// 공지사항: 메인 화면에 포스트잇으로 붙이기 (끌어서 이동, 두 번 눌러 수정)
(function () {
  const { $, $$, esc, toast } = UI;
  const MAX = 20;

  // 파스텔 포스트잇 색 10가지
  const BG_COLORS = [
    { v: '#FFF3A8', n: '노랑' },
    { v: '#FFD6E7', n: '핑크' },
    { v: '#FFE0CC', n: '피치' },
    { v: '#DDF5C8', n: '연두' },
    { v: '#C8F1E6', n: '민트' },
    { v: '#C9E8FF', n: '하늘' },
    { v: '#D6DCFF', n: '페리윙클' },
    { v: '#E6D6FF', n: '라벤더' },
    { v: '#F6D3F5', n: '라일락' },
    { v: '#FFFFFF', n: '화이트' },
  ];
  const FG_COLORS = ['#4B3B63', '#2E2E3A', '#FF4D6D', '#FF9F5A', '#F2B705', '#5CC27E',
    '#4BAEE8', '#2F5FD0', '#8C6CF0', '#C759C9', '#F47BB6', '#FFFFFF'];

  // 글머리 기호: 줄마다 앞에 붙는 표시 (num/circle 은 번호)
  const BULLETS = [
    { v: 'none', label: '없음' },
    { v: '•', label: '•' },
    { v: '◦', label: '◦' },
    { v: '-', label: '–' },
    { v: '✔', label: '✔' },
    { v: '★', label: '★' },
    { v: '♥', label: '♥' },
    { v: '▶', label: '▶' },
    { v: '📌', label: '📌' },
    { v: 'num', label: '1.' },
    { v: 'circle', label: '①' },
  ];
  const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  let fontPick = null;
  const MIN_W = 140;
  const MIN_H = 80;
  const WEIGHT_NAMES = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };

  // 글꼴에 들어 있는 굵기 중에서 고른다 (굵기가 2개면 굵게 켜고 끄기)
  function weightFor(n) {
    const ws = Fonts.get(n.font, 'paperlogy').weights;
    if (!ws) return 'normal';
    if (ws.length === 2) return n.bold ? ws[1] : ws[0];
    const want = Number(n.weight) || 700;
    return ws.reduce((a, w) => (Math.abs(w - want) < Math.abs(a - want) ? w : a), ws[0]);
  }

  // 예전 버전에서 만든 공지도 새 옵션으로 읽기
  function normalize(n) {
    const font = n.font === 'main' ? 'paperlogy' : n.font === 'small' ? 'ownglyph' : (Fonts.has(n.font) ? n.font : 'paperlogy');
    return {
      align: 'left', bullet: 'none', weight: 700, ...n, font,
    };
  }

  const notices = () => Store.data.notices;

  // 포스트잇마다 살짝 다른 기울기
  function tilt(id) {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return ((Math.abs(h) % 5) - 2) * 0.8;
  }

  function postitStyle(raw) {
    const n = normalize(raw);
    const weight = weightFor(n);
    return `--pi-bg:${esc(n.bg)};--pi-fg:${esc(n.fg)};--pi-size:${Number(n.size) || 32}px;--pi-font:${Fonts.css(n.font, 'paperlogy')};--pi-weight:${weight};--pi-tilt:${tilt(n.id || 'x')}deg`;
  }

  function marker(bullet, i) {
    if (bullet === 'num') return `${i}.`;
    if (bullet === 'circle') return CIRCLED[i - 1] || `${i}.`;
    return bullet;
  }

  // 줄마다 글머리 기호를 붙여서 그림. 빈 줄은 간격으로 남김
  function postitInner(raw) {
    const n = normalize(raw);
    let count = 0;
    const lines = String(n.text).split('\n').map((line) => {
      if (!line.trim()) return '<div class="pi-line pi-empty"></div>';
      count += 1;
      const b = n.bullet !== 'none' ? `<span class="pi-bullet">${esc(marker(n.bullet, count))}</span>` : '';
      return `<div class="pi-line">${b}<span class="pi-txt">${esc(line)}</span></div>`;
    }).join('');
    return `<span class="postit-tape"></span><div class="postit-text align-${esc(n.align)}${n.bullet !== 'none' ? ' has-bullet' : ''}">${lines}</div>`;
  }

  // ---------- 메인 화면 ----------
  function renderBoard() {
    const layer = $('#noticeLayer');
    const shown = notices().filter((n) => n.show && n.text.trim());
    layer.innerHTML = shown.map((n) => {
      const sized = n.w && n.h;
      const size = sized ? `;width:${Number(n.w)}px;height:${Number(n.h)}px` : '';
      return `<div class="postit on-board${sized ? ' sized' : ''}" data-id="${esc(n.id)}" style="${postitStyle(n)}${size}" title="끌어서 옮기기 · 모서리로 크기 조절 · 두 번 눌러 수정">${postitInner(n)}<span class="postit-resize" aria-hidden="true"></span></div>`;
    }).join('');
    layout();
    $$('.postit.on-board.sized', layer).forEach(fitText);
    updateBodyClass();
  }

  function updateBodyClass() {
    const pins = Store.data.ddays.some((d) => d.show);
    const notes = notices().some((n) => n.show && n.text.trim());
    document.body.classList.toggle('has-pins', pins || notes);
  }

  // 저장된 위치(%)로 배치. 위치가 없으면 오른쪽 위부터 차례로 쌓기
  function layout() {
    const layer = $('#noticeLayer');
    const W = layer.clientWidth;
    const H = layer.clientHeight;
    let stackTop = 16;
    $$('.postit.on-board', layer).forEach((el) => {
      const n = notices().find((x) => x.id === el.dataset.id);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let left;
      let top;
      if (n && typeof n.x === 'number' && typeof n.y === 'number') {
        left = n.x * W;
        top = n.y * H;
      } else {
        left = W - w - 24;
        top = stackTop;
        stackTop += h + 18;
      }
      el.style.left = `${Math.max(0, Math.min(W - w, left))}px`;
      el.style.top = `${Math.max(0, Math.min(H - Math.min(h, 60), top))}px`;
    });
  }

  // '크기에 맞춰 글자 자동 조절'을 켠 포스트잇: 넘치지 않는 가장 큰 글자 크기를 찾음
  function fitText(el) {
    const n = notices().find((x) => x.id === el.dataset.id);
    if (!n || !n.fit) return;
    const box = el.querySelector('.postit-text');
    let lo = 12;
    let hi = 200;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      el.style.setProperty('--pi-size', `${mid}px`);
      if (box.scrollHeight <= box.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1) lo = mid; else hi = mid;
    }
    el.style.setProperty('--pi-size', `${lo}px`);
  }

  function initDrag() {
    const layer = $('#noticeLayer');
    let drag = null;
    layer.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.postit.on-board');
      if (!el || e.button !== 0) return;
      const resize = !!e.target.closest('.postit-resize');
      drag = { el, resize, sx: e.clientX, sy: e.clientY, left: el.offsetLeft, top: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, moved: false };
      if (resize) {
        e.preventDefault();
        el.classList.add('resizing', 'sized');
        el.style.width = `${drag.w}px`;
        el.style.height = `${drag.h}px`;
      }
      el.setPointerCapture(e.pointerId);
    });
    layer.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      const W = layer.clientWidth;
      const H = layer.clientHeight;
      if (drag.resize) {
        drag.el.style.width = `${Math.max(MIN_W, Math.min(W - drag.left, drag.w + dx))}px`;
        drag.el.style.height = `${Math.max(MIN_H, Math.min(H - drag.top, drag.h + dy))}px`;
        fitText(drag.el);
        return;
      }
      drag.el.classList.add('dragging');
      drag.el.style.left = `${Math.max(0, Math.min(W - drag.el.offsetWidth, drag.left + dx))}px`;
      drag.el.style.top = `${Math.max(0, Math.min(H - 60, drag.top + dy))}px`;
    });
    const end = () => {
      if (!drag) return;
      const { el, moved, resize } = drag;
      drag = null;
      el.classList.remove('dragging', 'resizing');
      if (!moved) return;
      const n = notices().find((x) => x.id === el.dataset.id);
      if (n && resize) {
        n.w = el.offsetWidth;
        n.h = el.offsetHeight;
        Store.save();
      } else if (n) {
        n.x = el.offsetLeft / layer.clientWidth;
        n.y = el.offsetTop / layer.clientHeight;
        Store.save();
      }
    };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);
    layer.addEventListener('dblclick', (e) => {
      if (e.target.closest('.postit-resize')) return;
      const el = e.target.closest('.postit.on-board');
      if (el) openModal(el.dataset.id);
    });
    window.addEventListener('resize', layout);
  }

  // ---------- 공지 목록 ----------
  function renderList() {
    const list = notices();
    $('#noticeCount').textContent = list.length;
    if (!list.length) {
      $('#noticeList').innerHTML = '<div class="dday-empty">아직 공지가 없어요.<br />오른쪽 아래 ＋ 버튼으로 써 보세요 📌</div>';
      return;
    }
    $('#noticeList').innerHTML = list.map((n) => `
      <div class="dday-item notice-item" data-id="${esc(n.id)}">
        <div class="postit in-list" style="${postitStyle(n)}">${postitInner(n)}</div>
        <div class="dday-item-actions">
          <label class="switch-row"><span>화면에서 보기</span><input type="checkbox" class="switch" data-act="show" ${n.show ? 'checked' : ''} /></label>
          <div class="mini-btns">
            <button class="mini-btn" data-act="edit">수정</button>
            <button class="mini-btn" data-act="del">삭제</button>
          </div>
        </div>
      </div>`).join('');
  }

  function renderAll() { renderBoard(); renderList(); }

  // ---------- 쓰기/수정 모달 ----------
  let draft = null;

  function swatches() {
    const isCustomBg = !BG_COLORS.some((c) => c.v === draft.bg);
    $('#noticeBgSwatches').innerHTML = BG_COLORS.map((c) =>
      `<button class="swatch${draft.bg === c.v ? ' selected' : ''}" data-bg="${c.v}" style="background:${c.v}" title="${c.n}"></button>`).join('') +
      `<label class="swatch custom-sw${isCustomBg ? ' selected' : ''}" title="직접 고르기"${isCustomBg ? ` style="background:${esc(draft.bg)}"` : ''}><input type="color" data-custom="bg" value="${isCustomBg ? esc(draft.bg) : '#fff3a8'}" /></label>`;
    const isCustomFg = !FG_COLORS.includes(draft.fg);
    $('#noticeFgSwatches').innerHTML = FG_COLORS.map((c) =>
      `<button class="dot${draft.fg === c ? ' selected' : ''}" data-fg="${c}" style="background:${c}"></button>`).join('') +
      `<label class="dot custom-sw${isCustomFg ? ' selected' : ''}" title="직접 고르기"${isCustomFg ? ` style="background:${esc(draft.fg)}"` : ''}><input type="color" data-custom="fg" value="${isCustomFg ? esc(draft.fg) : '#4b3b63'}" /></label>`;
  }

  function preview() {
    draft.text = $('#noticeText').value;
    draft.size = Number($('#noticeSize').value);
    draft.weight = Number($('#noticeWeight').value);
    $('#noticeSizeVal').textContent = `${draft.size}px`;
    const ws = Fonts.get(draft.font, 'paperlogy').weights;
    const shown = weightFor(draft);
    $('#noticeWeightVal').textContent = `${shown} ${WEIGHT_NAMES[shown] || ''}`;
    $('#noticeWeightRow').hidden = !(ws && ws.length > 2);
    $('#noticeBoldRow').hidden = !(ws && ws.length === 2);
    draft.bold = $('#noticeBold').checked;
    draft.fit = $('#noticeFit').checked;
    $$('#noticeAlign [data-align]').forEach((b) => b.classList.toggle('active', b.dataset.align === draft.align));
    $$('#noticeBullets [data-bullet]').forEach((b) => b.classList.toggle('active', b.dataset.bullet === draft.bullet));
    fontPick?.refresh();
    const el = $('#noticePreview');
    el.setAttribute('style', postitStyle(draft));
    el.innerHTML = postitInner({ ...draft, text: draft.text.trim() ? draft.text : '공지 내용이 여기에 보여요' });
  }

  function openModal(id) {
    const existing = notices().find((n) => n.id === id);
    draft = existing ? normalize(existing)
      : normalize({ id: null, text: '', bg: BG_COLORS[0].v, fg: FG_COLORS[0], size: 32, font: 'paperlogy', show: true });
    $('#noticeModalTitle').textContent = existing ? '공지 수정하기' : '공지 새로 쓰기';
    $('#noticeSave').textContent = existing ? '저장' : '붙이기';
    $('#noticeText').value = draft.text;
    $('#noticeSize').value = draft.size;
    $('#noticeWeight').value = draft.weight;
    $('#noticeBold').checked = !!draft.bold;
    $('#noticeFit').checked = !!draft.fit;
    swatches();
    $('#noticeModal').hidden = false;
    preview();
    setTimeout(() => $('#noticeText').focus(), 50);
  }

  function save() {
    preview();
    if (!draft.text.trim()) { toast('공지 내용을 입력해 주세요'); $('#noticeText').focus(); return; }
    if (draft.id) {
      const i = notices().findIndex((n) => n.id === draft.id);
      if (i >= 0) notices()[i] = { ...draft };
    } else {
      if (notices().length >= MAX) { toast(`공지는 최대 ${MAX}개까지 만들 수 있어요`); return; }
      notices().unshift({ ...draft, id: Store.uid() });
    }
    Store.save();
    $('#noticeModal').hidden = true;
    renderAll();
    toast('공지를 붙였어요 📌');
  }

  function init() {
    $('#noticeAdd').addEventListener('click', () => openModal(null));
    $('#noticeSave').addEventListener('click', save);
    $('#noticeText').addEventListener('input', preview);
    $('#noticeSize').addEventListener('input', preview);
    $('#noticeWeight').addEventListener('input', preview);
    $('#noticeBold').addEventListener('change', preview);
    $('#noticeFit').addEventListener('change', preview);
    $('#noticeBullets').innerHTML = BULLETS.map((b) =>
      `<button data-bullet="${esc(b.v)}" title="${b.v === 'none' ? '글머리 기호 없음' : `글머리 기호 ${esc(b.label)}`}">${esc(b.label)}</button>`).join('');
    $('#noticeAlign').addEventListener('click', (e) => {
      const b = e.target.closest('[data-align]');
      if (b) { draft.align = b.dataset.align; preview(); }
    });
    $('#noticeBullets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bullet]');
      if (b) { draft.bullet = b.dataset.bullet; preview(); }
    });
    fontPick = Fonts.picker($('#noticeFontPick'), { get: () => draft?.font || 'paperlogy', set: (k) => { draft.font = k; preview(); } });
    window.addEventListener('fonts:changed', () => { renderAll(); if (!$('#noticeModal').hidden) preview(); });
    $('#noticeText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) save(); });

    $('#noticeBgSwatches').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bg]');
      if (!b) return;
      draft.bg = b.dataset.bg;
      swatches(); preview();
    });
    $('#noticeFgSwatches').addEventListener('click', (e) => {
      const b = e.target.closest('[data-fg]');
      if (!b) return;
      draft.fg = b.dataset.fg;
      swatches(); preview();
    });
    $('#noticeModal').addEventListener('input', (e) => {
      const c = e.target.dataset && e.target.dataset.custom;
      if (!c) return;
      draft[c] = e.target.value;
      const label = e.target.parentElement;
      label.style.background = e.target.value;
      label.parentElement.querySelectorAll('.selected').forEach((x) => x.classList.remove('selected'));
      label.classList.add('selected');
      preview();
    });
    $('#noticeModal').addEventListener('change', (e) => {
      if (e.target.dataset && e.target.dataset.custom) { swatches(); preview(); }
    });

    $('#noticeList').addEventListener('click', async (e) => {
      const item = e.target.closest('.notice-item');
      const act = e.target.dataset.act;
      if (!item || !act) return;
      const id = item.dataset.id;
      if (act === 'edit') openModal(id);
      if (act === 'del' && await UI.ask('이 공지를 삭제할까요?', '삭제')) {
        Store.data.notices = notices().filter((n) => n.id !== id);
        Store.save(); renderAll();
      }
    });
    $('#noticeList').addEventListener('change', (e) => {
      if (e.target.dataset.act !== 'show') return;
      const n = notices().find((x) => x.id === e.target.closest('.notice-item').dataset.id);
      if (n) { n.show = e.target.checked; Store.save(); renderBoard(); }
    });
    $('#noticeResetPos').addEventListener('click', () => {
      notices().forEach((n) => { delete n.x; delete n.y; delete n.w; delete n.h; });
      Store.save(); renderBoard();
      toast('포스트잇 위치와 크기를 처음대로 돌렸어요');
    });

    initDrag();
    UI.onPanel('noticePanel', { open: renderList });
    renderAll();
    // 글꼴이 늦게 불러와지면 크기가 바뀌므로 다시 배치
    document.fonts.ready.then(layout);
  }

  window.Notice = { init, renderAll, updateBodyClass };
})();
