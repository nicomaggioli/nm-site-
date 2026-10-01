/* Design preview switcher (local branch only; removed when a direction is chosen).

   ?theme=stars | nebula | horizon | atlas | cosmati  picks a direction and remembers it in this
   browser; ?theme=current (or the pill's "Current") returns to the live design.
   The chosen direction loads /css/theme-NAME.css and /js/theme-NAME.js and sets
   <html data-nm-theme="NAME"> before first paint, so theme CSS can key off it.
   Runs synchronously from <head>; everything it adds is outside React's text. */
(function () {
  'use strict';
  var THEMES = { stars: 'Night Sky', nebula: 'Nebula', horizon: 'Horizon', atlas: 'Atlas', cosmati: 'Cosmati' };
  var PILL = ['stars'];   // directions offered in the pill (others stay reachable by URL)
  var KEY = 'nm-theme-preview';
  var theme = null;
  try {
    var q = new URLSearchParams(location.search).get('theme');
    if (q !== null) {
      if (THEMES[q]) localStorage.setItem(KEY, q); else localStorage.removeItem(KEY);
    }
    theme = localStorage.getItem(KEY);
  } catch (e) {
    theme = new URLSearchParams(location.search).get('theme');
  }
  if (!THEMES[theme]) theme = null;
  var root = document.documentElement;
  window.__nmTheme = theme;

  if (theme) {
    root.setAttribute('data-nm-theme', theme);
    // Theme scripts fill this in synchronously; the shared modules read it on mount.
    window.NMThemeConfig = window.NMThemeConfig || {};
    var bust = '?v=dev' + Date.now().toString(36);
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/css/theme-' + theme + '.css' + bust;
    document.head.appendChild(css);
    // Ordered, non-blocking: the theme's config first, then the shared cosmos
    // layers (stars, airbrush, grain) and the footer black hole that read it.
    var mods = ['/js/theme-' + theme + '.js', '/js/nm-cosmos.js', '/js/nm-blackhole.js'];
    // the shooting star that cuts the hero logo
    if (theme === 'stars') mods.push('/js/nm-starcut.js');
    mods.forEach(function (src) {
      var js = document.createElement('script');
      js.src = src + bust;
      js.async = false;
      document.head.appendChild(js);
    });
  }

  // Floating pill to flip between directions while reviewing.
  function mount() {
    if (document.getElementById('nm-theme-pill')) return;
    var pill = document.createElement('nav');
    pill.id = 'nm-theme-pill';
    pill.setAttribute('aria-label', 'Design preview');
    var style = document.createElement('style');
    style.textContent =
      '#nm-theme-pill{position:fixed;left:50%;bottom:max(14px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;' +
      'display:flex;gap:2px;padding:4px;border-radius:999px;background:rgba(12,12,14,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
      'border:1px solid rgba(255,255,255,.14);font:500 11px/1 "Geist Mono",ui-monospace,monospace;letter-spacing:.04em;box-shadow:0 6px 24px rgba(0,0,0,.35)}' +
      '#nm-theme-pill a{color:#cfccc6;text-decoration:none;padding:8px 11px;border-radius:999px;white-space:nowrap}' +
      '#nm-theme-pill a[aria-current="true"]{background:#f4f1ea;color:#111}' +
      '#nm-theme-pill span{color:#7b7872;padding:8px 6px 8px 10px}' +
      '@media (max-width:420px){#nm-theme-pill span{display:none}#nm-theme-pill a{padding:8px 9px}}';
    document.head.appendChild(style);
    var label = document.createElement('span');
    label.textContent = 'Preview';
    pill.appendChild(label);
    [['current', 'Current']].concat(PILL.map(function (k) { return [k, THEMES[k]]; })).forEach(function (t) {
      var a = document.createElement('a');
      var u = new URL(location.href);
      u.searchParams.set('theme', t[0]);
      a.href = u.pathname + u.search + u.hash;
      a.textContent = t[1];
      if ((theme || 'current') === t[0]) a.setAttribute('aria-current', 'true');
      pill.appendChild(a);
    });
    document.body.appendChild(pill);
  }
  // mount with the other extensions (after React commits on the homepage)
  if (window.__nmReady) window.__nmReady(mount);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
