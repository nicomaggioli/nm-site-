/* Night Sky: the live design inside a particle space (js/nm-space.js) with the real night sky
   beyond it (js/nm-sky.js). */
(function () {
  'use strict';
  var C = window.NMThemeConfig = window.NMThemeConfig || {};
  C.blackHole = false;   // the footer mark is the NM the particles gather into
  C.heroClear = true;    // the hero paints the space and the sky outside the NM mark
  // in paint order: the space (opaque), the stars (transparent), and their overlay while a
  // shooting star or the hover reticle is on it
  C.heroBackdrop = function () {
    var out = [], sp = window.NMSpace, k = window.NMSky;
    if (sp && sp.canvas) out.push(sp.canvas);
    if (k && k.canvas) out.push(k.canvas);
    if (k && k.fx && k.fxBusy && k.fxBusy()) out.push(k.fx);
    return out;
  };
  var bust = '?v=dev' + Date.now().toString(36);
  // the space first: it owns the camera the sky reads
  ['/js/nm-space.js', '/js/nm-sky.js'].forEach(function (src) {
    var s = document.createElement('script');
    s.src = src + bust;
    s.async = false;
    document.head.appendChild(s);
  });
})();
