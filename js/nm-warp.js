/* Night Sky: scroll fast and the page sags in the middle like a tightrope under a weight, then
   springs back as the scroll slows. Edges stay put; the centre dips in the direction of travel
   (down while scrolling down, up while scrolling up). Ordinary scrolling never triggers it.

   Home and About: each section in normal flow is bent by an SVG displacement filter whose map is
   a horizontal curve (edges 0, centre 1), so text and images genuinely bow. The filter is only
   attached while the page is moving. Index: the image wall is a single 18,000px column, too big
   to filter, so each tile drops by the curve at its centre and tilts to the curve's slope, like a
   hammock. Never touches sticky/fixed layers. Off under prefers-reduced-motion. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  if (/[?&]warp=off\b/.test(location.search)) return;   // preview: compare against no warp
  var page = document.querySelector('footer .foot-mark') ? 'index' : document.body.classList.contains('nm-about-page') ? 'about' : 'home';
  var SECTIONS = {
    home: ['#about', '#nm-brands', '#nm-services', '#nm-sites'],
    about: ['main#main > section:not(#contact)']
  };
  var START = 1000, FULL = 4500;      // px/s: no dip below START, full dip at FULL
  var DIP = 90;                       // px the centre sags at full speed (desktop width)
  var NS = 'http://www.w3.org/2000/svg';
  var items = [], svg = null, mapURL = '', last = 0, lastY = 0, vel = 0, warp = 0, raf = 0, moving = false;

  // the curve: 0 at both edges, 1 in the middle (a soft rope sag)
  function sag(u) { var t = 2 * u - 1; return 1 - t * t; }
  function slope(u) { return -4 * (2 * u - 1); }   // d(sag)/du

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
    items.forEach(function (it) { clear(it); });
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
        f.setAttribute('id', id); f.setAttribute('filterUnits', 'userSpaceOnUse');
        f.setAttribute('x', '0'); f.setAttribute('y', String(-pad)); f.setAttribute('width', String(w)); f.setAttribute('height', String(h + 2 * pad));
        f.setAttribute('color-interpolation-filters', 'sRGB');
        var im = document.createElementNS(NS, 'feImage');
        im.setAttribute('href', mapURL); im.setAttribute('preserveAspectRatio', 'none');
        im.setAttribute('x', '0'); im.setAttribute('y', String(-pad)); im.setAttribute('width', String(w)); im.setAttribute('height', String(h + 2 * pad));
        im.setAttribute('result', 'map');
        var d = document.createElementNS(NS, 'feDisplacementMap');
        d.setAttribute('in', 'SourceGraphic'); d.setAttribute('in2', 'map'); d.setAttribute('scale', '0');
        d.setAttribute('xChannelSelector', 'R'); d.setAttribute('yChannelSelector', 'G');
        f.appendChild(im); f.appendChild(d); svg.appendChild(f);
        items.push({ el: el, id: id, disp: d, f: f, im: im, h: h, pad: pad });
      });
    });
  }
  function clear(it) {
    if (it.tile) { it.el.style.transform = ''; it.el.style.willChange = ''; }
    else { it.el.style.filter = ''; }
  }
  function apply(w) {
    var vw = window.innerWidth, vh = window.innerHeight, amount = DIP * Math.min(1, vw / 1440) * w;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (w === 0) { clear(it); continue; }
      var r = it.el.getBoundingClientRect();
      if (r.bottom < -vh * .5 || r.top > vh * 1.5) { clear(it); continue; }   // only what is near the screen
      if (it.tile) {
        var u = Math.max(0, Math.min(1, (r.left + r.width / 2) / vw));
        var dy = amount * sag(u), ang = Math.atan(amount * slope(u) / vw) * 180 / Math.PI;
        it.el.style.willChange = 'transform';
        it.el.style.transform = 'translateY(' + dy.toFixed(1) + 'px) rotate(' + ang.toFixed(2) + 'deg)';
      } else {
        // filter only the strip that is on screen (plus the sag margin): far fewer pixels per frame
        var y0 = Math.max(-it.pad, Math.floor(-r.top - it.pad)), y1 = Math.min(it.h + it.pad, Math.ceil(vh - r.top + it.pad));
        if (y1 <= y0) { clear(it); continue; }
        it.f.setAttribute('y', String(y0)); it.f.setAttribute('height', String(y1 - y0));
        it.im.setAttribute('y', String(y0)); it.im.setAttribute('height', String(y1 - y0));
        // the map samples from above by 0.5 * scale at the centre, so the centre moves down by that
        it.disp.setAttribute('scale', (2 * amount).toFixed(1));
        if (it.el.style.filter !== 'url("#' + it.id + '")' && it.el.style.filter !== 'url(#' + it.id + ')') it.el.style.filter = 'url(#' + it.id + ')';
      }
    }
  }
  function frame(t) {
    raf = 0;
    var dt = last ? Math.min(.05, (t - last) / 1000) : 1 / 60;
    last = t;
    var y = window.scrollY;
    if (dt > 0) vel = vel * .6 + ((y - lastY) / dt) * .4;
    lastY = y;
    var a = Math.abs(vel);
    var target = a <= START ? 0 : Math.min(1, (a - START) / (FULL - START)) * (vel > 0 ? 1 : -1);
    // quick to sag, slower to spring back, like a rope settling
    warp += (target - warp) * (Math.abs(target) > Math.abs(warp) ? .22 : .1);
    if (Math.abs(warp) < .004 && target === 0) { warp = 0; apply(0); moving = false; last = 0; vel = 0; return; }
    apply(warp);
    raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (reduce && reduce.matches) return;
    if (!items.length) collect();
    if (!moving) { moving = true; lastY = window.scrollY; last = 0; }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function start() {
    collect();
    addEventListener('scroll', kick, { passive: true });
    addEventListener('resize', function () { apply(0); warp = 0; collect(); }, { passive: true });
  }
  if (window.__nmReady) window.__nmReady(start);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
