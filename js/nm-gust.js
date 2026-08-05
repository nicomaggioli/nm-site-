/* ── cursor gust for the footer mark ──────────────────────────────────────
   Feeds the point cloud's trail from real DOM pointer events.

   The cloud lives in a render texture on a full-viewport plane, and the only
   thing feeding its trail was that plane's R3F onPointerMove. That path needs
   the raycaster running, the mesh visible, and the geometry to carry UVs --
   and it is nested under #global-canvas, which is pointer-events:none. Any one
   of those failing means the cursor never reaches the cloud and the orange
   never appears.

   This listens on the footer section instead and converts to the same space
   the shader expects: x,y in -1..1 with y pointing UP, which is three.js UV
   convention, not the DOM's. */
(function () {
  if (window.matchMedia && matchMedia('(hover: none)').matches) return;
  var host = null;

  function section() {
    if (host && host.isConnected) return host;
    var mains = document.querySelectorAll('main');
    for (var i = 0; i < mains.length; i++) {
      var m = mains[i], hidden = false;
      for (var p = m; p; p = p.parentElement)
        if (p.nodeType === 1 && getComputedStyle(p).display === 'none') { hidden = true; break; }
      if (hidden) continue;
      host = m.querySelector('#contact') || m.querySelector(':scope > section.h-lvh');
      if (host) return host;
    }
    return null;
  }

  document.addEventListener('pointermove', function (e) {
    var g = window.__nmGust;
    if (!g) return;
    var h = section();
    if (!h) return;
    var b = h.getBoundingClientRect();
    /* only while the footer is actually on screen */
    if (b.bottom < 0 || b.top > window.innerHeight) return;
    var x = (e.clientX / window.innerWidth) * 2 - 1;
    var y = ((window.innerHeight - e.clientY) / window.innerHeight) * 2 - 1;
    g(x, y, performance.now() / 1000);
  }, { passive: true });
})();
