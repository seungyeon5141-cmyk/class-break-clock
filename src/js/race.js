// 뽑기 레이스: 이름 구슬이 위에서 떨어지며 장애물을 지나 결승선 순서대로 순위가 정해짐
(function () {
  const { $, $$, esc, toast, randInt, shuffle } = UI;
  const M = window.Matter;
  const W = 640;          // 맵 너비 (월드 단위)
  const H = 4300;         // 맵 높이
  const GATE_Y = 250;
  const FINISH_Y = 3960;
  const MAX = 60;
  const COLORS = ['#FF8FB1', '#B79CFF', '#7CC6FF', '#7FD8BE', '#FFC56E', '#FF9F7A', '#E38CF0', '#8FA8FF',
    '#9BDB7A', '#FFB3D0', '#6FD3E0', '#F7A8FF', '#FFD86E', '#A8B8FF', '#FF8C8C'];
  const SECTIONS = [
    { y0: 0, y1: 300, name: '출발', color: '#F6EEFF' },
    { y0: 300, y1: 1150, name: '페그 숲', color: '#EEF3FF' },
    { y0: 1150, y1: 1880, name: '지그재그 미끄럼틀', color: '#FFF0F6' },
    { y0: 1880, y1: 2600, name: '빙글빙글 바람개비', color: '#F1EAFF' },
    { y0: 2600, y1: 3200, name: '통통 범퍼', color: '#EAFBF5' },
    { y0: 3200, y1: H, name: '마지막 깔때기', color: '#FFF7E8' },
  ];

  const cfg = () => Store.data.race;

  let engine = null;
  let marbles = [];      // { body, name, color, finished, rank, lastY, still }
  let obstacles = [];    // 그리기용 { kind, body }
  let spinners = [];     // { body, speed }
  let gate = null;
  let ranking = [];
  let running = false;
  let countingDown = false;
  let started = false;
  let winnerShown = false;
  let camY = 0;
  let raf = null;
  let stepCount = 0;
  let canvas, ctx, mini, mctx, dpr = 1;

  // ---------- 참가자 ----------
  function participants() {
    if (cfg().source === 'custom') {
      return cfg().customItems.map((t) => String(t).trim()).filter(Boolean).slice(0, MAX);
    }
    const pk = Store.data.picker;
    return Store.data.students
      .filter((p) => !pk.secretIds.includes(p.id) && !pk.excludedIds.includes(p.id))
      .map((p) => p.name).slice(0, MAX);
  }

  function targetRank(n) {
    const w = cfg().winRank;
    if (w === 'last') return n;
    if (w === 'n') return Math.max(1, Math.min(n, Number(cfg().winN) || 1));
    return 1;
  }

  // ---------- 맵 만들기 ----------
  const opts = (extra) => ({ isStatic: true, friction: 0.001, restitution: 0.5, ...extra });

  function addPeg(x, y, r = 7) {
    const b = M.Bodies.circle(x, y, r, opts({ label: 'peg' }));
    obstacles.push({ kind: 'peg', body: b, r });
    return b;
  }

  function addBar(x, y, w, h, angle, kind = 'bar') {
    const b = M.Bodies.rectangle(x, y, w, h, opts({ angle, label: kind, chamfer: { radius: Math.min(h / 2, 8) } }));
    obstacles.push({ kind, body: b, w, h });
    return b;
  }

  function buildWorld(names) {
    engine = M.Engine.create();
    engine.gravity.y = 1.15;
    engine.positionIterations = 8;
    engine.velocityIterations = 6;
    obstacles = [];
    spinners = [];
    const bodies = [];

    // 양쪽 벽과 바닥
    bodies.push(M.Bodies.rectangle(-20, H / 2, 40, H * 2, opts({ label: 'wall' })));
    bodies.push(M.Bodies.rectangle(W + 20, H / 2, 40, H * 2, opts({ label: 'wall' })));
    bodies.push(addBar(W / 2, H - 10, W, 20, 0, 'floor'));

    // 출발 문
    gate = addBar(W / 2, GATE_Y, W, 14, 0, 'gate');
    bodies.push(gate);

    // 페그 숲
    for (let row = 0; row < 12; row++) {
      const y = 340 + row * 68;
      const offset = row % 2 ? 32 : 0;
      for (let x = 32 + offset; x < W - 10; x += 64) bodies.push(addPeg(x, y));
    }

    // 지그재그 미끄럼틀
    for (let i = 0; i < 4; i++) {
      const y = 1220 + i * 165;
      const fromLeft = i % 2 === 0;
      const len = 500;
      const x = fromLeft ? len / 2 - 10 : W - len / 2 + 10;
      bodies.push(addBar(x, y, len, 16, fromLeft ? 0.3 : -0.3));
      bodies.push(addPeg(fromLeft ? W - 40 : 40, y - 40, 9));
    }

    // 바람개비
    const spin = (x, y, len, speed) => {
      const a = M.Bodies.rectangle(x, y, len, 14, { chamfer: { radius: 7 } });
      const b = M.Bodies.rectangle(x, y, 14, len, { chamfer: { radius: 7 } });
      const body = M.Body.create({ parts: [a, b], isStatic: true, label: 'spinner', friction: 0.05, restitution: 0.6 });
      spinners.push({ body, speed, len });
      bodies.push(body);
    };
    spin(W * 0.27, 1990, 170, 0.035);
    spin(W * 0.73, 1990, 170, -0.035);
    spin(W * 0.5, 2210, 230, 0.028);
    spin(W * 0.22, 2440, 150, -0.04);
    spin(W * 0.78, 2440, 150, 0.04);
    [[W * 0.5, 2050], [W * 0.08, 2210], [W * 0.92, 2210], [W * 0.5, 2420]].forEach(([x, y]) => bodies.push(addPeg(x, y, 10)));

    // 범퍼
    [[W * 0.2, 2700], [W * 0.5, 2760], [W * 0.8, 2700], [W * 0.35, 2900], [W * 0.65, 2900],
      [W * 0.15, 3080], [W * 0.5, 3060], [W * 0.85, 3080]].forEach(([x, y]) => {
      const r = 26;
      const b = M.Bodies.circle(x, y, r, opts({ label: 'bumper', restitution: 0.9 }));
      obstacles.push({ kind: 'bumper', body: b, r });
      bodies.push(b);
    });

    // 마지막 깔때기: 한 줄로 지나가며 순서가 정해짐
    const gapHalf = marbleRadius(names.length) * 1.7;
    const funnelTop = 3300;
    const funnelBottom = 3760;
    const leftAngle = Math.atan2(funnelBottom - funnelTop, W / 2 - gapHalf);
    const flen = Math.hypot(W / 2 - gapHalf, funnelBottom - funnelTop);
    bodies.push(addBar((W / 2 - gapHalf) / 2, (funnelTop + funnelBottom) / 2, flen, 16, leftAngle, 'funnel'));
    bodies.push(addBar(W - (W / 2 - gapHalf) / 2, (funnelTop + funnelBottom) / 2, flen, 16, -leftAngle, 'funnel'));
    bodies.push(addBar(W / 2 - gapHalf - 8, funnelBottom + 70, 16, 140, 0, 'funnel'));
    bodies.push(addBar(W / 2 + gapHalf + 8, funnelBottom + 70, 16, 140, 0, 'funnel'));
    // 결승선 아래 넓게 퍼지게
    bodies.push(addPeg(W / 2, FINISH_Y + 60, 12));

    M.Composite.add(engine.world, bodies);

    // 구슬
    const r = marbleRadius(names.length);
    const order = shuffle(names.map((name, i) => ({ name, color: COLORS[i % COLORS.length] })));
    const perRow = Math.floor((W - 40) / (r * 2 + 8));
    marbles = order.map((m, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const x = 24 + r + col * (r * 2 + 8) + (row % 2 ? r : 0) + Math.random() * 3;
      const y = GATE_Y - 20 - r - row * (r * 2 + 6);
      const body = M.Bodies.circle(x, Math.max(r + 4, y), r, {
        restitution: 0.45, friction: 0.002, frictionAir: 0.005, density: 0.002, label: 'marble',
      });
      return { body, name: m.name, color: m.color, finished: false, rank: 0, lastY: body.position.y, still: 0 };
    });
    M.Composite.add(engine.world, marbles.map((m) => m.body));

    // 범퍼에 닿으면 튕겨 나감
    M.Events.on(engine, 'collisionStart', (ev) => {
      ev.pairs.forEach(({ bodyA, bodyB }) => {
        const bumper = bodyA.label === 'bumper' ? bodyA : bodyB.label === 'bumper' ? bodyB : null;
        const ball = bodyA.label === 'marble' ? bodyA : bodyB.label === 'marble' ? bodyB : null;
        if (!bumper || !ball) return;
        const dx = ball.position.x - bumper.position.x;
        const dy = ball.position.y - bumper.position.y;
        const d = Math.hypot(dx, dy) || 1;
        M.Body.setVelocity(ball, { x: (dx / d) * 9, y: (dy / d) * 9 });
        bumper.hitAt = performance.now();
        if (cfg().sound) Sound.click();
      });
    });

    ranking = [];
    started = false;
    running = false;
    winnerShown = false;
    stepCount = 0;
    camY = 0;
    $('#raceWinner').hidden = true;
  }

  function marbleRadius(n) {
    if (n <= 20) return 15;
    if (n <= 35) return 13;
    return 11;
  }

  // ---------- 진행 ----------
  function step() {
    spinners.forEach((s) => M.Body.setAngle(s.body, s.body.angle + s.speed));
    M.Engine.update(engine, 1000 / 60);
    stepCount += 1;
    const n = marbles.length;
    const target = targetRank(n);

    marbles.forEach((m) => {
      const b = m.body;
      // 너무 빨라 장애물을 뚫지 않도록 제한
      const v = Math.hypot(b.velocity.x, b.velocity.y);
      if (v > 20) M.Body.setVelocity(b, { x: (b.velocity.x / v) * 20, y: (b.velocity.y / v) * 20 });
      if (!m.finished && b.position.y > FINISH_Y) {
        m.finished = true;
        ranking.push(m);
        m.rank = ranking.length;
        if (cfg().sound) Sound.tick();
        renderRanking();
      }
    });

    // 오래 멈춘 구슬은 살짝 흔들어 줌
    if (stepCount % 90 === 0) {
      marbles.forEach((m) => {
        if (m.finished) return;
        const moved = Math.abs(m.body.position.y - m.lastY);
        m.still = moved < 4 ? m.still + 1 : 0;
        m.lastY = m.body.position.y;
        if (m.still >= 2) {
          M.Body.setVelocity(m.body, { x: (Math.random() - 0.5) * 10, y: -4 - Math.random() * 3 });
          m.still = 0;
        }
      });
    }

    // 꼴등 뽑기는 마지막 한 명만 남으면 바로 결정
    if (!winnerShown && cfg().winRank === 'last' && n > 1 && ranking.length === n - 1) {
      const last = marbles.find((m) => !m.finished);
      showWinner(last, n);
    } else if (!winnerShown && ranking.length >= target) {
      showWinner(ranking[target - 1], target);
    }
    if (ranking.length === n && running) {
      running = false;
      renderSetup();
    }
  }

  function showWinner(m, rank) {
    winnerShown = true;
    const box = $('#raceWinner');
    $('#raceWinnerRank').textContent = cfg().winRank === 'last' ? '꼴등' : `${rank}등`;
    $('#raceWinnerName').textContent = m.name;
    box.style.setProperty('--win-color', m.color);
    box.hidden = false;
    if (cfg().sound) Sound.fanfare();
  }

  // 카메라가 따라갈 구슬: 지금 당첨 순위 자리에 있는 구슬
  function focusMarble() {
    const left = marbles.filter((m) => !m.finished).sort((a, b) => b.body.position.y - a.body.position.y);
    if (!left.length) return ranking[ranking.length - 1];
    if (cfg().winRank === 'last') return left[left.length - 1];
    const idx = Math.max(0, Math.min(left.length - 1, targetRank(marbles.length) - ranking.length - 1));
    return left[idx];
  }

  // ---------- 그리기 ----------
  function resize() {
    if (!canvas) return;
    dpr = window.devicePixelRatio || 1;
    const wrap = canvas.parentElement;
    canvas.width = Math.max(10, wrap.clientWidth * dpr);
    canvas.height = Math.max(10, wrap.clientHeight * dpr);
    const mw = mini.parentElement;
    mini.width = Math.max(10, mw.clientWidth * dpr);
    mini.height = Math.max(10, mw.clientHeight * dpr);
    draw();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawPoly(c, body) {
    const parts = body.parts.length > 1 ? body.parts.slice(1) : [body];
    parts.forEach((p) => {
      c.beginPath();
      p.vertices.forEach((v, i) => (i ? c.lineTo(v.x, v.y) : c.moveTo(v.x, v.y)));
      c.closePath();
      c.fill();
      c.stroke();
    });
  }

  function draw() {
    if (!ctx || !engine) return;
    const scale = canvas.width / W;
    const viewH = canvas.height / scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, -camY * scale);
    const top = camY - 40;
    const bottom = camY + viewH + 40;

    SECTIONS.forEach((s) => {
      if (s.y1 < top || s.y0 > bottom) return;
      ctx.fillStyle = s.color;
      ctx.fillRect(0, s.y0, W, s.y1 - s.y0);
      ctx.fillStyle = 'rgba(125, 108, 148, 0.18)';
      ctx.font = '700 34px Paperlogy, Pretendard, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.name, W / 2, s.y0 + 52);
    });

    // 결승선 (체크 무늬)
    if (FINISH_Y > top && FINISH_Y < bottom) {
      const sq = 16;
      for (let x = 0; x < W; x += sq) {
        for (let k = 0; k < 2; k++) {
          ctx.fillStyle = ((x / sq) + k) % 2 ? '#4B3B63' : '#FFFFFF';
          ctx.fillRect(x, FINISH_Y - sq + k * sq, sq, sq);
        }
      }
      ctx.fillStyle = '#F47BB6';
      ctx.font = '700 22px Paperlogy, sans-serif';
      ctx.fillText('FINISH', W / 2, FINISH_Y - 26);
    }

    obstacles.forEach((o) => {
      const b = o.body;
      if (o.kind === 'gate' && started) return;
      if (b.bounds.max.y < top || b.bounds.min.y > bottom) return;
      if (o.kind === 'peg') {
        ctx.fillStyle = '#CDB6FF';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(b.position.x, b.position.y, o.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (o.kind === 'bumper') {
        const hit = b.hitAt && performance.now() - b.hitAt < 150;
        ctx.fillStyle = hit ? '#FFD86E' : '#7FD8BE';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(b.position.x, b.position.y, o.r * (hit ? 1.12 : 1), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(b.position.x, b.position.y, o.r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = o.kind === 'gate' ? '#F47BB6' : o.kind === 'funnel' ? '#B79CFF' : o.kind === 'floor' ? '#E3D4FF' : '#FFB4D6';
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        drawPoly(ctx, b);
      }
    });

    spinners.forEach((s) => {
      ctx.fillStyle = '#9D7CF5';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      drawPoly(ctx, s.body);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(s.body.position.x, s.body.position.y, 6, 0, Math.PI * 2);
      ctx.fill();
    });

    const focus = started ? focusMarble() : null;
    marbles.forEach((m) => {
      const b = m.body;
      const r = b.circleRadius;
      if (b.position.y < top - 40 || b.position.y > bottom + 40) return;
      ctx.fillStyle = m.color;
      ctx.strokeStyle = m === focus ? '#4B3B63' : 'rgba(255,255,255,0.95)';
      ctx.lineWidth = m === focus ? 4 : 2.5;
      ctx.beginPath();
      ctx.arc(b.position.x, b.position.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(b.position.x - r * 0.35, b.position.y - r * 0.35, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
    });
    // 이름표는 구슬 위에 따로 그려서 가려지지 않게
    ctx.font = '700 13px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    marbles.forEach((m) => {
      const b = m.body;
      if (b.position.y < top - 40 || b.position.y > bottom + 40) return;
      const label = m.rank ? `${m.rank}. ${m.name}` : m.name;
      const tw = ctx.measureText(label).width + 12;
      const ly = b.position.y - b.circleRadius - 12;
      ctx.fillStyle = m === focus ? '#4B3B63' : 'rgba(75, 59, 99, 0.78)';
      roundRect(ctx, b.position.x - tw / 2, ly - 9, tw, 18, 9);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, b.position.x, ly + 0.5);
    });
    ctx.textBaseline = 'alphabetic';

    drawMini(viewH);
  }

  function drawMini(viewH) {
    if (!mctx) return;
    const s = Math.min(mini.width / W, mini.height / H);
    const ox = (mini.width - W * s) / 2;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, mini.width, mini.height);
    mctx.setTransform(s, 0, 0, s, ox, 0);
    SECTIONS.forEach((sec) => {
      mctx.fillStyle = sec.color;
      mctx.fillRect(0, sec.y0, W, sec.y1 - sec.y0);
    });
    mctx.strokeStyle = 'rgba(0,0,0,0)';
    obstacles.forEach((o) => {
      if (o.kind === 'gate' && started) return;
      const b = o.body;
      if (o.kind === 'peg' || o.kind === 'bumper') {
        mctx.fillStyle = o.kind === 'bumper' ? '#7FD8BE' : '#CDB6FF';
        mctx.beginPath();
        mctx.arc(b.position.x, b.position.y, Math.max(o.r, 10), 0, Math.PI * 2);
        mctx.fill();
      } else {
        mctx.fillStyle = o.kind === 'funnel' ? '#B79CFF' : '#FFB4D6';
        drawPoly(mctx, b);
      }
    });
    mctx.fillStyle = '#9D7CF5';
    spinners.forEach((sp) => drawPoly(mctx, sp.body));
    mctx.fillStyle = '#4B3B63';
    mctx.fillRect(0, FINISH_Y - 6, W, 12);
    marbles.forEach((m) => {
      mctx.fillStyle = m.color;
      mctx.beginPath();
      mctx.arc(m.body.position.x, m.body.position.y, 22, 0, Math.PI * 2);
      mctx.fill();
    });
    mctx.strokeStyle = '#F47BB6';
    mctx.lineWidth = 14;
    mctx.strokeRect(6, camY, W - 12, viewH);
  }

  function loop() {
    raf = null;
    if ($('#racePanel').hidden) return;
    syncBgm();
    if (running) {
      const speed = cfg().speed || 1;
      for (let i = 0; i < speed; i++) step();
    }
    if (started && marbles.length) {
      const scale = canvas.width / W;
      const viewH = canvas.height / scale;
      const f = focusMarble();
      const want = Math.max(0, Math.min(H - viewH, (f ? f.body.position.y : 0) - viewH * 0.45));
      camY += (want - camY) * 0.08;
    }
    draw();
    raf = requestAnimationFrame(loop);
  }

  function kick() { if (!raf) raf = requestAnimationFrame(loop); }

  // ---------- 화면 ----------
  function renderRanking() {
    const n = marbles.length;
    const target = targetRank(n);
    $('#raceRank').innerHTML = ranking.length
      ? ranking.map((m) => {
        const win = (cfg().winRank === 'last' ? m.rank === n : m.rank === target) ? ' win' : '';
        return `<li class="${win}"><b>${m.rank}</b><i style="background:${m.color}"></i><span>${esc(m.name)}</span></li>`;
      }).join('')
      : '<li class="empty">결승선을 지나면 순서대로 나와요</li>';
    $('#raceProgress').textContent = `${ranking.length} / ${n}`;
  }

  function renderSetup() {
    const c = cfg();
    $$('#raceSource [data-source]').forEach((b) => b.classList.toggle('active', b.dataset.source === c.source));
    $('#raceCustomWrap').hidden = c.source !== 'custom';
    if (document.activeElement !== $('#raceCustom')) $('#raceCustom').value = c.customItems.join('\n');
    const n = participants().length;
    $('#raceCountInfo').textContent = `참가 ${n}명`;
    $('#raceStudentsInfo').hidden = c.source !== 'students';
    $('#raceStudentsInfo').textContent = Store.data.students.length
      ? '학생 명단에서 결석·제외 번호를 뺀 학생이 참가해요'
      : '설정 › 학생 명단에서 먼저 CSV를 불러와 주세요';
    $('#raceWin').value = c.winRank;
    $('#raceWinN').value = c.winN;
    $('#raceWinN').hidden = c.winRank !== 'n';
    $('#raceSpeed').textContent = `${c.speed || 1}x`;
    $('#raceSound').classList.toggle('off', !c.sound);
    $('#raceBgm').classList.toggle('off', c.bgm === false);
    $('#raceBgm').setAttribute('aria-pressed', String(c.bgm !== false));
    $('#raceBgm').title = c.bgm === false ? '배경음악 켜기' : '배경음악 끄기';
    $('#raceSound').setAttribute('aria-pressed', String(!!c.sound));
    if (document.activeElement !== $('#raceTitle')) $('#raceTitle').value = c.title || '';
    const done = started && marbles.length && ranking.length === marbles.length;
    $('#raceStart').textContent = running ? '❚❚ 멈추기' : done ? '🔁 한 번 더' : started ? '▶ 계속하기' : '▶ 시작하기';
  }

  function showTab(name) {
    $$('#raceTabs [data-rtab]').forEach((b) => b.classList.toggle('active', b.dataset.rtab === name));
    $('#raceSetup').hidden = name !== 'setup';
    $('#raceRankWrap').hidden = name !== 'rank';
  }

  function reset() {
    const names = participants();
    buildWorld(names.length ? names : []);
    renderRanking();
    renderSetup();
    draw();
  }

  async function countdown() {
    const el = $('#raceCount');
    for (const t of ['3', '2', '1', 'GO!']) {
      el.textContent = t;
      el.hidden = false;
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
      if (cfg().sound) (t === 'GO!' ? Sound.tickLast : Sound.tick)();
      await new Promise((r) => setTimeout(r, 650));
    }
    el.hidden = true;
  }

  async function startPause() {
    Sound.unlock();
    if (running) { running = false; renderSetup(); return; }
    if (started && ranking.length === marbles.length) {
      started = false;
      ranking = [];
    }
    if (!started) {
      const names = participants();
      if (names.length < 2) {
        toast(cfg().source === 'custom' ? '참가할 이름을 2개 이상 입력해 주세요' : '참가할 학생이 2명 이상 필요해요');
        showTab('setup');
        return;
      }
      if (ranking.length || !marbles.length || marbles.length !== names.length) buildWorld(names);
      showTab('rank');
      renderRanking();
      $('#raceStart').disabled = true;
      countingDown = true;
      kick();
      await countdown();
      countingDown = false;
      $('#raceStart').disabled = false;
      M.Composite.remove(engine.world, gate);
      // 출발할 때 살짝씩 다른 힘을 줘서 매번 결과가 달라지게
      marbles.forEach((m) => M.Body.setVelocity(m.body, { x: (Math.random() - 0.5) * 3, y: Math.random() * 2 }));
      started = true;
    }
    if (ranking.length === marbles.length) return;
    running = true;
    renderSetup();
    kick();
  }

  // BGM: 레이스가 달리는 동안(카운트다운 포함)만 재생, 결승에 가까울수록 빨라짐
  function syncBgm() {
    const want = cfg().bgm !== false && (running || countingDown) && !$('#racePanel').hidden;
    if (want && !Sound.bgm.playing) Sound.bgm.start();
    if (!want && Sound.bgm.playing) Sound.bgm.stop();
    if (want && marbles.length) {
      const lead = Math.max(...marbles.filter((m) => !m.finished).map((m) => m.body.position.y), 0);
      Sound.bgm.setIntensity(lead / FINISH_Y);
    }
  }

  function init() {
    canvas = $('#raceCanvas');
    ctx = canvas.getContext('2d');
    mini = $('#raceMini');
    mctx = mini.getContext('2d');
    const c = cfg();

    $('#raceStart').addEventListener('click', startPause);
    $('#raceReset').addEventListener('click', () => { reset(); showTab('setup'); toast('구슬을 다시 섞었어요'); });
    $('#raceSpeed').addEventListener('click', () => { c.speed = (c.speed || 1) % 3 + 1; Store.save(); renderSetup(); });
    $('#raceSound').addEventListener('click', () => { c.sound = !c.sound; Store.save(); renderSetup(); });
    $('#raceBgm').addEventListener('click', () => {
      Sound.unlock();
      c.bgm = c.bgm === false;
      Store.save();
      renderSetup();
      syncBgm();
      toast(c.bgm ? '🎵 배경음악을 켰어요' : '배경음악을 껐어요');
    });
    $('#raceTitle').addEventListener('input', (e) => { c.title = e.target.value; Store.save(); });
    $('#raceTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rtab]');
      if (b) showTab(b.dataset.rtab);
    });
    $('#raceSource').addEventListener('click', (e) => {
      const b = e.target.closest('[data-source]');
      if (!b || started) { if (started) toast('다시 섞기를 누른 뒤 바꿀 수 있어요'); return; }
      c.source = b.dataset.source;
      Store.save();
      reset();
    });
    $('#raceCustom').addEventListener('input', (e) => {
      c.customItems = e.target.value.split('\n').slice(0, MAX * 2);
      Store.save();
      if (!started) reset();
    });
    $('#raceWin').addEventListener('change', (e) => { c.winRank = e.target.value; Store.save(); renderSetup(); renderRanking(); });
    $('#raceWinN').addEventListener('input', (e) => { c.winN = Math.max(1, parseInt(e.target.value, 10) || 1); Store.save(); renderRanking(); });
    $('#raceWinnerClose').addEventListener('click', () => { $('#raceWinner').hidden = true; });
    $('#raceMiniWrap').addEventListener('click', (e) => {
      // 전체맵을 누르면 그 위치를 잠깐 보여줌 (출발 전)
      if (started) return;
      const r = mini.getBoundingClientRect();
      const s = Math.min(mini.width / W, mini.height / H) / dpr;
      const scale = canvas.width / W;
      camY = Math.max(0, Math.min(H - canvas.height / scale, (e.clientY - r.top) / s - canvas.height / scale / 2));
      draw();
    });

    new ResizeObserver(resize).observe($('#raceStageWrap'));
    UI.onPanel('racePanel', {
      open: () => {
        document.fonts.ready.then(() => {
          if (!started) reset();
          resize();
          kick();
        });
      },
      close: () => { running = false; countingDown = false; Sound.bgm.stop(); },
    });
  }

  window.Race = { init };
})();
