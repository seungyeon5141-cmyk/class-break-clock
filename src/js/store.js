// 앱 데이터 저장소 (브라우저 저장소 = 컴퓨터의 앱 데이터 폴더에 보관)
(function () {
  const KEY = 'class-break-clock:v1';

  const DEFAULTS = {
    schedule: {
      periods: [
        { id: 'p1', name: '1교시', start: '09:00', end: '09:40' },
        { id: 'p2', name: '2교시', start: '09:50', end: '10:30' },
        { id: 'p3', name: '3교시', start: '10:40', end: '11:20' },
        { id: 'p4', name: '4교시', start: '11:30', end: '12:10' },
        { id: 'lunch', name: '점심 시간', start: '12:10', end: '13:00', type: 'lunch' },
        { id: 'p5', name: '5교시', start: '13:00', end: '13:40' },
        { id: 'p6', name: '6교시', start: '13:50', end: '14:30' },
      ],
      skipWeekend: true,
      autoRetime: true,
    },
    sound: {
      classStart: true,
      breakStart: true,
      warning: true,
      voice: true,
      bringToFront: true,
      chimeStyle: 'xylophone',
      volume: 80,
    },
    general: {
      message: '쉬는 시간 1분 전에는 자리에 앉아 교과서를 준비합니다.',
      hour12: false,
    },
    students: [],
    ddays: [],
    notices: [],
    picker: {
      mode: 'student', count: 1, noRepeat: true, effect: true, gender: 'all', pickedIds: [], excludedIds: [], secretIds: [], history: [],
      groupCount: 5, groupPicked: [], customItems: [], customPicked: [],
    },
    timer: { title: '쉬는 시간', seconds: 300, tick: true, endSound: true },
    race: { source: 'students', customItems: [], winRank: 'first', winN: 2, title: '', speed: 1, sound: true },
    roulette: { items: ['칭찬 스티커', '발표하기', '청소 당번', '선생님 도우미', '자유 시간', '한 번 더!'], removeWinner: false },
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  // 저장된 값에 새 기본값을 채워 넣는다 (업데이트 후에도 기존 데이터 유지)
  function merge(base, saved) {
    if (Array.isArray(base)) return Array.isArray(saved) ? saved : base;
    if (base && typeof base === 'object') {
      const out = { ...base };
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        Object.keys(saved).forEach((k) => { out[k] = k in base ? merge(base[k], saved[k]) : saved[k]; });
      }
      return out;
    }
    return saved === undefined || saved === null ? base : saved;
  }

  // 예전 기본 문구를 그대로 쓰던 경우에만 새 기본 문구로 바꿈 (직접 고친 문구는 유지)
  const OLD_DEFAULT_MESSAGES = ['쉬는 시간 1분 전에는 자리에 앉아주세요'];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const data = raw ? merge(clone(DEFAULTS), JSON.parse(raw)) : clone(DEFAULTS);
      if (OLD_DEFAULT_MESSAGES.includes(data.general.message)) data.general.message = DEFAULTS.general.message;
      return data;
    } catch {
      return clone(DEFAULTS);
    }
  }

  const listeners = new Set();
  let saveTimer = null;

  const Store = {
    data: load(),
    defaults: DEFAULTS,
    save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(Store.flush, 150);
      listeners.forEach((fn) => { try { fn(Store.data); } catch (e) { console.error(e); } });
    },
    flush() {
      clearTimeout(saveTimer);
      try { localStorage.setItem(KEY, JSON.stringify(Store.data)); } catch (e) { console.error('save failed', e); }
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    replaceAll(next) {
      Store.data = merge(clone(DEFAULTS), next);
      Store.flush();
      listeners.forEach((fn) => fn(Store.data));
    },
    uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
  };

  window.addEventListener('beforeunload', () => Store.flush());
  window.Store = Store;
})();
