// 설정: 시간표, 알림·소리, 학생 명단(CSV), 일반
(function () {
  const { $, $$, esc, toast, pad } = UI;

  function showTab(name) {
    $$('.snav').forEach((b) => b.classList.toggle('active', b.dataset.stab === name));
    $$('.stab').forEach((s) => { s.hidden = s.dataset.stabPanel !== name; });
  }

  // ---------- 시간표 ----------
  const fromSec = (s) => `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor((s % 3600) / 60))}`;

  const isLunch = (p) => p.type === 'lunch';
  const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const profiles = () => Store.data.schedule.profiles;
  let editId = null;

  // 지금 고치고 있는 시정 (처음에는 오늘 쓰는 시정)
  function prof() {
    let p = profiles().find((x) => x.id === editId);
    if (!p) {
      p = Clock.profileFor(new Date()) || profiles()[0];
      if (!p) {
        p = { id: Store.uid(), name: '기본 시정', days: [1, 2, 3, 4, 5], periods: [] };
        profiles().push(p);
      }
      editId = p.id;
    }
    return p;
  }

  const daysText = (days) => {
    const d = DAY_ORDER.filter((x) => (days || []).includes(x));
    if (!d.length) return '요일 없음';
    if (d.join() === '1,2,3,4,5') return '월~금';
    if (d.length === 7) return '매일';
    return d.map((x) => DAY_NAMES[x]).join('·');
  };

  function renderProfiles() {
    const cur = prof();
    $('#profileTabs').innerHTML = profiles().map((p) =>
      `<button class="profile-tab${p.id === cur.id ? ' active' : ''}" data-pid="${esc(p.id)}" role="tab" aria-selected="${p.id === cur.id}">
        <b>${esc(p.name)}</b><small>${esc(daysText(p.days))}</small></button>`).join('') +
      '<button class="profile-tab add" id="profileAdd" title="요일별 시정 추가">＋ 시정 추가</button>';
    if (document.activeElement !== $('#profileName')) $('#profileName').value = cur.name;
    $('#profileDays').innerHTML = DAY_ORDER.map((d) => {
      const owner = profiles().find((p) => (p.days || []).includes(d));
      const on = owner && owner.id === cur.id;
      const other = owner && !on ? ` title="지금은 '${esc(owner.name)}'에 있어요. 누르면 이쪽으로 옮겨 와요"` : '';
      return `<button class="day-chip${on ? ' on' : ''}${owner && !on ? ' taken' : ''}${d === 0 ? ' sun' : d === 6 ? ' sat' : ''}" data-day="${d}" aria-pressed="${!!on}"${other}>${DAY_NAMES[d]}</button>`;
    }).join('');
    $('#profileDelete').hidden = profiles().length < 2;
    $('#profileTitle').textContent = `· ${cur.name} (${daysText(cur.days)})`;
  }

  function renderSchedule() {
    renderProfiles();
    const rows = prof().periods;
    const toSec = Clock.toSec;
    const sorted = rows.map((p) => ({ id: p.id, type: p.type, s: toSec(p.start), e: toSec(p.end) }))
      .filter((p) => p.s !== null && p.e !== null).sort((a, b) => a.s - b.s);
    $('#schedRows').innerHTML = rows.map((p, i) => {
      const s = toSec(p.start);
      const e = toSec(p.end);
      let len = '';
      let gap = '';
      let gapCls = '';
      if (s === null || e === null) len = '<span class="muted bad">시간 확인</span>';
      else if (e <= s) len = '<span class="muted bad">끝이 더 빨라요</span>';
      else {
        len = `<span class="muted${isLunch(p) ? ' lunch' : ''}">${Math.round((e - s) / 60)}분</span>`;
        const idx = sorted.findIndex((x) => x.id === p.id);
        const next = sorted[idx + 1];
        if (next) {
          const g = Math.round((next.s - e) / 60);
          if (g < 0) { gap = '다음 줄과 겹쳐요'; gapCls = 'bad'; }
          else if (g === 0) gap = next.type === 'lunch' ? '🍱 바로 점심' : '바로 이어짐';
          else if (g >= 30 && !rows.some(isLunch)) { gap = `🍱 점심 ${g}분`; gapCls = 'lunch'; }
          else gap = `☕ ${g}분 (${fromSec(e)}~${fromSec(next.s)})`;
        } else gap = '🎒 하교';
      }
      return `<tr data-id="${esc(p.id)}" class="${isLunch(p) ? 'row-lunch' : ''}">
        <td class="move-cell"><span class="drag-handle" title="끌어서 순서 바꾸기" aria-hidden="true">⠿</span>
          <span class="updown"><button data-move="-1" title="위로" aria-label="위로" ${i === 0 ? 'disabled' : ''}>▲</button><button data-move="1" title="아래로" aria-label="아래로" ${i === rows.length - 1 ? 'disabled' : ''}>▼</button></span></td>
        <td><input data-f="name" value="${esc(p.name)}" maxlength="12" /></td>
        <td><select data-f="type"><option value="class" ${!isLunch(p) ? 'selected' : ''}>수업</option><option value="lunch" ${isLunch(p) ? 'selected' : ''}>점심</option></select></td>
        <td><input data-f="start" type="time" value="${esc(p.start)}" /></td>
        <td><input data-f="end" type="time" value="${esc(p.end)}" /></td>
        <td>${len}</td>
        <td><span class="muted ${gapCls}">${gap}</span></td>
        <td><button class="del-btn" data-del title="삭제">✕</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" class="muted" style="padding:16px">교시를 추가해 주세요</td></tr>';
    $('#schedAutoTime').checked = Store.data.schedule.autoRetime !== false;
  }

  function scheduleChanged(rerender = true) {
    Store.save();
    if (rerender) renderSchedule();
    Clock.refresh();
  }

  // 순서를 바꾼 뒤 시간 다시 맞추기: 각 줄의 길이는 그대로,
  // 수업↔수업 사이는 원래 쉬는 시간(가장 흔한 값), 점심 앞뒤는 바로 이어지게
  function retime(oldRows, newRows) {
    const toSec = Clock.toSec;
    const valid = newRows.every((p) => toSec(p.start) !== null && toSec(p.end) !== null && toSec(p.end) > toSec(p.start));
    if (!valid) return false;
    const byTime = oldRows.slice().sort((a, b) => toSec(a.start) - toSec(b.start));
    const gaps = [];
    for (let i = 1; i < byTime.length; i++) {
      if (!isLunch(byTime[i - 1]) && !isLunch(byTime[i])) {
        const g = toSec(byTime[i].start) - toSec(byTime[i - 1].end);
        if (g > 0) gaps.push(g);
      }
    }
    const counts = {};
    gaps.forEach((g) => { counts[g] = (counts[g] || 0) + 1; });
    const brk = Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a - b)[0]) || 600;
    let t = Math.min(...newRows.map((p) => toSec(p.start)));
    newRows.forEach((p, i) => {
      const len = toSec(p.end) - toSec(p.start);
      p.start = fromSec(t);
      p.end = fromSec(t + len);
      const next = newRows[i + 1];
      t += len + (next && !isLunch(p) && !isLunch(next) ? brk : 0);
    });
    return t <= 24 * 3600;
  }

  function moveRow(from, to) {
    const rows = prof().periods;
    if (to < 0 || to >= rows.length || from === to) return;
    const before = rows.map((p) => ({ ...p }));
    const [row] = rows.splice(from, 1);
    rows.splice(to, 0, row);
    if (Store.data.schedule.autoRetime !== false && !retime(before, rows)) {
      toast('시간을 확인할 수 없는 줄이 있어서 순서만 바꿨어요');
    }
    scheduleChanged();
  }

  function initSchedule() {
    $('#schedRows').addEventListener('change', (e) => {
      const tr = e.target.closest('tr[data-id]');
      const f = e.target.dataset.f;
      if (!tr || !f) return;
      const p = prof().periods.find((x) => x.id === tr.dataset.id);
      if (!p) return;
      p[f] = e.target.value.trim();
      if (f === 'type' && p.type === 'lunch' && /교시$/.test(p.name)) p.name = '점심 시간';
      scheduleChanged();
    });
    $('#schedRows').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const rows = prof().periods;
      const idx = rows.findIndex((p) => p.id === tr.dataset.id);
      const mv = e.target.closest('[data-move]');
      if (mv) { moveRow(idx, idx + Number(mv.dataset.move)); return; }
      if (!e.target.closest('[data-del]')) return;
      prof().periods = rows.filter((p) => p.id !== tr.dataset.id);
      scheduleChanged();
    });

    // ⠿ 손잡이를 잡고 끌어서 순서 바꾸기
    const tbody = $('#schedRows');
    let dragId = null;
    tbody.addEventListener('pointerdown', (e) => {
      const h = e.target.closest('.drag-handle');
      if (h) h.closest('tr').draggable = true;
    });
    tbody.addEventListener('dragstart', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      dragId = tr.dataset.id;
      tr.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    tbody.addEventListener('dragover', (e) => {
      if (!dragId) return;
      e.preventDefault();
      const tr = e.target.closest('tr[data-id]');
      $$('#schedRows tr').forEach((r) => r.classList.remove('drop-before', 'drop-after'));
      if (!tr || tr.dataset.id === dragId) return;
      const r = tr.getBoundingClientRect();
      tr.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    });
    tbody.addEventListener('drop', (e) => {
      e.preventDefault();
      const tr = e.target.closest('tr[data-id]');
      if (!dragId || !tr || tr.dataset.id === dragId) return;
      const rows = prof().periods;
      const from = rows.findIndex((p) => p.id === dragId);
      let to = rows.findIndex((p) => p.id === tr.dataset.id);
      const r = tr.getBoundingClientRect();
      if (e.clientY >= r.top + r.height / 2) to += 1;
      if (from < to) to -= 1;
      moveRow(from, to);
    });
    tbody.addEventListener('dragend', () => {
      dragId = null;
      $$('#schedRows tr').forEach((r) => { r.draggable = false; r.classList.remove('dragging', 'drop-before', 'drop-after'); });
    });

    $('#schedAdd').addEventListener('click', () => {
      const list = Clock.periods(prof());
      const last = list[list.length - 1];
      const s = last ? last.e + 600 : 9 * 3600;
      const n = prof().periods.filter((p) => !isLunch(p)).length + 1;
      prof().periods.push({ id: Store.uid(), name: `${n}교시`, type: 'class', start: fromSec(s), end: fromSec(s + 2400) });
      scheduleChanged();
    });
    $('#schedAddLunch').addEventListener('click', () => {
      if (prof().periods.some(isLunch)) { toast('점심 줄이 이미 있어요. 종류를 바꾸거나 시간을 고쳐 주세요'); return; }
      prof().periods.push({ id: Store.uid(), name: '점심 시간', type: 'lunch', start: '12:10', end: '13:00' });
      scheduleChanged();
      toast('점심 줄을 추가했어요. ⠿로 원하는 자리에 옮기세요');
    });
    $('#schedSort').addEventListener('click', () => {
      prof().periods.sort((a, b) => (Clock.toSec(a.start) ?? 1e9) - (Clock.toSec(b.start) ?? 1e9));
      scheduleChanged();
    });
    // 시정 탭·요일·이름·추가·삭제
    $('#profileTabs').addEventListener('click', async (e) => {
      if (e.target.closest('#profileAdd')) {
        const base = prof();
        const copy = await UI.ask(`'${base.name}' 시간표를 복사해서 새 시정을 만들까요?\n(취소하면 빈 시간표로 만들어요)`, '복사해서 만들기');
        const p = {
          id: Store.uid(),
          name: '새 시정',
          autoName: true,
          days: [],
          periods: copy ? base.periods.map((x) => ({ ...x, id: Store.uid() })) : [],
        };
        profiles().push(p);
        editId = p.id;
        scheduleChanged();
        toast('새 시정을 만들었어요. 쓸 요일을 눌러 주세요');
        return;
      }
      const b = e.target.closest('[data-pid]');
      if (b) { editId = b.dataset.pid; renderSchedule(); }
    });
    $('#profileDays').addEventListener('click', (e) => {
      const b = e.target.closest('[data-day]');
      if (!b) return;
      const d = Number(b.dataset.day);
      const cur = prof();
      if ((cur.days || []).includes(d)) {
        cur.days = cur.days.filter((x) => x !== d);
      } else {
        profiles().forEach((p) => { p.days = (p.days || []).filter((x) => x !== d); });
        cur.days = [...(cur.days || []), d].sort();
      }
      // 이름을 직접 바꾸지 않은 새 시정은 고른 요일로 이름을 지어 줌 (예: 수요일 시정)
      if (cur.autoName) {
        const picked = DAY_ORDER.filter((x) => cur.days.includes(x));
        cur.name = !picked.length ? '새 시정' : picked.length === 1 ? `${DAY_NAMES[picked[0]]}요일 시정` : `${daysText(picked)} 시정`;
      }
      scheduleChanged();
    });
    $('#profileName').addEventListener('input', (e) => {
      prof().name = e.target.value.trim() || '시정';
      prof().autoName = false;
      Store.save();
      renderProfiles();
      Clock.refresh();
    });
    $('#profileDelete').addEventListener('click', async () => {
      if (profiles().length < 2) return;
      const cur = prof();
      if (!await UI.ask(`'${cur.name}' 시정을 삭제할까요?\n이 시정의 요일(${daysText(cur.days)})은 종이 울리지 않게 돼요.`, '삭제')) return;
      Store.data.schedule.profiles = profiles().filter((p) => p.id !== cur.id);
      editId = null;
      scheduleChanged();
    });
    $('#schedAutoTime').addEventListener('change', (e) => { Store.data.schedule.autoRetime = e.target.checked; Store.save(); });
    $('#genApply').addEventListener('click', async () => {
      const start = Clock.toSec($('#genStart').value);
      const cls = Number($('#genClass').value) * 60;
      const brk = Number($('#genBreak').value) * 60;
      const count = Number($('#genCount').value);
      const lunchAfter = Number($('#genLunchAfter').value);
      const lunch = Number($('#genLunch').value) * 60;
      if (start === null || !cls || !count) { toast('입력값을 확인해 주세요'); return; }
      if (!await UI.ask('지금 시간표를 지우고 새로 만들까요?', '새로 만들기')) return;
      const periods = [];
      let t = start;
      for (let i = 1; i <= count; i++) {
        periods.push({ id: Store.uid(), name: `${i}교시`, type: 'class', start: fromSec(t), end: fromSec(t + cls) });
        t += cls;
        if (i === lunchAfter && lunch > 0 && i < count) {
          periods.push({ id: Store.uid(), name: '점심 시간', type: 'lunch', start: fromSec(t), end: fromSec(t + lunch) });
          t += lunch;
        } else t += brk;
      }
      if (t > 24 * 3600) { toast('하루를 넘어가요. 값을 줄여 주세요'); return; }
      prof().periods = periods;
      scheduleChanged();
      toast('시간표를 만들었어요 🕘');
    });
  }

  // ---------- 알림·소리 ----------
  function renderSound() {
    const snd = Store.data.sound;
    $$('[data-sound-setting]').forEach((el) => { el.checked = !!snd[el.dataset.soundSetting]; });
    const style = document.querySelector(`input[name="chimeStyle"][value="${snd.chimeStyle}"]`);
    if (style) style.checked = true;
    $('#volume').value = snd.volume;
    $('#volumeVal').textContent = `${snd.volume}%`;
    renderBellToggles();
  }

  function renderBellToggles() {
    $$('.bell-toggle').forEach((b) => b.classList.toggle('on', !!Store.data.sound[b.dataset.sound]));
  }

  function initSound() {
    $$('[data-sound-setting]').forEach((el) => el.addEventListener('change', () => {
      Store.data.sound[el.dataset.soundSetting] = el.checked;
      Store.save();
      renderBellToggles();
      Clock.refresh();
    }));
    $$('input[name="chimeStyle"]').forEach((r) => r.addEventListener('change', () => {
      Store.data.sound.chimeStyle = r.value;
      Store.save();
      Sound.classStart();
    }));
    $('#volume').addEventListener('input', (e) => {
      Store.data.sound.volume = Number(e.target.value);
      $('#volumeVal').textContent = `${e.target.value}%`;
      Store.save();
    });
    $('#volume').addEventListener('change', () => Sound.tickLast());
    $$('[data-preview]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.preview;
      if (k === 'warning') Sound.warning(Store.data.sound.voice);
      else Sound[k]();
    }));
    // 메인 화면 on/off 버튼
    $$('.bell-toggle').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.sound;
      Store.data.sound[k] = !Store.data.sound[k];
      Store.save();
      renderSound();
      Clock.refresh();
      const names = { classStart: '수업 시작종', breakStart: '쉬는 시간종', warning: '1분 전 알림' };
      toast(`${names[k]}을 ${Store.data.sound[k] ? '켰어요 🔔' : '껐어요 🔕'}`);
    }));
  }

  // ---------- 학생 명단 ----------
  // 엑셀에서 저장한 CSV는 보통 CP949(EUC-KR)라서 UTF-8로 안 읽히면 EUC-KR로 다시 읽는다
  function decodeCsv(buf) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
    } catch {
      return new TextDecoder('euc-kr').decode(buf);
    }
  }

  function splitCsvLine(line) {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',' || ch === '\t' || ch === ';') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  }

  function normGender(g) {
    const s = String(g || '').trim().toLowerCase();
    if (['남', '남자', '남학생', 'm', 'male', '男'].includes(s)) return 'M';
    if (['여', '여자', '여학생', 'f', 'female', '女'].includes(s)) return 'F';
    return '';
  }

  function parseStudents(text) {
    const rows = text.split(/\r?\n/).map(splitCsvLine).filter((r) => r.some(Boolean));
    if (!rows.length) return [];
    // 열 위치 찾기 (머리글이 있으면 사용)
    let noCol = 0, nameCol = 1, genderCol = 2;
    const head = rows[0].map((h) => h.replace(/\s/g, ''));
    const hasHeader = head.some((h) => /번호|이름|성명|name|no|성별|gender/i.test(h)) && !/^\d+$/.test(head[0]);
    if (hasHeader) {
      const find = (re) => head.findIndex((h) => re.test(h));
      const n = find(/번호|^no$|number|출석/i);
      const nm = find(/이름|성명|name/i);
      const g = find(/성별|gender|남녀/i);
      if (nm >= 0) nameCol = nm;
      noCol = n >= 0 ? n : (nm === 0 ? -1 : 0);
      genderCol = g;
      rows.shift();
    } else if (rows[0].length === 1 || !/^\d+$/.test(rows[0][0])) {
      // 번호 없이 이름만 있는 경우
      if (rows.every((r) => !/^\d+$/.test(r[0]))) { noCol = -1; nameCol = 0; genderCol = 1; }
    }
    const list = [];
    rows.forEach((r, i) => {
      const name = (r[nameCol] || '').trim();
      if (!name) return;
      const no = noCol >= 0 ? (r[noCol] || '').trim() : String(i + 1);
      list.push({ id: Store.uid() + i, no, name, gender: genderCol >= 0 ? normGender(r[genderCol]) : '' });
    });
    return list;
  }

  function renderStudents() {
    const list = Store.data.students;
    $('#studentTotal').textContent = list.length ? `총 ${list.length}명` : '';
    $('#studentRows').innerHTML = list.map((p) => `
      <tr data-id="${esc(p.id)}">
        <td><input data-f="no" value="${esc(p.no)}" maxlength="5" style="min-width:60px;width:70px" /></td>
        <td><input data-f="name" value="${esc(p.name)}" maxlength="20" /></td>
        <td><select data-f="gender">
          <option value="" ${!p.gender ? 'selected' : ''}>-</option>
          <option value="M" ${p.gender === 'M' ? 'selected' : ''}>남</option>
          <option value="F" ${p.gender === 'F' ? 'selected' : ''}>여</option>
        </select></td>
        <td><button class="del-btn" data-del title="삭제">✕</button></td>
      </tr>`).join('') || '<tr><td colspan="4" class="muted" style="padding:16px">CSV 파일을 불러오거나 직접 추가해 주세요</td></tr>';
  }

  function studentsChanged() {
    // 사라진 학생은 뽑기 기록에서도 정리
    const ids = new Set(Store.data.students.map((p) => p.id));
    const pk = Store.data.picker;
    pk.pickedIds = pk.pickedIds.filter((id) => ids.has(id));
    pk.excludedIds = pk.excludedIds.filter((id) => ids.has(id));
    pk.secretIds = pk.secretIds.filter((id) => ids.has(id));
    Store.save();
    renderStudents();
    Picker.refresh();
  }

  function initStudents() {
    $('#csvInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const list = parseStudents(decodeCsv(await file.arrayBuffer()));
      if (!list.length) { toast('학생을 찾지 못했어요. 파일 형식을 확인해 주세요'); return; }
      if (Store.data.students.length && !await UI.ask(`지금 명단(${Store.data.students.length}명)을 새 명단(${list.length}명)으로 바꿀까요?`)) return;
      Store.data.students = list;
      Store.data.picker.pickedIds = [];
      Store.data.picker.excludedIds = [];
      Store.data.picker.secretIds = [];
      Store.data.picker.history = [];
      studentsChanged();
      toast(`학생 ${list.length}명을 불러왔어요 👩‍🎓`);
    });
    $('#csvSample').addEventListener('click', () => {
      const sample = '번호,이름,성별\n1,김하늘,여\n2,이바다,남\n3,박구름,여\n4,최별,남\n5,정햇살,여\n';
      UI.download('학생명단_예시.csv', '﻿' + sample, 'text/csv;charset=utf-8');
    });
    $('#studentAdd').addEventListener('click', () => {
      const list = Store.data.students;
      const maxNo = list.reduce((m, p) => Math.max(m, parseInt(p.no, 10) || 0), 0);
      list.push({ id: Store.uid(), no: String(maxNo + 1), name: '새 학생', gender: '' });
      studentsChanged();
      const inputs = $$('#studentRows input[data-f="name"]');
      const last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); }
    });
    $('#studentClear').addEventListener('click', async () => {
      if (!Store.data.students.length) return;
      if (!await UI.ask('학생 명단을 모두 지울까요?', '모두 지우기')) return;
      Store.data.students = [];
      Store.data.picker.history = [];
      studentsChanged();
    });
    $('#studentRows').addEventListener('change', (e) => {
      const tr = e.target.closest('tr[data-id]');
      const f = e.target.dataset.f;
      if (!tr || !f) return;
      const p = Store.data.students.find((x) => x.id === tr.dataset.id);
      if (!p) return;
      p[f] = e.target.value.trim();
      Store.save();
      Picker.refresh();
    });
    $('#studentRows').addEventListener('click', (e) => {
      if (!e.target.closest('[data-del]')) return;
      const id = e.target.closest('tr').dataset.id;
      Store.data.students = Store.data.students.filter((p) => p.id !== id);
      studentsChanged();
    });
  }

  // ---------- 일반 ----------
  async function renderGeneral() {
    $('#mainMessage').value = Store.data.general.message;
    $('#hour12').checked = !!Store.data.general.hour12;
    const d = window.desktop;
    if (d) {
      const auto = await d.getAutoStart();
      $('#autoStart').checked = auto.enabled;
      $('#autoStart').disabled = !auto.supported;
      if (!auto.supported) $('#autoStartHelp').textContent = '이 운영체제에서는 자동 실행 설정을 지원하지 않아요.';
      $('#alwaysOnTop').checked = (await d.getWindowState()).alwaysOnTop;
      $('#closeToTray').checked = await d.getCloseToTray();
      $('#appVersion').textContent = `쉬는시간 알리미 v${await d.version()}`;
    } else {
      ['#autoStart', '#alwaysOnTop', '#closeToTray'].forEach((s) => { $(s).disabled = true; });
      $('#autoStartHelp').textContent = '자동 실행·항상 위 기능은 설치한 프로그램에서 사용할 수 있어요.';
    }
  }

  function initGeneral() {
    const d = window.desktop;
    $('#mainMessage').addEventListener('input', (e) => { Store.data.general.message = e.target.value; Store.save(); Clock.refresh(); });
    $('#hour12').addEventListener('change', (e) => { Store.data.general.hour12 = e.target.checked; Store.save(); Clock.refresh(); });
    if (d) {
      $('#autoStart').addEventListener('change', async (e) => {
        const on = await d.setAutoStart(e.target.checked);
        e.target.checked = on;
        toast(on ? '컴퓨터를 켜면 자동으로 실행돼요 🖥️' : '자동 실행을 껐어요');
      });
      $('#alwaysOnTop').addEventListener('change', (e) => d.setAlwaysOnTop(e.target.checked));
      $('#closeToTray').addEventListener('change', (e) => d.setCloseToTray(e.target.checked));
      $('#appQuit').addEventListener('click', async () => { if (await UI.ask('프로그램을 완전히 종료할까요?\n종소리도 울리지 않게 돼요.')) d.quit(); });
      d.onAutoStartChanged((v) => { $('#autoStart').checked = v; });
    } else {
      $('#appQuit').hidden = true;
    }
    $('#backupExport').addEventListener('click', () => {
      Store.flush();
      const t = new Date();
      UI.download(`쉬는시간알리미_백업_${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}.json`,
        JSON.stringify(Store.data, null, 2), 'application/json');
    });
    $('#backupImport').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data || typeof data !== 'object' || !data.schedule) throw new Error('bad');
        if (!await UI.ask('백업 파일로 모든 설정을 바꿀까요?', '바꾸기')) return;
        Store.replaceAll(data);
        location.reload();
      } catch {
        toast('올바른 백업 파일이 아니에요');
      }
    });
  }

  function init() {
    $$('.snav').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.stab)));
    initSchedule();
    initSound();
    initStudents();
    initGeneral();
    renderSound();
    UI.onPanel('settingsPanel', {
      open: () => { renderSchedule(); renderSound(); renderStudents(); renderGeneral(); },
    });
  }

  window.Settings = { init, showTab, parseStudents, decodeCsv };
})();
