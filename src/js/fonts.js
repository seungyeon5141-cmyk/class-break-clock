// 글꼴 목록 · 글꼴 고르기 메뉴 · 내 글꼴 파일 추가
(function () {
  const { esc, toast } = UI;

  const ALL_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  // 앱에 들어 있는 글꼴 (weights: 따로 들어 있는 굵기)
  const BUILTIN = [
    { key: 'pretendard', label: '프리텐다드', css: 'var(--font-ui)', weights: ALL_WEIGHTS },
    { key: 'paperlogy', label: '페이퍼로지', css: 'var(--font-main)' },
    { key: 'ownglyph', label: '온글잎 의연체', css: 'var(--font-small)' },
    { key: 'danjunghae', label: '카페24 단정해', css: "'Cafe24 Danjunghae', var(--font-ui)" },
    { key: 'dangdanghae', label: '카페24 당당해', css: "'Cafe24 Dangdanghae', var(--font-ui)" },
    { key: 'anemone', label: '카페24 아네모네', css: "'Cafe24 Ohsquare', var(--font-ui)" },
    { key: 'ssurround', label: '카페24 써라운드', css: "'Cafe24 Ssurround', var(--font-ui)" },
    { key: 'ssurroundair', label: '카페24 써라운드 에어', css: "'Cafe24 SsurroundAir', var(--font-ui)" },
    { key: 'supermagic', label: '카페24 슈퍼매직', css: "'Cafe24 Supermagic', var(--font-ui)", weights: [400, 700] },
    { key: 'nanumgothic', label: '나눔고딕', css: "'NanumGothic', var(--font-ui)", weights: [300, 400, 700, 800] },
    { key: 'nanumbarungothic', label: '나눔바른고딕', css: "'NanumBarunGothic', var(--font-ui)", weights: [200, 300, 400, 700] },
    { key: 'nanumbarunpen', label: '나눔바른펜', css: "'NanumBarunpen', var(--font-ui)", weights: [400, 700] },
    { key: 'nanumsquare', label: '나눔스퀘어', css: "'NanumSquare', var(--font-ui)", weights: [300, 400, 700, 800] },
    { key: 'nanumsquareround', label: '나눔스퀘어 라운드', css: "'NanumSquareRound', var(--font-ui)", weights: [300, 400, 700, 800] },
    { key: 'nanumsquareneo', label: '나눔스퀘어 네오', css: "'NanumSquare Neo', var(--font-ui)", weights: [400, 700, 800, 900] },
    { key: 'noonnu', label: '눈누 기초고딕', css: "'Noonnu BasicGothic', var(--font-ui)" },
  ];
  const MAX_FILE = 30 * 1024 * 1024;
  let custom = []; // { key, label, css, custom: true }

  const familyOf = (key) => `UF ${key.slice(2)}`;
  const customEntry = (key, label) => ({ key, label, css: `'${familyOf(key)}', var(--font-ui)`, custom: true });

  function list() { return BUILTIN.concat(custom); }
  function has(key) { return list().some((f) => f.key === key) || String(key).startsWith('u_'); }
  function get(key, fallback = 'pretendard') {
    return list().find((f) => f.key === key)
      // 직접 추가한 글꼴은 불러오기 전에도 이름표만으로 쓸 수 있게
      || (String(key).startsWith('u_') ? customEntry(key, '내 글꼴') : null)
      || list().find((f) => f.key === fallback) || BUILTIN[0];
  }
  const css = (key, fallback) => get(key, fallback).css;
  // 가장 굵게 (팝업처럼 크게 강조할 때)
  const heaviest = (key) => { const w = get(key).weights; return w ? w[w.length - 1] : 'normal'; };

  function changed() { window.dispatchEvent(new CustomEvent('fonts:changed')); }

  async function register(key, label, data) {
    const face = new FontFace(familyOf(key), data);
    await face.load();
    document.fonts.add(face);
    custom = custom.filter((f) => f.key !== key).concat(customEntry(key, label));
  }

  async function init() {
    try {
      const rows = await Db.all('fonts');
      rows.sort((a, b) => (a.value.added || 0) - (b.value.added || 0));
      for (const { key, value } of rows) {
        try { await register(key, value.name, value.data); } catch (e) { console.warn('글꼴을 불러오지 못함', value.name, e); }
      }
      if (rows.length) changed();
    } catch (e) {
      console.warn('글꼴 보관함을 열지 못함', e);
    }
  }

  async function addFile(file) {
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) { toast('ttf, otf, woff, woff2 글꼴 파일만 넣을 수 있어요'); return null; }
    if (file.size > MAX_FILE) { toast('글꼴 파일이 너무 커요 (30MB까지)'); return null; }
    const label = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 40) || '내 글꼴';
    const dup = custom.find((f) => f.label === label);
    if (dup) { toast('이미 추가한 글꼴이에요'); return dup.key; }
    const key = `u_${Store.uid()}`;
    const data = await file.arrayBuffer();
    try {
      await register(key, label, data);
    } catch (e) {
      toast('글꼴 파일을 읽지 못했어요. 다른 파일로 해 보세요');
      return null;
    }
    try {
      await Db.put('fonts', key, { name: label, data, added: Date.now() });
    } catch (e) {
      toast('글꼴을 저장하지 못했어요 (이번 실행 동안만 쓸 수 있어요)');
    }
    changed();
    toast(`'${label}' 글꼴을 추가했어요 🔤`);
    return key;
  }

  async function remove(key) {
    const f = custom.find((x) => x.key === key);
    if (!f) return;
    if (!(await UI.ask(`'${f.label}' 글꼴을 지울까요? 이 글꼴을 쓰던 곳은 기본 글꼴로 보여요.`, '지우기'))) return;
    custom = custom.filter((x) => x.key !== key);
    document.fonts.forEach((face) => { if (face.family.replace(/["']/g, '') === familyOf(key)) document.fonts.delete(face); });
    try { await Db.del('fonts', key); } catch (e) { /* 이미 없음 */ }
    changed();
  }

  // ---------- 글꼴 고르기 메뉴 (누르면 펼쳐지는 목록) ----------
  let menu = null;
  let menuOwner = null;
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.ttf,.otf,.woff,.woff2';
  fileInput.hidden = true;

  function closeMenu() {
    if (!menu) return;
    menu.remove();
    menu = null;
    if (menuOwner) menuOwner.btn.setAttribute('aria-expanded', 'false');
    menuOwner = null;
  }

  function openMenu(owner) {
    closeMenu();
    menuOwner = owner;
    owner.btn.setAttribute('aria-expanded', 'true');
    const cur = owner.get();
    menu = document.createElement('div');
    menu.className = 'font-menu';
    menu.setAttribute('role', 'listbox');
    const item = (f) => `<div class="fm-row${f.key === cur ? ' active' : ''}">
        <button class="fm-item" data-key="${esc(f.key)}" role="option" aria-selected="${f.key === cur}">
          <span class="fm-name" style="font-family:${esc(f.css)}">${esc(f.label)}</span>
          <span class="fm-sample" style="font-family:${esc(f.css)}">가나다 ABC 123</span>
        </button>
        ${f.custom ? `<button class="fm-del" data-del="${esc(f.key)}" title="이 글꼴 지우기" aria-label="${esc(f.label)} 지우기">✕</button>` : ''}
      </div>`;
    menu.innerHTML = `<div class="fm-list">${BUILTIN.map(item).join('')}
        ${custom.length ? `<div class="fm-group">내가 추가한 글꼴</div>${custom.map(item).join('')}` : ''}</div>
      <button class="fm-add" data-add>＋ 내 글꼴 파일 추가 <small>ttf · otf · woff</small></button>`;
    document.body.appendChild(menu);
    place(owner.btn);
    menu.querySelector('.fm-row.active')?.scrollIntoView({ block: 'nearest' });
    menu.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        const o = menuOwner;
        closeMenu();
        await remove(del.dataset.del);
        if (o) openMenu(o);
        return;
      }
      if (e.target.closest('[data-add]')) {
        const o = menuOwner;
        closeMenu();
        fileInput.onchange = async () => {
          const file = fileInput.files[0];
          fileInput.value = '';
          if (!file) return;
          const key = await addFile(file);
          if (key) o.choose(key);
        };
        fileInput.click();
        return;
      }
      const it = e.target.closest('[data-key]');
      if (it) {
        const o = menuOwner;
        closeMenu();
        o.choose(it.dataset.key);
      }
    });
  }

  function place(btn) {
    const r = btn.getBoundingClientRect();
    const w = Math.max(r.width, 280);
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 58;
    const maxH = Math.max(below, above, 200);
    menu.style.width = `${w}px`;
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left))}px`;
    menu.style.maxHeight = `${Math.min(460, maxH)}px`;
    if (below >= 320 || below >= above) menu.style.top = `${r.bottom + 6}px`;
    else menu.style.bottom = `${window.innerHeight - r.top + 6}px`;
  }

  document.addEventListener('pointerdown', (e) => {
    if (menu && !menu.contains(e.target) && !(menuOwner && menuOwner.btn.contains(e.target))) closeMenu();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (menu && e.key === 'Escape') { e.stopImmediatePropagation(); closeMenu(); }
  }, true);
  window.addEventListener('resize', closeMenu);

  // host 안에 글꼴 버튼을 만든다. get(): 지금 글꼴 키, set(key): 골랐을 때
  function picker(host, { get: getKey, set, compact = false }) {
    host.innerHTML = '';
    host.appendChild(fileInput);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `font-pick${compact ? ' compact' : ''}`;
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    host.appendChild(btn);
    const owner = {
      btn,
      get: getKey,
      choose(key) { set(key); refresh(); },
    };
    function refresh() {
      const f = get(getKey());
      btn.innerHTML = `<span class="fp-name" style="font-family:${esc(f.css)}">${esc(f.label)}</span><span class="fp-caret" aria-hidden="true">▾</span>`;
      btn.title = `글꼴: ${f.label} (눌러서 바꾸기)`;
    }
    btn.addEventListener('mousedown', (e) => e.preventDefault()); // 판서 글자 선택이 풀리지 않게
    btn.addEventListener('click', () => { if (menuOwner === owner) closeMenu(); else openMenu(owner); });
    window.addEventListener('fonts:changed', refresh);
    refresh();
    return { refresh };
  }

  window.Fonts = { init, list, has, get, css, heaviest, picker, addFile, remove, closeMenu, ALL_WEIGHTS };
})();
