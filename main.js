// 쉬는시간 알리미 - Electron 메인 프로세스
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, powerMonitor, session, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');

const ICON_PATH = path.join(__dirname, 'src', 'assets', 'icon.png');
let win = null;
let tray = null;
let isQuitting = false;

// ---------- 설정 파일 (창 위치, 자동 실행 등 메인 프로세스 전용 값) ----------
const configPath = () => path.join(app.getPath('userData'), 'app-config.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(next, null, 2));
  } catch (err) {
    console.error('config write failed', err);
  }
  return next;
}

// ---------- 컴퓨터 시작 시 자동 실행 ----------
function supportsLoginItem() {
  return process.platform === 'win32' || process.platform === 'darwin';
}

// Windows는 등록할 때와 확인할 때 실행 경로·인수가 똑같아야 같은 항목으로 찾음.
// (예전에는 확인할 때 인수를 빼서 켜져 있어도 '꺼짐'으로 읽혔음)
function loginItemOptions() {
  const args = app.isPackaged ? ['--autostart'] : [app.getAppPath(), '--autostart'];
  return { path: process.execPath, args };
}

function getAutoLaunch() {
  if (!supportsLoginItem()) return false;
  const st = app.getLoginItemSettings(loginItemOptions());
  return !!(st.openAtLogin || st.executableWillLaunchAtLogin);
}

function setAutoLaunch(enabled) {
  if (!supportsLoginItem()) return false;
  app.setLoginItemSettings({ openAtLogin: !!enabled, ...loginItemOptions() });
  // 예전 버전이 인수 없이 남긴 항목이 있으면 함께 정리
  if (!enabled) app.setLoginItemSettings({ openAtLogin: false, path: process.execPath });
  writeConfig({ autoLaunch: !!enabled });
  refreshTrayMenu();
  return getAutoLaunch();
}

// ---------- 유튜브 배경 음악 ----------
const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com'];
function isYouTubeUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && YT_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

// 파일로 연 화면에는 주소(Referer)가 없어서 유튜브 플레이어가 '오류 153'을 낸다.
// 유튜브로 가는 요청에만 Referer를 붙여 준다.
function allowYouTubeEmbeds() {
  const filter = { urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*'] };
  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const headers = details.requestHeaders;
    if (!headers.Referer && !headers.referer) headers.Referer = 'https://www.youtube-nocookie.com/';
    callback({ requestHeaders: headers });
  });
}

// 영상 제목 알아내기 (유튜브 oEmbed)
async function youtubeTitle(url) {
  if (!isYouTubeUrl(url)) return '';
  try {
    const res = await net.fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
    if (!res.ok) return '';
    const data = await res.json();
    return typeof data.title === 'string' ? data.title.slice(0, 80) : '';
  } catch {
    return '';
  }
}

// ---------- 창 상태 ----------
function restoreBounds() {
  const { bounds } = readConfig();
  const fallback = { width: 1100, height: 720 };
  if (!bounds) return fallback;
  // 저장된 위치가 현재 연결된 모니터 안에 있을 때만 사용
  const visible = screen.getAllDisplays().some(({ workArea: a }) =>
    bounds.x >= a.x - 50 && bounds.y >= a.y - 50 &&
    bounds.x + 100 <= a.x + a.width && bounds.y + 100 <= a.y + a.height);
  return visible ? bounds : { width: bounds.width || 1100, height: bounds.height || 720 };
}

function saveBounds() {
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
  writeConfig({ bounds: win.getNormalBounds(), maximized: win.isMaximized() });
}

function createWindow() {
  const config = readConfig();
  win = new BrowserWindow({
    ...restoreBounds(),
    minWidth: 760,
    minHeight: 520,
    frame: false,
    show: false,
    backgroundColor: '#f6e9ff',
    icon: ICON_PATH,
    title: '쉬는시간 알리미',
    alwaysOnTop: !!config.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 최소화되어 있어도 시계·알림이 정확히 동작하도록
      backgroundThrottling: false,
      // 종소리를 사용자 클릭 없이도 재생
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  if (config.maximized) win.maximize();
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());

  win.on('close', (event) => {
    saveBounds();
    if (!isQuitting && readConfig().closeToTray !== false && tray) {
      event.preventDefault();
      win.hide();
    }
  });
  win.on('moved', saveBounds);
  win.on('resized', saveBounds);
  // Windows 종료/로그오프 시 상태 저장
  win.on('session-end', () => {
    saveBounds();
    isQuitting = true;
  });

  const sendWinState = () => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('win:state', {
        maximized: win.isMaximized(),
        fullscreen: win.isFullScreen(),
        alwaysOnTop: win.isAlwaysOnTop(),
      });
    }
  };
  ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'always-on-top-changed']
    .forEach((evt) => win.on(evt, sendWinState));

  // 새 창은 막고, 유튜브 영상의 'YouTube에서 보기' 같은 링크만 기본 브라우저로 연다
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isYouTubeUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// ---------- 트레이 ----------
function refreshTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: '쉬는시간 알리미 열기', click: showWindow },
    { type: 'separator' },
    {
      label: '컴퓨터 시작 시 자동 실행',
      type: 'checkbox',
      enabled: supportsLoginItem(),
      checked: getAutoLaunch(),
      click: (item) => {
        setAutoLaunch(item.checked);
        if (win) win.webContents.send('autostart:changed', getAutoLaunch());
      },
    },
    {
      label: '항상 위에 고정',
      type: 'checkbox',
      checked: !!(win && win.isAlwaysOnTop()),
      click: (item) => setAlwaysOnTop(item.checked),
    },
    { type: 'separator' },
    { label: '완전히 종료', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  const image = nativeImage.createFromPath(ICON_PATH).resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('쉬는시간 알리미');
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
  refreshTrayMenu();
}

function setAlwaysOnTop(flag) {
  if (!win) return false;
  win.setAlwaysOnTop(!!flag, 'floating');
  writeConfig({ alwaysOnTop: !!flag });
  refreshTrayMenu();
  return win.isAlwaysOnTop();
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('win:minimize', () => win && win.minimize());
  ipcMain.handle('win:toggleMaximize', () => {
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize(); else win.maximize();
    return win.isMaximized();
  });
  ipcMain.handle('win:toggleFullScreen', () => {
    if (!win) return false;
    win.setFullScreen(!win.isFullScreen());
    return win.isFullScreen();
  });
  ipcMain.handle('win:close', () => win && win.close());
  ipcMain.handle('win:setAlwaysOnTop', (_e, flag) => setAlwaysOnTop(flag));
  ipcMain.handle('win:getState', () => ({
    maximized: !!(win && win.isMaximized()),
    fullscreen: !!(win && win.isFullScreen()),
    alwaysOnTop: !!(win && win.isAlwaysOnTop()),
  }));
  ipcMain.handle('win:bringToFront', () => {
    if (!win) return;
    showWindow();
    // 다른 창 뒤에 숨어 있어도 잠깐 앞으로 띄워 알림을 보여준다
    if (!win.isAlwaysOnTop()) {
      win.setAlwaysOnTop(true, 'screen-saver');
      setTimeout(() => {
        if (win && !win.isDestroyed() && !readConfig().alwaysOnTop) win.setAlwaysOnTop(false);
      }, 1500);
    }
  });
  ipcMain.handle('autostart:get', () => ({ supported: supportsLoginItem(), enabled: getAutoLaunch() }));
  ipcMain.handle('autostart:set', (_e, flag) => setAutoLaunch(flag));
  ipcMain.handle('tray:getCloseToTray', () => readConfig().closeToTray !== false);
  ipcMain.handle('tray:setCloseToTray', (_e, flag) => writeConfig({ closeToTray: !!flag }).closeToTray);
  ipcMain.handle('app:quit', () => { isQuitting = true; app.quit(); });
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('youtube:title', (_e, url) => youtubeTitle(String(url)));
}

// ---------- 앱 시작 ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('kr.classroom.breakclock');

    // 처음 실행할 때는 "컴퓨터 시작 시 자동 실행"을 기본으로 켠다
    const config = readConfig();
    if (config.autoLaunch === undefined && app.isPackaged) setAutoLaunch(true);

    allowYouTubeEmbeds();
    registerIpc();
    createWindow();
    createTray();

    // 절전에서 깨어나면 시계를 즉시 다시 맞춘다
    powerMonitor.on('resume', () => win && win.webContents.send('system:resume'));
    // 컴퓨터를 끌 때 창 상태를 저장하고 바로 종료되도록
    powerMonitor.on('shutdown', () => { saveBounds(); isQuitting = true; app.quit(); });
  });

  app.on('before-quit', () => { isQuitting = true; saveBounds(); });
  app.on('activate', showWindow);
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
