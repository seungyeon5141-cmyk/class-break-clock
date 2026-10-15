// 학생 뽑기 (설정의 학생 명단 사용)
(function () {
  const { $, $$, esc, toast, randInt } = UI;
  let rolling = false;
  // 이번 판에서 뽑힌 후보 (이어서 뽑기에서 제외)
  let round = [];

  const st = () => Store.data.picker;
  // 제외 번호로 지정한 학생은 화면 어디에도 나오지 않게 처음부터 빼 둔다
  const students = () => Store.data.students.filter((p) => !st().secretIds.includes(p.id));
  const label = (p) => `${p.no ? `${p.no}번 ` : ''}${p.name}`;

  const MODES = {
    student: { unit: '명', noRepeat: '뽑힌 학생 제외', picked: 'pickedIds', empty: '뽑을 수 있는 학생이 없어요' },
    group: { unit: '모둠', noRepeat: '뽑힌 모둠 제외', picked: 'groupPicked', empty: '뽑을 수 있는 모둠이 없어요' },
    custom: { unit: '개', noRepeat: '뽑힌 항목 제외', picked: 'customPicked', empty: '뽑을 항목이 없어요' },
  };
  const mode = () => (MODES[st().mode] ? st().mode : 'student');
  const pickedList = () => st()[MODES[mode()].picked];

  function matchesGender(p) {
    const g = st().gender;
    return g === 'all' || p.gender === g;
  }

  function customLines() {
    return st().customItems.map((t) => String(t).trim()).filter(Boolean).slice(0, 60);
  }

  // 지금 모드에서 뽑을 수 있는 전체 후보 { id, no, name }
  function everyone() {
    if (mode() === 'group') {
      return Array.from({ length: st().groupCount }, (_, i) => ({ id: `g${i + 1}`, no: '', name: `${i + 1}모둠` }));
    }
    if (mode() === 'custom') return customLines().map((t, i) => ({ id: `c${i}:${t}`, no: '', name: t }));
    return students().filter(matchesGender);
  }

  function pool() {
    const picked = pickedList();
    const absent = mode() === 'student' ? st().excludedIds : [];
    return everyone().filter((p) => !absent.includes(p.id) && !(st().noRepeat && picked.includes(p.id)));
  }

  function renderSide() {
    const m = mode();
    const list = students();
    const { excludedIds, pickedIds } = st();
    $$('#pickerMode .mode-tab').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    $$('[data-mode-card]').forEach((c) => { c.hidden = c.dataset.modeCard !== m; });
    $('#pickSettings').hidden = m !== 'student';
    const hasGender = list.some((p) => p.gender);
    $('#pickerGender').hidden = m !== 'student' || !hasGender;
    if (!hasGender && st().gender !== 'all') st().gender = 'all';
    $$('#pickerGender .seg').forEach((b) => b.classList.toggle('active', b.dataset.gender === st().gender));

    const left = pool().length;
    if (m === 'student') {
      $('#pickerNotice').innerHTML = list.length
        ? `🎯 남은 학생 <b>${left}</b>명 중에서 뽑아요`
        : '📂 학생 명단이 비어 있어요. <button class="link-btn" id="goStudents">설정 › 학생 명단</button>에서 CSV 파일을 불러와 주세요.';
    } else if (m === 'group') {
      $('#pickerNotice').innerHTML = `👥 남은 모둠 <b>${left}</b>개 중에서 뽑아요`;
    } else {
      $('#pickerNotice').innerHTML = customLines().length
        ? `✏️ 남은 항목 <b>${left}</b>개 중에서 뽑아요`
        : '✏️ 오른쪽 칸에 뽑을 항목을 한 줄에 하나씩 입력해 주세요';
    }
    const go = $('#goStudents');
    if (go) go.addEventListener('click', () => { UI.openPanel('settingsPanel'); Settings.showTab('students'); });

    $('#pickerCountInfo').textContent = `${list.length}명`;
    $('#studentChips').innerHTML = list.map((p) => {
      const cls = ['s-chip'];
      if (excludedIds.includes(p.id)) cls.push('excluded');
      else if (pickedIds.includes(p.id)) cls.push('picked');
      if (!matchesGender(p)) cls.push('hidden-gender');
      return `<button class="${cls.join(' ')}" data-id="${esc(p.id)}" title="눌러서 결석 표시/해제">${esc(label(p))}</button>`;
    }).join('');

    $('#groupCount').textContent = st().groupCount;
    $('#groupChips').innerHTML = everyone().length && m === 'group'
      ? everyone().map((g) => `<span class="g-chip${st().groupPicked.includes(g.id) ? ' picked' : ''}">${esc(g.name)}</span>`).join('')
      : '';
    if (document.activeElement !== $('#customItems')) $('#customItems').value = st().customItems.join('\n');
    $('#customCount').textContent = customLines().length;

    const hist = historyList();
    $('#pickHistory').innerHTML = hist.length
      ? hist.slice(0, 60).map((h) => `<span>${esc(h)}</span>`).join('')
      : '<small>아직 없어요</small>';
    const maxCount = Math.max(1, Math.min(30, everyone().length));
    if (st().count > maxCount) st().count = maxCount;
    $('#pickCount').textContent = st().count;
    $('#pickUnit').textContent = MODES[m].unit;
    $('#pickNoRepeat').checked = st().noRepeat;
    $('#pickNoRepeatLabel').textContent = MODES[m].noRepeat;
    $('#pickEffect').checked = st().effect !== false;
  }

  function cardHtml(p, cls) {
    return `<div class="pick-card ${cls}"><div class="pc-no">${p.no ? `${esc(p.no)}번` : '&nbsp;'}</div><div class="pc-name">${esc(p.name)}</div></div>`;
  }

  const historyLabel = (p) => (mode() === 'student' ? label(p) : p.name);
  // 지금 탭의 뽑힌 기록만
  function historyList() {
    if (!st().histories || typeof st().histories !== 'object') st().histories = { student: [], group: [], custom: [] };
    if (!Array.isArray(st().histories[mode()])) st().histories[mode()] = [];
    return st().histories[mode()];
  }

  // 모두 한 번씩 뽑혔을 때 처음부터 다시
  function restartAll() {
    round = [];
    st()[MODES[mode()].picked] = [];
    Store.save();
  }

  function resetRound() {
    round = [];
    $('#pickContinue').hidden = true;
  }

  // cont = true 이면 '이어서 뽑기': 이번 판에서 이미 뽑힌 후보를 빼고 계속 뽑음
  async function go(cont = false) {
    if (rolling) return;
    if (!cont) round = [];
    Sound.unlock();
    const m = mode();
    if (m === 'student' && !students().length) { toast('먼저 설정에서 학생 명단을 불러와 주세요'); return; }
    if (m === 'custom' && !customLines().length) { toast('뽑을 항목을 먼저 입력해 주세요'); $('#customItems').focus(); return; }
    const inRound = new Set(round.map((w) => w.id));
    let candidates = pool().filter((p) => !inRound.has(p.id));
    // 모두 한 번씩 뽑혔으면 처음부터 다시 뽑음
    if (!candidates.length && (round.length || pickedList().length)) {
      restartAll();
      candidates = pool();
      if (candidates.length) toast('🔄 모두 한 번씩 뽑혀서 처음부터 다시 뽑아요');
    }
    if (!candidates.length) { toast(MODES[m].empty); renderSide(); return; }

    const count = Math.min(st().count, candidates.length);
    if (count < st().count) toast(`남은 후보가 ${candidates.length}${MODES[m].unit === '명' ? '명' : '개'}이라 ${count}${MODES[m].unit}만 뽑아요`);

    // 공정하게 섞어서 앞에서부터 선택
    const bag = candidates.slice();
    const winners = [];
    for (let i = 0; i < count; i++) winners.push(bag.splice(randInt(bag.length), 1)[0]);

    rolling = true;
    $('#pickGo').disabled = true;
    $('#pickContinue').disabled = true;
    const stage = $('#pickerStage');
    stage.classList.toggle('mode-group', m === 'group');
    // 앞에서 뽑힌 후보는 위에 작게 남겨 둠
    const prevHtml = round.length
      ? `<div class="round-prev"><span class="rp-label">앞에서 뽑힘</span>${round.map((w, i) => `<span class="rp-chip"><b>${i + 1}</b>${esc(historyLabel(w))}</span>`).join('')}</div>`
      : '';

    if (st().effect !== false) {
      stage.innerHTML = prevHtml + winners.map(() => cardHtml({ no: '', name: '?' }, 'rolling')).join('');
      const cards = $$('.pick-card', stage);
      const all = everyone();
      // 이름이 빠르게 바뀌다가 점점 느려지며 멈춤
      const start = performance.now();
      const duration = 1800;
      let delay = 50;
      while (performance.now() - start < duration) {
        cards.forEach((c, i) => {
          const p = all[randInt(all.length)];
          c.querySelector('.pc-no').innerHTML = p.no ? `${esc(p.no)}번` : '&nbsp;';
          c.querySelector('.pc-name').textContent = p.name;
          if (i === 0) Sound.click();
        });
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(220, delay * 1.12);
      }
      for (let i = 0; i < cards.length; i++) {
        cards[i].outerHTML = cardHtml(winners[i], 'final');
        Sound.click();
        await new Promise((r) => setTimeout(r, 180));
      }
    } else {
      stage.innerHTML = prevHtml + winners.map((w) => cardHtml(w, 'final')).join('');
    }
    round.push(...winners);
    Sound.fanfare();

    const picked = pickedList();
    winners.forEach((w) => {
      if (!picked.includes(w.id)) picked.push(w.id);
      historyList().unshift(historyLabel(w));
    });
    st().histories[m] = historyList().slice(0, 200);
    Store.save();
    rolling = false;
    $('#pickGo').disabled = false;
    $('#pickContinue').disabled = false;
    $('#pickContinue').hidden = false;
    // 이번에 마지막 후보까지 뽑았으면 '처음부터 다시' 안내
    const doneIds = new Set(round.map((w) => w.id));
    const allDone = !pool().some((p) => !doneIds.has(p.id));
    $('#pickContinue').textContent = allDone ? '🔄 처음부터 다시 뽑기' : '➕ 이어서 뽑기';
    $('#pickContinue').classList.toggle('restart', allDone);
    if (allDone) stage.insertAdjacentHTML('beforeend', '<div class="all-done">🎉 모두 한 번씩 뽑혔어요! <b>처음부터 다시 뽑기</b>를 누르면 새로 시작해요</div>');
    renderSide();
  }

  function setMode(m) {
    if (rolling || !MODES[m]) return;
    st().mode = m;
    Store.save();
    resetRound();
    $('#pickerStage').innerHTML = '<div class="picker-empty">뽑기 버튼을 눌러 주세요 ✨</div>';
    renderSide();
  }

  // ---------- 제외 번호 지정 (설정 톱니바퀴) ----------
  let secretDraft = [];

  function byNumber(a, b) {
    const na = parseInt(a.no, 10);
    const nb = parseInt(b.no, 10);
    if (Number.isNaN(na) || Number.isNaN(nb)) return String(a.no).localeCompare(String(b.no), 'ko');
    return na - nb;
  }

  function renderSecretGrid() {
    const list = Store.data.students.slice().sort(byNumber);
    $('#secretGrid').innerHTML = list.length
      ? list.map((p, i) => `<button class="secret-no${secretDraft.includes(p.id) ? ' on' : ''}" data-id="${esc(p.id)}" aria-pressed="${secretDraft.includes(p.id)}">${esc(p.no || i + 1)}</button>`).join('')
      : '<p class="mini-help">학생 명단이 비어 있어요. 설정 › 학생 명단에서 먼저 불러와 주세요.</p>';
  }

  function openSecret() {
    secretDraft = st().secretIds.slice();
    renderSecretGrid();
    $('#secretModal').hidden = false;
  }

  function saveSecret() {
    st().secretIds = secretDraft.filter((id) => Store.data.students.some((p) => p.id === id));
    Store.save();
    $('#secretModal').hidden = true;
    renderSide();
    toast('설정을 저장했어요');
  }

  function init() {
    $('#pickGo').addEventListener('click', () => go(false));
    $('#pickContinue').addEventListener('click', () => go(true));
    $('#pickSettings').addEventListener('click', openSecret);
    $('#secretSave').addEventListener('click', saveSecret);
    $('#secretGrid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      const id = b.dataset.id;
      secretDraft = secretDraft.includes(id) ? secretDraft.filter((x) => x !== id) : [...secretDraft, id];
      b.classList.toggle('on', secretDraft.includes(id));
      b.setAttribute('aria-pressed', String(secretDraft.includes(id)));
    });
    $('#pickCountMinus').addEventListener('click', () => { st().count = Math.max(1, st().count - 1); Store.save(); renderSide(); });
    $('#pickCountPlus').addEventListener('click', () => { st().count = Math.min(Math.max(1, everyone().length), st().count + 1, 30); Store.save(); renderSide(); });
    $('#pickNoRepeat').addEventListener('change', (e) => { st().noRepeat = e.target.checked; Store.save(); renderSide(); });
    $('#pickEffect').addEventListener('change', (e) => { st().effect = e.target.checked; Store.save(); });
    $('#pickerMode').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (b) setMode(b.dataset.mode);
    });
    const setGroups = (n) => {
      st().groupCount = Math.max(2, Math.min(12, n));
      st().groupPicked = st().groupPicked.filter((id) => Number(id.slice(1)) <= st().groupCount);
      Store.save();
      renderSide();
    };
    $('#groupMinus').addEventListener('click', () => setGroups(st().groupCount - 1));
    $('#groupPlus').addEventListener('click', () => setGroups(st().groupCount + 1));
    $('#customItems').addEventListener('input', (e) => {
      let lines = e.target.value.split('\n');
      if (lines.filter((t) => t.trim()).length > 60) {
        toast('항목은 60개까지 넣을 수 있어요');
        lines = lines.slice(0, 60);
      }
      st().customItems = lines;
      const valid = new Set(customLines().map((t, i) => `c${i}:${t}`));
      st().customPicked = st().customPicked.filter((id) => valid.has(id));
      Store.save();
      renderSide();
    });
    // 초기화는 지금 탭의 기록만
    $('#pickReset').addEventListener('click', () => {
      st()[MODES[mode()].picked] = [];
      st().histories[mode()] = [];
      Store.save();
      resetRound();
      $('#pickerStage').innerHTML = '<div class="picker-empty">뽑기 버튼을 눌러 주세요 ✨</div>';
      renderSide();
      const names = { student: '학생 뽑기', group: '모둠 선출', custom: '직접 입력 선출' };
      toast(`${names[mode()]} 기록을 초기화했어요`);
    });
    $('#pickerGender').addEventListener('click', (e) => {
      const b = e.target.closest('[data-gender]');
      if (!b) return;
      st().gender = b.dataset.gender;
      Store.save();
      renderSide();
    });
    $('#studentChips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      const id = b.dataset.id;
      const ex = st().excludedIds;
      st().excludedIds = ex.includes(id) ? ex.filter((x) => x !== id) : [...ex, id];
      Store.save();
      renderSide();
    });
    document.addEventListener('keydown', (e) => {
      if ($('#pickerPanel').hidden || e.code !== 'Space') return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      e.preventDefault();
      go(!$('#pickContinue').hidden);
    });
    UI.onPanel('pickerPanel', { open: renderSide });
  }

  window.Picker = { init, refresh: renderSide };
})();
