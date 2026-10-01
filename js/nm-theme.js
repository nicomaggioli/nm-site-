/* Night Sky: the site's design (brief and pieces: docs/night-sky.md).

   Runs synchronously from <head>, before first paint: marks <html data-nm-theme="stars"> (all of
   css/theme-stars.css keys off it; the page links that stylesheet right after this script) and
   loads the Night Sky scripts in order, non-blocking. js/theme-stars.js fills
   window.NMThemeConfig first; the shared modules read it on mount. Everything added here is
   outside React's text.

   Content versions: VERSIONS holds the first 10 hex of each file's SHA-256 (the site's ?v=
   convention). tests/theme.test.cjs fails if one goes stale, and prints the new values. */
(function () {
  'use strict';
  var VERSIONS = {
    '/js/theme-stars.js': '4198477107',
    '/js/nm-starcut.js': 'a40aa413ec',
    '/js/nm-warp.js': '98a51e5cd9',
    '/js/nm-space.js': 'ee59cb759c',
    '/js/nm-sky.js': '6d13d90b36',
    '/js/nm-aurora.js': '4b912593aa'
  };
  window.__nmTheme = 'stars';
  document.documentElement.setAttribute('data-nm-theme', 'stars');
  window.NMThemeConfig = window.NMThemeConfig || {};
  // theme config first; the shooting star that cuts the hero logo, the fast-scroll warp; then the
  // particle space (it owns the camera the sky reads), the real sky, and the aurora between them
  Object.keys(VERSIONS).forEach(function (src) {
    var js = document.createElement('script');
    js.src = src + '?v=' + VERSIONS[src];
    js.async = false;
    document.head.appendChild(js);
  });
})();
