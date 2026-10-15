// 앱 시작
(function () {
  const { $, initPanels } = UI;

  function initTitlebar() {
    const d = window.desktop;
    if (!d) {
      document.querySelector('.titlebar-actions').hidden = true;
      return;
    }
    $('#tbMin').addEventListener('click', () => d.minimize());
    $('#tbMax').addEventListener('click', () => d.toggleMaximize());
    $('#tbFull').addEventListener('click', () => d.toggleFullScreen());
    $('#tbClose').addEventListener('click', () => d.close());
    $('#tbPin').addEventListener('click', async () => {
      const on = !(await d.getWindowState()).alwaysOnTop;
      await d.setAlwaysOnTop(on);
      UI.toast(on ? '📌 항상 다른 창 위에 고정했어요' : '고정을 풀었어요');
    });
    const apply = (s) => {
      $('#tbPin').classList.toggle('active', s.alwaysOnTop);
      const top = $('#alwaysOnTop');
      if (top) top.checked = s.alwaysOnTop;
    };
    d.getWindowState().then(apply);
    d.onWindowState(apply);
    d.onResume(() => Clock.refresh());
    document.querySelector('.titlebar').addEventListener('dblclick', (e) => {
      if (!e.target.closest('.titlebar-actions')) d.toggleMaximize();
    });
  }

  function start() {
    initPanels();
    initTitlebar();
    Settings.init();
    DDay.init();
    Notice.init();
    Timer.init();
    Picker.init();
    Roulette.init();
    Race.init();
    Clock.start();
    // 첫 클릭 때 오디오 장치를 미리 깨워 둔다
    document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
