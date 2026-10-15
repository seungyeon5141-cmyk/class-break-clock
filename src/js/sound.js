// 종소리 · 알림음 (파일 없이 Web Audio로 직접 합성)
(function () {
  let ctx = null;
  let master = null;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    const vol = (Store.data.sound.volume ?? 80) / 100;
    master.gain.value = vol * vol * 0.9;
    return ctx;
  }

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
      if (withVoice) setTimeout(() => speak('쉬는 시간 1분 전입니다. 자리에 앉아주세요.'), (len * 2 + 0.4) * 1000);
    },
    tick() { play([[96, 0.1]], 'soft', { gain: 0.35 }); },
    tickLast() { play([[101, 0.1]], 'soft', { gain: 0.45 }); },
    timerEnd() {
      const seq = [];
      for (let r = 0; r < 4; r++) seq.push([88, 0.12], [88, 0.12], [88, 0.12], [null, 0.35]);
      play(seq, 'beep', { gain: 0.8 });
      play([[84, 0.18], [88, 0.18], [91, 0.18], [96, 0.6]], 'xylophone', { gain: 0.5, delay: 2.6 });
    },
    click() { play([[90 + Math.floor(Math.random() * 4), 0.05]], 'xylophone', { gain: 0.25, lenScale: 0.12 }); },
    fanfare() { play([[72, 0.12], [76, 0.12], [79, 0.12], [[84, 88, 91], 0.8]], 'xylophone', { gain: 0.5 }); },
    speak,
  };

  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  window.Sound = Sound;
})();
