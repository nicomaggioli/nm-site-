/* Night Sky: the live design plus a real night sky (js/nm-sky.js). */
(function () {
  'use strict';
  var C = window.NMThemeConfig = window.NMThemeConfig || {};
  C.blackHole = false;   // the footer mark becomes the NM constellation, drawn by nm-sky
  C.heroClear = true;    // the hero paints the sky outside the NM mark
  C.heroBackdrop = function () { return window.NMSky && window.NMSky.canvas ? [window.NMSky.canvas] : []; };
  var s = document.createElement('script');
  s.src = '/js/nm-sky.js?v=dev' + Date.now().toString(36);
  s.async = false;
  document.head.appendChild(s);
})();
