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
  const FONTS = {
    pretendard: { label: '프리텐다드 Black', css: "var(--font-ui)", weight: 900 },
    ssurround: { label: '카페24 써라운드', css: "'Cafe24 Ssurround', var(--font-ui)", weight: 'normal' },
    dangdanghae: { label: '카페24 당당해', css: "'Cafe24 Dangdanghae', var(--font-ui)", weight: 'normal' },
    paperlogy: { label: '페이퍼로지', css: 'var(--font-main)', weight: 'normal' },
  };
  const DURATIONS = [
    { v: 0, label: '직접 닫기' },
    { v: 5, label: '5초' },
    { v: 10, label: '10초' },
    { v: 30, label: '30초' },
    { v: 60, label: '1분' },
  ];

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
    const font = FONTS[cfg().font] || FONTS.pretendard;
    const ov = $('#popupOverlay');
    ov.style.setProperty('--pop-bg', theme.bg);
    ov.style.setProperty('--pop-fg', theme.fg);
    const box = $('#popupText');
    box.style.fontFamily = font.css;
    box.style.fontWeight = font.weight;
    box.textContent = msg;
    UI.closePanel();
    ov.hidden = false;
    ov.classList.remove('show');
    void ov.offsetWidth;
    ov.classList.add('show');
    fit();

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
    $('#popupFonts').innerHTML = Object.entries(FONTS).map(([k, f]) =>
      `<button class="pf-chip${c.font === k ? ' active' : ''}" data-font="${k}" style="font-family:${f.css};font-weight:${f.weight}">${f.label}</button>`).join('');
    $('#popupDurations').innerHTML = DURATIONS.map((d) =>
      `<button class="seg${Number(c.duration) === d.v ? ' active' : ''}" data-sec="${d.v}">${d.label}</button>`).join('');
    $('#popupSound').checked = !!c.sound;
    preview();
  }

  function preview() {
    const c = cfg();
    const theme = THEMES[c.theme] || THEMES.alert;
    const font = FONTS[c.font] || FONTS.pretendard;
    const pv = $('#popupPreview');
    pv.style.background = theme.bg;
    pv.style.color = theme.fg;
    pv.style.fontFamily = font.css;
    pv.style.fontWeight = font.weight;
    pv.textContent = c.text.trim() || '여기에 크게 보여요';
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
    $('#popupFonts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-font]');
      if (b) { c.font = b.dataset.font; Store.save(); renderPanel(); }
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
