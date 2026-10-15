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

  function initPanels() {
    $$('[data-open]').forEach((btn) => btn.addEventListener('click', () => openPanel(btn.dataset.open)));
    $$('.panel [data-close]').forEach((btn) => btn.addEventListener('click', closePanel));
    $$('.panel [data-expand]').forEach((btn) => btn.addEventListener('click', () => {
      btn.closest('.panel').classList.toggle('expanded');
      window.dispatchEvent(new Event('resize'));
    }));
    $('#panelBackdrop').addEventListener('click', closePanel);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const modal = $$('.modal').find((m) => !m.hidden);
      if (modal) modal.hidden = true; else closePanel();
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

  const pad = (n, w = 2) => String(n).padStart(w, '0');

  window.UI = { $, $$, esc, toast, openPanel, closePanel, onPanel, initPanels, download, shuffle, randInt, pad };
})();
