/* Night Sky: scroll fast and the page sags in the middle like a tightrope under a weight, then
   springs back as the scroll slows. Edges stay put; the centre dips in the direction of travel
   (down while scrolling down, up while scrolling up). Ordinary scrolling never triggers it.

   Home and About: each section in normal flow is bent by an SVG displacement filter whose map is
   a horizontal curve (edges 0, centre 1), so text and images genuinely bow. The filter is only
   attached while the page is moving. Index: the image wall is a single 18,000px column, too big
   to filter, so each tile drops by the curve at its centre. Tiles stay upright (tilting them
   opened black wedges and overlaps between neighbours), so each column of the wall dips as one
   solid strip and the images stay whole. Never touches sticky/fixed layers. Off under prefers-reduced-motion.

   Preview switch (2026-10-15): ?dip=blocks moves Home's and About's sections in pieces instead of
   filtering them (the lighter dip meant for Safari, see "Blocks" below), ?dip=filter the filter as
   it is, ?dip=off no dip (as ?warp=off). The choice is kept for the tab (sessionStorage
   'nm-dip-mode'). Index is the same in every mode. With no switch nothing changes. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  if (/[?&]warp=off\b/.test(location.search)) return;   // preview: compare against no warp
  var page = document.querySelector('footer .foot-mark') ? 'index' : document.body.classList.contains('nm-about-page') ? 'about' : 'home';
  var dm = /[?&]dip=(blocks|filter|off)\b/.exec(location.search), MODE = dm ? dm[1] : null;
  try { if (MODE) sessionStorage.setItem('nm-dip-mode', MODE); else MODE = sessionStorage.getItem('nm-dip-mode'); } catch (e) {}
  if (MODE !== 'blocks' && MODE !== 'filter' && MODE !== 'off') MODE = null;
  if (MODE === 'off') return;
  var BLOCKS = MODE === 'blocks' && page !== 'index';
  var SECTIONS = {
    home: ['#about', '#nm-brands', '#nm-services', '#nm-sites'],
    about: ['main#main > section:not(#contact)']
  };
  // px/s of page speed: no dip below START, the full dip at FULL. The homepage scrolls through
  // Lenis, which turns a swipe into a longer glide and moves the page a little faster than the
  // gesture, so it has its own pair and reads its speed over a longer stretch. Tuned with Chrome's
  // synthetic swipes (Input.synthesizeScrollGesture) so a swipe dips the same on every page:
  // ~6 px at an ordinary 800 px/s, the full dip from ~2500 px/s.
  var LENIS = page === 'home';
  var START = LENIS ? 1400 : 700, FULL = LENIS ? 2100 : 1700;
  var DIP = 45;                       // px the centre sags at full speed (desktop width); Nico halved it from 90 (2026-10-14)
  var WINDOW = LENIS ? 250 : 100;     // ms of motion the speed is read over (the homepage: see LENIS)
  var NS = 'http://www.w3.org/2000/svg';
  // Safari (and every iOS browser, all WebKit) places a userSpaceOnUse filter region in page
  // coordinates, so a section far down the page rendered blank. WebKit gets the same filter in
  // bounding-box units instead (region, map and scale as fractions of the section; WebKit scales
  // the displacement by the section's height, measured: a 60 px target dips 59 px). WebKit draws
  // it on the CPU, so a fast fling there is heavier than in Chrome; Chrome keeps user units.
  var ua = navigator.userAgent;
  var WEBKIT = (/AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/.test(ua)) || /CriOS|FxiOS|EdgiOS/.test(ua);
  var items = [], rects = [], svg = null, mapURL = '', last = 0, vel = 0, warp = 0, raf = 0, moving = false, filtered = false;
  var hist = [], seen = -1;   // recent [time, scrollY] pairs; how many sections the last list found
  var firstDt = 1 / 60, age = 0, hold = null;

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
      geo = null; watch();
      return;
    }
    if (BLOCKS) { bCollect(); return; }
    if (!svg) {
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
      svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      document.body.appendChild(svg);
      mapURL = buildMap();
    }
    svg.textContent = '';
    seen = document.querySelectorAll(SECTIONS[page].join(',')).length;
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
        var hb = h || 1;   // a section with no height yet (apply() resizes the filter from its live height)
        var y0 = WEBKIT ? -pad / hb : -pad, fh = WEBKIT ? 1 + 2 * pad / hb : h + 2 * pad;
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
  // it.on: this item carries the dip (items already flat are skipped); it.wc: this tile has will-change;
  // it.dy: the tile's offset now (what its box was read with), it.ds the same as written
  function clear(it) {
    if (!it.on) return;
    it.on = false;
    if (it.tile) { it.el.style.transform = ''; it.dy = 0; it.ds = null; }
    else it.el.style.filter = '';
  }
  function release(it) { it.wc = false; it.el.style.willChange = ''; }
  // the episode is over (or the items are rebuilt): everything flat, will-change dropped in one pass
  function flat() {
    filtered = window.__nmDip = window.__nmTileDip = false;
    band = null;
    for (var i = 0; i < items.length; i++) { clear(items[i]); if (items[i].wc) release(items[i]); }
    if (BLOCKS) bFlat();
  }

  // Index. Each tile's box in document px (left, width, top, bottom: geo[4i..4i+3]) is read once, and
  // again when the wall moves or changes size, when the last tile of a column moves (any tile above it
  // changed), or after a resize or a ResizeObserver report: a tile's own transform never moves layout.
  // Read live every frame of a dip, the 178 boxes cost a throttled phone ~30 ms a second; the check is
  // the wall's box and one tile per column. A box read mid-dip has the tile's offset taken off, and the
  // near-screen test adds the offset back, so it decides exactly as the live boxes did.
  var geo = null, wall = null, tails = [], ro = null, band = null;
  function wallBox() {
    var el = document.querySelector('main#main');
    return el ? el.getBoundingClientRect() : null;
  }
  function measureTiles() {
    var sy = window.scrollY, n = items.length, g = new Array(n * 4), m = wallBox();
    for (var i = 0; i < n; i++) {
      var it = items[i], r = it.el.getBoundingClientRect(), d = it.on ? it.dy : 0;
      g[4 * i] = r.left; g[4 * i + 1] = r.width; g[4 * i + 2] = r.top + sy - d; g[4 * i + 3] = r.bottom + sy - d;
    }
    geo = g;
    wall = m && [m.left, m.top + sy, m.width, m.height];
    var last = {};   // the lowest tile of each column
    for (i = 0; i < n; i++) { var c = Math.round(g[4 * i]); if (last[c] == null || g[4 * i + 3] > g[4 * last[c] + 3]) last[c] = i; }
    tails = Object.keys(last).map(function (c) { return last[c]; });
  }
  function wallMoved() {
    var m = wallBox(), sy = window.scrollY;
    if (!m || !wall) return !!m !== !!wall;
    if (Math.abs(m.left - wall[0]) > .01 || Math.abs(m.top + sy - wall[1]) > .01 || Math.abs(m.width - wall[2]) > .01 || Math.abs(m.height - wall[3]) > .01) return true;
    for (var j = 0; j < tails.length; j++) {
      var i = tails[j], it = items[i], r = it.el.getBoundingClientRect(), d = it.on ? it.dy : 0;
      if (Math.abs(r.left - geo[4 * i]) > .05 || Math.abs(r.bottom + sy - d - geo[4 * i + 3]) > .05) return true;   // (a transformed box can be rounded to 1/64 px)
    }
    return false;
  }
  function watch() {
    if (!window.ResizeObserver) return;
    if (ro) ro.disconnect();
    ro = new ResizeObserver(function () { geo = null; });
    var m = document.querySelector('main#main');
    if (m) ro.observe(m);
    ro.observe(document.body);
    for (var i = 0; i < items.length; i++) ro.observe(items[i].el);
  }
  // Adding or dropping will-change rebuilds the page's layers and relays out the whole wall, so it is
  // given to a band of tiles at once: the stretch that can carry the dip (half a screen above the view
  // to a screen and a half below, plus the dip), a screen more in the direction of travel and a
  // quarter behind. When that stretch reaches the band's edge the band moves on in one pass (tiles
  // ahead promoted, tiles left behind released): one relayout a screen of scrolling instead of one
  // most frames, with about as many layers as before. Tiles on screen hold will-change exactly as
  // before, and the episode's end releases everything, as before.
  function promote(sy, vh, down) {
    var lo = sy - vh * (down ? .75 : 1.5) - DIP, hi = sy + vh * (down ? 2.5 : 1.75) + DIP;
    band = [lo, hi];
    for (var i = 0; i < items.length; i++) {
      var it = items[i], inb = geo[4 * i + 3] >= lo && geo[4 * i + 2] <= hi;
      if (inb && !it.wc) { it.wc = true; it.el.style.willChange = 'transform'; }
      else if (!inb && it.wc && !it.on) release(it);
    }
  }
  function applyTiles(amount, vw, vh) {
    var sy = window.scrollY, n = items.length;
    if (!geo || wallMoved()) measureTiles();
    if (!band || sy - vh * .5 - DIP < band[0] || sy + vh * 1.5 + DIP > band[1]) promote(sy, vh, vel >= 0);
    for (var i = 0; i < n; i++) {
      var it = items[i], d = it.on ? it.dy : 0;
      if (geo[4 * i + 3] - sy + d < -vh * .5 || geo[4 * i + 2] - sy + d > vh * 1.5) { clear(it); continue; }   // only what is near the screen
      var u = Math.max(0, Math.min(1, (geo[4 * i] + geo[4 * i + 1] / 2) / vw));
      var s = (amount * sag(u)).toFixed(1);
      if (!it.wc) { it.wc = true; it.el.style.willChange = 'transform'; }
      if (s !== it.ds) { it.el.style.transform = 'translateY(' + s + 'px)'; it.ds = s; it.dy = +s; }
      it.on = true;
    }
    // tiles are moving: js/nm-sky.js draws the sky behind the wall as it did before it skipped those
    // draws (NMSky.covered), so the sky in the dip's 1-px seams and fling gaps is the live one
    window.__nmTileDip = true;
  }
  // Blocks (?dip=blocks): the lighter dip, meant for Safari. WebKit draws the SVG filter on the CPU
  // over each section's on-screen strip every frame the page moves under it; here the pieces of each
  // section move instead, by transform on the compositor. Each piece rides the same curve the filter's
  // map encodes (across the section's own width): its centre at the curve's height there, sheared
  // with the curve's slope there, as the filter shears what it bends, so a section still reads as one
  // bowed surface. A piece is the smallest whole thing: an image or video, a paragraph or heading, a
  // box that paints itself (a pill, a framed photo, a button), or anything narrower than a third of the
  // section; wider plain containers are taken apart (rows into their cells, columns into what they
  // hold), a headline written as one span per word (the homepage statement) moves word by word, and
  // the logo strip logo by logo (see strip()). A container's top or bottom rule is taken over by eight
  // short segments (fewer on a narrow rule) that ride the curve, so a full-width line bends as a
  // polyline; the rule itself is transparent only while its segments are on. Boxes are read when the pieces are listed (document
  // px, while everything is flat) and listed again after a resize, a ResizeObserver report from a
  // section or the body, or a change of the sections' content or classes (once the page is flat
  // again); nothing is read per frame. will-change goes to a band of pieces at once, as on Index.
  var pieces = [], owners = [], strips = [], secs = [], lists = 0, host = null, hx = 0, hy = 0, bdirty = true, bband = null, bro = null, bmo = null, bidle = 0, broInit = false;
  var MAXU = 0.34, SEGS = 8, WORDPX = 28;
  var ATOM = { IMG: 1, VIDEO: 1, CANVAS: 1, svg: 1, PICTURE: 1, IFRAME: 1, BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, OBJECT: 1, EMBED: 1 };
  var TRANSLATE = document.documentElement.style.translate !== undefined;
  function sagc(u) { return u <= 0 || u >= 1 ? 0 : sag(u); }
  function slope(u) { return u <= 0 || u >= 1 ? 0 : 4 * (1 - 2 * u); }   // d sag / du
  function see(c) { return c && c !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(c); }
  function rule(cs, s) { var st = cs['border' + s + 'Style']; return parseFloat(cs['border' + s + 'Width']) > 0 && st !== 'none' && st !== 'hidden' && see(cs['border' + s + 'Color']); }
  function pseudo(el, p) { var c = getComputedStyle(el, p); return c.content !== 'none' && c.content !== 'normal' && c.display !== 'none'; }
  // a box that paints something of its own (besides top and bottom rules), or groups what it holds
  function whole(el, cs) {
    return ATOM[el.tagName] || see(cs.backgroundColor) || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none' || rule(cs, 'Left') || rule(cs, 'Right')
      || cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.clipPath !== 'none' || (cs.maskImage || cs.webkitMaskImage || 'none') !== 'none'
      || cs.opacity !== '1' || cs.filter !== 'none' || cs.mixBlendMode !== 'normal' || cs.transform !== 'none' || pseudo(el, '::before') || pseudo(el, '::after');
  }
  // 0: block content only; 1: text or inline elements (it moves whole); 2: a headline of word spans
  function inline(el, cs) {
    var ws = parseFloat(cs.fontSize) >= WORDPX, any = false;
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { if (/\S/.test(n.data)) return 1; continue; }
      if (n.nodeType !== 1 || getComputedStyle(n).display !== 'inline') continue;
      any = true;
      if (n.tagName !== 'SPAN' || n.firstElementChild) ws = false;
    }
    return any ? (ws ? 2 : 1) : 0;
  }
  function bCollect() {
    bFlat();
    for (var i = 0; i < owners.length; i++) for (var j = 0; j < owners[i].segs.length; j++) owners[i].segs[j].el.remove();
    pieces = []; owners = []; strips = []; secs = []; bdirty = false; bband = null; lists++;
    var sx = window.scrollX, sy = window.scrollY;
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none';
      document.body.appendChild(host);
    }
    var hr = host.getBoundingClientRect(); hx = hr.left + sx; hy = hr.top + sy;
    var list = document.querySelectorAll(SECTIONS[page].join(','));
    seen = list.length;
    list.forEach(function (el) {
      var cs = getComputedStyle(el);
      if (cs.position === 'sticky' || cs.position === 'fixed' || cs.display === 'none') return;
      var r = el.getBoundingClientRect();
      if (!r.width) return;
      var sec = { el: el, l: r.left, w: r.width, sx: sx, sy: sy };
      secs.push(sec);
      rules(el, cs, r, sec, null);
      walk(el, sec, null);
    });
    bWatch();
  }
  function walk(el, sec, cull) {
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      var t = c.tagName;
      if (t === 'SCRIPT' || t === 'STYLE' || t === 'TEMPLATE' || t === 'BR') continue;
      var cs = getComputedStyle(c), d = cs.display;
      // (unseen: the five services photos stacked behind the open one would be ~8 MB of layers each)
      if (d === 'none' || cs.position === 'fixed' || cs.opacity === '0') continue;
      if (d === 'contents') { walk(c, sec, cull); continue; }
      var cc = cull;
      if (cs.position === 'sticky') {   // it moves within its parent while the page scrolls: kept near the screen while that is
        var pr = c.parentElement.getBoundingClientRect();
        cc = [pr.top + sec.sy, pr.bottom + sec.sy];
      }
      var r = c.getBoundingClientRect();
      if ((!r.width || !r.height) && !c.firstElementChild) continue;
      if (c.classList.contains('nm-brands-marquee') && TRANSLATE && strip(c, cs, r, sec, cc)) continue;
      var kind = inline(c, cs);
      if (kind === 2 && r.width > MAXU * sec.w && !whole(c, cs)) { rules(c, cs, r, sec, cc); words(c, sec, cc); }
      else if (kind === 1 || !c.firstElementChild || r.width <= MAXU * sec.w || whole(c, cs)) piece(c, cs, r, sec, cc);
      else { rules(c, cs, r, sec, cc); walk(c, sec, cc); }
    }
  }
  // a headline written one span per word: each word is a piece. An inline box cannot be transformed, so
  // while a word holds will-change it is an inline-block aligned to the line's top, which lays the
  // lines out exactly as before (aligned to the baseline the lines grew by 1/64 px each); at rest it is
  // the inline it was (as an inline-block, WebKit placed two words' glyphs a fraction of a pixel apart)
  function words(el, sec, cull) {
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (!/\S/.test(c.textContent)) continue;
      var cs = getComputedStyle(c);
      piece(c, cs, c.getBoundingClientRect(), sec, cull, cs.display === 'inline');
    }
  }
  function piece(el, cs, r, sec, cull, word) {
    var x0 = r.left, x1 = r.right, top = r.top, bot = r.bottom;
    // plain text and plain containers: centred on what they hold (a short heading in a wide box)
    if (!whole(el, cs) && !rule(cs, 'Top') && !rule(cs, 'Bottom')) {
      var rg = document.createRange(); rg.selectNodeContents(el);
      var q = rg.getBoundingClientRect();
      if (q.width > 0) { x0 = q.left; x1 = q.right; top = Math.min(top, q.top); bot = Math.max(bot, q.bottom); }
    }
    var uc = ((x0 + x1) / 2 - sec.l) / sec.w;
    var own = cs.transform !== 'none' || el.classList.contains('nm-mag');   // its own transform (the magnetic words): moved by translate only
    if (own && !TRANSLATE) return;
    pieces.push({ el: el, S: sagc(uc), K: own ? 0 : slope(uc) / sec.w, ox: (x0 + x1) / 2 - r.left, own: own, word: !!word,
      top: cull ? cull[0] : top + sec.sy, bot: cull ? cull[1] : bot + sec.sy, on: false, wc: false, ds: null });
  }
  function rules(el, cs, r, sec, cull) {
    ['Top', 'Bottom'].forEach(function (s) {
      if (!rule(cs, s)) return;
      var bw = parseFloat(cs['border' + s + 'Width']), y = (s === 'Top' ? r.top : r.bottom - bw) + sec.sy;
      var n = Math.max(1, Math.min(SEGS, Math.round(SEGS * r.width / sec.w)));
      var o = { el: el, prop: 'border' + s + 'Color', prev: el.style['border' + s + 'Color'], segs: [],
        top: cull ? cull[0] : y, bot: cull ? cull[1] : y + bw, on: false, wc: false };
      for (var i = 0; i < n; i++) {
        var xa = Math.round(r.left + r.width * i / n), xb = Math.round(r.left + r.width * (i + 1) / n), uc = ((xa + xb) / 2 - sec.l) / sec.w;
        var d = document.createElement('div');
        d.style.cssText = 'position:absolute;display:none;left:' + (xa + sec.sx - hx) + 'px;top:' + (y - hy) + 'px;width:' + (xb - xa) + 'px;height:' + bw + 'px;background:' + cs['border' + s + 'Color'];
        host.appendChild(d);
        o.segs.push({ el: d, S: sagc(uc), K: slope(uc) / sec.w, ox: (xb - xa) / 2, own: false, on: false, wc: false, ds: null });
      }
      owners.push(o);
    });
  }
  // The logo strip slides sideways all the time inside its own mask and clip, so moved whole it could
  // only drop level. Its logos ride the curve instead, each from where the strip's animation has it this
  // frame (its timing, not layout); while they hold will-change the strip's box reaches further up and
  // down (padding, with as much negative margin: nothing else moves), so the mask does not cut them.
  function prog(a) { var t = a.effect.getComputedTiming().progress; return t == null ? 0 : t; }
  function strip(el, cs, r, sec, cull) {
    var tr = el.firstElementChild, an = tr && tr.getAnimations ? tr.getAnimations() : [];
    if (!an.length || !an[0].effect || !an[0].effect.getKeyframes) return false;
    var kf = an[0].effect.getKeyframes(), tw = tr.offsetWidth;
    var tx = function (k) { var m = /translateX\((-?[\d.]+)(px|%)?\)/.exec((k && k.transform) || ''); return m ? (m[2] === '%' ? +m[1] * tw / 100 : +m[1]) : NaN; };
    var x0 = tx(kf[0]), x1 = tx(kf[kf.length - 1]);
    if (kf.length < 2 || isNaN(x0) || isNaN(x1)) return false;
    var q = tr.getBoundingClientRect(), logos = [];
    for (var c = tr.firstElementChild; c; c = c.nextElementSibling) {
      var g = c.getBoundingClientRect();
      if (g.width) logos.push({ el: c, x: g.left - q.left + g.width / 2, S: 0, own: true, on: false, wc: false, ds: null });
    }
    strips.push({ el: el, an: an[0], x0: x0, x1: x1, base: q.left - (x0 + (x1 - x0) * prog(an[0])), sec: sec, logos: logos,
      css: [cs.paddingTop, cs.paddingBottom, cs.marginTop, cs.marginBottom],
      prev: [el.style.paddingTop, el.style.paddingBottom, el.style.marginTop, el.style.marginBottom],
      top: cull ? cull[0] : r.top + sec.sy, bot: cull ? cull[1] : r.bottom + sec.sy, wc: false });
    return true;
  }
  function sLift(t) {
    var e = (DIP + 4) + 'px', st = t.el.style;
    t.wc = true;
    st.paddingTop = 'calc(' + t.css[0] + ' + ' + e + ')'; st.paddingBottom = 'calc(' + t.css[1] + ' + ' + e + ')';
    st.marginTop = 'calc(' + t.css[2] + ' - ' + e + ')'; st.marginBottom = 'calc(' + t.css[3] + ' - ' + e + ')';
    for (var j = 0; j < t.logos.length; j++) if (!t.logos[j].wc) lift(t.logos[j]);
  }
  function sDrop(t) {
    var st = t.el.style;
    t.wc = false;
    st.paddingTop = t.prev[0]; st.paddingBottom = t.prev[1]; st.marginTop = t.prev[2]; st.marginBottom = t.prev[3];
    for (var j = 0; j < t.logos.length; j++) { bClear(t.logos[j]); if (t.logos[j].wc) drop(t.logos[j]); }
  }
  function sPut(t, a) {
    var x = t.base + t.x0 + (t.x1 - t.x0) * prog(t.an) - t.sec.l;
    for (var j = 0; j < t.logos.length; j++) {
      var g = t.logos[j], u = (x + g.x) / t.sec.w;
      if (u <= 0 || u >= 1) { bClear(g); continue; }
      g.S = sag(u); put(g, a);
    }
  }
  function bWatch() {
    if (window.ResizeObserver) {
      if (bro) bro.disconnect();
      broInit = true;
      bro = new ResizeObserver(function () { if (broInit) broInit = false; else bStaleSoon(); });
      for (var i = 0; i < secs.length; i++) bro.observe(secs[i].el);
      bro.observe(document.body);
    }
    if (window.MutationObserver) {
      if (bmo) bmo.disconnect();
      // (a section's own class moves nothing: #nm-brands pauses its strip that way as it scrolls by)
      bmo = new MutationObserver(function (recs) {
        for (var k = 0; k < recs.length; k++) {
          var t = recs[k].target, root = false;
          for (var s = 0; s < secs.length && !root; s++) root = secs[s].el === t;
          if (recs[k].type !== 'attributes' || !root) { bStaleSoon(); return; }
        }
      });
      for (i = 0; i < secs.length; i++) bmo.observe(secs[i].el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'aria-expanded'] });
    }
  }
  // listed again in a quiet moment once the page is flat (or when the next swipe starts, if sooner)
  function bStaleSoon() {
    bdirty = true;
    if (!bidle) bidle = setTimeout(function () { bidle = 0; if (!bdirty) return; if (moving) bStaleSoon(); else collect(); }, 250);
  }
  function bStale() {
    if (bdirty || document.querySelectorAll(SECTIONS[page].join(',')).length !== seen) return true;
    for (var i = 0; i < pieces.length; i++) if (!pieces[i].el.isConnected) return true;
    return false;
  }
  function put(p, a) {
    var v;
    if (p.own) {
      v = '0 ' + (a * p.S).toFixed(2) + 'px';
      if (v !== p.ds) { p.el.style.translate = v; p.ds = v; }
    } else {
      v = 'matrix(1,' + (a * p.K).toFixed(5) + ',0,1,0,' + (a * p.S).toFixed(2) + ')';
      if (v !== p.ds) { if (!p.on) p.el.style.transformOrigin = p.ox.toFixed(2) + 'px 0'; p.el.style.transform = v; p.ds = v; }
    }
    if (!p.wc) lift(p);
    p.on = true;
  }
  function lift(p) {
    p.wc = true;
    if (p.word) { p.el.style.display = 'inline-block'; p.el.style.verticalAlign = 'top'; }
    p.el.style.willChange = 'transform';
  }
  function drop(p) {
    p.wc = false;
    if (p.word) { p.el.style.display = ''; p.el.style.verticalAlign = ''; }
    p.el.style.willChange = '';
  }
  function bClear(p) {
    if (!p.on) return;
    p.on = false; p.ds = null;
    if (p.own) p.el.style.translate = '';
    else { p.el.style.transform = ''; p.el.style.transformOrigin = ''; }
  }
  function oClear(o) {
    if (!o.on) return;
    o.on = false;
    o.el.style[o.prop] = o.prev;
    for (var j = 0; j < o.segs.length; j++) { bClear(o.segs[j]); o.segs[j].el.style.visibility = 'hidden'; }
  }
  function oRelease(o) {
    o.wc = false;
    for (var j = 0; j < o.segs.length; j++) { var s = o.segs[j]; s.wc = false; s.el.style.willChange = ''; s.el.style.display = 'none'; }
  }
  function bFlat() {
    bband = null;
    for (var i = 0; i < pieces.length; i++) { var p = pieces[i]; bClear(p); if (p.wc) drop(p); }
    for (i = 0; i < owners.length; i++) { oClear(owners[i]); if (owners[i].wc) oRelease(owners[i]); }
    for (i = 0; i < strips.length; i++) if (strips[i].wc) sDrop(strips[i]);
  }
  // will-change for a band (as on Index): the stretch that can dip, a screen more ahead, a quarter behind
  function bPromote(sy, vh, down) {
    var lo = sy - vh * (down ? .75 : 1.5) - DIP, hi = sy + vh * (down ? 2.5 : 1.75) + DIP, i, j, inb;
    bband = [lo, hi];
    for (i = 0; i < pieces.length; i++) {
      var p = pieces[i]; inb = p.bot >= lo && p.top <= hi;
      if (inb && !p.wc) lift(p);
      else if (!inb && p.wc && !p.on) drop(p);
    }
    for (i = 0; i < owners.length; i++) {
      var o = owners[i]; inb = o.bot >= lo && o.top <= hi;
      if (inb && !o.wc) {
        o.wc = true;
        for (j = 0; j < o.segs.length; j++) { var s = o.segs[j]; s.wc = true; s.el.style.visibility = 'hidden'; s.el.style.display = 'block'; s.el.style.willChange = 'transform'; }
      } else if (!inb && o.wc && !o.on) oRelease(o);
    }
    for (i = 0; i < strips.length; i++) {
      var t = strips[i]; inb = t.bot >= lo && t.top <= hi;
      if (inb && !t.wc) sLift(t);
      else if (!inb && t.wc) sDrop(t);
    }
  }
  function applyBlocks(amount, vh) {
    var sy = window.scrollY, m = Math.abs(amount), lo = sy - vh * .5 - m, hi = sy + vh * 1.5 + m, i, j;
    if (!bband || sy - vh * .5 - DIP < bband[0] || sy + vh * 1.5 + DIP > bband[1]) bPromote(sy, vh, vel >= 0);
    for (i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      if (p.bot < lo || p.top > hi) bClear(p);   // only what is near the screen
      else put(p, amount);
    }
    for (i = 0; i < owners.length; i++) {
      var o = owners[i];
      if (o.bot < lo || o.top > hi) { oClear(o); continue; }
      if (!o.wc) bPromote(sy, vh, vel >= 0);
      for (j = 0; j < o.segs.length; j++) put(o.segs[j], amount);
      if (!o.on) {
        o.on = true;
        for (j = 0; j < o.segs.length; j++) o.segs[j].el.style.visibility = 'visible';
        o.el.style[o.prop] = 'transparent';
      }
    }
    for (i = 0; i < strips.length; i++) {
      var t = strips[i];
      if (t.bot < lo || t.top > hi) { for (j = 0; j < t.logos.length; j++) bClear(t.logos[j]); continue; }
      if (!t.wc) bPromote(sy, vh, vel >= 0);
      sPut(t, amount);
    }
  }
  // WebKit samples the displacement at whole device pixels, truncating toward zero: a dip under 1.5
  // device px down, or 0.5 up, moves nothing (its frames match the zero-scale filter's, measured), yet
  // each still costs WebKit a CPU-filtered frame. At an episode's edges (before the filter goes on, and
  // once the page has slowed and the dip springs back) those frames go without it; mid-episode it stays
  // on as before. The dip's timing, spring and speed are untouched. Margins: 1.25 and 0.4 device px.
  function unseen(amount) {
    var px = amount * (window.devicePixelRatio || 1) * ((window.visualViewport && window.visualViewport.scale) || 1);
    return px < 1.25 && px > -0.4;
  }
  function apply(w, target) {
    if (hold !== null) { w = target = hold; }   // the preview's capture rig (?dip= only)
    if (w === 0) { flat(); return; }
    var vw = window.innerWidth, vh = window.innerHeight, amount = DIP * Math.min(1, vw / 1440) * w, n = items.length, i;
    if (page === 'index') { applyTiles(amount, vw, vh); return; }
    if (BLOCKS) { applyBlocks(amount, vh); return; }
    if (WEBKIT && (!filtered || target === 0) && unseen(amount)) { flat(); return; }
    // Read every box before writing anything (a read after a write forces a style and layout pass);
    // filters never move layout, so the boxes are the same either way
    rects.length = n;
    for (i = 0; i < n; i++) rects[i] = items[i].el.getBoundingClientRect();
    for (i = 0; i < n; i++) {
      var it = items[i], r = rects[i];
      if (r.bottom < -vh * .5 || r.top > vh * 1.5) { clear(it); continue; }   // only what is near the screen
      // filter only the strip that is on screen (plus the sag margin): far fewer pixels per frame
      var hh = r.height || it.h;   // the section's height now (images can still be loading)
      var y0 = Math.max(-it.pad, Math.floor(-r.top - it.pad)), y1 = Math.min(hh + it.pad, Math.ceil(vh - r.top + it.pad));
      if (y1 <= y0) { clear(it); continue; }
      var k = WEBKIT ? 1 / hh : 1;   // bounding-box units in WebKit
      it.f.setAttribute('y', String(y0 * k)); it.f.setAttribute('height', String((y1 - y0) * k));
      it.im.setAttribute('y', String(y0 * k)); it.im.setAttribute('height', String((y1 - y0) * k));
      // the map samples from above by 0.5 * scale at the centre, so the centre moves down by that
      it.disp.setAttribute('scale', WEBKIT ? String(2 * amount * k) : (2 * amount).toFixed(1));
      if (it.el.style.filter !== 'url("#' + it.id + '")' && it.el.style.filter !== 'url(#' + it.id + ')') it.el.style.filter = 'url(#' + it.id + ')';
      it.on = true;
    }
    // WebKit draws the filter on the CPU: js/nm-space.js does not count these frames against its
    // particles (fewer would not make them faster)
    if (WEBKIT) { var on = false; for (i = 0; i < n && !on; i++) on = !!items[i].on; filtered = window.__nmDip = on; }
  }
  // The easing rates below were tuned per 60 Hz frame. Each is applied as 1 - (1 - rate)^(dt * 60):
  // exactly the tuned rate for a 60 Hz frame, and the same pull per second at 120 Hz.
  function ease(rate, dt) { return 1 - Math.pow(1 - rate, dt * 60); }
  // The scroll speed over the last WINDOW ms, in px/s: the distance moved since the newest sample
  // at least that old. Steady at any frame rate, and one slow frame cannot fake a burst of speed
  // (the homepage's smooth scrolling made per-frame readings jump between swipes).
  function speed(t, y) {
    hist.push(t, y);
    while (hist.length > 4 && t - hist[2] >= WINDOW) hist.splice(0, 2);
    var span = t - hist[0];
    return span > 4 ? (y - hist[1]) / span * 1000 : 0;
  }
  function frame(t) {
    raf = 0;
    var dt = last ? Math.min(.05, (t - last) / 1000) : firstDt;
    last = t; age += dt;
    vel = speed(t, window.scrollY);
    var a = Math.abs(vel);
    var target = a <= START ? 0 : Math.min(1, (a - START) / (FULL - START)) * (vel > 0 ? 1 : -1);
    // quick to sag, slower to spring back, like a rope settling
    warp += (target - warp) * ease(Math.abs(target) > Math.abs(warp) ? .45 : .1, dt);
    // stay at least one 60 Hz frame before giving up, so a fast screen judges the speed as fully as 60 Hz
    if (Math.abs(warp) < .004 && target === 0 && age > .014) { warp = 0; apply(0); moving = false; last = 0; vel = 0; hist = []; return; }
    apply(warp, target);
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
    kick(recent ? evY : y, recent ? evF : f);
    evY = y; evT = now; evF = f;
    // Index: this frame's sky and space draw before this file's frame moves the tiles, so when that frame
    // will start a dip they are told now (NMSky.covered), from the speed it is about to read (read here
    // the same way, without keeping it; at the frame's time in Chrome, a frame early in WebKit, so the
    // margin); applyTiles tells them on the dip's later frames
    if (page === 'index' && moving && !window.__nmTileDip) {
      var h = hist.concat([f, y]);
      while (h.length > 4 && f - h[2] >= WINDOW) h.splice(0, 2);
      var span = f - h[0];
      if (span > 4 && Math.abs(y - h[1]) / span * 1000 > START * 0.95) window.__nmTileDip = true;
    }
  }
  function kick(fromY, fromT) {
    if (reduce && reduce.matches) return;
    // Home and About: on the homepage most sections (brands, services, sites) are added by script
    // after this file starts, so a list taken at start-up could hold only the statement. Re-list
    // them when a swipe starts and their number has changed.
    if (BLOCKS) { if (!moving && bStale()) collect(); }
    else if (!moving && page !== 'index' && document.querySelectorAll(SECTIONS[page].join(',')).length !== seen) collect();
    else if (!items.length) collect();
    if (!moving) { moving = true; hist = [fromT, fromY]; last = 0; age = 0; firstDt = 1 / 60; }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  // the preview's capture rig: hold(w) sets the dip (-1..1) until hold(null); warp is the live value
  if (MODE) window.__nmDipDebug = {
    mode: page === 'index' ? 'tiles' : BLOCKS ? 'blocks' : 'filter',
    hold: function (w) { hold = w == null ? null : +w; apply(hold === null ? 0 : hold, hold); },
    get warp() { return warp; },
    get pieces() { return pieces.length; },
    get rules() { return owners.length; },
    get strips() { return strips.length; },
    get lists() { return lists; }
  };
  function start() {
    collect();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', function () { apply(0); warp = 0; collect(); }, { passive: true });
  }
  if (window.__nmReady) window.__nmReady(start);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
