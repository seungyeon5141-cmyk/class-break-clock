// 수업 배경 음악: 장르별 기본 음악(인터넷 없이) + 선생님이 넣은 유튜브 영상
(function () {
  const { $, esc, toast } = UI;

  const CATS = [
    { id: 'bright', icon: '🌞', name: '밝고 신나는', desc: '모둠 활동 · 정리 시간' },
    { id: 'focus', icon: '📚', name: '집중 공부', desc: '혼자 공부 · 문제 풀이' },
    { id: 'classic', icon: '🎻', name: '잔잔한 클래식', desc: '글쓰기 · 독서 시간' },
    { id: 'nature', icon: '🌿', name: '자연의 소리', desc: '미술 · 만들기 시간' },
    { id: 'calm', icon: '🌙', name: '차분한 휴식', desc: '쉬는 시간 · 마음 가라앉히기' },
  ];
  const MAX_LINKS = 30;

  const cfg = () => Store.data.bgm;
  // 지금 나오는 것 { kind: 'builtin'|'youtube', id, title, cat }
  let now = null;
  let follow = 0;

  // ---------- 유튜브 주소 읽기 ----------
  function parseYouTube(raw) {
    let u;
    try { u = new URL(String(raw).trim()); } catch { return null; }
    const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      id = u.searchParams.get('v');
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{6,})/);
      if (!id && m) id = m[1];
    } else return null;
    const list = u.searchParams.get('list');
    if (id && !/^[\w-]{6,20}$/.test(id)) id = null;
    if (!id && !(list && /^[\w-]+$/.test(list))) return null;
    return { id, list: list && /^[\w-]+$/.test(list) ? list : null };
  }

  function embedUrl(p) {
    const q = new URLSearchParams({ autoplay: '1', enablejsapi: '1', rel: '0', playsinline: '1', loop: '1', modestbranding: '1' });
    if (p.list) q.set('list', p.list);
    else q.set('playlist', p.id); // 한 영상을 계속 반복
    return `https://www.youtube-nocookie.com/embed/${p.id || 'videoseries'}?${q}`;
  }

  // ---------- 재생 ----------
  function ytFrame() { return $('#ytFrame'); }

  function ytCommand(func, args = []) {
    const f = ytFrame();
    if (f && f.contentWindow && f.src.startsWith('https:')) {
      f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    }
  }

  function stopAll() {
    Music.stop();
    const f = ytFrame();
    if (f.src !== 'about:blank') f.src = 'about:blank';
    $('#ytHost').classList.remove('on');
    now = null;
    render();
  }

  function playBuiltin(id) {
    const tr = Music.tracks.find((t) => t.id === id);
    if (!tr) return;
    stopAll();
    Music.setVolume(cfg().volume);
    Music.start(id);
    now = { kind: 'builtin', id, title: tr.name, cat: tr.cat };
    cfg().last = { kind: 'builtin', id };
    Store.save();
    render();
  }

  function playYouTube(link, cat) {
    const p = parseYouTube(link.url);
    if (!p) { toast('유튜브 주소를 읽지 못했어요'); return; }
    stopAll();
    if (!navigator.onLine) toast('인터넷에 연결되어 있지 않아요. 연결되면 영상이 나와요');
    const f = ytFrame();
    f.src = embedUrl(p);
    f.onload = () => {
      // 플레이어가 준비되면 음량 맞추기
      [800, 2000, 4000].forEach((ms) => setTimeout(() => ytCommand('setVolume', [cfg().volume]), ms));
    };
    $('#ytHost').classList.add('on');
    now = { kind: 'youtube', id: link.id, title: link.title, cat };
    cfg().last = { kind: 'youtube', id: link.id, cat };
    Store.save();
    render();
  }

  // 영상은 패널이 열려 있을 때 패널 안 자리에 보이고, 닫으면 숨겨진 채로 소리만 나온다
  function placeVideo() {
    const host = $('#ytHost');
    const slot = $('#bgmVideoSlot');
    const panelOpen = !$('#bgmPanel').hidden;
    if (panelOpen && now && now.kind === 'youtube' && slot.offsetParent) {
      const r = slot.getBoundingClientRect();
      host.classList.add('shown');
      Object.assign(host.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    } else {
      host.classList.remove('shown');
      Object.assign(host.style, { left: '', top: '', width: '', height: '' });
    }
  }
  function followLoop() {
    cancelAnimationFrame(follow);
    const loop = () => {
      placeVideo();
      if (!$('#bgmPanel').hidden) follow = requestAnimationFrame(loop);
    };
    loop();
  }

  // ---------- 화면 ----------
  function render() {
    const c = cfg();
    const cat = CATS.find((x) => x.id === c.cat) || CATS[0];
    $('#bgmCats').innerHTML = CATS.map((x) => `
      <button class="bgm-cat cat-${x.id}${x.id === cat.id ? ' active' : ''}" data-cat="${x.id}">
        <span class="bc-ico">${x.icon}</span>
        <span class="bc-txt"><b>${x.name}</b><small>${x.desc}</small></span>
        ${now && now.cat === x.id ? '<span class="bc-eq" aria-label="재생 중"><i></i><i></i><i></i></span>' : ''}
      </button>`).join('');

    const tracks = Music.tracks.filter((t) => t.cat === cat.id);
    $('#bgmBuiltin').innerHTML = tracks.map((t) => {
      const on = now && now.kind === 'builtin' && now.id === t.id;
      return `<div class="bgm-item${on ? ' playing' : ''}">
        <button class="bi-play" data-builtin="${t.id}" aria-label="${on ? '멈추기' : '재생'}">${on ? '⏸' : '▶'}</button>
        <span class="bi-txt"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span>
        ${on ? '<span class="bc-eq"><i></i><i></i><i></i></span>' : ''}
      </div>`;
    }).join('');

    const links = c.links[cat.id] || [];
    $('#bgmLinks').innerHTML = links.length ? links.map((l) => {
      const on = now && now.kind === 'youtube' && now.id === l.id;
      return `<div class="bgm-item yt${on ? ' playing' : ''}">
        <button class="bi-play" data-yt="${esc(l.id)}" aria-label="${on ? '멈추기' : '재생'}">${on ? '⏸' : '▶'}</button>
        <span class="bi-txt"><b>${esc(l.title)}</b><small>${esc(l.url)}</small></span>
        <button class="mini-btn bi-del" data-del-yt="${esc(l.id)}" title="목록에서 빼기" aria-label="목록에서 빼기">✕</button>
      </div>`;
    }).join('') : '<p class="mini-help">아직 넣은 영상이 없어요. 아래에 유튜브 주소를 붙여 넣으세요.</p>';
    $('#bgmCatTitle').textContent = `${cat.icon} ${cat.name}`;
    $('#bgmVideoSlot').hidden = !(now && now.kind === 'youtube');

    $('#bgmVolume').value = c.volume;
    $('#bgmVolVal').textContent = `${c.volume}`;
    $('#bgmNowTitle').textContent = now ? now.title : '꺼져 있어요';
    $('#bgmNow').classList.toggle('on', !!now);
    $('#bgmStop').disabled = !now;

    // 메인 화면 작은 표시
    $('#bgmMini').hidden = !now;
    if (now) $('#bgmMiniTitle').textContent = now.title;
    placeVideo();
  }

  async function addLink() {
    const url = $('#bgmUrl').value.trim();
    if (!url) { $('#bgmUrl').focus(); return; }
    const p = parseYouTube(url);
    if (!p) { toast('유튜브 영상 주소를 넣어 주세요 (youtube.com 또는 youtu.be)'); return; }
    const c = cfg();
    const list = c.links[c.cat] || (c.links[c.cat] = []);
    if (list.length >= MAX_LINKS) { toast(`한 종류에 ${MAX_LINKS}개까지 넣을 수 있어요`); return; }
    let title = $('#bgmUrlName').value.trim();
    if (!title && window.desktop && window.desktop.youtubeTitle) {
      title = await window.desktop.youtubeTitle(url).catch(() => '') || '';
    }
    const link = { id: Store.uid(), url, title: (title || `유튜브 영상 ${list.length + 1}`).slice(0, 80) };
    list.push(link);
    Store.save();
    $('#bgmUrl').value = '';
    $('#bgmUrlName').value = '';
    render();
    toast('영상을 넣었어요 🎵');
  }

  function init() {
    const c = cfg();
    CATS.forEach((x) => { if (!Array.isArray(c.links[x.id])) c.links[x.id] = []; });
    Music.setVolume(c.volume);

    $('#bgmCats').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      c.cat = b.dataset.cat;
      Store.save();
      render();
    });
    $('#bgmBuiltin').addEventListener('click', (e) => {
      const b = e.target.closest('[data-builtin]');
      if (!b) return;
      if (now && now.kind === 'builtin' && now.id === b.dataset.builtin) stopAll(); else playBuiltin(b.dataset.builtin);
    });
    $('#bgmLinks').addEventListener('click', async (e) => {
      const del = e.target.closest('[data-del-yt]');
      if (del) {
        const list = c.links[c.cat];
        const l = list.find((x) => x.id === del.dataset.delYt);
        if (!l || !(await UI.ask(`'${l.title}'을(를) 목록에서 뺄까요?`, '빼기'))) return;
        if (now && now.id === l.id) stopAll();
        c.links[c.cat] = list.filter((x) => x !== l);
        Store.save();
        render();
        return;
      }
      const b = e.target.closest('[data-yt]');
      if (!b) return;
      const l = (c.links[c.cat] || []).find((x) => x.id === b.dataset.yt);
      if (!l) return;
      if (now && now.id === l.id) stopAll(); else playYouTube(l, c.cat);
    });
    $('#bgmAdd').addEventListener('click', addLink);
    [$('#bgmUrl'), $('#bgmUrlName')].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') addLink(); }));
    $('#bgmVolume').addEventListener('input', (e) => {
      c.volume = Number(e.target.value);
      $('#bgmVolVal').textContent = `${c.volume}`;
      Music.setVolume(c.volume);
      ytCommand('setVolume', [c.volume]);
      Store.save();
    });
    $('#bgmStop').addEventListener('click', stopAll);
    $('#bgmMiniStop').addEventListener('click', (e) => { e.stopPropagation(); stopAll(); });
    $('#bgmMini').addEventListener('click', () => UI.openPanel('bgmPanel'));
    window.addEventListener('resize', placeVideo);

    UI.onPanel('bgmPanel', {
      open: () => { render(); followLoop(); },
      close: () => { cancelAnimationFrame(follow); placeVideo(); },
    });
    render();
  }

  window.Bgm = { init, stop: stopAll, parseYouTube, get playing() { return !!now; } };
})();
