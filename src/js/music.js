// 수업 배경 음악 (인터넷 없이 Web Audio로 직접 연주 · 저작권 걱정 없음)
// 클래식 곡은 저작권이 끝난 곡(바흐, 파헬벨)을 직접 연주
(function () {
  let ctx = null;
  let vol = null;      // 음량 (계속 유지)
  let irBuf = null;    // 울림(리버브) 소리 모양
  let noiseBuf = null;
  let play = null;     // 지금 연주 { bus, dry, wet, timer, layers, track }
  let volume = 0.6;

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function setup() {
    ctx = Sound.context();
    if (!vol) {
      vol = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      comp.attack.value = 0.01;
      comp.release.value = 0.3;
      vol.connect(comp).connect(ctx.destination);
      setVolume(volume * 100);
      // 울림: 점점 작아지는 잡음으로 만든 공간감
      const len = Math.floor(ctx.sampleRate * 2.6);
      irBuf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = irBuf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    }
    return ctx;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(100, Number(v))) / 100;
    if (vol) vol.gain.setTargetAtTime(volume * volume * 1.5, ctx.currentTime, 0.05);
  }

  // ---------- 악기 ----------
  function voice(type, freq, t, { a = 0.005, peak = 0.2, decay = 1, hold = 0, dest, detune = 0, release = null } = {}) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (release !== null) {
      g.gain.setValueAtTime(peak, t + a + hold);
      g.gain.linearRampToValueAtTime(0.0001, t + a + hold + release);
    } else {
      g.gain.setValueAtTime(peak, t + a + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + decay);
    }
    o.connect(g).connect(dest || play.dry);
    o.start(t);
    o.stop(t + a + hold + (release ?? decay) + 0.05);
    return g;
  }
  function send(node, amt) {
    const s = ctx.createGain();
    s.gain.value = amt;
    node.connect(s).connect(play.wet);
  }

  const I = {
    // 피아노: 배음이 빨리 줄어드는 따뜻한 소리
    piano(m, t, len = 1, vel = 0.5) {
      const f = hz(m);
      const d = Math.min(4, 0.6 + len * 1.4) * (m > 80 ? 0.6 : 1);
      [[1, 1, 1], [2, 0.32, 0.55], [3, 0.12, 0.35], [4, 0.05, 0.25]].forEach(([k, amp, dk], i) => {
        const g = voice(i ? 'sine' : 'triangle', f * k, t, { a: 0.004, peak: vel * amp * 0.22, decay: d * dk });
        if (!i) send(g, 0.5);
      });
    },
    // 전자 피아노(로파이): 둥글고 살짝 떨리는 소리
    rhodes(m, t, len = 1, vel = 0.5) {
      const f = hz(m);
      const g1 = voice('sine', f, t, { a: 0.01, peak: vel * 0.16, decay: Math.min(3.5, len + 1.2), detune: -4 });
      voice('sine', f, t, { a: 0.01, peak: vel * 0.12, decay: Math.min(3.5, len + 1.2), detune: 5 });
      voice('sine', f * 3.98, t, { a: 0.002, peak: vel * 0.035, decay: 0.35 });
      send(g1, 0.6);
    },
    // 오르골·종소리
    bell(m, t, vel = 0.5) {
      const f = hz(m);
      [[1, 1, 1.8], [2, 0.25, 0.9], [3, 0.12, 0.5], [5.4, 0.06, 0.2]].forEach(([k, amp, dk], i) => {
        const g = voice('sine', f * k, t, { a: 0.002, peak: vel * amp * 0.16, decay: dk });
        if (!i) send(g, 0.8);
      });
    },
    // 마림바: 통통 나무 소리
    marimba(m, t, vel = 0.5) {
      const f = hz(m);
      const g = voice('sine', f, t, { a: 0.002, peak: vel * 0.25, decay: 0.45 });
      voice('sine', f * 4, t, { a: 0.001, peak: vel * 0.05, decay: 0.06 });
      send(g, 0.35);
    },
    // 우쿨렐레처럼 튕기는 소리
    pluck(m, t, vel = 0.5) {
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = hz(m);
      f.type = 'lowpass';
      f.frequency.setValueAtTime(3200, t);
      f.frequency.exponentialRampToValueAtTime(500, t + 0.25);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel * 0.09, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(f).connect(g).connect(play.dry);
      send(g, 0.3);
      o.start(t);
      o.stop(t + 0.6);
    },
    // 포근한 배경 화음
    pad(notes, t, len, vel = 0.5, cutoff = 1100) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      const g = ctx.createGain();
      const a = Math.min(1.6, len * 0.35);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel * 0.05, t + a);
      g.gain.setValueAtTime(vel * 0.05, t + len - 0.2);
      g.gain.linearRampToValueAtTime(0.0001, t + len + 1.4);
      f.connect(g).connect(play.dry);
      send(g, 0.9);
      notes.forEach((m) => [-7, 7].forEach((dt) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(m);
        o.detune.value = dt;
        o.connect(f);
        o.start(t);
        o.stop(t + len + 1.5);
      }));
    },
    bass(m, t, len, vel = 0.5) {
      voice('triangle', hz(m), t, { a: 0.01, peak: vel * 0.32, hold: len * 0.6, decay: len * 0.5 + 0.1 });
      voice('sine', hz(m), t, { a: 0.01, peak: vel * 0.2, hold: len * 0.6, decay: len * 0.5 + 0.1 });
    },
    kick(t, vel = 0.7) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(vel * 0.55, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(play.dry);
      o.start(t);
      o.stop(t + 0.32);
    },
    noise(t, dur, vel, type, freq, q = 0.8, wet = 0) {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(play.dry);
      if (wet) send(g, wet);
      s.start(t, Math.random() * 2);
      s.stop(t + dur + 0.02);
    },
    snare(t, vel = 0.5) { I.noise(t, 0.16, vel * 0.22, 'bandpass', 1800, 0.7, 0.3); voice('triangle', 190, t, { peak: vel * 0.12, decay: 0.08 }); },
    clap(t, vel = 0.5) { [0, 0.012, 0.024].forEach((d) => I.noise(t + d, 0.09, vel * 0.16, 'bandpass', 1400, 1.2, 0.4)); },
    hat(t, vel = 0.3) { I.noise(t, 0.045, vel * 0.09, 'highpass', 7500); },
    shaker(t, vel = 0.3) { I.noise(t, 0.07, vel * 0.06, 'bandpass', 6000, 1.5); },
    // 계속 이어지는 잡음 (빗소리·바람·시냇물)
    bed(type, freq, gain, { q = 0.7, lfo = 0, lfoRate = 0.1, hp = 0 } = {}) {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      let node = s.connect(f);
      if (hp) {
        const h = ctx.createBiquadFilter();
        h.type = 'highpass';
        h.frequency.value = hp;
        node = node.connect(h);
      }
      node.connect(g).connect(play.dry);
      const stops = [s];
      if (lfo) {
        const l = ctx.createOscillator();
        const lg = ctx.createGain();
        l.frequency.value = lfoRate;
        lg.gain.value = gain * lfo;
        l.connect(lg).connect(g.gain);
        l.start();
        stops.push(l);
      }
      s.start(ctx.currentTime, Math.random() * 2);
      play.layers.push(...stops);
    },
    // 새소리: 빠르게 오르내리는 짧은 휘파람
    bird(t, kind = Math.floor(Math.random() * 3)) {
      const base = 2400 + Math.random() * 1600;
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const st = t + i * (0.09 + Math.random() * 0.06);
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        const f0 = kind === 0 ? base : kind === 1 ? base * 1.3 : base * 0.8;
        o.frequency.setValueAtTime(f0, st);
        o.frequency.exponentialRampToValueAtTime(kind === 1 ? f0 * 0.7 : f0 * 1.45, st + 0.07);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.linearRampToValueAtTime(0.035, st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.08);
        o.connect(g).connect(play.dry);
        send(g, 0.5);
        o.start(st);
        o.stop(st + 0.1);
      }
    },
    crackle(t) { I.noise(t, 0.012, 0.05 + Math.random() * 0.05, 'highpass', 3000); },
  };

  // ---------- 곡 ----------
  // 16분음표 한 칸마다 step(i, t, s16)이 불린다. bed()는 시작할 때 한 번.
  const C_MAJ = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81];

  // 바흐 평균율 1권 전주곡 C장조 (BWV 846) — 마디마다 화음 5음
  const BACH = [
    [60, 64, 67, 72, 76], [60, 62, 69, 74, 77], [59, 62, 67, 74, 77], [60, 64, 67, 72, 76],
    [60, 64, 69, 76, 81], [60, 62, 66, 69, 74], [59, 62, 67, 74, 79], [59, 60, 64, 67, 72],
    [57, 60, 64, 67, 72], [50, 57, 62, 66, 72], [55, 59, 62, 67, 71], [55, 58, 64, 67, 73],
    [53, 57, 62, 69, 74], [53, 56, 62, 65, 71], [52, 55, 60, 67, 72], [52, 53, 57, 60, 65],
    [50, 53, 57, 60, 65], [43, 50, 55, 59, 65], [48, 52, 55, 60, 64], [48, 55, 58, 60, 64],
    [41, 53, 57, 60, 64], [42, 48, 57, 60, 63], [44, 53, 59, 60, 62], [43, 53, 55, 59, 62],
    [43, 52, 55, 60, 64], [43, 50, 55, 60, 65], [43, 50, 55, 59, 65], [43, 51, 57, 60, 66],
    [43, 52, 55, 60, 67], [43, 50, 55, 60, 65], [43, 50, 55, 59, 65], [36, 48, 55, 58, 64],
    [36, 45, 53, 57, 64], [36, 47, 55, 62, 65], [36, 48, 52, 55, 60],
  ];
  const BACH_ORDER = [0, 1, 2, 3, 4, 2, 3, 4];

  // 파헬벨 캐논 화음 (D장조) — 2박마다 하나
  const CANON = [[50, 62, 66, 69], [45, 61, 64, 69], [47, 62, 66, 71], [42, 61, 66, 69], [43, 62, 67, 71], [38, 62, 66, 69], [43, 59, 62, 67], [45, 61, 64, 67]];
  const CANON_MEL = [
    null,
    [78, 76, 74, 73, 71, 69, 71, 73],
    [74, 73, 71, 69, 67, 66, 67, 64],
    [[74, 78], [81, 79], [78, 74], [78, 76], [74, 71], [74, 81], [79, 83], [81, 79]],
  ];

  const TRACKS = [
    // ---- 밝고 신나는 ----
    {
      id: 'sunny', cat: 'bright', name: '햇살 산책', desc: '통통 튀는 우쿨렐레 팝', bpm: 112,
      chords: [[48, 60, 64, 67], [43, 59, 62, 67], [45, 60, 64, 69], [41, 57, 60, 65]],
      mel: [
        [76, 0, 79, 0, 81, 0, 79, 0, 76, 0, 74, 0, 72, 0, 0, 0],
        [74, 0, 0, 71, 74, 0, 79, 0, 0, 0, 77, 0, 74, 0, 0, 0],
        [72, 0, 76, 0, 81, 0, 79, 0, 76, 0, 72, 0, 76, 0, 0, 0],
        [77, 0, 76, 0, 74, 0, 72, 0, 74, 0, 0, 0, 67, 0, 0, 0],
      ],
      step(i, t, s) {
        const k = i % 16;
        const bar = Math.floor(i / 16);
        const ch = this.chords[bar % 4];
        const cycle = Math.floor(bar / 4);
        if (k === 0 || k === 8 || (k === 10 && bar % 2)) I.kick(t, 0.6);
        if (k === 4 || k === 12) I.clap(t, 0.55);
        if (k % 2 === 1) I.shaker(t, k % 4 === 3 ? 0.45 : 0.25);
        if ([0, 6, 8, 14].includes(k)) I.bass(ch[0] + (k === 6 ? 12 : 0), t, s * 2, 0.55);
        if ([2, 6, 10, 14].includes(k)) ch.slice(1).forEach((m, j) => I.pluck(m, t + j * 0.012, 0.55));
        const mel = this.mel[bar % 4][k];
        if (mel && cycle % 3 !== 2) I.bell(mel, t, 0.42);
        if (cycle % 3 === 2 && k % 4 === 0) I.marimba(pick(ch.slice(1)) + 12, t, 0.35);
      },
    },
    {
      id: 'marimba', cat: 'bright', name: '통통 마림바', desc: '경쾌한 마림바 행진', bpm: 124,
      chords: [[41, 65, 69, 72], [38, 62, 65, 69], [46, 62, 65, 70], [48, 64, 67, 70]],
      mel: [
        [77, 0, 81, 0, 84, 0, 81, 0, 79, 0, 77, 0, 79, 0, 81, 0],
        [77, 0, 74, 0, 77, 0, 81, 0, 79, 0, 0, 0, 74, 0, 0, 0],
        [74, 0, 77, 0, 82, 0, 81, 0, 79, 0, 77, 0, 74, 0, 77, 0],
        [79, 0, 0, 0, 76, 0, 79, 0, 84, 0, 0, 0, 82, 0, 0, 0],
      ],
      step(i, t, s) {
        const k = i % 16;
        const bar = Math.floor(i / 16);
        const ch = this.chords[bar % 4];
        if (k % 4 === 0) I.kick(t, k === 0 ? 0.65 : 0.45);
        if (k === 4 || k === 12) I.snare(t, 0.5);
        if (k % 2 === 0) I.hat(t, 0.35);
        if (k % 4 === 0) I.bass(ch[0] + (k === 8 ? 7 : 0), t, s * 3, 0.5);
        if (k % 2 === 0) I.marimba(ch[1 + ((k / 2) % 3)], t, 0.3);
        const mel = this.mel[bar % 4][k];
        if (mel && Math.floor(bar / 4) % 2 === 0) I.marimba(mel, t, 0.6);
        if (mel && Math.floor(bar / 4) % 2 === 1) I.bell(mel, t, 0.4);
      },
    },
    // ---- 집중 공부 ----
    {
      id: 'lofi', gain: 1.2, cat: 'focus', name: '로파이 공부방', desc: '잔잔한 비트와 전자 피아노', bpm: 74, swing: 0.3, cutoff: 2600,
      chords: [[53, 64, 67, 69, 72], [52, 62, 64, 67, 71], [50, 60, 64, 65, 69], [48, 59, 62, 64, 67]],
      step(i, t, s) {
        const k = i % 16;
        const bar = Math.floor(i / 16);
        const ch = this.chords[bar % 4];
        if (k === 0 || k === 7 || k === 10) I.kick(t, k ? 0.4 : 0.55);
        if (k === 4 || k === 12) I.snare(t, 0.32);
        if (k % 2 === 0) I.hat(t, k % 4 ? 0.22 : 0.35);
        if (Math.random() < 0.18) I.crackle(t + Math.random() * s);
        if (k === 0) { ch.slice(1).forEach((m) => I.rhodes(m, t, s * 14, 0.42)); I.bass(ch[0] - 12, t, s * 6, 0.5); }
        if (k === 8 && bar % 2) I.bass(ch[0] - 5, t, s * 5, 0.4);
        if (bar % 8 >= 4 && [2, 6, 11].includes(k) && Math.random() < 0.7) I.piano(pick([72, 74, 76, 79, 81]), t, 1, 0.3);
      },
    },
    {
      id: 'softpiano', gain: 2.3, cat: 'focus', name: '조용한 피아노', desc: '천천히 흐르는 피아노 아르페지오', bpm: 84,
      chords: [[48, 55, 64, 67, 71], [45, 52, 60, 64, 67], [41, 48, 57, 64, 65], [43, 50, 59, 62, 67]],
      step(i, t, s) {
        const k = i % 16;
        const bar = Math.floor(i / 16);
        const ch = this.chords[bar % 4];
        if (k % 2 === 0) {
          const order = [0, 1, 2, 3, 4, 3, 2, 1];
          const m = ch[order[(k / 2) % 8]];
          I.piano(m, t, k === 0 ? 3 : 1, k === 0 ? 0.5 : 0.32);
        }
        if (k === 0 && bar % 4 === 0) I.pad(ch.slice(1, 4), t, s * 64, 0.5, 900);
        if ((k === 4 || k === 12) && bar % 2 === 1 && Math.random() < 0.5) I.piano(pick(C_MAJ.slice(4)) + 12, t, 1, 0.22);
      },
    },
    // ---- 잔잔한 클래식 ----
    {
      id: 'bach', gain: 2.3, cat: 'classic', name: '바흐 · 전주곡 C장조', desc: '평균율 1권 1번 (BWV 846)', bpm: 66,
      step(i, t) {
        const k = i % 16;
        const bar = Math.floor(i / 16) % (BACH.length + 1);
        if (bar === BACH.length) return; // 한 마디 쉬고 다시
        const ch = BACH[bar];
        if (bar === BACH.length - 1) { if (k === 0) ch.forEach((m, j) => I.piano(m, t + j * 0.05, 4, 0.45)); return; }
        const m = ch[BACH_ORDER[k % 8]];
        const len = k === 0 || k === 8 ? 3 : k === 1 || k === 9 ? 2.5 : 0.9;
        I.piano(m, t, len, k % 8 === 0 ? 0.5 : 0.38);
      },
    },
    {
      id: 'canon', gain: 1.0, cat: 'classic', name: '파헬벨 · 캐논', desc: '현악 화음 위에 흐르는 선율', bpm: 60,
      step(i, t, s) {
        const k = i % 8; // 2박(8칸)마다 화음 하나
        const ci = Math.floor(i / 8) % 8;
        const cycle = Math.floor(i / 64) % 4;
        const ch = CANON[ci];
        if (k === 0) {
          I.bass(ch[0], t, s * 8, 0.45);
          if (ci === 0) I.pad(ch.slice(1), t, s * 64, 0.45, 1300);
        }
        if (k % 2 === 0) I.piano(ch[1 + ((k / 2) % 3)], t, 1.2, 0.3);
        const mel = CANON_MEL[cycle];
        if (!mel) return;
        const note = mel[ci];
        if (Array.isArray(note)) { if (k === 0) I.bell(note[0], t, 0.4); if (k === 4) I.bell(note[1], t, 0.4); }
        else if (k === 0) I.piano(note, t, 2.5, 0.5);
      },
    },
    // ---- 자연의 소리 ----
    {
      id: 'rain', gain: 2.0, cat: 'nature', name: '창밖 빗소리', desc: '토독토독 차분한 비',
      bed() {
        I.bed('lowpass', 1400, 0.22, { lfo: 0.25, lfoRate: 0.07, hp: 250 });
        I.bed('bandpass', 4200, 0.05, { q: 0.4, lfo: 0.4, lfoRate: 0.13 });
      },
      bpm: 120,
      step(i, t, s) {
        for (let n = 0; n < 3; n++) if (Math.random() < 0.7) I.noise(t + Math.random() * s, 0.02, 0.04 + Math.random() * 0.06, 'bandpass', 2500 + Math.random() * 3000, 2);
        if (Math.random() < 0.05) I.noise(t, 0.05, 0.08, 'bandpass', 900 + Math.random() * 600, 3, 0.4);
      },
    },
    {
      id: 'forest', gain: 3.0, cat: 'nature', name: '숲속 시냇물', desc: '졸졸 물소리와 새소리',
      bed() {
        I.bed('bandpass', 1800, 0.12, { q: 0.6, lfo: 0.35, lfoRate: 0.31 });
        I.bed('lowpass', 500, 0.1, { lfo: 0.5, lfoRate: 0.05 });
      },
      bpm: 120,
      step(i, t, s) {
        if (Math.random() < 0.35) I.noise(t + Math.random() * s, 0.05, 0.03, 'bandpass', 1200 + Math.random() * 2400, 6);
        if (Math.random() < 0.012) I.bird(t + Math.random() * s);
      },
    },
    // ---- 차분한 휴식 ----
    {
      id: 'musicbox', gain: 1.4, cat: 'calm', name: '별빛 오르골', desc: '포근한 오르골 자장가', bpm: 66, steps: 12,
      chords: [[53, 65, 69, 72], [48, 64, 67, 72], [50, 62, 65, 69], [46, 62, 65, 70]],
      mel: [[81, 0, 79, 0, 77, 0], [79, 0, 76, 0, 72, 0], [77, 0, 74, 0, 72, 0], [74, 0, 0, 0, 70, 0]],
      step(i, t, s) {
        const k = i % 12; // 3박자 (8분음표 기준 2칸씩)
        const bar = Math.floor(i / 12);
        const ch = this.chords[bar % 4];
        if (k === 0) { I.bass(ch[0], t, s * 10, 0.3); I.pad(ch.slice(1), t, s * 12, 0.35, 800); }
        if (k % 2 === 0) I.bell(ch[1 + ((k / 2) % 3)] + 12, t, 0.28);
        const mel = this.mel[bar % 4][k / 2];
        if (k % 2 === 0 && mel && Math.floor(bar / 4) % 2 === 0) I.bell(mel + 12, t + 0.01, 0.4);
      },
    },
    {
      id: 'clouds', gain: 1.4, cat: 'calm', name: '구름 명상', desc: '천천히 숨 쉬는 앰비언트', bpm: 50,
      chords: [[48, 60, 64, 67, 71], [45, 60, 64, 67, 71], [41, 57, 60, 64, 67], [43, 59, 62, 67, 69]],
      step(i, t, s) {
        const k = i % 16;
        const bar = Math.floor(i / 16);
        const ch = this.chords[bar % 4];
        if (k === 0) { I.pad(ch.slice(1), t, s * 16, 0.6, 900); I.bass(ch[0] - 12, t, s * 14, 0.3); }
        if (k % 4 === 2 && Math.random() < 0.45) I.bell(pick([72, 74, 76, 79, 81, 84]), t, 0.25);
      },
    },
  ];

  // ---------- 연주 ----------
  function tick() {
    if (!play) return;
    const tr = play.track;
    if (!tr.step) return;
    const s16 = 60 / tr.bpm / 4;
    while (play.next < ctx.currentTime + 0.4) {
      const swing = tr.swing && play.step % 2 === 1 ? s16 * tr.swing : 0;
      try { tr.step(play.step, play.next + swing, s16); } catch (e) { console.error(e); }
      play.next += s16;
      play.step += 1;
    }
  }

  function stop(fade = 0.8) {
    if (!play) return;
    const p = play;
    play = null;
    clearInterval(p.timer);
    const now = ctx.currentTime;
    p.bus.gain.cancelScheduledValues(now);
    p.bus.gain.setValueAtTime(p.bus.gain.value, now);
    p.bus.gain.linearRampToValueAtTime(0.0001, now + fade);
    setTimeout(() => {
      p.layers.forEach((n) => { try { n.stop(); } catch (e) { /* 이미 멈춤 */ } });
      p.bus.disconnect();
    }, fade * 1000 + 200);
  }

  function start(id) {
    const tr = TRACKS.find((x) => x.id === id);
    if (!tr) return false;
    setup();
    stop(0.4);
    const bus = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const rev = ctx.createConvolver();
    rev.buffer = irBuf;
    wet.gain.value = 0.22;
    if (tr.cutoff) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = tr.cutoff;
      dry.connect(lp).connect(bus);
    } else {
      dry.connect(bus);
    }
    wet.connect(rev).connect(bus);
    bus.connect(vol);
    const now = ctx.currentTime;
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.linearRampToValueAtTime(tr.gain || 1, now + 1.2); // 곡마다 크기를 비슷하게
    play = { bus, dry, wet, track: tr, layers: [], step: 0, next: now + 0.1, timer: null };
    if (tr.bed) tr.bed();
    play.timer = setInterval(tick, 60);
    tick();
    return true;
  }

  window.Music = {
    tracks: TRACKS,
    start,
    stop,
    setVolume,
    get current() { return play ? play.track.id : null; },
  };
})();
