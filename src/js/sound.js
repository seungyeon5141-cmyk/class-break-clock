// 종소리 · 알림음 (파일 없이 Web Audio로 직접 합성)
(function () {
  let ctx = null;
  let master = null;
  let loud = null;          // 타이머 알람용 큰 소리 통로 (압축기로 찢어지지 않게)
  const active = new Set(); // 지금 울리는 알람 (멈추기용)

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.connect(ctx.destination);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 6;
      comp.ratio.value = 12;
      comp.attack.value = 0.002;
      comp.release.value = 0.12;
      loud = ctx.createGain();
      loud.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    const vol = (Store.data.sound.volume ?? 80) / 100;
    master.gain.value = vol * vol * 0.9;
    loud.gain.value = Math.max(0.15, vol) * 2.2;
    return ctx;
  }

  // 강한 알람 소리 한 조각 (네모파·톱니파, 주파수를 미끄러지게 할 수도 있음)
  function tone(freq, when, dur, type = 'square', gain = 0.5, freqEnd = null) {
    const c = ensure();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (freqEnd) osc.frequency.linearRampToValueAtTime(freqEnd, when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.006);
    g.gain.setValueAtTime(gain, when + Math.max(0.007, dur - 0.02));
    g.gain.linearRampToValueAtTime(0.0001, when + dur);
    osc.connect(g).connect(loud);
    osc.start(when);
    osc.stop(when + dur + 0.02);
    active.add(osc);
    osc.onended = () => active.delete(osc);
  }

  // 타이머 종료 알람 종류
  const ALARMS = {
    // 따르릉: 두 음이 빠르게 번갈아 울리는 탁상 알람시계 벨
    bell(t0) {
      for (let r = 0; r < 6; r++) {
        const t = t0 + r * 0.85;
        for (let k = 0; k < 16; k++) tone(k % 2 ? 1568 : 1175, t + k * 0.038, 0.034, 'square', 0.55);
      }
      return 6 * 0.85;
    },
    // 삐삐삐삐: 날카로운 디지털 알람
    digital(t0) {
      for (let r = 0; r < 6; r++) {
        const t = t0 + r * 0.8;
        for (let k = 0; k < 4; k++) tone(2093, t + k * 0.11, 0.075, 'square', 0.6);
      }
      return 6 * 0.8;
    },
    // 사이렌: 올라갔다 내려가는 경보음
    siren(t0) {
      for (let r = 0; r < 4; r++) {
        const t = t0 + r * 0.9;
        tone(650, t, 0.45, 'sawtooth', 0.5, 1450);
        tone(1450, t + 0.45, 0.45, 'sawtooth', 0.5, 650);
        tone(655, t, 0.45, 'square', 0.18, 1460);
        tone(1460, t + 0.45, 0.45, 'square', 0.18, 655);
      }
      return 4 * 0.9;
    },
    // 빠바바밤: 힘찬 금관 빵빠레
    fanfare(t0) {
      const notes = [[523, 0.14], [523, 0.14], [523, 0.14], [659, 0.5], [null, 0.12], [587, 0.14], [587, 0.14], [587, 0.14], [784, 0.9]];
      let t = t0;
      for (let rep = 0; rep < 2; rep++) {
        notes.forEach(([f, d]) => {
          if (f) {
            tone(f, t, d * 0.92, 'sawtooth', 0.42);
            tone(f * 1.5, t, d * 0.92, 'sawtooth', 0.2);
            tone(f / 2, t, d * 0.92, 'square', 0.22);
          }
          t += d;
        });
        t += 0.25;
      }
      return t - t0;
    },
  };

  const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // 음색: 부분음(배수, 세기, 감쇠 시간)
  const TIMBRES = {
    xylophone: { partials: [[1, 1, 1.0], [4, 0.35, 0.18], [10, 0.08, 0.06]], attack: 0.004 },
    musicbox: { partials: [[1, 1, 1.8], [2, 0.25, 0.9], [3, 0.12, 0.5], [5.4, 0.06, 0.2]], attack: 0.002 },
    school: { partials: [[1, 1, 2.6], [2.01, 0.45, 1.6], [3.0, 0.22, 1.0], [4.17, 0.12, 0.6]], attack: 0.005 },
    beep: { partials: [[1, 1, 0.25]], attack: 0.005, wave: 'square' },
    soft: { partials: [[1, 1, 0.5], [2, 0.2, 0.25]], attack: 0.01 },
  };

  function note(midi, when, timbreName, gain = 0.5, lenScale = 1) {
    const c = ensure();
    const t = TIMBRES[timbreName] || TIMBRES.xylophone;
    const f = midiToHz(midi);
    t.partials.forEach(([mult, amp, decay]) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = t.wave || 'sine';
      osc.frequency.value = f * mult;
      const peak = gain * amp * (t.wave === 'square' ? 0.18 : 1);
      const d = decay * lenScale;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(peak, when + t.attack);
      g.gain.exponentialRampToValueAtTime(0.0001, when + d);
      osc.connect(g).connect(master);
      osc.start(when);
      osc.stop(when + d + 0.05);
    });
  }

  // [미디 음, 박자(초)] 목록 연주. 반환값은 연주 길이(초)
  function play(seq, timbre, { gain = 0.5, lenScale = 1, delay = 0.05 } = {}) {
    const c = ensure();
    let t = c.currentTime + delay;
    seq.forEach(([m, dur, g]) => {
      if (m !== null) {
        (Array.isArray(m) ? m : [m]).forEach((mm) => note(mm, t, timbre, g ?? gain, lenScale));
      }
      t += dur;
    });
    return t - c.currentTime;
  }

  // ---- 멜로디 ----
  // 수업 시작: 통통 튀는 귀여운 상행 멜로디
  const CLASS_START = [[72, 0.16], [76, 0.16], [79, 0.16], [84, 0.32], [81, 0.16], [84, 0.16], [[79, 88], 0.9]];
  // 쉬는 시간: 느긋하게 내려오는 멜로디
  const BREAK_START = [[84, 0.2], [79, 0.2], [81, 0.2], [76, 0.3], [77, 0.2], [74, 0.2], [[72, 79], 0.9]];
  // 딩동댕동 학교종 (웨스트민스터)
  const SCHOOL_A = [[76, 0.55], [72, 0.55], [74, 0.55], [67, 1.0], [67, 0.55], [74, 0.55], [76, 0.55], [72, 1.4]];
  const SCHOOL_B = [[72, 0.55], [76, 0.55], [74, 0.55], [67, 1.0], [67, 0.55], [74, 0.55], [76, 0.55], [72, 1.4]];
  // 1분 전 알림: 띵동~ 띵동~
  const WARNING = [[88, 0.28], [84, 0.5], [88, 0.28], [84, 0.6]];

  function chime(kind) {
    const style = Store.data.sound.chimeStyle || 'xylophone';
    if (style === 'school') {
      return play(kind === 'classStart' ? SCHOOL_A : SCHOOL_B, 'school', { gain: 0.45 });
    }
    const seq = kind === 'classStart' ? CLASS_START : BREAK_START;
    // 두 번 연주해서 확실히 들리게
    const first = play(seq, style, { gain: 0.5 });
    play(seq, style, { gain: 0.42, delay: first + 0.35 });
    return first * 2 + 0.35;
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR';
      u.rate = 0.95;
      u.pitch = 1.15;
      u.volume = Math.min(1, (Store.data.sound.volume ?? 80) / 100 + 0.1);
      const ko = speechSynthesis.getVoices().find((v) => /^ko/i.test(v.lang));
      if (ko) u.voice = ko;
      speechSynthesis.speak(u);
    } catch (e) {
      console.warn('speech failed', e);
    }
  }

  const Sound = {
    unlock: ensure,
    classStart() { return chime('classStart'); },
    breakStart() { return chime('breakStart'); },
    warning(withVoice) {
      const len = play(WARNING, 'musicbox', { gain: 0.55 });
      play(WARNING, 'musicbox', { gain: 0.45, delay: len + 0.2 });
      if (withVoice) setTimeout(() => speak('수업 시간 1분 전입니다. 자리에 앉아 교과서를 준비해 주세요.'), (len * 2 + 0.4) * 1000);
    },
    // 레이스·카운트다운용 작은 소리
    tick() { play([[96, 0.1]], 'soft', { gain: 0.35 }); },
    tickLast() { play([[101, 0.1]], 'soft', { gain: 0.45 }); },
    // 타이머 5초 전 경고: 또렷한 '딱' 소리
    timerTick(last) {
      const c = ensure();
      const t = c.currentTime + 0.02;
      tone(last ? 1760 : 1320, t, last ? 0.16 : 0.09, 'square', last ? 0.55 : 0.45);
      if (last) tone(2640, t, 0.16, 'square', 0.25);
    },
    // 타이머 종료 알람 (style: bell | digital | siren | fanfare)
    timerEnd(style = 'bell') {
      Sound.stopAlarm();
      const c = ensure();
      return (ALARMS[style] || ALARMS.bell)(c.currentTime + 0.05);
    },
    stopAlarm() {
      active.forEach((o) => { try { o.stop(); } catch (e) { /* 이미 멈춤 */ } });
      active.clear();
    },
    alarmStyles: ['bell', 'digital', 'siren', 'fanfare'],
    click() { play([[90 + Math.floor(Math.random() * 4), 0.05]], 'xylophone', { gain: 0.25, lenScale: 0.12 }); },
    fanfare() { play([[72, 0.12], [76, 0.12], [79, 0.12], [[84, 88, 91], 0.8]], 'xylophone', { gain: 0.5 }); },
    speak,
  };

  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  window.Sound = Sound;
})();
