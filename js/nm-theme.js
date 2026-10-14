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

   It also asks for the star data js/nm-sky.js draws (the catalogue and the page's featured stars),
   so it is on its way while the scripts load: window.__nmSkyData, a promise of [catalogue, page],
   from versioned URLs (window.__nmSkyURLs) the HTTP cache keeps. About asks at once; Index
   right after its first paint (its image wall lays out and its first image loads first: asked
   during the parse, the data could push that image back on a slow phone); the homepage after
   React commits and at low priority, behind its hero.

   Content versions: VERSIONS (scripts) and DATA (star data) hold the first 10 hex of each file's
   SHA-256 (the site's ?v= convention). tests/theme.test.cjs fails if one goes stale, and prints
   the new values. */
(function () {
  'use strict';
  var VERSIONS = {
    '/js/theme-stars.js': '19d1735148',
    '/js/nm-starcut.js': 'e72f4740b3',
    '/js/nm-warp.js': '57600ba551',
    '/js/nm-space.js': '797d29fb2b',
    '/js/nm-sky.js': '3d672b7e97'
  };
  var DATA = {
    '/media/sky/stars.json': 'ede78d3203',
    '/media/sky/home.json': 'cb8d36c870',
    '/media/sky/about.json': '61241fd00a',
    '/media/sky/index.json': 'dcac4da95c'
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

  // the star data
  var path = location.pathname;
  var page = home ? 'home' : /^\/about(\/|$)/.test(path) ? 'about' : /^\/index(\/|$)/.test(path) ? 'index' : null;
  var url = function (f) { return f + '?v=' + DATA[f]; };
  var U = window.__nmSkyURLs = { page: page, stars: url('/media/sky/stars.json'), pages: {} };
  ['home', 'about', 'index'].forEach(function (p) { U.pages[p] = url('/media/sky/' + p + '.json'); });
  if (!page || !window.fetch || !window.Promise) return;
  function load() {
    if (window.__nmSkyData) return;   // (js/nm-sky.js asked first)
    var init = page === 'home' ? { priority: 'low' } : {};
    var get = function (u) { return fetch(u, init).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }); };
    var data = window.__nmSkyData = Promise.all([get(U.stars), get(U.pages[page]).catch(function () { return {}; })]);
    data.catch(function () {});   // (js/nm-sky.js reports a failure)
  }
  if (page === 'home' && window.__nmReady) window.__nmReady(load);
  else if (page === 'index') requestAnimationFrame(function () { setTimeout(load, 0); });
  else load();
})();
