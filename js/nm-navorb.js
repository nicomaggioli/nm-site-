/* ── magnetic nav orbs ────────────────────────────────────────────────────
   Shared by the homepage and /index/. Each nav item is pulled toward the
   cursor, lifted and tilted in 3D. (An earlier version drew a lit oval behind
   each item and re-aimed its highlight at the cursor; that was pulled and the
   nav is plain text again.)

   This owns the nav on BOTH pages. The homepage's own magnet script still
   drives the footer taglines and the big statement words, but it deliberately
   no longer collects nav items — otherwise two loops would write transform on
   the same elements every frame and fight each other.

   Geometry is cached in DOCUMENT space and only re-measured when the item set
   changes or on resize. Reading getBoundingClientRect per item per pointermove
   would force a synchronous layout on every mouse event, and caching in
   viewport space would mean re-measuring on every scroll instead. */
(function () {
  if (!window.matchMedia || !matchMedia('(hover: hover)').matches) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var R = 130;        // influence radius, px
  var PULL = 0.34;    // how far it slides toward the cursor
  var TILT = 15;      // max degrees of 3D tilt
  var LIFT = 26;      // max translateZ — what makes it read as solid
  var EASE = 0.16;    // lerp per frame

  var SEL = 'header[class*="z-50"] nav ul li > *, .nm-hdr .nm-nav li > a';
  var items = [], mx = -9999, my = -9999, dirty = true;

  function rendered(el) {
    for (var p = el; p; p = p.parentElement)
      if (p.nodeType === 1 && getComputedStyle(p).display === 'none') return false;
    return true;
  }
  function collect() {
    var out = [], seen = [];
    document.querySelectorAll(SEL).forEach(function (el) {
      if (seen.indexOf(el) !== -1 || !rendered(el)) return;
      seen.push(el);
      out.push({ el: el, x:0, y:0, z:0, rx:0, ry:0, dx:0, dy:0 });
    });
    if (items.length === out.length) {
      var same = true;
      for (var i = 0; i < out.length; i++) if (items[i].el !== out[i].el) { same = false; break; }
      if (same) return;
    }
    items = out; dirty = true;
  }
  function measure() {
    var sx = window.scrollX || 0, sy = window.scrollY || 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      /* measure untransformed, else the cached centre drifts with the very
         offset being applied to it */
      var prev = it.el.style.transform;
      it.el.style.transform = 'none';
      var r = it.el.getBoundingClientRect();
      it.el.style.transform = prev;
      it.dx = r.left + r.width / 2 + sx;
      it.dy = r.top + r.height / 2 + sy;
    }
    dirty = false;
  }
  function frame() {
    requestAnimationFrame(frame);
    if (dirty) measure();
    var sx = window.scrollX || 0, sy = window.scrollY || 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], tx = 0, ty = 0, tz = 0, trx = 0, try_ = 0;
      var dx = mx - (it.dx - sx), dy = my - (it.dy - sy);
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < R) {
        var s = 1 - d / R; s = s * s * (3 - 2 * s);          // smoothstep falloff
        tx = dx * PULL * s; ty = dy * PULL * s; tz = LIFT * s;
        try_ =  (dx / R) * TILT * s;
        trx  = -(dy / R) * TILT * s;
      }
      it.x += (tx - it.x) * EASE;   it.y  += (ty  - it.y)  * EASE;
      it.z += (tz - it.z) * EASE;   it.rx += (trx - it.rx) * EASE;
      it.ry += (try_ - it.ry) * EASE;

      var still = Math.abs(it.x) < .01 && Math.abs(it.y) < .01 && Math.abs(it.z) < .01 &&
                  Math.abs(it.rx) < .01 && Math.abs(it.ry) < .01;
      if (still) {
        if (it.el.style.transform) it.el.style.transform = '';
        continue;
      }
      it.el.style.transform =
        'perspective(520px) translate3d(' + it.x.toFixed(2) + 'px,' + it.y.toFixed(2) + 'px,' +
        it.z.toFixed(2) + 'px) rotateX(' + it.rx.toFixed(2) + 'deg) rotateY(' + it.ry.toFixed(2) + 'deg)';
    }
  }

  window.addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
  window.addEventListener('pointerleave', function () { mx = my = -9999; }, { passive: true });
  window.addEventListener('resize', function () { dirty = true; collect(); }, { passive: true });

  collect();
  document.addEventListener('DOMContentLoaded', collect);
  window.addEventListener('load', collect);
  /* the homepage header is React-rendered and gets replaced wholesale */
  new MutationObserver((function () {
    var p = 0;
    return function () { if (p) return; p = setTimeout(function () { p = 0; collect(); }, 40); };
  })()).observe(document.documentElement, { childList: true, subtree: true });

  if (!reduce) frame();
})();
