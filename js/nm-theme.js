/* Night Sky: the site's design (brief and pieces: docs/night-sky.md).

   Runs synchronously from <head>, before first paint: marks <html data-nm-theme="stars"> (all of
   css/theme-stars.css keys off it; the page links that stylesheet right after this script) and
   loads the Night Sky scripts in order, non-blocking. js/theme-stars.js fills
   window.NMThemeConfig first; the shared modules read it on mount. Everything added here is
   outside React's text.

   Homepage: the particle space and the sky mount only after React commits (window.__nmReady,
   js/nm-sync.js, which the page runs just before this script), so they are requested then. The
   bandwidth before it stays with the React chunks, and their mount runs in its own task instead
   of the commit's frame. The shooting star that cuts the hero logo exists only there.

   Content versions: VERSIONS holds the first 10 hex of each file's SHA-256 (the site's ?v=
   convention). tests/theme.test.cjs fails if one goes stale, and prints the new values. */
(function () {
  'use strict';
  var VERSIONS = {
    '/js/theme-stars.js': 'ccdf605c09',
    '/js/nm-starcut.js': 'e72f4740b3',
    '/js/nm-warp.js': '277aa38bdf',
    '/js/nm-space.js': 'd8a73b4748',
    '/js/nm-sky.js': '62593905f1'
  };
  window.__nmTheme = 'stars';
  document.documentElement.setAttribute('data-nm-theme', 'stars');
  window.NMThemeConfig = window.NMThemeConfig || {};
  var home = /^\/(index\.html)?$/.test(location.pathname);
  var HOME_ONLY = { '/js/nm-starcut.js': 1 };
  var AFTER_COMMIT = { '/js/nm-space.js': 1, '/js/nm-sky.js': 1 };
  var later = home && window.__nmReady ? [] : null;
  function add(src) {
    var js = document.createElement('script');
    js.src = src + '?v=' + VERSIONS[src];
    js.async = false;
    document.head.appendChild(js);
  }
  // theme config first (the hero reads NMThemeConfig); the shooting star that cuts the hero logo,
  // the fast-scroll warp; then the particle space (it owns the camera the sky reads) and the sky
  Object.keys(VERSIONS).forEach(function (src) {
    if (HOME_ONLY[src] && !home) return;
    if (later && AFTER_COMMIT[src]) later.push(src);
    else add(src);
  });
  if (later) window.__nmReady(function () { later.forEach(add); });
})();
