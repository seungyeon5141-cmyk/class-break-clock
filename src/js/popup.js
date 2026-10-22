// 긴급 팝업: "조용히 합시다" 같은 안내를 화면 가득 크게 잠깐 띄우기
(function () {
  const { $, $$, esc, toast } = UI;

  const THEMES = {
    alert: { label: '빨강 강조', bg: 'linear-gradient(135deg, #FF4D6D 0%, #FF8FB1 100%)', fg: '#FFFFFF' },
    lavender: { label: '연보라', bg: 'linear-gradient(135deg, #9D7CF5 0%, #F47BB6 100%)', fg: '#FFFFFF' },
    yellow: { label: '노랑', bg: 'linear-gradient(135deg, #FFE45C 0%, #FFC56E 100%)', fg: '#3A2E12' },
    mint: { label: '민트', bg: 'linear-gradient(135deg, #48C9A9 0%, #7CC6FF 100%)', fg: '#FFFFFF' },
    dark: { label: '검정', bg: 'linear-gradient(135deg, #2E2440 0%, #4B3B63 100%)', fg: '#FFFFFF' },
    white: { label: '하양', bg: '#FFFFFF', fg: '#2E2440' },
  };
  let fontPick = null;
  const DURATIONS = [
    { v: 0, label: '직접 닫기' },
    { v: 5, label: '5초' },
    { v: 10, label: '10초' },
    { v: 30, label: '30초' },
    { v: 60, label: '1분' },
  ];

  // 글자 애니메이션 효과
  const EFFECTS = [
    { v: 'none', label: '효과 없음', icon: '⏹️' },
    { v: 'bounce', label: '톡톡 튀기', icon: '🏀' },
    { v: 'spin', label: '360도 회전', icon: '🌀' },
    { v: 'drop', label: '위에서 떨어지기', icon: '⬇️' },
    { v: 'fly', label: '날아오기', icon: '🚀' },
    { v: 'zoom', label: '쾅! 커지기', icon: '💥' },
    { v: 'wave', label: '물결', icon: '🌊' },
    { v: 'shake', label: '흔들흔들', icon: '🫨' },
    { v: 'jelly', label: '말랑 젤리', icon: '🍮' },
    { v: 'typing', label: '한 글자씩', icon: '⌨️' },
    { v: 'rainbow', label: '무지개', icon: '🌈' },
    { v: 'heart', label: '두근두근', icon: '💓' },
  ];

  // 글자를 한 자씩 나눠 효과를 순서대로 주기 (단어는 줄바꿈으로 안 쪼개지게 묶음)
  function fillChars(el, text, effect) {
    el.textContent = '';
    el.className = el.className.replace(/\bfx-\S+/g, '').trim();
    if (!effect || effect === 'none') { el.textContent = text; return; }
    el.classList.add(`fx-${effect}`);
    // 미리보기처럼 grid로 가운데 정렬하는 상자에서도 한 덩어리로 보이게 감싸기
    const wrap = document.createElement('span');
    wrap.className = 'pfx';
    el.appendChild(wrap);
    let i = 0;
    text.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) { wrap.appendChild(document.createTextNode(part)); return; }
      const word = document.createElement('span');
      word.className = 'pw';
      Array.from(part).forEach((ch) => {
        const c = document.createElement('span');
        c.className = 'pc';
        c.textContent = ch;
        c.style.setProperty('--i', i);
        c.style.setProperty('--r', ((i * 37) % 7) - 3);
        i += 1;
        word.appendChild(c);
      });
      wrap.appendChild(word);
    });
    el.style.setProperty('--n', i);
  }

  const cfg = () => Store.data.popup;
  let closeTimer = null;

  // ---------- 화면 가득 띄우기 ----------
  function fit() {
    const box = $('#popupText');
    const wrap = $('#popupStage');
    let lo = 24;
    let hi = 600;
    while (hi - lo > 2) {
      const mid = Math.floor((lo + hi) / 2);
      box.style.fontSize = `${mid}px`;
      if (box.scrollWidth <= wrap.clientWidth && box.scrollHeight <= wrap.clientHeight) lo = mid; else hi = mid;
    }
    box.style.fontSize = `${lo}px`;
  }

  function show(text) {
    const msg = String(text ?? cfg().text).trim();
    if (!msg) { toast('띄울 내용을 입력해 주세요'); $('#popupInput').focus(); return; }
    const theme = THEMES[cfg().theme] || THEMES.alert;
    const ov = $('#popupOverlay');
    ov.style.setProperty('--pop-bg', theme.bg);
    ov.style.setProperty('--pop-fg', theme.fg);
    const box = $('#popupText');
    box.style.fontFamily = Fonts.css(cfg().font);
    box.style.fontWeight = Fonts.heaviest(cfg().font);
    fillChars(box, msg, cfg().effect);
    const fxClass = Array.from(box.classList).find((k) => k.startsWith('fx-'));
    if (fxClass) box.classList.remove(fxClass);
    UI.closePanel();
    ov.hidden = false;
    ov.classList.remove('show');
    void ov.offsetWidth;
    ov.classList.add('show');
    fit();
    if (fxClass) box.classList.add(fxClass);

    clearTimeout(closeTimer);
    const sec = Number(cfg().duration) || 0;
    const bar = $('#popupBar');
    bar.hidden = !sec;
    if (sec) {
      bar.style.transition = 'none';
      bar.style.transform = 'scaleX(1)';
      void bar.offsetWidth;
      bar.style.transition = `transform ${sec}s linear`;
      bar.style.transform = 'scaleX(0)';
      closeTimer = setTimeout(hide, sec * 1000);
    }
    if (cfg().sound) { Sound.unlock(); Sound.warning(false); }
    if (window.desktop) window.desktop.bringToFront();
  }

  function hide() {
    clearTimeout(closeTimer);
    $('#popupOverlay').hidden = true;
  }

  // ---------- 만들기 패널 ----------
  function renderPanel() {
    const c = cfg();
    if (document.activeElement !== $('#popupInput')) $('#popupInput').value = c.text;
    $('#popupPresets').innerHTML = c.presets.map((p, i) =>
      `<span class="pp-chip"><button class="pp-use" data-i="${i}" title="눌러서 바로 띄우기">${esc(p)}</button><button class="pp-del" data-del="${i}" aria-label="${esc(p)} 지우기" title="지우기">✕</button></span>`).join('') ||
      '<p class="mini-help">자주 쓰는 문구가 없어요. 위에 쓰고 ★를 눌러 저장하세요.</p>';
    $('#popupThemes').innerHTML = Object.entries(THEMES).map(([k, t]) =>
      `<button class="pt-chip${c.theme === k ? ' active' : ''}" data-theme="${k}" style="background:${t.bg};color:${t.fg}" title="${t.label}">가</button>`).join('');
    fontPick.refresh();
    $('#popupDurations').innerHTML = DURATIONS.map((d) =>
      `<button class="seg${Number(c.duration) === d.v ? ' active' : ''}" data-sec="${d.v}">${d.label}</button>`).join('');
    $('#popupSound').checked = !!c.sound;
    $('#popupEffects').innerHTML = EFFECTS.map((f) =>
      `<button class="pe-chip${(c.effect || 'none') === f.v ? ' active' : ''}" data-fx="${f.v}"><span>${f.icon}</span>${f.label}</button>`).join('');
    preview();
  }

  function preview() {
    const c = cfg();
    const theme = THEMES[c.theme] || THEMES.alert;
    const pv = $('#popupPreview');
    pv.style.background = theme.bg;
    pv.style.color = theme.fg;
    pv.style.fontFamily = Fonts.css(c.font);
    pv.style.fontWeight = Fonts.heaviest(c.font);
    fillChars(pv, c.text.trim() || '여기에 크게 보여요', c.effect);
  }

  function init() {
    const c = cfg();
    $('#popupInput').addEventListener('input', (e) => { c.text = e.target.value; Store.save(); preview(); });
    $('#popupInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); show(); }
    });
    $('#popupShow').addEventListener('click', () => show());
    $('#popupSave').addEventListener('click', () => {
      const t = c.text.trim();
      if (!t) { toast('저장할 문구를 먼저 입력해 주세요'); return; }
      if (c.presets.includes(t)) { toast('이미 저장된 문구예요'); return; }
      c.presets.unshift(t);
      c.presets = c.presets.slice(0, 30);
      Store.save();
      renderPanel();
      toast('자주 쓰는 문구에 저장했어요 ⭐');
    });
    $('#popupPresets').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        c.presets.splice(Number(del.dataset.del), 1);
        Store.save();
        renderPanel();
        return;
      }
      const use = e.target.closest('[data-i]');
      if (!use) return;
      c.text = c.presets[Number(use.dataset.i)];
      Store.save();
      show(c.text);
    });
    $('#popupThemes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-theme]');
      if (b) { c.theme = b.dataset.theme; Store.save(); renderPanel(); }
    });
    fontPick = Fonts.picker($('#popupFontPick'), { get: () => cfg().font, set: (k) => { cfg().font = k; Store.save(); preview(); } });
    $('#popupEffects').addEventListener('click', (e) => {
      const b = e.target.closest('[data-fx]');
      if (b) { c.effect = b.dataset.fx; Store.save(); renderPanel(); }
    });
    $('#popupDurations').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sec]');
      if (b) { c.duration = Number(b.dataset.sec); Store.save(); renderPanel(); }
    });
    $('#popupSound').addEventListener('change', (e) => { c.sound = e.target.checked; Store.save(); });

    // 아무 곳이나 누르거나 Esc를 누르면 닫힘
    $('#popupOverlay').addEventListener('click', hide);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#popupOverlay').hidden) { e.stopImmediatePropagation(); hide(); }
    }, true);
    window.addEventListener('resize', () => { if (!$('#popupOverlay').hidden) fit(); });

    UI.onPanel('popupPanel', { open: () => { renderPanel(); setTimeout(() => $('#popupInput').select(), 50); } });
  }

  window.Popup = { init, show, hide };
})();
