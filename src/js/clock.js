// 메인 시계 + 시간표에 따른 자동 종소리
(function () {
  const { $, esc, pad } = UI;
  const WARN_SEC = 60;       // 수업 시작 몇 초 전에 알릴지
  const LUNCH_GAP = 30 * 60; // 이만큼 이상 비면 점심 시간으로 표시
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

  const toSec = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 : null;
  };

  // 그 날짜의 요일에 쓰는 시정 (없으면 null → 그날은 종 없음)
  function profileFor(date) {
    const day = (date || new Date()).getDay();
    return Store.data.schedule.profiles.find((p) => (p.days || []).includes(day)) || null;
  }

  // 올바른 교시만 시작 시각 순서로. type: 'class'(수업) | 'lunch'(점심)
  // 인자: 시정 객체(설정 화면) 또는 날짜(그날의 시정)
  function periods(arg) {
    const prof = arg && Array.isArray(arg.periods) ? arg : profileFor(arg instanceof Date ? arg : new Date());
    return (prof ? prof.periods : [])
      .map((p) => ({ ...p, type: p.type === 'lunch' ? 'lunch' : 'class', s: toSec(p.start), e: toSec(p.end) }))
      .filter((p) => p.s !== null && p.e !== null && p.e > p.s)
      .sort((a, b) => a.s - b.s);
  }

  // 오늘 쓰는 시정이 없는 날(주말 등)은 종을 울리지 않음
  function isWeekendOff(date) {
    return !profileFor(date);
  }

  // 지금이 수업/쉬는 시간/점심/등교 전/방과 후 중 어디인지
  function statusAt(sec, list) {
    if (!list.length) return { type: 'none' };
    const classes = list.filter((p) => p.type === 'class');
    const cur = list.find((p) => p.s <= sec && sec < p.e);
    if (cur && cur.type === 'class') return { type: 'class', period: cur, remain: cur.e - sec };
    const next = classes.find((p) => p.s > sec);
    if (cur) return { type: 'lunch', period: cur, next, until: next ? next.s - sec : null, remain: cur.e - sec };
    const prev = list.filter((p) => p.e <= sec).pop();
    if (!next) return { type: 'after', prev };
    const until = next.s - sec;
    if (!prev) return { type: 'before', next, until };
    // 점심을 따로 넣지 않은 시간표는 30분 이상 빈 시간을 점심으로 표시
    const hasLunchRow = list.some((p) => p.type === 'lunch');
    return { type: !hasLunchRow && next.s - prev.e >= LUNCH_GAP ? 'lunch' : 'break', next, prev, until };
  }

  function fmtRemain(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function fmtClock(date) {
    const h = date.getHours();
    const m = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    if (Store.data.general.hour12) {
      const ampm = h < 12 ? '오전' : '오후';
      const hh = h % 12 === 0 ? 12 : h % 12;
      return `<span class="ampm">${ampm}</span>${hh}:${m}:${s}`;
    }
    return `${pad(h)}:${m}:${s}`;
  }

  // ---- 자동 종 이벤트 ----
  let lastDayKey = null;
  let lastSec = null;
  const fired = new Set();

  function fire(kind, key) {
    if (fired.has(key)) return;
    fired.add(key);
    const snd = Store.data.sound;
    if (kind === 'warning') {
      if (!snd.warning) return;
      Sound.warning(snd.voice);
    } else if (kind === 'classStart') {
      if (!snd.classStart) return;
      Sound.classStart();
    } else if (kind === 'breakStart') {
      if (!snd.breakStart) return;
      Sound.breakStart();
    }
    if (snd.bringToFront && window.desktop) window.desktop.bringToFront();
  }

  function checkEvents(now, sec, list) {
    const dayKey = now.toDateString();
    if (dayKey !== lastDayKey) {
      lastDayKey = dayKey;
      lastSec = sec;
      fired.clear();
      return;
    }
    if (sec < lastSec) { lastSec = sec; return; } // 시계가 뒤로 바뀐 경우
    if (isWeekendOff(now)) { lastSec = sec; return; }
    // lastSec < t <= sec 사이에 지난 시각만 울림. 절전 등으로 오래 멈췄다면 지난 종은 생략
    const crossed = (t) => lastSec < t && t <= sec && sec - t <= 5;
    // 종은 수업 줄에만. 점심 줄은 종 없이 시간표 표시만
    const classes = list.filter((p) => p.type === 'class');
    classes.forEach((p) => {
      // 1분 전 알림: 그 시각이 수업 중이 아닐 때만 (쉬는 시간·점심·등교 전)
      const warnAt = p.s - WARN_SEC;
      const inClass = classes.some((c) => c.s <= warnAt && warnAt < c.e);
      if (crossed(warnAt) && !inClass) fire('warning', `${dayKey}-w-${p.id}`);
      if (crossed(p.s)) fire('classStart', `${dayKey}-s-${p.id}`);
      // 다음 수업이 바로 이어지면 쉬는 시간 종은 생략
      if (crossed(p.e) && !classes.some((c) => c !== p && c.s <= p.e && c.e > p.e)) fire('breakStart', `${dayKey}-e-${p.id}`);
    });
    lastSec = sec;
  }

  // ---- 화면 ----
  let lastRenderKey = '';

  function render(now) {
    const sec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const list = periods(now);
    checkEvents(now, sec, list);

    const weekendOff = isWeekendOff(now);
    const st = weekendOff ? { type: 'weekend' } : statusAt(sec, list);
    const warning = Store.data.sound.warning && !weekendOff &&
      (st.type === 'break' || st.type === 'lunch' || st.type === 'before') && st.until <= WARN_SEC;

    document.body.classList.toggle('warning', !!warning);
    const digits = $('#clockDigits');
    if (warning) {
      digits.textContent = fmtRemain(st.until);
      $('#warningSub').hidden = false;
      $('#warningNow').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      $('#clockMessage').textContent = `수업 시간 1분 전입니다! 자리에 앉아 ${st.next.name} 교과서를 준비해요 📚`;
    } else {
      digits.innerHTML = fmtClock(now);
      $('#warningSub').hidden = true;
      $('#clockMessage').textContent = Store.data.general.message || Store.defaults.general.message;
    }

    $('#dateLine').textContent =
      `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${DAYS[now.getDay()]}요일`;

    let chip;
    switch (st.type) {
      case 'class':
        chip = `📚 ${esc(st.period.name)} 수업 중<span class="sc-sub">끝나기까지 ${fmtRemain(st.remain)}</span>`; break;
      case 'break':
        chip = warning ? `⏰ 곧 ${esc(st.next.name)} 시작!<span class="sc-sub">수업 시작까지</span>`
          : `☕ 쉬는 시간<span class="sc-sub">${esc(st.next.name)}까지 ${fmtRemain(st.until)}</span>`; break;
      case 'lunch':
        if (warning) chip = `⏰ 곧 ${esc(st.next.name)} 시작!<span class="sc-sub">수업 시작까지</span>`;
        else if (st.next) chip = `🍱 ${esc(st.period ? st.period.name : '점심 시간')}<span class="sc-sub">${esc(st.next.name)}까지 ${fmtRemain(st.until)}</span>`;
        else chip = `🍱 ${esc(st.period ? st.period.name : '점심 시간')}<span class="sc-sub">끝나기까지 ${fmtRemain(st.remain)}</span>`;
        break;
      case 'before':
        chip = warning ? `⏰ 곧 ${esc(st.next.name)} 시작!<span class="sc-sub">수업 시작까지</span>`
          : `🌤️ 좋은 아침이에요<span class="sc-sub">${esc(st.next.name)} ${esc(st.next.start)} 시작</span>`; break;
      case 'after': chip = '🎒 오늘 수업 끝! 수고했어요'; break;
      case 'weekend':
        chip = now.getDay() === 0 || now.getDay() === 6 ? '🌈 즐거운 주말이에요' : '📅 오늘은 정해진 시정이 없어요'; break;
      default: chip = '⚙️ 설정에서 시간표를 입력해 주세요';
    }
    $('#statusChip').innerHTML = chip;

    // 시간표 줄은 바뀔 때만 다시 그림
    const curId = st.period ? st.period.id : '';
    const nextId = st.next ? st.next.id : '';
    const prof = profileFor(now);
    const showProfile = prof && Store.data.schedule.profiles.length > 1;
    const key = JSON.stringify([list.map((p) => [p.id, p.type, p.name, p.start, p.end, p.e <= sec]), curId, nextId, weekendOff, showProfile && prof.name]);
    if (key !== lastRenderKey) {
      lastRenderKey = key;
      $('#timeline').innerHTML = (showProfile ? `<div class="tl-item tl-profile"><b>📅 ${esc(prof.name)}</b></div>` : '') + list.map((p) => {
        const cls = p.id === curId ? 'now' : (p.e <= sec ? 'done' : '');
        const lunch = p.type === 'lunch' ? ' lunch' : '';
        return `<div class="tl-item ${cls}${lunch}"><b>${p.type === 'lunch' ? '🍱 ' : ''}${esc(p.name)}</b>${esc(p.start)}~${esc(p.end)}</div>`;
      }).join('');
    }
  }

  let timer = null;
  function start() {
    const loop = () => {
      const now = new Date();
      render(now);
      // 다음 초 경계에 맞춰 갱신
      timer = setTimeout(loop, 1000 - now.getMilliseconds() + 5);
    };
    clearTimeout(timer);
    loop();
  }

  window.Clock = { start, refresh: () => { lastRenderKey = ''; render(new Date()); }, statusAt, toSec, periods, profileFor, fmtRemain };
})();
