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

  // 올바른 교시만 시작 시각 순서로
  function periods() {
    return Store.data.schedule.periods
      .map((p) => ({ ...p, s: toSec(p.start), e: toSec(p.end) }))
      .filter((p) => p.s !== null && p.e !== null && p.e > p.s)
      .sort((a, b) => a.s - b.s);
  }

  function isWeekendOff(date) {
    const d = date.getDay();
    return Store.data.schedule.skipWeekend && (d === 0 || d === 6);
  }

  // 지금이 수업/쉬는 시간/점심/등교 전/방과 후 중 어디인지
  function statusAt(sec, list) {
    if (!list.length) return { type: 'none' };
    const cur = list.find((p) => p.s <= sec && sec < p.e);
    if (cur) return { type: 'class', period: cur, remain: cur.e - sec };
    const next = list.find((p) => p.s > sec);
    const prev = list.filter((p) => p.e <= sec).pop();
    if (!next) return { type: 'after', prev };
    const until = next.s - sec;
    if (!prev) return { type: 'before', next, until };
    return { type: next.s - prev.e >= LUNCH_GAP ? 'lunch' : 'break', next, prev, until };
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
    list.forEach((p, i) => {
      const prev = list[i - 1];
      const next = list[i + 1];
      // 1분 전 알림: 그 시각이 쉬는 시간(또는 등교 전)일 때만
      const warnAt = p.s - WARN_SEC;
      if (crossed(warnAt) && (!prev || prev.e <= warnAt)) fire('warning', `${dayKey}-w-${p.id}`);
      if (crossed(p.s)) fire('classStart', `${dayKey}-s-${p.id}`);
      // 다음 수업이 바로 이어지면 쉬는 시간 종은 생략
      if (crossed(p.e) && !(next && next.s <= p.e)) fire('breakStart', `${dayKey}-e-${p.id}`);
    });
    lastSec = sec;
  }

  // ---- 화면 ----
  let lastRenderKey = '';

  function render(now) {
    const sec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const list = periods();
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
      $('#clockMessage').textContent = `쉬는 시간 1분 전입니다! ${st.next.name} 준비하고 자리에 앉아주세요 🪑`;
    } else {
      digits.innerHTML = fmtClock(now);
      $('#warningSub').hidden = true;
      $('#clockMessage').textContent = Store.data.general.message || '쉬는 시간 1분 전에는 자리에 앉아주세요';
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
        chip = warning ? `⏰ 곧 ${esc(st.next.name)} 시작!<span class="sc-sub">수업 시작까지</span>`
          : `🍱 점심 시간<span class="sc-sub">${esc(st.next.name)}까지 ${fmtRemain(st.until)}</span>`; break;
      case 'before':
        chip = warning ? `⏰ 곧 ${esc(st.next.name)} 시작!<span class="sc-sub">수업 시작까지</span>`
          : `🌤️ 좋은 아침이에요<span class="sc-sub">${esc(st.next.name)} ${esc(st.next.start)} 시작</span>`; break;
      case 'after': chip = '🎒 오늘 수업 끝! 수고했어요'; break;
      case 'weekend': chip = '🌈 즐거운 주말이에요'; break;
      default: chip = '⚙️ 설정에서 시간표를 입력해 주세요';
    }
    $('#statusChip').innerHTML = chip;

    // 시간표 줄은 바뀔 때만 다시 그림
    const curId = st.type === 'class' ? st.period.id : '';
    const nextId = st.next ? st.next.id : '';
    const key = JSON.stringify([list.map((p) => [p.id, p.name, p.start, p.end, p.e <= sec]), curId, nextId, weekendOff]);
    if (key !== lastRenderKey) {
      lastRenderKey = key;
      $('#timeline').innerHTML = list.map((p) => {
        const cls = p.id === curId ? 'now' : (p.e <= sec ? 'done' : '');
        return `<div class="tl-item ${cls}"><b>${esc(p.name)}</b>${esc(p.start)}~${esc(p.end)}</div>`;
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

  window.Clock = { start, refresh: () => { lastRenderKey = ''; render(new Date()); }, statusAt, toSec, periods, fmtRemain };
})();
