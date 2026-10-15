// 디데이: 만들기/수정/삭제, 메인 화면 왼쪽 위 고정
(function () {
  const { $, esc, toast } = UI;
  const MAX = 50;

  // 파스텔 키컬러 10가지
  const BG_COLORS = [
    { v: '#FFFFFF', n: '화이트' },
    { v: '#FFD6E7', n: '핑크' },
    { v: '#FFE0CC', n: '피치' },
    { v: '#FFF3B8', n: '버터' },
    { v: '#DDF5C8', n: '연두' },
    { v: '#C8F1E6', n: '민트' },
    { v: '#C9E8FF', n: '하늘' },
    { v: '#D6DCFF', n: '페리윙클' },
    { v: '#E6D6FF', n: '라벤더' },
    { v: '#F6D3F5', n: '라일락' },
  ];
  const FG_COLORS = ['#4B3B63', '#FF6B8B', '#FF9F5A', '#F2B705', '#5CC27E', '#4BAEE8',
    '#2F5FD0', '#8C6CF0', '#C759C9', '#F47BB6', '#FFFFFF', '#8A8A99'];

  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

  function countText(dateStr) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    if (!y || !m || !d) return 'D-?';
    const target = new Date(y, m - 1, d);
    const diff = Math.round((target - today0()) / 86400000);
    if (diff === 0) return 'D-DAY';
    return diff > 0 ? `D-${diff}` : `D+${-diff}`;
  }

  // 배경이 어두우면 제목 글자를 흰색으로
  function isDark(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return false;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 < 120;
  }

  function cardHtml(d) {
    const transparent = d.bg === 'transparent';
    const cls = ['dday-card', `pos-${d.pos === 'bottom' ? 'bottom' : 'top'}`];
    if (transparent) cls.push('transparent');
    else if (isDark(d.bg)) cls.push('dark');
    const style = `--dd-bg:${transparent ? 'transparent' : esc(d.bg)};--dd-fg:${esc(d.fg)};--dd-accent:${esc(d.fg)}`;
    return `<div class="${cls.join(' ')}" style="${style}">
      <div class="dd-count">${countText(d.date)}</div>
      <div class="dd-title">${esc(d.title)}</div>
      <div class="dd-date">${esc(d.date)}</div>
    </div>`;
  }

  function renderPins() {
    const shown = Store.data.ddays.filter((d) => d.show);
    $('#ddayPins').innerHTML = shown.map(cardHtml).join('');
    if (window.Notice) Notice.updateBodyClass();
    else document.body.classList.toggle('has-pins', shown.length > 0);
  }

  function renderList() {
    const list = Store.data.ddays;
    $('#ddayCount').textContent = list.length;
    if (!list.length) {
      $('#ddayList').innerHTML = '<div class="dday-empty">아직 디데이가 없어요.<br />오른쪽 아래 ＋ 버튼으로 만들어 보세요 📅</div>';
      return;
    }
    $('#ddayList').innerHTML = list.map((d) => `
      <div class="dday-item" data-id="${esc(d.id)}">
        ${cardHtml(d)}
        <div class="dday-item-actions">
          <label class="switch-row"><span>화면에서 보기</span><input type="checkbox" class="switch" data-act="show" ${d.show ? 'checked' : ''} /></label>
          <div class="mini-btns">
            <button class="mini-btn" data-act="edit">수정</button>
            <button class="mini-btn" data-act="del">삭제</button>
          </div>
        </div>
      </div>`).join('');
  }

  function renderAll() { renderPins(); renderList(); }

  // ---- 만들기/수정 모달 ----
  let draft = null;

  function swatchHtml() {
    const bg = BG_COLORS.map((c) =>
      `<button class="swatch${draft.bg === c.v ? ' selected' : ''}" data-bg="${c.v}" style="background:${c.v}" title="${c.n}"></button>`).join('');
    const isCustomBg = draft.bg !== 'transparent' && !BG_COLORS.some((c) => c.v === draft.bg);
    $('#ddayBgSwatches').innerHTML = bg +
      `<label class="swatch custom-sw${isCustomBg ? ' selected' : ''}" title="직접 고르기"${isCustomBg ? ` style="background:${esc(draft.bg)}"` : ''}><input type="color" data-custom="bg" value="${isCustomBg ? esc(draft.bg) : '#ffd6e7'}" /></label>` +
      `<button class="swatch transparent-sw${draft.bg === 'transparent' ? ' selected' : ''}" data-bg="transparent">투명</button>`;

    const isCustomFg = !FG_COLORS.includes(draft.fg);
    $('#ddayFgSwatches').innerHTML = FG_COLORS.map((c) =>
      `<button class="dot${draft.fg === c ? ' selected' : ''}" data-fg="${c}" style="background:${c}"></button>`).join('') +
      `<label class="dot custom-sw${isCustomFg ? ' selected' : ''}" title="직접 고르기"${isCustomFg ? ` style="background:${esc(draft.fg)}"` : ''}><input type="color" data-custom="fg" value="${isCustomFg ? esc(draft.fg) : '#4b3b63'}" /></label>`;
  }

  function preview() {
    draft.title = $('#ddayTitle').value.trim();
    draft.date = $('#ddayDate').value;
    draft.pos = document.querySelector('input[name="ddayPos"]:checked').value;
    $('#ddayPreview').outerHTML = cardHtml({ ...draft, title: draft.title || '제목' }).replace('<div class="dday-card', '<div id="ddayPreview" class="dday-card');
  }

  function openModal(id) {
    const existing = Store.data.ddays.find((d) => d.id === id);
    const t = today0();
    const dateStr = `${t.getFullYear()}-${UI.pad(t.getMonth() + 1)}-${UI.pad(t.getDate())}`;
    draft = existing ? { ...existing } : { id: null, title: '', date: dateStr, bg: BG_COLORS[1].v, fg: FG_COLORS[0], pos: 'top', show: true };
    $('#ddayModalTitle').textContent = existing ? '디데이 수정하기' : '디데이 새로 만들기';
    $('#ddaySave').textContent = existing ? '저장' : '만들기';
    $('#ddayTitle').value = draft.title;
    $('#ddayDate').value = draft.date;
    document.querySelector(`input[name="ddayPos"][value="${draft.pos === 'bottom' ? 'bottom' : 'top'}"]`).checked = true;
    swatchHtml();
    $('#ddayModal').hidden = false;
    preview();
    setTimeout(() => $('#ddayTitle').focus(), 50);
  }

  function save() {
    preview();
    if (!draft.title) { toast('제목을 입력해 주세요'); $('#ddayTitle').focus(); return; }
    if (!draft.date) { toast('날짜를 골라 주세요'); return; }
    if (draft.id) {
      const i = Store.data.ddays.findIndex((d) => d.id === draft.id);
      if (i >= 0) Store.data.ddays[i] = { ...draft };
    } else {
      if (Store.data.ddays.length >= MAX) { toast(`디데이는 최대 ${MAX}개까지 만들 수 있어요`); return; }
      Store.data.ddays.unshift({ ...draft, id: Store.uid() });
    }
    Store.save();
    $('#ddayModal').hidden = true;
    renderAll();
    toast('디데이를 저장했어요 📅');
  }

  function init() {
    $('#ddayAdd').addEventListener('click', () => openModal(null));
    $('#ddaySave').addEventListener('click', save);
    $('#ddayTitle').addEventListener('input', preview);
    $('#ddayDate').addEventListener('input', preview);
    document.querySelectorAll('input[name="ddayPos"]').forEach((r) => r.addEventListener('change', preview));
    $('#ddayTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

    $('#ddayBgSwatches').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bg]');
      if (!b) return;
      draft.bg = b.dataset.bg;
      swatchHtml(); preview();
    });
    $('#ddayFgSwatches').addEventListener('click', (e) => {
      const b = e.target.closest('[data-fg]');
      if (!b) return;
      draft.fg = b.dataset.fg;
      swatchHtml(); preview();
    });
    $('#ddayModal').addEventListener('input', (e) => {
      const c = e.target.dataset && e.target.dataset.custom;
      if (!c) return;
      draft[c] = e.target.value;
      const label = e.target.parentElement;
      label.style.background = e.target.value;
      label.parentElement.querySelectorAll('.selected').forEach((x) => x.classList.remove('selected'));
      label.classList.add('selected');
      preview();
    });
    $('#ddayModal').addEventListener('change', (e) => {
      if (e.target.dataset && e.target.dataset.custom) { swatchHtml(); preview(); }
    });

    $('#ddayList').addEventListener('click', async (e) => {
      const item = e.target.closest('.dday-item');
      const act = e.target.dataset.act;
      if (!item || !act) return;
      const id = item.dataset.id;
      if (act === 'edit') openModal(id);
      if (act === 'del') {
        const d = Store.data.ddays.find((x) => x.id === id);
        if (d && await UI.ask(`"${d.title}" 디데이를 삭제할까요?`, '삭제')) {
          Store.data.ddays = Store.data.ddays.filter((x) => x.id !== id);
          Store.save(); renderAll();
        }
      }
    });
    $('#ddayList').addEventListener('change', (e) => {
      if (e.target.dataset.act !== 'show') return;
      const d = Store.data.ddays.find((x) => x.id === e.target.closest('.dday-item').dataset.id);
      if (d) { d.show = e.target.checked; Store.save(); renderPins(); }
    });
    $('#ddayClearAll').addEventListener('click', async () => {
      if (!Store.data.ddays.length) return;
      if (await UI.ask('디데이를 모두 삭제할까요?', '모두 삭제')) { Store.data.ddays = []; Store.save(); renderAll(); }
    });

    UI.onPanel('ddayPanel', { open: renderList });
    renderAll();

    // 자정이 지나면 날짜 숫자 갱신
    let lastDay = new Date().getDate();
    setInterval(() => {
      const d = new Date().getDate();
      if (d !== lastDay) { lastDay = d; renderAll(); }
    }, 30000);
  }

  window.DDay = { init, renderAll, countText };
})();
