// 판서: 칠판에 글자를 쓰고(크기·글꼴·굵기·색) 펜으로 그리기, 저장·목록·인쇄
(function () {
  const { $, $$, esc, toast } = UI;

  const MAX_CHARS = 10000;
  const MAX_PAGES = 200;
  const SIZES = [20, 24, 28, 32, 40, 48, 56, 64, 72, 88, 100, 120, 150, 180];
  const WEIGHTS = [
    { v: 300, label: '가늘게' },
    { v: 500, label: '보통' },
    { v: 700, label: '굵게' },
    { v: 800, label: '더 굵게' },
    { v: 900, label: '아주 굵게' },
  ];
  const BOARDS = [
    { v: '#1f4a3c', label: '초록 칠판' },
    { v: '#0e3b3c', label: '청록 칠판' },
    { v: '#2a2e31', label: '검정 칠판' },
    { v: '#1d2a4a', label: '남색 칠판' },
    { v: '#4a3328', label: '갈색 칠판' },
    { v: '#fdfdf8', label: '화이트보드', light: true },
    { v: '#ffeef5', label: '연분홍', light: true },
    { v: '#f1ebff', label: '연보라', light: true },
    { v: '#fff6dc', label: '크림', light: true },
    { v: '#e4f6ee', label: '민트', light: true },
  ];
  const INKS = [
    { v: '#ffffff', label: '하양 분필' },
    { v: '#fff27a', label: '노랑 분필' },
    { v: '#ffb3c7', label: '분홍 분필' },
    { v: '#9fd8ff', label: '하늘 분필' },
    { v: '#b9f0a6', label: '연두 분필' },
    { v: '#ffc58a', label: '주황 분필' },
    { v: '#ff6b6b', label: '빨강' },
    { v: '#c9a7ff', label: '보라' },
    { v: '#1f6feb', label: '파랑' },
    { v: '#1d9a5b', label: '초록' },
    { v: '#8a8a8a', label: '회색' },
    { v: '#222222', label: '검정' },
  ];
  const MARKS = [
    { v: 'transparent', label: '형광펜 없음' },
    { v: 'rgba(255, 238, 88, 0.55)', label: '노랑 형광' },
    { v: 'rgba(255, 140, 190, 0.5)', label: '분홍 형광' },
    { v: 'rgba(120, 220, 255, 0.5)', label: '하늘 형광' },
    { v: 'rgba(140, 240, 150, 0.5)', label: '연두 형광' },
    { v: 'rgba(255, 170, 90, 0.5)', label: '주황 형광' },
    { v: 'rgba(200, 160, 255, 0.5)', label: '보라 형광' },
  ];
  const PEN_SIZES = [3, 6, 10, 16, 24];
  const ERASER = 34;

  const cfg = () => Store.data.board;
  let text;
  let canvas;
  let page = null;      // 지금 쓰는 판서 { id, html, strokes, bg, base, updated }
  let strokes = [];
  let mode = 'text';    // text | pen | eraser
  let savedRange = null;
  let dirty = false;
  let saveTimer = null;
  let fontPick = null;

  const isLight = (bg) => {
    const hit = BOARDS.find((b) => b.v === bg);
    if (hit) return !!hit.light;
    const m = /^#?([0-9a-f]{6})$/i.exec(bg || '');
    if (!m) return false;
    const n = parseInt(m[1], 16);
    return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150;
  };
  const plain = () => text.textContent.replace(/​/g, '');

  // ---------- 바탕(칠판 전체 기본 글자 모양) ----------
  function applyBase() {
    const b = page.base;
    text.style.fontFamily = Fonts.css(b.font);
    text.style.fontSize = `${b.size}px`;
    text.style.fontWeight = b.weight;
    text.style.color = b.color;
    $('#boardSurface').style.setProperty('--board-bg', page.bg);
    $('#boardSurface').classList.toggle('light', isLight(page.bg));
    syncTools();
  }

  function showSize(px) {
    if (!$(`#boardSize option[value="${px}"]`)) $('#boardSize').insertAdjacentHTML('beforeend', `<option value="${px}">${px}px</option>`);
    $('#boardSize').value = String(px);
  }
  function showWeight(w) {
    const near = WEIGHTS.reduce((a, x) => (Math.abs(x.v - w) < Math.abs(a.v - w) ? x : a), WEIGHTS[0]);
    $('#boardWeight').value = String(near.v);
  }

  // 커서가 있는 글자의 크기·굵기를 도구 막대에 보여 준다
  function showCaretStyle() {
    const sel = getSelection();
    if (!sel.rangeCount || !inText(sel.anchorNode)) return;
    const el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    if (!el) return;
    const cs = getComputedStyle(el);
    showSize(Math.round(parseFloat(cs.fontSize)));
    showWeight(Number(cs.fontWeight) || 500);
  }

  function syncTools() {
    const b = page.base;
    showSize(b.size);
    showWeight(b.weight);
    $('#boardColorBtn').style.setProperty('--sw', b.color);
    $('#boardBgBtn').style.setProperty('--sw', page.bg);
    $('#boardPenBtn').style.setProperty('--sw', cfg().pen.color);
    fontPick?.refresh();
    $$('#boardModes [data-mode]').forEach((x) => x.classList.toggle('active', x.dataset.mode === mode));
    $$('#boardPenSizes [data-pen-size]').forEach((x) => x.classList.toggle('active', Number(x.dataset.penSize) === cfg().pen.size));
    $('#boardToolbar').dataset.mode = mode;
    $('#boardUndo').disabled = !strokes.length;
  }

  // ---------- 글자 선택 영역 기억 (도구 버튼을 눌러도 선택이 풀리지 않게) ----------
  function inText(node) { return node && text.contains(node); }
  function rememberSelection() {
    const sel = getSelection();
    if (sel.rangeCount && inText(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    if (!savedRange || !inText(savedRange.startContainer)) return false;
    text.focus({ preventScroll: true });
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    return true;
  }
  const hasSelection = () => savedRange && !savedRange.collapsed && inText(savedRange.commonAncestorContainer);
  const hasCaret = () => savedRange && inText(savedRange.startContainer) && plain().trim().length > 0;

  // 크기·글꼴·굵기: 고른 글자에만, 커서만 있으면 거기서부터 새로 쓰는 글자에, 아무것도 없으면 칠판 전체에
  function applyInline(css, baseKey, baseVal) {
    if (mode !== 'text') setMode('text');
    if (hasSelection()) {
      restoreSelection();
      document.execCommand('styleWithCSS', false, false);
      document.execCommand('fontSize', false, '7');
      const made = [];
      text.querySelectorAll('font[size="7"]').forEach((f) => {
        const span = document.createElement('span');
        Object.assign(span.style, css);
        span.append(...f.childNodes);
        span.querySelectorAll('[style]').forEach((d) => { Object.keys(css).forEach((k) => { d.style[k] = ''; }); });
        f.replaceWith(span);
        made.push(span);
      });
      if (made.length) {
        const r = document.createRange();
        r.setStartBefore(made[0]);
        r.setEndAfter(made[made.length - 1]);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        savedRange = r.cloneRange();
      }
      changed();
      return;
    }
    if (hasCaret() && restoreSelection()) {
      const span = document.createElement('span');
      Object.assign(span.style, css);
      span.textContent = '​';
      const r = savedRange;
      r.insertNode(span);
      const sel = getSelection();
      const c = document.createRange();
      c.setStart(span.firstChild, 1);
      c.collapse(true);
      sel.removeAllRanges();
      sel.addRange(c);
      savedRange = c.cloneRange();
      changed();
      return;
    }
    page.base[baseKey] = baseVal;
    cfg().base[baseKey] = baseVal; // 새 판서도 이 모양으로 시작
    Store.save();
    applyBase();
    changed();
  }

  // 굵게·기울임·밑줄·취소선·글자색·형광펜·정렬
  function command(cmd, value = null) {
    if (mode !== 'text') setMode('text');
    if (!restoreSelection()) {
      text.focus();
      const r = document.createRange();
      r.selectNodeContents(text);
      r.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    }
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(cmd, false, value);
    rememberSelection();
    changed();
    updateStates();
  }

  function setColor(color) {
    if (!plain().trim() && !hasSelection()) {
      page.base.color = color;
      cfg().base.color = color;
      Store.save();
      applyBase();
      changed();
      return;
    }
    command('foreColor', color);
  }

  function updateStates() {
    if (!document.queryCommandState) return;
    ['bold', 'italic', 'underline', 'strikeThrough'].forEach((c) => {
      const b = $(`#boardToolbar [data-cmd="${c}"]`);
      if (b) b.classList.toggle('active', inText(getSelection().anchorNode) && document.queryCommandState(c));
    });
  }

  // ---------- 펜 ----------
  function setMode(m) {
    mode = m;
    canvas.classList.toggle('drawing', m !== 'text');
    canvas.classList.toggle('erasing', m === 'eraser');
    text.contentEditable = m === 'text' ? 'true' : 'false';
    syncTools();
  }

  function resizeCanvas() {
    const r = canvas.parentElement.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    redraw();
  }

  function drawStroke(ctx, s) {
    const pts = s.p;
    if (!pts.length) return;
    ctx.save();
    ctx.globalCompositeOperation = s.e ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.c;
    ctx.fillStyle = s.c;
    ctx.lineWidth = s.w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0][0], pts[0][1], s.w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2;
        const my = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last[0], last[1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  function redraw() {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    strokes.forEach((s) => drawStroke(ctx, s));
  }

  function initPen() {
    let cur = null;
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10];
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (mode === 'text' || e.button > 0) return;
      canvas.setPointerCapture(e.pointerId);
      const eraser = mode === 'eraser' || e.button === 5;
      cur = { c: cfg().pen.color, w: eraser ? ERASER : cfg().pen.size, e: eraser ? 1 : 0, p: [pos(e)] };
      strokes.push(cur);
      redraw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!cur) return;
      const p = pos(e);
      const last = cur.p[cur.p.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.5) return;
      cur.p.push(p);
      redraw();
    });
    const end = () => {
      if (!cur) return;
      cur = null;
      $('#boardUndo').disabled = !strokes.length;
      changed();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    new ResizeObserver(resizeCanvas).observe(canvas.parentElement);
  }

  // ---------- 저장 ----------
  function cleanHtml() {
    // 커서 자리 표시(보이지 않는 글자)는 다른 글자가 있으면 지운다
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (n.data.includes('​') && n.data.replace(/​/g, '').length) n.data = n.data.replace(/​/g, '');
    }
    return text.innerHTML;
  }

  function titleOf() {
    const first = (text.innerText || '').split('\n').map((s) => s.replace(/​/g, '').trim()).find(Boolean);
    return first ? first.slice(0, 40) : (strokes.length ? '그림 판서' : '빈 판서');
  }

  function snapshot() {
    page.html = cleanHtml();
    page.strokes = strokes;
    page.title = titleOf();
    page.updated = Date.now();
    return page;
  }

  async function persist(showToast) {
    clearTimeout(saveTimer);
    if (!page) return;
    snapshot();
    try {
      await Db.put('boards', page.id, JSON.parse(JSON.stringify(page)));
      cfg().currentId = page.id;
      Store.save();
      dirty = false;
      $('#boardSave').classList.remove('dirty');
      if (showToast) toast('판서를 저장했어요 💾');
      trimPages();
    } catch (e) {
      if (showToast) toast('저장하지 못했어요. 다시 시도해 주세요');
    }
  }

  async function trimPages() {
    const all = await listPages();
    all.slice(MAX_PAGES).forEach((p) => Db.del('boards', p.id).catch(() => {}));
  }

  function changed() {
    dirty = true;
    $('#boardSave').classList.add('dirty');
    updateCount();
    if (cfg().autosave) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => persist(false), 700);
    }
  }

  function updateCount() {
    const n = plain().length;
    $('#boardCount').textContent = `${n.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`;
    $('#boardCount').classList.toggle('over', n >= MAX_CHARS);
    text.classList.toggle('empty', !n && !text.querySelector('img'));
  }

  function newPage() {
    const base = { font: 'pretendard', size: 56, weight: 500, color: '#ffffff', ...cfg().base };
    return { id: Store.uid(), html: '', strokes: [], bg: cfg().bg, base, title: '빈 판서', updated: Date.now() };
  }

  function load(p) {
    page = { ...newPage(), ...p, base: { ...newPage().base, ...(p.base || {}) } };
    text.innerHTML = page.html || '';
    strokes = Array.isArray(page.strokes) ? page.strokes : [];
    savedRange = null;
    dirty = false;
    $('#boardSave').classList.remove('dirty');
    applyBase();
    redraw();
    updateCount();
    cfg().currentId = page.id;
    Store.save();
  }

  async function listPages() {
    const rows = await Db.all('boards');
    return rows.map((r) => r.value).filter((p) => p && p.id).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  }

  async function startNew() {
    if (dirty && !cfg().autosave && (plain().trim() || strokes.length)) {
      if (!(await UI.ask('저장하지 않은 판서가 있어요. 저장하고 새로 시작할까요?', '저장하고 새로'))) return;
      await persist(false);
    } else if (dirty) {
      await persist(false);
    }
    load(newPage());
    setMode('text');
    text.focus();
  }

  // ---------- 목록 ----------
  async function openList() {
    if (dirty && cfg().autosave) await persist(false);
    const pages = await listPages().catch(() => []);
    const fmt = (t) => {
      const d = new Date(t);
      return `${d.getMonth() + 1}월 ${d.getDate()}일 ${UI.pad(d.getHours())}:${UI.pad(d.getMinutes())}`;
    };
    $('#boardListBody').innerHTML = pages.length ? pages.map((p) => `
      <div class="bl-row${page && p.id === page.id ? ' current' : ''}">
        <span class="bl-sw" style="background:${esc(p.bg)}"></span>
        <button class="bl-open" data-open-page="${esc(p.id)}">
          <b>${esc(p.title || '빈 판서')}</b>
          <small>${fmt(p.updated)}${page && p.id === page.id ? ' · 지금 쓰는 중' : ''}</small>
        </button>
        <button class="mini-btn bl-del" data-del-page="${esc(p.id)}" title="지우기" aria-label="지우기">🗑</button>
      </div>`).join('') : '<p class="mini-help">저장된 판서가 없어요.</p>';
    $('#boardListModal').hidden = false;
  }

  // ---------- 색 고르기 작은 창 ----------
  function palette(anchor, items, current, onPick, { custom = true, round = true } = {}) {
    closePalette();
    const pop = document.createElement('div');
    pop.className = 'board-pop';
    pop.id = 'boardPop';
    pop.innerHTML = `<div class="bp-grid${round ? '' : ' square'}">${items.map((c) =>
      `<button class="bp-sw${c.v === current ? ' active' : ''}${c.v === 'transparent' ? ' none' : ''}" data-c="${esc(c.v)}" title="${esc(c.label)}" aria-label="${esc(c.label)}" style="--c:${esc(c.v)}"></button>`).join('')}</div>
      ${custom ? `<label class="bp-custom">🎨 직접 고르기 <input type="color" value="${/^#[0-9a-f]{6}$/i.test(current) ? current : '#ffffff'}" /></label>` : ''}`;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left))}px`;
    pop.style.top = `${r.bottom + 6}px`;
    pop.addEventListener('mousedown', (e) => { if (!e.target.closest('input')) e.preventDefault(); });
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      onPick(b.dataset.c);
      closePalette();
    });
    const inp = pop.querySelector('input[type=color]');
    if (inp) inp.addEventListener('change', () => { onPick(inp.value); closePalette(); });
  }
  function closePalette() { document.getElementById('boardPop')?.remove(); }

  // ---------- 인쇄 ----------
  function print() {
    if (dirty) persist(false);
    document.body.classList.add('print-board');
    const done = () => { document.body.classList.remove('print-board'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 500); }, 50);
  }

  function init() {
    text = $('#boardText');
    canvas = $('#boardInk');
    if (!cfg().pen || typeof cfg().pen !== 'object') cfg().pen = { ...Store.defaults.board.pen };

    $('#boardSize').innerHTML = SIZES.map((s) => `<option value="${s}">${s}px</option>`).join('');
    $('#boardWeight').innerHTML = WEIGHTS.map((w) => `<option value="${w.v}">${w.label}</option>`).join('');
    $('#boardPenSizes').innerHTML = PEN_SIZES.map((s) =>
      `<button class="pen-size" data-pen-size="${s}" title="펜 굵기 ${s}" aria-label="펜 굵기 ${s}"><i style="--d:${Math.min(22, s + 2)}px"></i></button>`).join('');
    fontPick = Fonts.picker($('#boardFontPick'), {
      compact: true,
      get: () => (page ? page.base.font : cfg().base.font),
      set: (k) => applyInline({ fontFamily: Fonts.css(k) }, 'font', k),
    });

    // 도구 버튼을 눌러도 칠판 글자 선택이 풀리지 않게
    $('#boardToolbar').addEventListener('mousedown', (e) => {
      if (e.target.closest('button') && !e.target.closest('select, input')) e.preventDefault();
    });
    document.addEventListener('selectionchange', () => { rememberSelection(); updateStates(); showCaretStyle(); });

    $('#boardToolbar').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.mode) { setMode(b.dataset.mode); if (b.dataset.mode === 'text') restoreSelection(); return; }
      if (b.dataset.cmd) { command(b.dataset.cmd, b.dataset.val || null); return; }
      if (b.dataset.step) {
        const cur = Number($('#boardSize').value) || page.base.size;
        const next = Math.max(12, Math.min(240, cur + Number(b.dataset.step) * (cur >= 72 ? 8 : 4)));
        showSize(next);
        applyInline({ fontSize: `${next}px` }, 'size', next);
        return;
      }
      if (b.dataset.penSize) { cfg().pen.size = Number(b.dataset.penSize); Store.save(); if (mode === 'text') setMode('pen'); else syncTools(); }
    });
    $('#boardSize').addEventListener('change', (e) => { const v = Number(e.target.value); applyInline({ fontSize: `${v}px` }, 'size', v); });
    $('#boardWeight').addEventListener('change', (e) => { const v = Number(e.target.value); applyInline({ fontWeight: String(v) }, 'weight', v); });
    $('#boardColorBtn').addEventListener('click', (e) => palette(e.currentTarget, INKS, page.base.color, setColor));
    $('#boardMarkBtn').addEventListener('click', (e) => palette(e.currentTarget, MARKS, null, (c) => command('hiliteColor', c), { custom: false }));
    $('#boardPenBtn').addEventListener('click', (e) => palette(e.currentTarget, INKS, cfg().pen.color, (c) => {
      cfg().pen.color = c;
      Store.save();
      if (mode !== 'pen') setMode('pen'); else syncTools();
    }));
    $('#boardBgBtn').addEventListener('click', (e) => palette(e.currentTarget, BOARDS, page.bg, (c) => {
      const wasLight = isLight(page.bg);
      page.bg = c;
      cfg().bg = c;
      // 칠판 ↔ 화이트보드로 바꾸면 기본 글자색·펜색도 잘 보이게 바꿔 준다
      if (isLight(c) !== wasLight) {
        const flip = isLight(c) ? ['#ffffff', '#222222'] : ['#222222', '#ffffff'];
        if (page.base.color.toLowerCase() === flip[0]) { page.base.color = flip[1]; cfg().base.color = flip[1]; }
        if (cfg().pen.color.toLowerCase() === flip[0]) cfg().pen.color = flip[1];
        strokes.forEach((st) => { if (String(st.c).toLowerCase() === flip[0]) st.c = flip[1]; });
        redraw();
      }
      Store.save();
      applyBase();
      changed();
    }, { round: false }));
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('#boardPop, #boardColorBtn, #boardMarkBtn, #boardPenBtn, #boardBgBtn')) closePalette();
    }, true);

    $('#boardUndo').addEventListener('click', () => { strokes.pop(); redraw(); syncTools(); changed(); });
    $('#boardClear').addEventListener('click', async () => {
      if (!plain().trim() && !strokes.length) return;
      const what = mode === 'text' ? '글자와 그림을 모두' : '펜으로 그린 그림을 모두';
      if (!(await UI.ask(`칠판의 ${what} 지울까요?`, '모두 지우기'))) return;
      if (mode === 'text') text.innerHTML = '';
      strokes = [];
      redraw();
      syncTools();
      changed();
    });

    // 글자 입력
    text.addEventListener('input', () => {
      if (!plain() && !text.querySelector('img')) text.innerHTML = '';
      changed();
    });
    text.addEventListener('beforeinput', (e) => {
      if (/^insert/.test(e.inputType) && plain().length >= MAX_CHARS) { e.preventDefault(); toast(`판서는 ${MAX_CHARS.toLocaleString()}자까지 쓸 수 있어요`); }
    });
    // 붙여넣기는 글자만 (다른 곳의 글꼴·색이 섞이지 않게)
    text.addEventListener('paste', (e) => {
      e.preventDefault();
      const t = (e.clipboardData.getData('text/plain') || '').slice(0, Math.max(0, MAX_CHARS - plain().length));
      document.execCommand('insertText', false, t);
    });
    text.addEventListener('drop', (e) => e.preventDefault());

    $('#boardAutosave').checked = !!cfg().autosave;
    $('#boardAutosave').addEventListener('change', (e) => {
      cfg().autosave = e.target.checked;
      Store.save();
      if (cfg().autosave && dirty) persist(false);
      toast(cfg().autosave ? '쓰는 대로 자동으로 저장해요' : '자동 저장을 껐어요. 💾 저장을 눌러 저장하세요');
    });
    $('#boardSave').addEventListener('click', () => persist(true));
    $('#boardNew').addEventListener('click', startNew);
    $('#boardListBtn').addEventListener('click', openList);
    $('#boardPrint').addEventListener('click', print);
    $('#boardListBody').addEventListener('click', async (e) => {
      const o = e.target.closest('[data-open-page]');
      if (o) {
        if (dirty) await persist(false);
        const p = await Db.get('boards', o.dataset.openPage);
        if (p) load(p);
        $('#boardListModal').hidden = true;
        return;
      }
      const d = e.target.closest('[data-del-page]');
      if (d) {
        if (!(await UI.ask('이 판서를 지울까요? 지운 판서는 되돌릴 수 없어요.', '지우기'))) return;
        await Db.del('boards', d.dataset.delPage).catch(() => {});
        if (page && page.id === d.dataset.delPage) load(newPage());
        openList();
      }
    });

    initPen();
    // 마지막으로 쓰던 판서 불러오기
    const lastId = cfg().currentId;
    load(newPage());
    if (lastId) {
      Db.get('boards', lastId).then((p) => { if (p && !dirty) load(p); }).catch(() => {});
    }
    window.addEventListener('fonts:changed', applyBase);
    window.addEventListener('beforeunload', () => { if (dirty && cfg().autosave) persist(false); });

    UI.onPanel('boardPanel', {
      open: () => {
        resizeCanvas();
        if (mode === 'text') setTimeout(() => { if (!restoreSelection()) text.focus({ preventScroll: true }); }, 60);
      },
      close: () => { closePalette(); Fonts.closeMenu(); if (dirty && cfg().autosave) persist(false); },
    });
  }

  window.Board = { init };
})();
