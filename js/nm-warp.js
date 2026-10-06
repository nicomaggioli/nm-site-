/* Night Sky: scroll fast and the page sags in the middle like a tightrope under a weight, then
   springs back as the scroll slows. Edges stay put; the centre dips in the direction of travel
   (down while scrolling down, up while scrolling up). Ordinary scrolling never triggers it.

   Home and About: each section in normal flow is bent by an SVG displacement filter whose map is
   a horizontal curve (edges 0, centre 1), so text and images genuinely bow. The filter is only
   attached while the page is moving. Index: the image wall is a single 18,000px column, too big
   to filter, so each tile drops by the curve at its centre. Tiles stay upright (tilting them
   opened black wedges and overlaps between neighbours), so each column of the wall dips as one
   solid strip and the images stay whole. Never touches sticky/fixed layers. Off under prefers-reduced-motion. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  if (/[?&]warp=off\b/.test(location.search)) return;   // preview: compare against no warp
  var page = document.querySelector('footer .foot-mark') ? 'index' : document.body.classList.contains('nm-about-page') ? 'about' : 'home';
  var SECTIONS = {
    home: ['#about', '#nm-brands', '#nm-services', '#nm-sites'],
    about: ['main#main > section:not(#contact)']
  };
  // px/s: no dip below START, full dip at FULL. Tuned on trackpad-like flicks through Lenis (a fast
  // flick ~53 px, ordinary wheel scrolling under 2 px, a slow two-finger scroll 0); the first
  // tuning (1000/4500) needed flicks harder than Lenis's smoothing lets through, so it barely showed.
  var START = 700, FULL = 1700;
  var DIP = 90;                       // px the centre sags at full speed (desktop width)
  var NS = 'http://www.w3.org/2000/svg';
  // Safari (and every iOS browser, all WebKit) places a userSpaceOnUse filter region in page
  // coordinates, so a section far down the page rendered blank. WebKit gets the same filter in
  // bounding-box units instead (region, map and scale as fractions of the section; WebKit scales
  // the displacement by the section's height, measured: a 60 px target dips 59 px). WebKit draws
  // it on the CPU, so a fast fling there is heavier than in Chrome; Chrome keeps user units.
  var ua = navigator.userAgent;
  var WEBKIT = (/AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/.test(ua)) || /CriOS|FxiOS|EdgiOS/.test(ua);
  var items = [], rects = [], far = [], svg = null, mapURL = '', last = 0, lastY = 0, vel = 0, warp = 0, raf = 0, moving = false;
  var firstDt = 1 / 60, age = 0;

  // the curve: 0 at both edges, 1 in the middle (a soft rope sag)
  function sag(u) { var t = 2 * u - 1; return 1 - t * t; }

  function buildMap() {
    // displacement map: R neutral (no sideways shift), G encodes how far up to sample from
    var c = document.createElement('canvas'); c.width = 256; c.height = 2;
    var x = c.getContext('2d'), img = x.createImageData(256, 2);
    for (var i = 0; i < 256; i++) {
      var g = Math.round(255 * (0.5 - 0.5 * sag(i / 255)));
      for (var r = 0; r < 2; r++) { var o = (r * 256 + i) * 4; img.data[o] = 128; img.data[o + 1] = g; img.data[o + 2] = 128; img.data[o + 3] = 255; }
    }
    x.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }

  function collect() {
    flat();
    items = [];
    if (page === 'index') {
      document.querySelectorAll('main#main > figure.tile').forEach(function (el) { items.push({ el: el, tile: true }); });
      return;
    }
    if (!svg) {
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
      svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      document.body.appendChild(svg);
      mapURL = buildMap();
    }
    svg.textContent = '';
    var n = 0;
    SECTIONS[page].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        var pos = getComputedStyle(el).position;
        if (pos === 'sticky' || pos === 'fixed') return;
        var w = el.offsetWidth, h = el.offsetHeight, pad = DIP * 1.2, id = 'nm-dip-' + (n++);
        var f = document.createElementNS(NS, 'filter');
        f.setAttribute('id', id);
        if (WEBKIT) { f.setAttribute('primitiveUnits', 'objectBoundingBox'); w = 1; }
        else f.setAttribute('filterUnits', 'userSpaceOnUse');
        var y0 = WEBKIT ? -pad / h : -pad, fh = WEBKIT ? 1 + 2 * pad / h : h + 2 * pad;
        f.setAttribute('x', '0'); f.setAttribute('y', String(y0)); f.setAttribute('width', String(w)); f.setAttribute('height', String(fh));
        f.setAttribute('color-interpolation-filters', 'sRGB');
        var im = document.createElementNS(NS, 'feImage');
        im.setAttribute('href', mapURL); im.setAttribute('preserveAspectRatio', 'none');
        im.setAttribute('x', '0'); im.setAttribute('y', String(y0)); im.setAttribute('width', String(w)); im.setAttribute('height', String(fh));
        im.setAttribute('result', 'map');
        var d = document.createElementNS(NS, 'feDisplacementMap');
        d.setAttribute('in', 'SourceGraphic'); d.setAttribute('in2', 'map'); d.setAttribute('scale', '0');
        d.setAttribute('xChannelSelector', 'R'); d.setAttribute('yChannelSelector', 'G');
        f.appendChild(im); f.appendChild(d); svg.appendChild(f);
        items.push({ el: el, id: id, disp: d, f: f, im: im, h: h, pad: pad });
      });
    });
  }
  // it.on: this item carries the dip (items already flat are skipped); it.wc: this tile has will-change
  function clear(it) {
    if (!it.on) return;
    it.on = false;
    if (it.tile) it.el.style.transform = '';
    else it.el.style.filter = '';
  }
  function release(it) { it.wc = false; it.el.style.willChange = ''; }
  // the episode is over (or the items are rebuilt): everything flat, will-change dropped in one pass
  function flat() {
    for (var i = 0; i < items.length; i++) { clear(items[i]); if (items[i].wc) release(items[i]); }
  }
  function apply(w) {
    if (w === 0) { flat(); return; }
    var vw = window.innerWidth, vh = window.innerHeight, amount = DIP * Math.min(1, vw / 1440) * w, n = items.length, i;
    // Read every box before writing anything. A read after a write forces a style and layout pass,
    // which on Index meant one per tile per frame. The boxes are the same either way: a tile's
    // transform never moves another tile, and filters never move layout.
    rects.length = n; far.length = 0;
    for (i = 0; i < n; i++) rects[i] = items[i].el.getBoundingClientRect();
    for (i = 0; i < n; i++) {
      var it = items[i], r = rects[i];
      if (r.bottom < -vh * .5 || r.top > vh * 1.5) {   // only what is near the screen
        clear(it);
        if (it.wc && (r.bottom < -vh * 1.5 || r.top > vh * 2.5)) far.push(it);
        continue;
      }
      if (it.tile) {
        var u = Math.max(0, Math.min(1, (r.left + r.width / 2) / vw));
        var dy = amount * sag(u);
        if (!it.wc) { it.wc = true; it.el.style.willChange = 'transform'; }
        it.el.style.transform = 'translateY(' + dy.toFixed(1) + 'px)';
        it.on = true;
      } else {
        // filter only the strip that is on screen (plus the sag margin): far fewer pixels per frame
        var y0 = Math.max(-it.pad, Math.floor(-r.top - it.pad)), y1 = Math.min(it.h + it.pad, Math.ceil(vh - r.top + it.pad));
        if (y1 <= y0) { clear(it); continue; }
        var k = WEBKIT ? 1 / it.h : 1;   // bounding-box units in WebKit
        it.f.setAttribute('y', String(y0 * k)); it.f.setAttribute('height', String((y1 - y0) * k));
        it.im.setAttribute('y', String(y0 * k)); it.im.setAttribute('height', String((y1 - y0) * k));
        // the map samples from above by 0.5 * scale at the centre, so the centre moves down by that
        it.disp.setAttribute('scale', WEBKIT ? String(2 * amount * k) : (2 * amount).toFixed(1));
        if (it.el.style.filter !== 'url("#' + it.id + '")' && it.el.style.filter !== 'url(#' + it.id + ')') it.el.style.filter = 'url(#' + it.id + ')';
        it.on = true;
      }
    }
    // Adding or dropping will-change rebuilds the page's layers. A tile keeps it while it is within a
    // screen of the warped band; tiles further out give it up 16 at a time, not one per frame.
    if (far.length >= 16) for (i = 0; i < far.length; i++) release(far[i]);
  }
  // The easing rates below were tuned per 60 Hz frame. Each is applied as 1 - (1 - rate)^(dt * 60):
  // exactly the tuned rate for a 60 Hz frame, and the same pull per second at 120 Hz.
  function ease(rate, dt) { return 1 - Math.pow(1 - rate, dt * 60); }
  function frame(t) {
    raf = 0;
    var dt = last ? Math.min(.05, (t - last) / 1000) : firstDt;
    last = t; age += dt;
    var y = window.scrollY;
    if (dt > 0) vel += ((y - lastY) / dt - vel) * ease(.4, dt);
    lastY = y;
    var a = Math.abs(vel);
    var target = a <= START ? 0 : Math.min(1, (a - START) / (FULL - START)) * (vel > 0 ? 1 : -1);
    // quick to sag, slower to spring back, like a rope settling
    warp += (target - warp) * ease(Math.abs(target) > Math.abs(warp) ? .45 : .1, dt);
    // stay at least one 60 Hz frame before giving up, so a fast screen judges the speed as fully as 60 Hz
    if (Math.abs(warp) < .004 && target === 0 && age > .014) { warp = 0; apply(0); moving = false; last = 0; vel = 0; return; }
    apply(warp);
    raf = requestAnimationFrame(frame);
  }
  // Velocity needs the position before this scroll moved. Native scrolling (touch, and every page
  // without Lenis) has already moved when its event fires, so a gesture starts from the previous
  // scroll event's position; a lone jump (End, a link) has no recent event and starts flat. That
  // first step counts as one 60 Hz frame, as tuned, unless the two events were clearly closer
  // (a faster screen), when it counts as the frame time between them.
  var evY = window.scrollY, evT = -1e9, evF = 0;
  function onScroll() {
    var now = performance.now(), y = window.scrollY, tl = document.timeline, f = tl && tl.currentTime;
    if (typeof f !== 'number') f = now;   // the frame's time
    var recent = now - evT < 120;
    kick(recent ? evY : y, recent ? f - evF : 0);
    evY = y; evT = now; evF = f;
  }
  function kick(fromY, gap) {
    if (reduce && reduce.matches) return;
    if (!items.length) collect();
    if (!moving) { moving = true; lastY = fromY; last = 0; age = 0; firstDt = gap > 0 && gap < 12.5 ? Math.max(1 / 240, gap / 1000) : 1 / 60; }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function start() {
    collect();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', function () { apply(0); warp = 0; collect(); }, { passive: true });
  }
  if (window.__nmReady) window.__nmReady(start);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
