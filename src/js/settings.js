// 설정: 시간표, 알림·소리, 학생 명단(CSV), 일반
(function () {
  const { $, $$, esc, toast, pad } = UI;

  function showTab(name) {
    $$('.snav').forEach((b) => b.classList.toggle('active', b.dataset.stab === name));
    $$('.stab').forEach((s) => { s.hidden = s.dataset.stabPanel !== name; });
  }

  // ---------- 시간표 ----------
  const fromSec = (s) => `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor((s % 3600) / 60))}`;

  function renderSchedule() {
    const rows = Store.data.schedule.periods;
    const toSec = Clock.toSec;
    const sorted = rows.map((p) => ({ id: p.id, s: toSec(p.start), e: toSec(p.end) }))
      .filter((p) => p.s !== null && p.e !== null).sort((a, b) => a.s - b.s);
    $('#schedRows').innerHTML = rows.map((p) => {
      const s = toSec(p.start);
      const e = toSec(p.end);
      let len = '';
      let gap = '';
      let gapCls = '';
      if (s === null || e === null) len = '<span class="muted bad">시간 확인</span>';
      else if (e <= s) len = '<span class="muted bad">끝이 더 빨라요</span>';
      else {
        len = `<span class="muted">${Math.round((e - s) / 60)}분</span>`;
        const idx = sorted.findIndex((x) => x.id === p.id);
        const next = sorted[idx + 1];
        if (next) {
          const g = Math.round((next.s - e) / 60);
          if (g < 0) { gap = '다음 교시와 겹쳐요'; gapCls = 'bad'; }
          else if (g >= 30) { gap = `🍱 점심 ${g}분`; gapCls = 'lunch'; }
          else gap = `☕ ${g}분 (${fromSec(e)}~${fromSec(next.s)})`;
        } else gap = '🎒 하교';
      }
      return `<tr data-id="${esc(p.id)}">
        <td><input data-f="name" value="${esc(p.name)}" maxlength="12" /></td>
        <td><input data-f="start" type="time" value="${esc(p.start)}" /></td>
        <td><input data-f="end" type="time" value="${esc(p.end)}" /></td>
        <td>${len}</td>
        <td><span class="muted ${gapCls}">${gap}</span></td>
        <td><button class="del-btn" data-del title="삭제">✕</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="muted" style="padding:16px">교시를 추가해 주세요</td></tr>';
    $('#skipWeekend').checked = Store.data.schedule.skipWeekend;
  }

  function scheduleChanged(rerender = true) {
    Store.save();
    if (rerender) renderSchedule();
    Clock.refresh();
  }

  function initSchedule() {
    $('#schedRows').addEventListener('change', (e) => {
      const tr = e.target.closest('tr[data-id]');
      const f = e.target.dataset.f;
      if (!tr || !f) return;
      const p = Store.data.schedule.periods.find((x) => x.id === tr.dataset.id);
      if (!p) return;
      p[f] = e.target.value.trim();
      scheduleChanged();
    });
    $('#schedRows').addEventListener('click', (e) => {
      if (!e.target.closest('[data-del]')) return;
      const id = e.target.closest('tr').dataset.id;
      Store.data.schedule.periods = Store.data.schedule.periods.filter((p) => p.id !== id);
      scheduleChanged();
    });
    $('#schedAdd').addEventListener('click', () => {
      const list = Clock.periods();
      const last = list[list.length - 1];
      const s = last ? last.e + 600 : 9 * 3600;
      const n = Store.data.schedule.periods.length + 1;
      Store.data.schedule.periods.push({ id: Store.uid(), name: `${n}교시`, start: fromSec(s), end: fromSec(s + 2400) });
      scheduleChanged();
    });
    $('#schedSort').addEventListener('click', () => {
      Store.data.schedule.periods.sort((a, b) => (Clock.toSec(a.start) ?? 1e9) - (Clock.toSec(b.start) ?? 1e9));
      scheduleChanged();
    });
    $('#skipWeekend').addEventListener('change', (e) => { Store.data.schedule.skipWeekend = e.target.checked; scheduleChanged(false); });
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
        periods.push({ id: Store.uid(), name: `${i}교시`, start: fromSec(t), end: fromSec(t + cls) });
        t += cls + (i === lunchAfter ? lunch : brk);
      }
      if (t > 24 * 3600) { toast('하루를 넘어가요. 값을 줄여 주세요'); return; }
      Store.data.schedule.periods = periods;
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
