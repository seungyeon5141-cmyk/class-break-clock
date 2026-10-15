// 돌림판
(function () {
  const { $, toast, randInt, shuffle } = UI;
  const COLORS = ['#FFD6E7', '#E6D6FF', '#C9E8FF', '#C8F1E6', '#FFF3B8', '#FFE0CC', '#F6D3F5', '#D6DCFF', '#DDF5C8', '#FFC9D9'];
  const TAU = Math.PI * 2;
  let rot = 0;
  let spinning = false;

  const cfg = () => Store.data.roulette;

  function items() {
    return $('#wheelItems').value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 100);
  }

  function draw() {
    const canvas = $('#wheelCanvas');
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const c = size / 2;
    const R = c - 12;
    const list = items();
    ctx.clearRect(0, 0, size, size);

    // 바깥 테두리
    ctx.beginPath();
    ctx.arc(c, c, R + 8, 0, TAU);
    const ring = ctx.createLinearGradient(0, 0, size, size);
    ring.addColorStop(0, '#b79cff');
    ring.addColorStop(1, '#ff9fcf');
    ctx.fillStyle = ring;
    ctx.fill();

    if (!list.length) {
      ctx.beginPath();
      ctx.arc(c, c, R, 0, TAU);
      ctx.fillStyle = '#faf6ff';
      ctx.fill();
      ctx.fillStyle = '#7d6c94';
      ctx.font = '30px Paperlogy';
      ctx.textAlign = 'center';
      ctx.fillText('항목을 입력해 주세요', c, c - 70);
      return;
    }

    const seg = TAU / list.length;
    const fontSize = Math.max(14, Math.min(34, 360 / list.length + 10));
    list.forEach((text, i) => {
      const a0 = rot + i * seg;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, R, a0, a0 + seg);
      ctx.closePath();
      ctx.fillStyle = list.length % COLORS.length === 1 && i === list.length - 1 ? COLORS[4] : COLORS[i % COLORS.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(a0 + seg / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#4b3b63';
      ctx.font = `${fontSize}px Paperlogy`;
      let label = text;
      const maxW = R - 80;
      while (ctx.measureText(label).width > maxW && label.length > 1) label = label.slice(0, -1);
      if (label !== text) label = label.slice(0, -1) + '…';
      ctx.fillText(label, R - 22, 0);
      ctx.restore();
    });

    // 가운데 원 (버튼 자리)
    ctx.beginPath();
    ctx.arc(c, c, 58, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  // 바늘(위쪽)이 가리키는 칸
  function indexAtPointer(n) {
    const seg = TAU / n;
    const a = (((-Math.PI / 2 - rot) % TAU) + TAU) % TAU;
    return Math.floor(a / seg) % n;
  }

  function spin() {
    if (spinning) return;
    Sound.unlock();
    const list = items();
    if (list.length < 2) { toast('항목을 2개 이상 입력해 주세요'); return; }
    const n = list.length;
    const seg = TAU / n;
    const target = randInt(n);
    const offset = (0.15 + Math.random() * 0.7) * seg;
    let finalRot = -Math.PI / 2 - (target * seg + offset);
    const minRot = rot + TAU * (6 + randInt(3));
    finalRot += Math.ceil((minRot - finalRot) / TAU) * TAU;

    const startRot = rot;
    const dur = 5200 + randInt(1200);
    const t0 = performance.now();
    let lastIdx = indexAtPointer(n);
    spinning = true;
    $('#wheelSpin').disabled = true;
    $('#wheelItems').disabled = true;
    const res = $('#wheelResult');
    res.classList.remove('win');
    res.textContent = '두근두근…';

    const ease = (t) => 1 - Math.pow(1 - t, 4);
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      rot = startRot + (finalRot - startRot) * ease(t);
      draw();
      const idx = indexAtPointer(n);
      if (idx !== lastIdx) { lastIdx = idx; Sound.click(); }
      if (t < 1) { requestAnimationFrame(frame); return; }
      rot %= TAU;
      spinning = false;
      $('#wheelSpin').disabled = false;
      $('#wheelItems').disabled = false;
      const winner = list[target];
      res.textContent = `🎉 ${winner}`;
      res.classList.add('win');
      Sound.fanfare();
      if (cfg().removeWinner) {
        setTimeout(() => {
          const rest = items();
          rest.splice(target, 1);
          $('#wheelItems').value = rest.join('\n');
          save();
          draw();
        }, 1600);
      }
    };
    requestAnimationFrame(frame);
  }

  function save() {
    cfg().items = items();
    Store.save();
    $('#wheelCount').textContent = `${cfg().items.length}개`;
  }

  function init() {
    $('#wheelItems').value = cfg().items.join('\n');
    $('#wheelRemove').checked = cfg().removeWinner;
    $('#wheelCount').textContent = `${cfg().items.length}개`;
    $('#wheelItems').addEventListener('input', () => { save(); draw(); });
    $('#wheelSpin').addEventListener('click', spin);
    $('#wheelShuffle').addEventListener('click', () => {
      $('#wheelItems').value = shuffle(items()).join('\n');
      save(); draw();
    });
    $('#wheelRemove').addEventListener('change', (e) => { cfg().removeWinner = e.target.checked; Store.save(); });
    $('#wheelLoadStudents').addEventListener('click', () => {
      const list = Store.data.students;
      if (!list.length) { toast('설정 › 학생 명단에서 먼저 CSV를 불러와 주세요'); return; }
      $('#wheelItems').value = list.map((p) => p.name).join('\n');
      save(); draw();
      toast(`학생 ${list.length}명을 불러왔어요`);
    });
    UI.onPanel('roulettePanel', { open: () => document.fonts.ready.then(draw) });
    draw();
  }

  window.Roulette = { init };
})();
