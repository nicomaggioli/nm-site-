/* The footer door is tiny. Game code, styles and artwork load only on discovery. */
(window.__nmReady || function (fn) { fn(); })(function () {
  'use strict';
  var door, loading = false, game = null;
  function stylesheet() {
    var existing = document.querySelector('link[data-nm-game-style]');
    if (existing) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = '/css/nm-run.css?v=f900e796b2'; link.dataset.nmGameStyle = '';
      link.onload = resolve; link.onerror = function () { link.remove(); reject(new Error('Game styles failed to load')); };
      document.head.appendChild(link);
    });
  }
  async function open() {
    if (loading || document.querySelector('.nm-run')) return;
    loading = true;
    if (door) door.setAttribute('aria-busy', 'true');
    try {
      var result = await Promise.all([import('/js/nm-run-game.mjs?v=ab93e423cb'), stylesheet()]);
      game = result[0]; game.openGame();
    } catch (error) {
      if (door) { door.title = 'Could not load the game. Click to try again.'; door.setAttribute('aria-label', door.title); }
      console.error('Cloud Run could not load:', error);
    } finally { loading = false; if (door) door.removeAttribute('aria-busy'); }
  }
  var footer = document.querySelector('main > section.h-lvh');
  if (footer) {
    door = footer.querySelector('.nm-run-door');
    footer.addEventListener('click', function (event) {
      var target = event.target.closest('.nm-run-door');
      if (target) { door = target; open(); }
    });
  }
  window.__nmRun = { open: open, close: function () { if (game) game.closeGame(); } };
  function hash() { if (location.hash === '#run') open(); }
  window.addEventListener('hashchange', hash); hash();
});
