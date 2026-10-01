/* Night Sky: the live design plus a real night sky (js/nm-sky.js). */
(function () {
  'use strict';
  var C = window.NMThemeConfig = window.NMThemeConfig || {};
  C.blackHole = false;   // the footer mark becomes the NM constellation, drawn by nm-sky
  C.heroClear = true;    // the hero paints the sky outside the NM mark
  // the sky canvas, plus its overlay while a shooting star or the hover reticle is on it
  C.heroBackdrop = function () {
    var k = window.NMSky;
    if (!k || !k.canvas) return [];
    return k.fx && k.fxBusy && k.fxBusy() ? [k.canvas, k.fx] : [k.canvas];
  };
  var s = document.createElement('script');
  s.src = '/js/nm-sky.js?v=dev' + Date.now().toString(36);
  s.async = false;
  document.head.appendChild(s);
})();
