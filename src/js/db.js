// 큰 데이터 보관함 (IndexedDB): 직접 추가한 글꼴 파일, 판서 기록처럼 브라우저 저장소에 넣기엔 큰 것
(function () {
  const NAME = 'class-break-clock';
  const STORES = ['fonts', 'boards'];
  let opening = null;

  function open() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB 없음')); return; }
      const req = indexedDB.open(NAME, 1);
      req.onupgradeneeded = () => {
        STORES.forEach((s) => { if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s); });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    opening.catch(() => { opening = null; });
    return opening;
  }

  async function run(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  const Db = {
    get: (store, key) => run(store, 'readonly', (s) => s.get(key)),
    put: (store, key, value) => run(store, 'readwrite', (s) => s.put(value, key)),
    del: (store, key) => run(store, 'readwrite', (s) => s.delete(key)),
    // [{ key, value }] 목록
    async all(store) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const out = [];
        const req = db.transaction(store, 'readonly').objectStore(store).openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) { resolve(out); return; }
          out.push({ key: cur.key, value: cur.value });
          cur.continue();
        };
        req.onerror = () => reject(req.error);
      });
    },
  };

  window.Db = Db;
})();
