// 타이머 · 스톱워치
(function () {
  const { $, $$, pad, toast } = UI;
  const PRESETS = [1, 2, 3, 5, 10, 20, 30, 40, 50];
  const CIRC = 2 * Math.PI * 90;

  const s = {
    mode: 'timer',
    total: 300,
    remainMs: 300000,
    running: false,
    endAt: 0,
    done: false,
    lastTickSec: null,
    // 스톱워치
    swRunning: false,
    swStart: 0,
    swAcc: 0,
    laps: [],
  };
  let raf = null;

  const cfg = () => Store.data.timer;

  function setTotal(sec) {
    sec = Math.max(0, Math.min(999 * 60 + 59, Math.round(sec)));
    s.total = sec;
    s.remainMs = sec * 1000;
    s.done = false;
    cfg().seconds = sec;
    Store.save();
    render();
  }

  function remainSec() { return Math.ceil(s.remainMs / 1000); }

  const swElapsed = () => s.swAcc + (s.swRunning ? performance.now() - s.swStart : 0);

  // 스톱워치 시간 표시 (분:초.1/10초, 1시간 넘으면 시:분:초)
  function fmtSw(ms) {
    const tenth = Math.floor(ms / 100) % 10;
    const sec = Math.floor(ms / 1000);
    const h = Math.floor(sec / 3600);
    const main = h ? `${h}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}` : `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
    return `${main}.${tenth}`;
  }

  function render() {
    const face = $('#timerFace');
    if (s.mode === 'timer') {
      const r = remainSec();
      const m = Math.floor(r / 60);
      const minInput = $('#timerMin');
      const secInput = $('#timerSec');
      if (document.activeElement !== minInput) minInput.value = pad(m);
      if (document.activeElement !== secInput) secInput.value = pad(r % 60);
      minInput.classList.toggle('wide', m >= 100);
      const ratio = s.total ? s.remainMs / (s.total * 1000) : 0;
      $('#timerRing').style.strokeDashoffset = String(CIRC * (1 - Math.max(0, Math.min(1, ratio))));
      face.classList.toggle('running', s.running);
      face.classList.toggle('urgent', s.running && r <= 10);
      face.classList.toggle('done', s.done);
      $('#timerStart').innerHTML = s.running ? '❚❚ 일시정지' : '▶ 시작';
      $('#timerHint').textContent = s.done ? '시간이 다 됐어요! ⏰' : (s.running ? '' : '숫자를 눌러 직접 입력할 수 있어요');
    } else {
      const ms = s.swAcc + (s.swRunning ? performance.now() - s.swStart : 0);
      const tenth = Math.floor(ms / 100) % 10;
      const totalSec = Math.floor(ms / 1000);
      const h = Math.floor(totalSec / 3600);
      const main = h ? `${h}:${pad(Math.floor(totalSec / 60) % 60)}:${pad(totalSec % 60)}` : `${pad(Math.floor(totalSec / 60))}:${pad(totalSec % 60)}`;
      $('#swDigits').innerHTML = `${main}<small>.${tenth}</small>`;
      $('#timerRing').style.strokeDashoffset = String(CIRC * (1 - ((ms / 1000) % 60) / 60));
      face.classList.remove('urgent', 'done', 'running');
      $('#timerStart').innerHTML = s.swRunning ? '❚❚ 일시정지' : '▶ 시작';
    }
  }

  // 남은 시간 계산 · 5초 전 경고음 · 종료 처리
  function step() {
    if (s.running) {
      s.remainMs = Math.max(0, s.endAt - Date.now());
      const r = remainSec();
      if (r !== s.lastTickSec) {
        s.lastTickSec = r;
        if (cfg().tick && r > 0 && r <= 5) Sound.timerTick(r === 1);
      }
      if (s.remainMs <= 0) finish();
    }
  }

  function loop() {
    step();
    render();
    if (s.running || s.swRunning) raf = requestAnimationFrame(loop);
  }

  function kick() { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); }

  function finish() {
    s.running = false;
    s.done = true;
    s.remainMs = 0;
    if (cfg().endSound) Sound.timerEnd(cfg().endStyle || 'bell');
    if (window.desktop && Store.data.sound.bringToFront) window.desktop.bringToFront();
    const title = $('#timerTitle').value.trim();
    toast(`⏰ ${title ? `${title} ` : ''}타이머가 끝났어요!`, 5000);
  }

  function startPause() {
    Sound.unlock();
    Sound.stopAlarm();
    if (s.mode === 'timer') {
      readInputs();
      if (s.running) {
        s.running = false;
        s.remainMs = Math.max(0, s.endAt - Date.now());
      } else {
        if (s.done || s.remainMs <= 0) { s.remainMs = s.total * 1000; s.done = false; }
        if (s.remainMs <= 0) { toast('시간을 먼저 정해 주세요'); return; }
        s.running = true;
        s.endAt = Date.now() + s.remainMs;
        s.lastTickSec = remainSec();
      }
    } else if (s.swRunning) {
      s.swAcc += performance.now() - s.swStart;
      s.swRunning = false;
    } else {
      s.swStart = performance.now();
      s.swRunning = true;
    }
    kick();
  }

  function reset() {
    Sound.stopAlarm();
    if (s.mode === 'timer') {
      s.running = false;
      s.done = false;
      s.remainMs = s.total * 1000;
    } else {
      s.swRunning = false;
      s.swAcc = 0;
      s.laps = [];
      renderLaps();
    }
    render();
  }

  function adjust(delta) {
    if (s.mode !== 'timer') return;
    if (s.running) {
      const nextRemain = Math.max(1000, s.endAt - Date.now() + delta * 1000);
      s.endAt = Date.now() + nextRemain;
      s.total = Math.max(s.total + delta, Math.ceil(nextRemain / 1000));
      kick();
    } else {
      setTotal(Math.max(0, (s.done ? s.total : remainSec()) + delta));
    }
  }

  function readInputs() {
    if (s.running) return;
    const m = parseInt($('#timerMin').value, 10) || 0;
    const sec = parseInt($('#timerSec').value, 10) || 0;
    const total = m * 60 + Math.min(59, sec);
    if (total !== remainSec() || s.done) setTotal(total);
  }

  function renderLaps() {
    const n = s.laps.length;
    $('#swLaps').innerHTML = s.laps.map((l, i) =>
      `<li><b>${n - i}</b><span class="lap-split">${fmtSw(l.split)}</span><span class="lap-total">${fmtSw(l.total)}</span></li>`).join('');
    $('#swLapCount').textContent = n ? `${n}개` : '';
    $('#swLapEmpty').hidden = n > 0;
  }

  function setMode(mode) {
    s.mode = mode;
    $$('[data-timer-mode]').forEach((b) => b.classList.toggle('active', b.dataset.timerMode === mode));
    const isTimer = mode === 'timer';
    $('.timer-digits').hidden = !isTimer;
    $('#timerHint').hidden = !isTimer;
    $('#swDigits').hidden = isTimer;
    $('#swLap').hidden = isTimer;
    // 스톱워치에서는 오른쪽 칸에 기록만 보여줌
    $$('#timerSide > .side-card').forEach((card) => { card.hidden = isTimer ? card.id === 'swLapCard' : card.id !== 'swLapCard'; });
    render();
    if (s.running || s.swRunning) kick();
  }

  function init() {
    const c = cfg();
    $('#timerTitle').value = c.title;
    $('#timerTick').checked = c.tick;
    $('#timerEndSound').checked = c.endSound;
    s.total = c.seconds;
    s.remainMs = c.seconds * 1000;

    $('#timerPresets').innerHTML = PRESETS.map((m) => `<button data-preset="${m}">${m}분</button>`).join('');
    $('#timerPresets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-preset]');
      if (!b) return;
      s.running = false;
      setTotal(Number(b.dataset.preset) * 60);
    });
    $$('.adj').forEach((b) => b.addEventListener('click', () => adjust(Number(b.dataset.delta))));
    $$('.td-arrow').forEach((b) => b.addEventListener('click', () => { if (!s.running) adjust(Number(b.dataset.adj)); }));

    ['#timerMin', '#timerSec'].forEach((sel) => {
      const el = $(sel);
      el.addEventListener('focus', () => { if (s.running) el.blur(); else el.select(); });
      el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, ''); });
      el.addEventListener('blur', readInputs);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { el.blur(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); adjust(sel === '#timerMin' ? 60 : 1); }
        if (e.key === 'ArrowDown') { e.preventDefault(); adjust(sel === '#timerMin' ? -60 : -1); }
      });
    });

    $('#timerStart').addEventListener('click', startPause);
    $('#timerReset').addEventListener('click', reset);
    $('#swLap').addEventListener('click', () => {
      if (!s.swRunning) return;
      const total = swElapsed();
      const prev = s.laps.length ? s.laps[0].total : 0;
      s.laps.unshift({ total, split: total - prev });
      renderLaps();
    });
    $$('[data-timer-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.timerMode)));

    $('#timerTitle').addEventListener('input', () => { c.title = $('#timerTitle').value; Store.save(); });
    $('#timerTick').addEventListener('change', (e) => { c.tick = e.target.checked; Store.save(); });
    $('#timerEndSound').addEventListener('change', (e) => { c.endSound = e.target.checked; Store.save(); });
    $('#timerEndStyle').value = c.endStyle || 'bell';
    $('#timerEndStyle').addEventListener('change', (e) => { c.endStyle = e.target.value; Store.save(); Sound.timerEnd(c.endStyle); });
    $('#timerEndPreview').addEventListener('click', () => { Sound.unlock(); Sound.timerEnd(c.endStyle || 'bell'); });
    // 알람이 울리는 중에 타이머 숫자를 누르면 소리 멈춤
    $('#timerFace').addEventListener('click', () => { if (s.done) Sound.stopAlarm(); });

    $('#timerRing').style.strokeDasharray = String(CIRC);

    // 패널이 열려 있을 때 스페이스바로 시작/정지
    document.addEventListener('keydown', (e) => {
      if ($('#timerPanel').hidden || e.code !== 'Space') return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      e.preventDefault();
      startPause();
    });

    // 패널을 닫거나 창을 최소화해도 타이머는 계속 진행 (끝나면 소리 + 알림)
    setInterval(() => {
      if (!s.running) return;
      step();
      if (!s.running) render();
    }, 250);
    render();
  }

  window.Timer = { init };
})();
