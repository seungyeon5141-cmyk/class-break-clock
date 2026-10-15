// 학생 뽑기 (설정의 학생 명단 사용)
(function () {
  const { $, $$, esc, toast, randInt } = UI;
  let rolling = false;

  const st = () => Store.data.picker;
  const students = () => Store.data.students;
  const label = (p) => `${p.no ? `${p.no}번 ` : ''}${p.name}`;

  function matchesGender(p) {
    const g = st().gender;
    return g === 'all' || p.gender === g;
  }

  function pool() {
    const { excludedIds, pickedIds, noRepeat } = st();
    return students().filter((p) => matchesGender(p) && !excludedIds.includes(p.id) && !(noRepeat && pickedIds.includes(p.id)));
  }

  function renderSide() {
    const list = students();
    const { excludedIds, pickedIds } = st();
    const hasGender = list.some((p) => p.gender);
    $('#pickerGender').hidden = !hasGender;
    if (!hasGender && st().gender !== 'all') st().gender = 'all';
    $$('#pickerGender .seg').forEach((b) => b.classList.toggle('active', b.dataset.gender === st().gender));

    $('#pickerNotice').innerHTML = list.length
      ? `🎯 남은 학생 <b>${pool().length}</b>명 중에서 뽑아요`
      : '📂 학생 명단이 비어 있어요. <button class="link-btn" id="goStudents">설정 › 학생 명단</button>에서 CSV 파일을 불러와 주세요.';
    const go = $('#goStudents');
    if (go) go.addEventListener('click', () => { UI.openPanel('settingsPanel'); Settings.showTab('students'); });

    $('#pickerCountInfo').textContent = `${list.length}명`;
    $('#studentChips').innerHTML = list.map((p) => {
      const cls = ['s-chip'];
      if (excludedIds.includes(p.id)) cls.push('excluded');
      else if (pickedIds.includes(p.id)) cls.push('picked');
      if (!matchesGender(p)) cls.push('hidden-gender');
      return `<button class="${cls.join(' ')}" data-id="${esc(p.id)}" title="눌러서 제외/포함">${esc(label(p))}</button>`;
    }).join('');

    const hist = st().history;
    $('#pickHistory').innerHTML = hist.length
      ? hist.slice(0, 60).map((h) => `<span>${esc(h)}</span>`).join('')
      : '<small>아직 없어요</small>';
    $('#pickCount').textContent = st().count;
    $('#pickNoRepeat').checked = st().noRepeat;
  }

  function cardHtml(p, cls) {
    return `<div class="pick-card ${cls}"><div class="pc-no">${p.no ? `${esc(p.no)}번` : '&nbsp;'}</div><div class="pc-name">${esc(p.name)}</div></div>`;
  }

  async function go() {
    if (rolling) return;
    Sound.unlock();
    if (!students().length) { toast('먼저 설정에서 학생 명단을 불러와 주세요'); return; }
    let candidates = pool();
    if (!candidates.length) {
      if (st().noRepeat && st().pickedIds.length && await UI.ask('모든 학생이 한 번씩 뽑혔어요. 처음부터 다시 뽑을까요?', '다시 뽑기')) {
        st().pickedIds = [];
        Store.save();
        candidates = pool();
      }
      if (!candidates.length) { toast('뽑을 수 있는 학생이 없어요'); renderSide(); return; }
    }

    const count = Math.min(st().count, candidates.length);
    if (count < st().count) toast(`남은 학생이 ${candidates.length}명이라 ${count}명만 뽑아요`);

    // 공정하게 섞어서 앞에서부터 선택
    const bag = candidates.slice();
    const winners = [];
    for (let i = 0; i < count; i++) winners.push(bag.splice(randInt(bag.length), 1)[0]);

    rolling = true;
    $('#pickGo').disabled = true;
    const stage = $('#pickerStage');
    stage.innerHTML = winners.map(() => cardHtml({ no: '', name: '?' }, 'rolling')).join('');
    const cards = $$('.pick-card', stage);
    const all = students().filter(matchesGender);

    // 이름이 빠르게 바뀌다가 점점 느려지며 멈춤
    const start = performance.now();
    const duration = 1800;
    let delay = 50;
    while (performance.now() - start < duration) {
      cards.forEach((c, i) => {
        if (c.classList.contains('final')) return;
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
    Sound.fanfare();

    winners.forEach((w) => {
      if (!st().pickedIds.includes(w.id)) st().pickedIds.push(w.id);
      st().history.unshift(label(w));
    });
    st().history = st().history.slice(0, 200);
    Store.save();
    rolling = false;
    $('#pickGo').disabled = false;
    renderSide();
  }

  function init() {
    $('#pickGo').addEventListener('click', go);
    $('#pickCountMinus').addEventListener('click', () => { st().count = Math.max(1, st().count - 1); Store.save(); renderSide(); });
    $('#pickCountPlus').addEventListener('click', () => { st().count = Math.min(Math.max(1, students().length), st().count + 1, 30); Store.save(); renderSide(); });
    $('#pickNoRepeat').addEventListener('change', (e) => { st().noRepeat = e.target.checked; Store.save(); renderSide(); });
    $('#pickReset').addEventListener('click', () => {
      st().pickedIds = [];
      st().history = [];
      Store.save();
      $('#pickerStage').innerHTML = '<div class="picker-empty">뽑기 버튼을 눌러 주세요 ✨</div>';
      renderSide();
      toast('뽑힌 기록을 초기화했어요');
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
      go();
    });
    UI.onPanel('pickerPanel', { open: renderSide });
  }

  window.Picker = { init, refresh: renderSide };
})();
