// 렌더러에 필요한 기능만 안전하게 노출
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  minimize: () => ipcRenderer.invoke('win:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
  toggleFullScreen: () => ipcRenderer.invoke('win:toggleFullScreen'),
  close: () => ipcRenderer.invoke('win:close'),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('win:setAlwaysOnTop', !!flag),
  getWindowState: () => ipcRenderer.invoke('win:getState'),
  bringToFront: () => ipcRenderer.invoke('win:bringToFront'),
  getAutoStart: () => ipcRenderer.invoke('autostart:get'),
  setAutoStart: (flag) => ipcRenderer.invoke('autostart:set', !!flag),
  getCloseToTray: () => ipcRenderer.invoke('tray:getCloseToTray'),
  setCloseToTray: (flag) => ipcRenderer.invoke('tray:setCloseToTray', !!flag),
  quit: () => ipcRenderer.invoke('app:quit'),
  version: () => ipcRenderer.invoke('app:version'),
  youtubeTitle: (url) => ipcRenderer.invoke('youtube:title', String(url)),
  onWindowState: (cb) => ipcRenderer.on('win:state', (_e, state) => cb(state)),
  onAutoStartChanged: (cb) => ipcRenderer.on('autostart:changed', (_e, v) => cb(v)),
  onResume: (cb) => ipcRenderer.on('system:resume', () => cb()),
});
