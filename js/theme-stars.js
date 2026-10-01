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
    // Nav bar: a Work link, so the centred wordmark has two links on each side.
  function addWork() {
    var ul = document.querySelector('header[data-nm-header] > nav > ul, .nm-hdr .nm-nav');
    if (!ul || ul.querySelector('a[href="/#work"]')) return;
    var li = document.createElement('li'), a = document.createElement('a'), sp = document.createElement('span');
    li.className = 'nm-st-work';
    a.href = '/#work';
    a.className = 'text-nav';
    sp.textContent = 'work';
    a.appendChild(sp); li.appendChild(a);
    var index = ul.querySelector('a[href="/index/"]');
    ul.insertBefore(li, index ? index.parentNode : ul.firstChild);
    a.addEventListener('click', function (e) {
      var target = document.getElementById('work');
      if (!target) return;                       // other pages: go to the homepage's work section
      e.preventDefault();
      if (window.__nmLenis) window.__nmLenis.scrollTo(target);
      else target.scrollIntoView({ behavior: 'smooth' });
    });
  }
  if (window.__nmReady) window.__nmReady(addWork);
  else document.addEventListener('DOMContentLoaded', addWork);

  var s = document.createElement('script');
    s.src = src + bust;
    s.async = false;
    document.head.appendChild(s);
  });
})();
