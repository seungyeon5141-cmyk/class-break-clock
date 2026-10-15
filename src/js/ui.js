// 공통 화면 도우미: 패널 열기/닫기, 토스트, HTML 이스케이프
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let toastTimer = null;
  function toast(msg, ms = 2600) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  const panelHooks = {};
  let openPanelId = null;

  function openPanel(id) {
    if (openPanelId && openPanelId !== id) closePanel();
    const panel = document.getElementById(id);
    if (!panel) return;
    panel.hidden = false;
    applySavedPos(panel);
    // 옮겨 둔 창은 열 때만 살짝 떠오르는 효과 (끌기를 놓을 때는 다시 재생하지 않음)
    panel.classList.add('opening');
    setTimeout(() => panel.classList.remove('opening'), 300);
    $('#panelBackdrop').hidden = false;
    openPanelId = id;
    (panelHooks[id]?.open || (() => {}))();
  }

  function closePanel() {
    if (!openPanelId) return;
    const panel = document.getElementById(openPanelId);
    panel.hidden = true;
    panel.classList.remove('expanded');
    $('#panelBackdrop').hidden = true;
    (panelHooks[openPanelId]?.close || (() => {}))();
    openPanelId = null;
  }

  function onPanel(id, hooks) { panelHooks[id] = hooks; }

  // ---------- 창 끌어서 옮기기 (제목 줄을 잡고) ----------
  const savedPos = () => {
    if (!Store.data.ui || typeof Store.data.ui !== 'object') Store.data.ui = { panels: {} };
    if (!Store.data.ui.panels) Store.data.ui.panels = {};
    return Store.data.ui.panels;
  };

  // 화면 밖으로 나가지 않게: 제목 줄이 항상 보이도록
  function clampPos(panel, x, y) {
    const w = panel.offsetWidth;
    const minX = Math.min(0, 120 - w);
    const maxX = Math.max(0, window.innerWidth - 120);
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(46, Math.min(window.innerHeight - 70, y)),
    };
  }

  function placeAt(panel, x, y) {
    const p = clampPos(panel, x, y);
    panel.classList.add('moved');
    panel.style.left = `${p.x}px`;
    panel.style.top = `${p.y}px`;
    return p;
  }

  function resetPos(panel) {
    panel.classList.remove('moved');
    panel.style.left = '';
    panel.style.top = '';
  }

  function applySavedPos(panel) {
    const pos = savedPos()[panel.id];
    if (pos) placeAt(panel, pos.x, pos.y); else resetPos(panel);
  }

  function initPanelDrag() {
    $$('.panel').forEach((panel) => {
      const head = panel.querySelector('.panel-head');
      if (!head) return;
      head.title = '끌어서 창 옮기기 · 두 번 누르면 가운데로';
      let drag = null;
      head.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('button, input, select') || panel.classList.contains('expanded')) return;
        const r = panel.getBoundingClientRect();
        drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
        head.setPointerCapture(e.pointerId);
      });
      head.addEventListener('pointermove', (e) => {
        if (!drag) return;
        if (!drag.moved) { drag.moved = true; panel.classList.add('dragging'); }
        placeAt(panel, e.clientX - drag.dx, e.clientY - drag.dy);
      });
      const end = () => {
        if (!drag) return;
        const moved = drag.moved;
        drag = null;
        panel.classList.remove('dragging');
        if (!moved) return;
        savedPos()[panel.id] = { x: panel.offsetLeft, y: panel.offsetTop };
        Store.save();
      };
      head.addEventListener('pointerup', end);
      head.addEventListener('pointercancel', end);
      head.addEventListener('dblclick', (e) => {
        if (e.target.closest('button, input, select')) return;
        resetPos(panel);
        delete savedPos()[panel.id];
        Store.save();
      });
    });
    window.addEventListener('resize', () => {
      $$('.panel.moved').forEach((p) => placeAt(p, p.offsetLeft, p.offsetTop));
    });
  }

  // ---------- 누를 때 퍼지는 물결 효과 ----------
  const RIPPLE = '.btn, .dock-btn, .seg, .mode-tab, .bell-toggle, .round-btn, .bgm-btn, .mini-btn, .preset-grid button, .adj, .step, .snav, .ph-btn, .tb-btn, .pp-use, .pf-chip, .font-chips button, .bullet-chips button, .profile-tab, .day-chip, .secret-no, .s-chip, .pt-chip, .icon-seg button, .wheel-center, .fab, .gear-btn';
  function initRipple() {
    document.addEventListener('pointerdown', (e) => {
      const el = e.target.closest(RIPPLE);
      if (!el || el.disabled) return;
      const r = el.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2.2;
      const dot = document.createElement('span');
      dot.className = 'ripple';
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${e.clientX - r.left - size / 2}px`;
      dot.style.top = `${e.clientY - r.top - size / 2}px`;
      el.classList.add('has-ripple');
      el.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove());
    });
  }

  function initPanels() {
    $$('[data-open]').forEach((btn) => btn.addEventListener('click', () => openPanel(btn.dataset.open)));
    $$('.panel [data-close]').forEach((btn) => btn.addEventListener('click', closePanel));
    $$('.panel [data-expand]').forEach((btn) => btn.addEventListener('click', () => {
      btn.closest('.panel').classList.toggle('expanded');
      window.dispatchEvent(new Event('resize'));
    }));
    $('#panelBackdrop').addEventListener('click', closePanel);
    initPanelDrag();
    initRipple();
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const modal = $$('.modal').find((m) => !m.hidden);
      if (modal && modal.id === 'askModal') $('#askNo').click();
      else if (modal) modal.hidden = true; else closePanel();
    });
    $$('.modal [data-modal-close]').forEach((btn) => btn.addEventListener('click', () => { btn.closest('.modal').hidden = true; }));
  }

  function download(filename, text, type = 'text/plain') {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 암호학적으로 고른 난수 (뽑기의 공정성)
  function randInt(n) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / n) * n;
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  }

  // 브라우저 확인 창 대신 쓰는 앱 안의 확인 창. 확인을 누르면 true
  function ask(message, okLabel = '확인') {
    const modal = $('#askModal');
    $('#askText').textContent = message;
    $('#askYes').textContent = okLabel;
    modal.hidden = false;
    $('#askYes').focus();
    return new Promise((resolve) => {
      const done = (v) => {
        modal.hidden = true;
        $('#askYes').onclick = null;
        $('#askNo').onclick = null;
        modal.onclick = null;
        resolve(v);
      };
      $('#askYes').onclick = () => done(true);
      $('#askNo').onclick = () => done(false);
      modal.onclick = (e) => { if (e.target === modal) done(false); };
    });
  }

  const pad = (n, w = 2) => String(n).padStart(w, '0');

  window.UI = { $, $$, esc, toast, ask, openPanel, closePanel, onPanel, initPanels, download, shuffle, randInt, pad };
})();
