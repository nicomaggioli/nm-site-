/* Atlas direction: a field guide to wonders, drawn like a star atlas.
   Brief: docs/cosmic-directions.md ("3. Atlas"). Loaded by js/nm-theme.js only
   while ?theme=atlas is active, before nm-cosmos.js and nm-blackhole.js.

   What it adds (all aria-hidden, none of it touches React-owned text):
     ground    a fixed deep navy-black plate, softly uneven like an exposed
               emulsion, generated once per viewport size (canvas, dithered)
     sky       NMCosmos stars + spray grain (config below)
     plate     one document-space SVG: a conic RA/Dec graticule, reseau crosses,
               a graduated neatline and a faint constellation that links the
               section anchors (Bayer-lettered stars) and runs into the black
               hole. Lines break where they would cross content.
     halos     every work image glows with a sprayed thermal halo in the hoodie
               ramp (warm white > cream > peach > coral > deep coral > a violet
               fringe), stronger on hover. Halos are rendered once per size into
               blob images (stochastic airbrush dither), never per frame.
     notes     mono catalogue annotations: services get Messier pairings, the live
               sites read as a catalogue of worlds, gallery tiles show plate
               numbers on hover, the hero mark is catalogued like a galaxy.
   Budget: no animation loop of its own (one passive scroll handler on the home
   hero fades the reticle); everything is rebuilt only on layout changes. */
(function () {
  'use strict';
  var root = document.documentElement;
  var cfg = window.NMThemeConfig = window.NMThemeConfig || {};
  var path = location.pathname;
  var PAGE = /^\/index(\/|\/index\.html)?$/.test(path) ? 'index' : /^\/about(\/|\/index\.html)?$/.test(path) ? 'about' : 'home';
  var PHONE = (function () {
    try { return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 600; } catch (e) { return false; }
  })();
  var reduceMQ = null;
  try { reduceMQ = matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { /* old engines */ }
  function reduced() { return !!(reduceMQ && reduceMQ.matches); }
  root.setAttribute('data-atl-page', PAGE);

  var INK = '#070A14';
  var C = {
    warmWhite: [244, 248, 240], cream: [237, 225, 204], ice: [198, 205, 198], sky: [188, 211, 224],
    peach: [233, 180, 163], coral: [227, 131, 122], deep: [202, 88, 85], violet: [110, 107, 214], ink: [7, 10, 20]
  };

  /* ------------------------------------------------------------ shared modules */
  cfg.heroClear = true;
  cfg.heroBase = INK;
  cfg.stars = {
    density: PHONE ? 0.8 : 0.95, brightness: 0.95, twinkle: 0.16, twinkleDepth: 0.9,
    spikes: 0.93, spikeAngle: 0, band: 0.34, parallax: 0.045, shootingStars: 48, seed: 11
  };
  cfg.grain = { opacity: 0.2, blend: 'overlay', density: 0.42, light: 0.12, scale: 1, seed: 9 };
  // A little more tilt than the default opens the disk so its sprayed bands
  // read; desktop renders it at full resolution (phones keep the module's).
  cfg.blackHole = {
    annotate: true, tilt: 10, arrive: 6, spin: 0.85, intensity: 1, scale: PHONE ? 1 : 0.96,
    stars: 0.9, grain: 0.85, violet: true, quality: PHONE ? 0 : 0.95
  };
  // The hero samples page layers outside the NM mark: the plate ground (a canvas
  // that never changes) under the live star canvas.
  var bd = null, heroGrat = null;
  cfg.heroBackdrop = function () {
    if (bd) return bd;
    var list = [];
    if (ground && ground.img && ground.img.naturalWidth) list.push(ground.img);
    if (heroGrat && heroGrat.img && heroGrat.img.naturalWidth) list.push(heroGrat.img);
    var api = window.NMCosmos;
    if (api && api.layers) {
      for (var i = 0; i < api.layers.length; i++) {
        var h = api.layers[i];
        if (h.kind === 'stars' && !h.options.target) { var cv = h.el.querySelector('canvas'); if (cv) list.push(cv); }
      }
    }
    if (list.length >= (PAGE === 'home' ? 3 : 2)) bd = list;
    return list;
  };

  /* ------------------------------------------------------------------ helpers */
  function rng(seed) {
    var a = (seed * 2654435761) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function idle(fn, t) {
    if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: t || 900 });
    else setTimeout(fn, 60);
  }
  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    e.setAttribute('aria-hidden', 'true');
    if (parent) parent.appendChild(e);
    return e;
  }
  function docRect(e) {
    var r = e.getBoundingClientRect(), sy = window.scrollY || 0, sx = window.scrollX || 0;
    return { x: r.left + sx, y: r.top + sy, w: r.width, h: r.height, r: r.right + sx, b: r.bottom + sy };
  }
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return [].slice.call((c || document).querySelectorAll(s)); }
  function debounce(fn, ms) {
    var t = 0;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ------------------------------------------------------------------- ground
     A fixed canvas the size of the viewport (CSS px): navy-black with faint cool
     nebulosity and an exposure falloff toward the corners, dithered so the
     shallow gradients never band. Painted once per size; the hero samples it. */
  var ground = null;
  // Swap a freshly painted canvas into a layer as a new <img>: the hero uploads
  // an image texture once (a canvas would be re-uploaded every other frame), and
  // a new element makes it notice the change.
  function swapImg(layer, c) {
    var done = function (url) {
      var im = new Image();
      im.alt = ''; im.decoding = 'async';
      im.onload = function () {
        var old = layer.img;
        layer.el.appendChild(im);
        layer.img = im;
        if (old) { old.remove(); if (old.__url) URL.revokeObjectURL(old.__url); }
        bd = null;
      };
      im.__url = url.indexOf('blob:') === 0 ? url : '';
      im.src = url;
    };
    if (c.toBlob) c.toBlob(function (b) { done(b ? URL.createObjectURL(b) : c.toDataURL()); }, 'image/png');
    else done(c.toDataURL());
  }
  function paintGround() {
    var w = Math.max(64, Math.round(window.innerWidth)), h = Math.max(64, Math.round(window.innerHeight));
    if (!ground) {
      ground = { el: el('div', 'atl-ground') };
      document.body.appendChild(ground.el);
    }
    // resize only for real changes (toolbar height shifts stretch the old one)
    if (ground.w && Math.abs(ground.w - w) < 2 && Math.abs(ground.h - h) / ground.h < 0.2) return;
    ground.w = w; ground.h = h;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.fillStyle = INK; g.fillRect(0, 0, w, h);
    var m = Math.max(w, h);
    function blob(x, y, rx, ry, rgb, a) {
      g.save();
      g.translate(x, y); g.scale(rx, ry);
      var gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
      gr.addColorStop(0.55, 'rgba(' + rgb + ',' + (a * 0.38).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = gr; g.fillRect(-1, -1, 2, 2);
      g.restore();
    }
    blob(w * 0.16, h * 0.18, m * 0.5, m * 0.34, '26,36,72', 0.5);
    blob(w * 0.9, h * 0.84, m * 0.46, m * 0.36, '34,26,62', 0.42);
    blob(w * 0.62, h * 0.02, m * 0.36, m * 0.2, '20,34,62', 0.36);
    blob(w * 0.42, h * 0.62, m * 0.42, m * 0.14, '20,26,50', 0.22);
    // the hoodie, faintly: a warm deep-coral exposure low right, ice high left
    blob(w * 0.96, h * 1.02, m * 0.42, m * 0.3, '86,34,48', 0.32);
    blob(w * 0.04, h * -0.04, m * 0.34, m * 0.22, '44,62,92', 0.26);
    var v = g.createRadialGradient(w / 2, h * 0.48, Math.min(w, h) * 0.25, w / 2, h * 0.5, m * 0.78);
    v.addColorStop(0, 'rgba(3,4,10,0)');
    v.addColorStop(1, 'rgba(3,4,10,0.6)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
    // dither: a tiled noise of +-2 levels (so the shallow gradients never band),
    // with sparse darker emulsion specks
    var N = 128, nc = document.createElement('canvas');
    nc.width = nc.height = N;
    var ng = nc.getContext('2d'), nd = ng.createImageData(N, N), r = rng(3);
    for (var i = 0; i < nd.data.length; i += 4) {
      var v = r() < 0.5 ? 255 : 0, a = r() * r() * 14 + (r() < 0.006 && !v ? 22 : 0);
      nd.data[i] = nd.data[i + 1] = nd.data[i + 2] = v; nd.data[i + 3] = a;
    }
    ng.putImageData(nd, 0, 0);
    g.fillStyle = g.createPattern(nc, 'repeat');
    g.fillRect(0, 0, w, h);
    swapImg(ground, c);
  }

  /* -------------------------------------------------------------------- halos
     The work is a warm body seen through a thermal camera that reads in the
     hoodie's colours. Its own light sets the heat: a tiny luminance map of the
     image makes the glow run hot (cream, warm white) beside bright edges and
     cool (coral, deep coral) beside dark ones, so every halo is different and
     belongs to its picture. Light spreads from a blurred box (corners dim and
     round off like real backlight) whose reach drifts slowly around the
     perimeter, so the isotherms flow out in soft lobes like the hoodie's bands
     instead of tracing a frame; the coldest fringe turns violet only here and
     there. Colour and opacity both come from the temperature. Alpha is
     deposited stochastically: dense where the paint is thick, breaking into
     droplets and overspray at the fringe. */
  var LUT = null;
  // The ramp is written as the colour each temperature should *read as* on the
  // ink ground; each entry is then split into the least opaque paint that
  // produces it, so the light stays saturated (dimmed coral would turn brown)
  // and the sky still shows through the cooler bands.
  function heatLut() {
    if (LUT) return LUT;
    var stops = [
      [0.0, C.ink], [0.12, [24, 22, 48]], [0.27, [88, 40, 70]], [0.42, C.deep], [0.58, C.coral],
      [0.72, C.peach], [0.84, C.cream], [0.95, C.warmWhite], [1.0, C.warmWhite]
    ];
    var I = C.ink;
    LUT = new Float32Array(256 * 4);
    for (var i = 0; i < 256; i++) {
      var t = i / 255, k = 0;
      while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      var a = stops[k], b = stops[k + 1], u = smooth(0, 1, (t - a[0]) / (b[0] - a[0]));
      var tg = [0, 1, 2].map(function (j) { return a[1][j] + (b[1][j] - a[1][j]) * u; });
      var al = 0;
      for (var j = 0; j < 3; j++) al = Math.max(al, (tg[j] - I[j]) / (255 - I[j]), (I[j] - tg[j]) / Math.max(1, I[j]));
      al = clamp(al, 0, 1);
      for (var q = 0; q < 3; q++) LUT[i * 4 + q] = al > 0.002 ? clamp((tg[q] - (1 - al) * I[q]) / al, 0, 255) : tg[q];
      LUT[i * 4 + 3] = al;
    }
    return LUT;
  }
  // tileable-enough value noise on a coarse random lattice (smoothstep blend)
  function lattice(r, nx, ny) {
    var g = new Float32Array((nx + 2) * (ny + 2));
    for (var i = 0; i < g.length; i++) g[i] = r();
    return function (x, y) {
      x = clamp(x, 0, nx); y = clamp(y, 0, ny);
      var ix = Math.min(nx, x | 0), iy = Math.min(ny, y | 0), fx = x - ix, fy = y - iy;
      fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      var s = nx + 2, i0 = iy * s + ix;
      return (g[i0] * (1 - fx) + g[i0 + 1] * fx) * (1 - fy) + (g[i0 + s] * (1 - fx) + g[i0 + s + 1] * fx) * fy;
    };
  }
  var haloCache = {};
  // w,h: the work's size in CSS px. o: { m margin, r radius, heat, seed, scale,
  // crop:[x,y,w,h], src: the work's image (its own light sets the heat) }
  function haloURL(w, h, o, cb) {
    var key = [Math.round(w), Math.round(h), o.m, o.r, o.heat, o.seed, o.scale, o.crop ? o.crop.join(',') : '', o.src || ''].join('|');
    var hit = haloCache[key];
    if (hit) { if (hit.url) cb(hit.url); else hit.q.push(cb); return; }
    hit = haloCache[key] = { url: '', q: [cb] };
    workHeat(o.src, w, h, function (map) {
      o.map = map;
      // rendered in row bands inside idle slices, so it never costs a frame
      var job = haloJob(w, h, o);
      var tick = function (dl) {
        var budget = dl && dl.timeRemaining ? Math.max(3, dl.timeRemaining() - 1) : 6;
        if (!job.step(budget)) { idle(tick, 400); return; }
        var c = job.canvas;
        var done = function (url) { hit.url = url; hit.q.forEach(function (f) { f(url); }); hit.q = []; };
        if (c.toBlob) c.toBlob(function (bl) { done(bl ? URL.createObjectURL(bl) : c.toDataURL()); }, 'image/png');
        else done(c.toDataURL());
      };
      idle(tick, 600);
    });
  }
  // The work's own light: a tiny luminance map of what it shows (cropped like
  // object-fit:cover), contrast-stretched, so the glow runs hot beside bright
  // edges and cool beside dark ones. Same-origin images only; null otherwise.
  var heatMaps = {};
  function workHeat(src, w, h, cb) {
    if (!src) { cb(null); return; }
    var ar = h / Math.max(1, w), nx = ar > 1 ? clamp(Math.round(14 / ar), 4, 14) : 14, ny = ar > 1 ? 14 : clamp(Math.round(14 * ar), 4, 14), key = src + '|' + nx + 'x' + ny;
    var hit = heatMaps[key];
    if (hit) { if (hit.done) cb(hit.map); else hit.q.push(cb); return; }
    hit = heatMaps[key] = { done: false, map: null, q: [cb] };
    var finish = function (map) { hit.done = true; hit.map = map; hit.q.forEach(function (f) { f(map); }); hit.q = []; };
    var im = new Image();
    im.decoding = 'async';
    im.onload = function () {
      try {
        var c = document.createElement('canvas'); c.width = nx; c.height = ny;
        var g = c.getContext('2d'), iw = im.naturalWidth, ih = im.naturalHeight;
        var k = Math.max(nx / iw, ny / ih), sw = nx / k, sh = ny / k;
        g.imageSmoothingQuality = 'high';
        g.drawImage(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, nx, ny);
        var px = g.getImageData(0, 0, nx, ny).data, L = new Float32Array(nx * ny), lo = 1, hi = 0;
        for (var i = 0; i < L.length; i++) {
          var v = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
          L[i] = v; if (v < lo) lo = v; if (v > hi) hi = v;
        }
        var span = Math.max(0.08, hi - lo), B = new Float32Array(L.length);
        for (var j = 0; j < L.length; j++) L[j] = 0.45 * L[j] + 0.55 * (L[j] - lo) / span;
        // one soft blur pass so the heat changes like liquid along the edge
        for (var yy = 0; yy < ny; yy++) for (var xx = 0; xx < nx; xx++) {
          var sum = 0, wt = 0;
          for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
            var X = xx + dx, Y = yy + dy;
            if (X < 0 || Y < 0 || X >= nx || Y >= ny) continue;
            var k2 = dx || dy ? (dx && dy ? 0.5 : 0.75) : 1;
            sum += L[Y * nx + X] * k2; wt += k2;
          }
          B[yy * nx + xx] = sum / wt;
        }
        L = B;
        finish({ nx: nx, ny: ny, L: L });
      } catch (e) { finish(null); }
    };
    im.onerror = function () { finish(null); };
    im.src = src;
  }
  function sampleMap(map, u, v) {
    var x = clamp(u, 0, 1) * (map.nx - 1), y = clamp(v, 0, 1) * (map.ny - 1);
    var ix = Math.min(map.nx - 2, x | 0), iy = Math.min(map.ny - 2, y | 0), fx = x - ix, fy = y - iy, L = map.L, n = map.nx;
    if (map.nx < 2 || map.ny < 2) return L[0];
    return (L[iy * n + ix] * (1 - fx) + L[iy * n + ix + 1] * fx) * (1 - fy) + (L[(iy + 1) * n + ix] * (1 - fx) + L[(iy + 1) * n + ix + 1] * fx) * fy;
  }
  // The image a halo target shows: an img that has loaded (its currentSrc, so
  // reading it never starts a different download), or a video's poster.
  function imgOf(t) { return !t ? null : t.tagName === 'IMG' ? t : t.querySelector && t.querySelector('img'); }
  function srcOf(t) {
    if (!t) return '';
    var im = imgOf(t);
    if (im) return im.complete && im.naturalWidth && im.currentSrc || '';
    var v = t.tagName === 'VIDEO' ? t : t.querySelector && t.querySelector('video');
    return v && v.poster || '';
  }
  // render one halo now (inspection hook; resolves to a canvas)
  function renderHalo(w, h, o) {
    return new Promise(function (res) { workHeat(o.src, w, h, function (map) { o.map = map; var j = haloJob(w, h, o); j.step(Infinity); res(j.canvas); }); });
  }
  function haloJob(w, h, o) {
    var m = o.m, s = o.scale || 1, lut = heatLut();
    var crop = o.crop || [0, 0, w + 2 * m, h + 2 * m];
    var W = Math.max(2, Math.round(crop[2] * s)), H = Math.max(2, Math.round(crop[3] * s));
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    var r = rng(o.seed || 1), hw = w / 2, hh = h / 2, cx = m + hw, cy = m + hh, rr = Math.min(o.r || 0, hw, hh);
    var heat = o.heat || 0.86, inv = 1 / s, ox = crop[0], oy = crop[1];
    var BW = w + 2 * m, BH = h + 2 * m;
    // three slow fields over the box: reach (how far the heat flows out), flare
    // (how hot the edge runs) and the rare violet in the coldest fringe
    var cell = Math.max(90, m * 2.4), nx = Math.ceil(BW / cell), ny = Math.ceil(BH / cell);
    var reachN = lattice(r, nx, ny), reachN2 = lattice(r, nx * 2 + 1, ny * 2 + 1);
    var flareN = lattice(r, Math.ceil(BW / (cell * 0.8)), Math.ceil(BH / (cell * 0.8)));
    var vioN = lattice(r, Math.ceil(BW / (cell * 1.6)) + 1, Math.ceil(BH / (cell * 1.6)) + 1);
    var fC = 1 / (cell * 0.8), vC = 1 / (cell * 1.6), rC = 1 / cell;
    // light from a blurred box (separable, so corners dim and round off as real
    // backlight does), its coordinates warped so the glow flows out in lobes
    // sgBase: blur of the light box; warpA: lobe drift; gain: how far the edge
    // temperature holds before it cools; lo/span: edge heat from a dark to a
    // bright stretch of the picture
    var sgBase = m * 0.55, warpA = m * 0.08, gain = 2.4, lo = 0.45, span = 0.65;
    var map = o.map || null;
    function prof(v, a0, a1, sg) { return 0.5 * (Math.tanh((v - a0) / sg) - Math.tanh((v - a1) / sg)); }
    var row = 0;
    function rows(budget) {
      var t0 = performance.now();
      for (var y = row; y < H; y++) {
        if (y > row && (y & 7) === 0 && performance.now() - t0 > budget) { row = y; return false; }
        var py = oy + (y + 0.5) * inv;
        var ey = Math.min(py, BH - py);
        for (var x = 0; x < W; x++) {
          var px = ox + (x + 0.5) * inv, i4 = (y * W + x) * 4;
          var nr = 0.68 * reachN(px * rC, py * rC) + 0.32 * reachN2(px * rC * 2, py * rC * 2);
          // how hot the work runs at the nearest point of its edge
          var hs = map ? sampleMap(map, (px - m) / w, (py - m) / h) : 0.5 + 0.5 * (reachN(py * rC + 2.3, px * rC + 0.7) - 0.5) * 2;
          var wx = px + warpA * (reachN2(py * rC * 2 + 3.1, px * rC * 2 + 1.7) - 0.5) * 2;
          var wy = py + warpA * (nr - 0.5) * 2;
          var sg = sgBase * (0.62 + 0.42 * nr) * (0.6 + 0.65 * hs);
          var L = prof(wx, m, m + w, sg) * prof(wy, m, m + h, sg);
          var edgeT = heat * (0.86 + 0.28 * flareN(px * fC, py * fC)) * (lo + span * hs);
          var T = edgeT * Math.min(1, gain * L);
          // isotherm ridges: faint contour bands like the hoodie's sprayed stripes
          if (T > 0.06) T += 0.014 * Math.sin(T * 40);
          // never reach the box edge (no clipped glow)
          var ex = Math.min(px, BW - px), edge = smooth(0, m * 0.42, Math.min(ex, ey));
          T *= edge;
          var tc = clamp(T, 0, 1), li = tc * 255 | 0;
          var a = lut[li * 4 + 3];
          if (a <= 0.003) { d[i4 + 3] = 0; continue; }
          var R = lut[li * 4], G = lut[li * 4 + 1], B = lut[li * 4 + 2];
          // the coldest fringe turns violet, only where the violet field allows
          if (tc < 0.3) {
            var v = smooth(0.6, 0.84, vioN(px * vC, py * vC)) * (1 - tc / 0.3) * 0.85;
            if (v > 0) { R += (C.violet[0] - R) * v; G += (C.violet[1] - G) * v; B += (C.violet[2] - B) * v; }
          }
          // Airbrush deposit: an even tone with sparse specks where the paint is
          // dense; separate droplets where it thins out.
          var u = r();
          var dense = a * (0.9 + 0.2 * u);
          var p0 = 0.08, sparse = u < a / p0 ? p0 * (0.7 + 0.9 * r()) : 0;
          var wgt = smooth(p0 * 0.35, p0 * 2.2, a);
          var dep = dense * wgt + sparse * (1 - wgt);
          if (dep <= 0.004) { d[i4 + 3] = 0; continue; }
          d[i4] = R; d[i4 + 1] = G; d[i4 + 2] = B;
          d[i4 + 3] = clamp(dep, 0, 1) * 255;
        }
      }
      row = H;
      return true;
    }
    function finish() {
      g.putImageData(img, 0, 0);
      // spatter: a few larger droplets in the overspray, as a real airbrush spits
      var drops = Math.round(W * H * 0.0003);
      for (var j = 0; j < drops; j++) {
        var X = r() * W, Y = r() * H;
        var pxx = ox + X * inv, pyy = oy + Y * inv;
        var qx2 = Math.abs(pxx - cx) - (hw - rr), qy2 = Math.abs(pyy - cy) - (hh - rr);
        var d2 = Math.sqrt(Math.max(qx2, 0) * Math.max(qx2, 0) + Math.max(qy2, 0) * Math.max(qy2, 0)) - rr;
        if (d2 < m * 0.1 || d2 > m * 0.78) continue;
        var tt = heat * 0.55 * Math.exp(-d2 / (m * 0.32));
        if (r() > tt * 2 + 0.03) continue;
        var li2 = clamp(tt * 1.1, 0, 1) * 255 | 0;
        g.fillStyle = 'rgba(' + (lut[li2 * 4] | 0) + ',' + (lut[li2 * 4 + 1] | 0) + ',' + (lut[li2 * 4 + 2] | 0) + ',' + (0.3 + r() * 0.4).toFixed(2) + ')';
        g.beginPath(); g.arc(X, Y, (0.55 + r() * 1.05) * s, 0, 6.2832); g.fill();
      }
    }
    var out = { canvas: c, step: function (budget) { if (!rows(budget)) return false; finish(); out.step = function () { return true; }; return true; } };
    return out;
  }
  function haloScale(w, h, m) {
    var px = (w + 2 * m) * (h + 2 * m), dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    return px * dpr * dpr > 1.1e6 ? Math.max(0.75, Math.sqrt(1.1e6 / px)) : dpr;
  }
  function marginFor(w, h) { return Math.round(clamp(Math.min(w, h) * 0.2, 46, PHONE ? 70 : 128)); }

  // A halo element behind `target`, inside `host` (positioned), sized from rects.
  function Halo(target, host, o) {
    this.t = target; this.host = host; this.o = o || {};
    this.e = el('i', 'atl-halo' + (this.o.cls ? ' ' + this.o.cls : ''));
    if (this.o.before) host.insertBefore(this.e, this.o.before); else host.appendChild(this.e);
    this.key = '';
  }
  Halo.prototype.place = function () {
    // the element's containing block, whatever the layout mode of its parent
    var cb = this.e.offsetParent;
    if (!cb) return;
    var t = this.t.getBoundingClientRect(), h = cb.getBoundingClientRect();
    if (t.width < 8 || t.height < 8) return;
    var m = this.o.m || marginFor(t.width, t.height);
    var s = this.e.style;
    s.left = (t.left - h.left - cb.clientLeft + cb.scrollLeft - m).toFixed(1) + 'px';
    s.top = (t.top - h.top - cb.clientTop + cb.scrollTop - m).toFixed(1) + 'px';
    s.width = (t.width + 2 * m).toFixed(1) + 'px';
    s.height = (t.height + 2 * m).toFixed(1) + 'px';
    s.setProperty('--atl-m', m + 'px');
    var w = Math.round(t.width / 8) * 8, hh = Math.round(t.height / 8) * 8, src = srcOf(this.t), self0 = this;
    var im = imgOf(this.t);
    if (im && !src && !this.waiting) { this.waiting = true; im.addEventListener('load', function () { self0.waiting = false; self0.place(); }, { once: true }); }
    var key = w + 'x' + hh + ':' + m + ':' + src;
    if (key === this.key) return;
    this.key = key;
    var e = this.e, self = this;
    haloURL(w, hh, { m: m, r: this.o.r || 0, heat: this.o.heat || 0.86, seed: this.o.seed || 1, scale: haloScale(w, hh, m), src: src }, function (url) {
      if (self.key !== key) return;
      e.style.backgroundImage = 'url(' + url + ')';
      e.classList.add('is-ready');
    });
  };

  /* --------------------------------------------------------- the plate (SVG) */
  var plate = null, obstacles = [];
  // Obstacles are document-space rects the plate's lines break around. Blocks
  // (images, lists, pills) count whole; text counts only its line boxes, so a
  // line passes beside a short last line or a ragged right edge instead of
  // stopping in empty space at the paragraph's box.
  function shown(e) {
    var cs = getComputedStyle(e);
    return !(cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0);
  }
  function clipBox(e) {
    // the visible part of e: intersect with ancestors that clip (collapsed panels)
    var r = e.getBoundingClientRect(), x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
    for (var a = e.parentElement, k = 0; a && a !== document.body && k < 8; a = a.parentElement, k++) {
      var cs = getComputedStyle(a);
      if (cs.overflow === 'visible' && cs.overflowY === 'visible') continue;
      var q = a.getBoundingClientRect();
      x0 = Math.max(x0, q.left); y0 = Math.max(y0, q.top); x1 = Math.min(x1, q.right); y1 = Math.min(y1, q.bottom);
    }
    return { l: x0, t: y0, r: x1, b: y1 };
  }
  function collectObstacles(sel, pad, tight) {
    var out = [], sx = window.scrollX || 0, sy = window.scrollY || 0;
    if (!sel) return out;
    $$(sel).forEach(function (e) {
      if (e.closest('.atl-plate') || !shown(e)) return;
      var cb = clipBox(e);
      if (cb.r - cb.l < 2 || cb.b - cb.t < 2) return;
      if (!tight) { out.push({ x: cb.l + sx - pad, y: cb.t + sy - pad, r: cb.r + sx + pad, b: cb.b + sy + pad }); return; }
      var tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), n, rg = document.createRange();
      while ((n = tw.nextNode())) {
        if (!/\S/.test(n.data)) continue;
        rg.selectNodeContents(n);
        var rs = rg.getClientRects();
        for (var i = 0; i < rs.length; i++) {
          var q = rs[i], l = Math.max(q.left, cb.l), t = Math.max(q.top, cb.t), rr = Math.min(q.right, cb.r), bb = Math.min(q.bottom, cb.b);
          if (rr - l < 1 || bb - t < 1) continue;
          out.push({ x: l + sx - pad, y: t + sy - pad, r: rr + sx + pad, b: bb + sy + pad });
        }
      }
    });
    return out;
  }
  function hits(R, obs) {
    for (var i = 0; i < obs.length; i++) { var o = obs[i]; if (R.x < o.r && R.r > o.x && R.y < o.b && R.b > o.y) return true; }
    return false;
  }
  // Liang-Barsky: the [t0,t1] part of segment p->q inside rect, or null
  function clipT(p, q, R) {
    var t0 = 0, t1 = 1, dx = q.x - p.x, dy = q.y - p.y;
    var P = [-dx, dx, -dy, dy], Q = [p.x - R.x, R.r - p.x, p.y - R.y, R.b - p.y];
    for (var i = 0; i < 4; i++) {
      if (P[i] === 0) { if (Q[i] < 0) return null; continue; }
      var t = Q[i] / P[i];
      if (P[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return [t0, t1];
  }
  // segment p->q minus every obstacle, as a list of [ta,tb] visible spans
  function visibleSpans(p, q, obs) {
    var cut = [];
    for (var i = 0; i < obs.length; i++) { var c = clipT(p, q, obs[i]); if (c) cut.push(c); }
    cut.sort(function (a, b) { return a[0] - b[0]; });
    var spans = [], t = 0;
    for (var j = 0; j < cut.length; j++) {
      if (cut[j][0] > t) spans.push([t, cut[j][0]]);
      if (cut[j][1] > t) t = cut[j][1];
    }
    if (t < 1) spans.push([t, 1]);
    return spans;
  }
  function inObstacle(x, y, obs) {
    for (var i = 0; i < obs.length; i++) { var o = obs[i]; if (x > o.x && x < o.r && y > o.y && y < o.b) return true; }
    return false;
  }

  var BAYER = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ'];
  var OBSTACLES = {
    home: {
      block: '#nm-made .index-feature,#nm-made .idx-view-all,.nm-tag,.nm-brands-marquee,.nm-svc-showcase,.nm-sites-grid,.nm-bh-plate text,.atl-reticle text',
      text: '#about p,#contact p,#contact footer'
    },
    about: {
      block: '.about-tag,.about-actions a,.about-product,.about-process-list li,.about-resume-content > section,.nm-bh-plate text',
      text: '.about-intro h1,.about-intro-copy p,.about-meta,.about-focus h2,.about-focus p,.about-section-top h2,.about-section-top a,.about-resume-heading h2,.nm-footer-cta,.nm-footer-meta'
    },
    index: { block: '#main.grid,.nm-bh-plate text', text: '.foot-cta p,.foot-bar' }
  };
  // reseau crosses only avoid the text itself, so the grid shows between words
  var CROSS_OBS = {
    home: '#nm-made .index-feature,#nm-made .idx-view-all,#about p,.nm-tag,.nm-brands-marquee,.nm-svc-number,.nm-svc-title,.nm-svc-mark,.nm-svc-visual,.nm-svc-copy,.atl-cat,.nm-site-num,.nm-site-name,.nm-site-host,.nm-site-arrow,.nm-site-preview-toggle,.nm-site-inline-preview,.nm-bh,#contact p,#contact footer',
    about: '.about-intro h1,.about-intro-copy p,.about-actions a,.about-tag,.about-meta,.about-focus h2,.about-focus p,.about-product,.about-section-top h2,.about-section-top a,.about-process-list h3,.about-process-list p,.about-number,.about-resume h2,.about-resume h3,.about-resume h4,.about-resume p,.about-resume li,.nm-bh,.nm-footer-cta,.nm-footer-meta',
    index: '#main.grid,.foot-cta p,.foot-bar,.nm-bh'
  };

  // Anchors for the constellation, per page, in document px. Each: {x,y,mag,bayer,kind}
  function anchors(W) {
    var pts = [], narrow = W < 768, b = 0;
    function tagStar(tag) {
      if (!tag) return null;
      var r = docRect(tag);
      return { x: Math.min(W - 18, r.r + (narrow ? 16 : 26)), y: r.y + r.h / 2, mag: 3.2, bayer: BAYER[b++], kind: 'anchor', tag: tag };
    }
    function push(p) { if (p) pts.push(p); }
    if (PAGE === 'home') {
      var va = $('#nm-made .idx-view-all'), st = $('#about .text-heading-xl p') || $('#about .text-heading-xl');
      if (va) { var r1 = docRect(va); push({ x: narrow ? W * 0.8 : r1.r + W * 0.12, y: r1.y + r1.h / 2 + (narrow ? 44 : 10), mag: 2.2 }); }
      if (st) {
        var r2 = docRect(st);
        push({ x: narrow ? W * 0.86 : Math.min(W - 60, r2.r + W * 0.08), y: r2.y + (narrow ? -34 : 26), mag: 3.4, bayer: BAYER[b++], kind: 'anchor' });
      }
      push(tagStar($('#nm-brands .nm-tag')));
      push(tagStar($('#nm-services .nm-tag')));
      push(tagStar($('#nm-sites .nm-tag')));
    } else if (PAGE === 'about') {
      $$('.about-tag').forEach(function (t) { push(tagStar(t)); });
    } else {
      var grid = $('#main.grid'), rh = grid ? docRect(grid) : null;
      if (rh) {
        push({ x: W * (narrow ? 0.3 : 0.16), y: Math.max(104, rh.y - 30), mag: 2.6, bayer: BAYER[b++], kind: 'anchor' });
        push({ x: W * (narrow ? 0.62 : 0.7), y: Math.max(112, rh.y - 58), mag: 1.7 });
      }
    }
    var bh = $('.nm-bh');
    // the hole's centre and world unit (its box is 26.4 units wide, see nm-blackhole.js)
    if (bh) { var rb = docRect(bh); push({ x: rb.x + rb.w / 2, y: rb.y + rb.h * 0.5, kind: 'hole', ry: rb.h * 0.3, u: rb.w / 26.4 }); }
    return weave(pts, W);
  }
  // Between anchors that are far apart, add a star in the widest empty band
  // between them, alternating sides, so the figure zigzags through the gaps.
  function weave(pts, W) {
    var out = [], side = 0, r = rng(57);
    for (var i = 0; i < pts.length; i++) {
      out.push(pts[i]);
      var a = pts[i], c = pts[i + 1];
      if (!c || c.y - a.y < 260 || c.kind === 'hole' && i === 0) continue;
      var lo = a.y + 30, hi = (c.kind === 'hole' ? c.y - c.ry * 1.6 : c.y) - 30;
      var spans = [];
      obstacles.forEach(function (o) { if (o.b > lo && o.y < hi) spans.push([Math.max(lo, o.y), Math.min(hi, o.b)]); });
      spans.sort(function (p, q) { return p[0] - q[0]; });
      var best = null, y = lo;
      for (var j = 0; j <= spans.length; j++) {
        var end = j < spans.length ? spans[j][0] : hi;
        if (end - y > 40 && (!best || end - y > best[1] - best[0])) best = [y, end];
        if (j < spans.length) y = Math.max(y, spans[j][1]);
      }
      if (!best) continue;
      var ax = (a.x + c.x) / 2, toRight = ax < W * 0.5 ? 1 : 0;
      if (side++ % 2) toRight = 1 - toRight;
      out.push({ x: W * (toRight ? 0.62 + r() * 0.24 : 0.2 + r() * 0.2), y: (best[0] + best[1]) / 2 + (r() - 0.5) * Math.min(30, (best[1] - best[0]) * 0.3), mag: 1.5 + r() * 1.1 });
    }
    return out;
  }

  function buildPlate() {
    if (!document.body) return;
    var W = root.clientWidth, H = Math.max(document.body.offsetHeight, window.innerHeight);
    if (!plate) {
      plate = el('div', 'atl-plate');
      document.body.appendChild(plate);
    }
    plate.style.height = H + 'px';
    var narrow = W < 768;
    var OB = OBSTACLES[PAGE], padB = narrow ? 8 : 12;
    obstacles = collectObstacles(OB.block, padB).concat(collectObstacles(OB.text, narrow ? 7 : 10, true));
    var crossObs = collectObstacles(CROSS_OBS[PAGE], 4);
    var out = [];
    var G = geom(W), step = G.step, R0 = G.R0, PX = G.PX, PY = G.PY;
    var grat = [], cross = [], labels = [];
    var k0 = 0, k1 = Math.ceil((H + 200) / step);
    function rAt(k) { return R0 + k * step; }
    for (var k = k0; k <= k1; k++) {
      var r = rAt(k), xa = -20, xb = W + 20;
      if (r <= Math.abs(PX - xa)) continue;
      var ya = PY + Math.sqrt(r * r - (xa - PX) * (xa - PX)), yb = PY + Math.sqrt(r * r - (xb - PX) * (xb - PX));
      grat.push('M' + xa + ' ' + ya.toFixed(1) + 'A' + r.toFixed(1) + ' ' + r.toFixed(1) + ' 0 0 0 ' + xb + ' ' + yb.toFixed(1));
    }
    // meridians, with intermediate ones added as they fan apart
    var dTh = G.dTh, rEnd = R0 + H + 300, thMax = Math.asin(Math.min(1, (W * 0.7) / R0));
    var mer = [];
    for (var lvl = 0; lvl < 3; lvl++) {
      var dt = dTh / Math.pow(2, lvl), rStart = lvl === 0 ? R0 : step * 1.3 * Math.pow(2, lvl) / (dTh * 2);
      if (rStart > rEnd) break;
      for (var j = -60; j <= 60; j++) {
        if (lvl > 0 && j % 2 === 0) continue;
        var th = j * dt;
        if (Math.abs(th) > thMax) continue;
        var ra = Math.max(R0, rStart);
        mer.push({ th: th, r0: ra, lvl: lvl, j: j });
        grat.push('M' + (PX + ra * Math.sin(th)).toFixed(1) + ' ' + (PY + ra * Math.cos(th)).toFixed(1) +
          'L' + (PX + rEnd * Math.sin(th)).toFixed(1) + ' ' + (PY + rEnd * Math.cos(th)).toFixed(1));
      }
    }
    // constellation anchors, and a plate caption in each tagged section's row
    var pts = anchors(W), captions = [], ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'], pl = 0;
    if (W >= 1024) {
      pts.forEach(function (p) {
        if (!p.tag) return;
        var sec = p.tag.closest('section') || p.tag.parentElement, rs = docRect(sec);
        var top = radec(W * 0.5, rs.y, W), bot = radec(W * 0.5, rs.b, W);
        var cx = W - 36, cy = p.y + 4, box = { x: cx - 190, y: cy - 22, r: cx + 8, b: cy + 14 };
        pl++;
        if (hits(box, obstacles)) return;
        captions.push({ x: cx, y: cy, n: ROMAN[pl - 1] || '', d: top.dec.slice(0, 3) + '°  —  ' + bot.dec.slice(0, 3) + '°' });
        obstacles.push({ x: cx - 200, y: cy - 30, r: cx + 30, b: cy + 30 });
      });
    }
    // reseau crosses at intersections (skipped behind content)
    var arm = narrow ? 3 : 4;
    for (var kk = k0; kk <= k1; kk++) {
      var rr = rAt(kk);
      for (var m = 0; m < mer.length; m++) {
        if (rr < mer[m].r0) continue;
        var x = PX + rr * Math.sin(mer[m].th), y = PY + rr * Math.cos(mer[m].th);
        if (x < 14 || x > W - 14 || y < 0 || y > H) continue;
        if (inObstacle(x, y, crossObs)) continue;
        cross.push('M' + (x - arm).toFixed(1) + ' ' + y.toFixed(1) + 'h' + 2 * arm + 'M' + x.toFixed(1) + ' ' + (y - arm).toFixed(1) + 'v' + 2 * arm);
      }
      // declination label near the right edge, where the arc has room
      if (kk % 2 === 0 && !narrow) {
        var lx = W - 34, dy2 = lx - PX;
        if (rr > Math.abs(dy2)) {
          var ly = PY + Math.sqrt(rr * rr - dy2 * dy2);
          var dec = 86 - kk;
          var txt = (dec > 0 ? '+' : dec < 0 ? '−' : '') + Math.abs(dec) + '°';
          if (ly > 120 && ly < H - 20 && !inObstacle(lx - 18, ly - 10, obstacles) && !inObstacle(lx, ly - 10, obstacles)) {
            labels.push({ x: lx, y: ly - 5, t: txt });
          }
        }
      }
    }
    // neatline: a graduated border down both edges
    var nl = [], fill = [], e1 = narrow ? 4.5 : 6.5, e2 = narrow ? 0 : 10.5;
    nl.push('M' + e1 + ' 0V' + H + 'M' + (W - e1) + ' 0V' + H);
    if (e2) {
      nl.push('M' + e2 + ' 0V' + H + 'M' + (W - e2) + ' 0V' + H);
      var seg = step / 4;
      for (var yy = 0, n = 0; yy < H; yy += seg, n++) {
        if (n % 2) fill.push('M' + e1 + ' ' + yy.toFixed(1) + 'h' + (e2 - e1) + 'v' + seg.toFixed(1) + 'h' + (e1 - e2) + 'Z' +
          'M' + (W - e2) + ' ' + yy.toFixed(1) + 'h' + (e2 - e1) + 'v' + seg.toFixed(1) + 'h' + (e1 - e2) + 'Z');
      }
    } else {
      for (var y3 = 0; y3 < H; y3 += step / 2) nl.push('M' + e1 + ' ' + y3.toFixed(1) + 'h4M' + (W - e1) + ' ' + y3.toFixed(1) + 'h-4');
    }
    // constellation
    var lines = [], stars = [], tags = [], fall = '';
    for (var i = 0; i < pts.length - 1; i++) {
      var p = pts[i], q = pts[i + 1];
      var gp = p.kind === 'hole' ? 0 : starR(p) + 6, gq = q.kind === 'hole' ? 0 : starR(q) + 6;
      if (q.kind === 'hole') q = { x: q.x + q.u * 0.6, y: q.y - q.u * 4.7, kind: 'hole' };
      var len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len < gp + gq + 4) continue;
      var ux = (q.x - p.x) / len, uy = (q.y - p.y) / len;
      var A = { x: p.x + ux * gp, y: p.y + uy * gp }, B = { x: q.x - ux * gq, y: q.y - uy * gq };
      // the star's own pill (its section tag) never hides the link leaving it
      var spans = visibleSpans(A, B, obstacles.filter(function (o) { return !(p.tag && o.x <= p.x && o.r >= p.x - 30 && o.y <= p.y && o.b >= p.y); }));
      spans.forEach(function (sp) {
        var L = (sp[1] - sp[0]) * len, ends = sp[0] === 0 || sp[1] === 1;
        if (L < (ends ? 14 : 36)) return;
        var x0 = A.x + (B.x - A.x) * sp[0], y0 = A.y + (B.y - A.y) * sp[0], x1 = A.x + (B.x - A.x) * sp[1], y1 = A.y + (B.y - A.y) * sp[1];
        var d = 'M' + x0.toFixed(1) + ' ' + y0.toFixed(1) + 'L' + x1.toFixed(1) + ' ' + y1.toFixed(1);
        // the last link runs into the black hole and fades out in its glow
        if (q.kind === 'hole' && sp[1] === 1) {
          fall = '<linearGradient id="atl-fall" gradientUnits="userSpaceOnUse" x1="' + x0.toFixed(1) + '" y1="' + y0.toFixed(1) + '" x2="' + x1.toFixed(1) + '" y2="' + y1.toFixed(1) + '">' +
            '<stop offset="0" stop-color="#E9B4A3" stop-opacity=".34"/><stop offset=".55" stop-color="#E9B4A3" stop-opacity=".3"/><stop offset="1" stop-color="#E3837A" stop-opacity="0"/></linearGradient>' +
            '<path class="fall" d="' + d + '"/>';
          return;
        }
        lines.push(d);
      });
    }
    pts.forEach(function (p) {
      if (p.kind === 'hole') return;
      var R = starR(p);
      stars.push('<circle class="g" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (R * 5).toFixed(1) + '"/>' +
        '<circle class="s" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + R.toFixed(2) + '"/>');
      if (p.kind === 'anchor') {
        var a = R + 5, b2 = R + 11;
        stars.push('<path class="x" d="M' + (p.x - b2) + ' ' + p.y + 'H' + (p.x - a) + 'M' + (p.x + a) + ' ' + p.y + 'H' + (p.x + b2) +
          'M' + p.x + ' ' + (p.y - b2) + 'V' + (p.y - a) + 'M' + p.x + ' ' + (p.y + a) + 'V' + (p.y + b2) + '"/>');
      }
      if (p.bayer) tags.push('<text class="b" x="' + (p.x + R + 7).toFixed(1) + '" y="' + (p.y - R - 5).toFixed(1) + '">' + p.bayer + '</text>');
    });
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<defs><radialGradient id="atl-sg"><stop offset="0" stop-color="#E9B4A3" stop-opacity=".55"/><stop offset=".35" stop-color="#E3837A" stop-opacity=".16"/><stop offset="1" stop-color="#CA5855" stop-opacity="0"/></radialGradient></defs>' +
      '<path class="grat" d="' + grat.join('') + '"/>' +
      '<path class="res" d="' + cross.join('') + '"/>' +
      '<path class="nl" d="' + nl.join('') + '"/>' +
      (fill.length ? '<path class="nlf" d="' + fill.join('') + '"/>' : '') +
      '<path class="con" d="' + lines.join('') + '"/>' + (fall ? '<defs>' + fall.split('<path')[0] + '</defs><path' + fall.split('<path')[1] : '') +
      stars.join('') + tags.join('') + captions.map(function (c) {
        return '<text class="pc" x="' + c.x + '" y="' + c.y.toFixed(1) + '" text-anchor="end"><tspan class="pl">Pl. ' + c.n + '</tspan>   ' + c.d + '</text>';
      }).join('') + labels.map(function (l) {
        return '<text class="d" x="' + l.x + '" y="' + l.y.toFixed(1) + '" text-anchor="end">' + l.t + '</text>';
      }).join('') + '</svg>';
    plate.innerHTML = svg;
    if (PAGE === 'home') paintHeroGrat(W, { grat: grat.join(''), res: cross.join(''), nl: nl.join(''), nlf: fill.join('') }, labels);
  }

  // The hero shows the sky through the NM mark's surroundings: the same plate
  // the page scrolls onto, as it sits at the top, painted once into an image
  // the hero samples (hidden once the hero has been scrolled past).
  function paintHeroGrat(W, d, labels) {
    var vw = window.innerWidth, vh = window.innerHeight;
    if (!heroGrat) heroGrat = { el: el('div', 'atl-herograt') };
    if (!heroGrat.el.parentNode) document.body.appendChild(heroGrat.el);
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var c = document.createElement('canvas');
    c.width = Math.round(vw * dpr); c.height = Math.round(vh * dpr);
    var g = c.getContext('2d');
    if (!g || typeof Path2D !== 'function') return;
    g.scale(dpr, dpr);
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(188,211,224,.085)'; g.stroke(new Path2D(d.grat));
    g.strokeStyle = 'rgba(237,225,204,.24)'; g.stroke(new Path2D(d.res));
    g.strokeStyle = 'rgba(237,225,204,.22)'; g.stroke(new Path2D(d.nl));
    if (d.nlf) { g.fillStyle = 'rgba(237,225,204,.13)'; g.fill(new Path2D(d.nlf)); }
    g.font = '400 9.5px "Geist Mono", ui-monospace, monospace';
    g.fillStyle = 'rgba(188,211,224,.5)'; g.textAlign = 'right';
    // keep clear of the hero's corner captions (DESIGN & MANUFACTURING / SCROLL DOWN)
    labels.forEach(function (l) { if (l.y < vh - 96) g.fillText(l.t, l.x, l.y); });
    swapImg(heroGrat, c);
  }
  function starR(p) { return 0.9 + (p.mag || 2) * 0.62; }
  // Conic projection: parallels are arcs around a pole far above the page,
  // meridians radiate from it. One parallel per degree; meridians every 20m.
  function geom(W) {
    var narrow = W < 768, step = narrow ? 118 : W > 1700 ? 176 : 156, R0 = Math.max(2400, W * 2.7);
    return { step: step, R0: R0, PX: W * 0.58, PY: -R0 + 40, dTh: step * 1.3 / R0 };
  }
  // Plate coordinates of a document point, as catalogue text.
  function radec(x, y, W) {
    var G = geom(W), r = Math.hypot(x - G.PX, y - G.PY), th = Math.atan2(x - G.PX, y - G.PY);
    var dec = 86 - (r - G.R0) / G.step, ra = ((2 + th / G.dTh / 3) % 24 + 24) % 24;
    var rh = Math.floor(ra), rm = Math.floor((ra - rh) * 60);
    var dd = Math.floor(Math.abs(dec)), dm = Math.floor((Math.abs(dec) - dd) * 60);
    return { ra: ('0' + rh).slice(-2) + 'h' + ('0' + rm).slice(-2) + 'm', dec: (dec < 0 ? '−' : '+') + ('0' + dd).slice(-2) + '°' + ('0' + dm).slice(-2) + '′' };
  }

  /* ------------------------------------------------------- page annotations */
  // Services: each service is paired with a Messier object (real J2000 positions).
  var MESSIER = [
    ['M42', '05h35m', '−05°23′'], ['M45', '03h47m', '+24°07′'], ['M31', '00h43m', '+41°16′'],
    ['M1', '05h35m', '+22°01′'], ['M51', '13h30m', '+47°12′'], ['M104', '12h40m', '−11°37′']
  ];
  function annotateServices() {
    $$('#nm-services .nm-svc-trigger').forEach(function (b, i) {
      if (b.querySelector('.atl-cat') || !MESSIER[i]) return;
      var m = MESSIER[i], s = el('span', 'atl-cat');
      s.innerHTML = '<b>' + m[0] + '</b><span>' + m[1] + ' ' + m[2] + '</span>';
      var mark = b.querySelector('.nm-svc-mark');
      b.insertBefore(s, mark || null);
    });
  }
  // Live sites: a catalogue of known worlds. Each gets a designation (a planet
  // of the NM catalogue) and a position written exactly like the header's own
  // coordinates ("37.9497° N 27.3639° E"), so the list reads as places found.
  function annotateSites() {
    $$('#nm-sites .nm-site').forEach(function (a, i) {
      var host = a.querySelector('.nm-site-host');
      if (!host || host.hasAttribute('data-atl-cat')) return;
      var r = rng(31 + i * 7), lat = (r() * 2 - 1) * 68, lon = (r() * 2 - 1) * 179;
      var pos = Math.abs(lat).toFixed(4) + '° ' + (lat < 0 ? 'S' : 'N') + ' ' + Math.abs(lon).toFixed(4) + '° ' + (lon < 0 ? 'W' : 'E');
      var id = 'NM-' + ('0' + (i + 1)).slice(-2) + ' b';
      host.setAttribute('data-atl-cat', id + '   ' + pos);
      // phones show it under the name, as a two-line label
      var name = a.querySelector('.nm-site-name');
      if (name) name.setAttribute('data-atl-cat', id + '\n' + pos);
      a.classList.add('atl-world');
    });
  }
  // Gallery: plate numbers revealed on hover/focus.
  function annotateGallery() {
    var tiles = $$('#main.grid .tile');
    tiles.forEach(function (t, i) {
      if (t.querySelector('.atl-pl')) return;
      var s = el('span', 'atl-pl', t);
      s.innerHTML = '<i>Pl.</i> ' + ('00' + (i + 1)).slice(-3);
    });
  }

  /* ---------------------------------------------------------- halos per page */
  var halos = [];
  function placeHalos() { for (var i = 0; i < halos.length; i++) halos[i].place(); }
  function servicesHalos() {
    var sc = $('#nm-services .nm-svc-showcase');
    if (!sc) return;
    // Inside each panel, before its image: the panel is display:contents on
    // desktop (the halo is then placed against the showcase) and a positioned
    // flex column on phones.
    $$('.nm-svc-panel', sc).forEach(function (panel, i) {
      var v = panel.querySelector('.nm-svc-visual');
      if (!v || panel.querySelector('.atl-halo')) return;
      halos.push(new Halo(v, panel, { r: 18, heat: 0.84, seed: 4 + i, cls: 'atl-halo--svc', before: v }));
    });
    syncSvc();
  }
  // Site previews: the desktop cursor panel uses one halo image through a CSS
  // variable (the panel is created lazily by nm-sites.js); tap previews on
  // phones get a halo element when they open.
  function siteHalos() {
    var pw = Math.max(380, window.innerWidth * 380 / 1920), ph = pw * 10 / 16, m = 92;
    haloURL(Math.round(pw), Math.round(ph), { m: m, r: 17, heat: 0.88, seed: 12, scale: haloScale(pw, ph, m) }, function (url) {
      root.style.setProperty('--atl-peek-halo', 'url(' + url + ')');
      root.style.setProperty('--atl-peek-m', m + 'px');
    });
    var list = $('#nm-sites');
    if (!list) return;
    list.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.nm-site-preview-toggle');
      if (!b) return;
      setTimeout(function () {
        var entry = b.closest('.nm-site-entry'), panel = entry && entry.querySelector('.nm-site-inline-preview');
        if (!panel || panel.hidden) return;
        var h = entry.__atlHalo;
        if (!h) {
          entry.classList.add('atl-halo-host');
          h = entry.__atlHalo = new Halo(panel, entry, { r: 18, heat: 0.84, seed: 40, m: 56, before: panel, cls: 'atl-halo--site' });
          halos.push(h);
        }
        h.place();
      }, 60);
    });
  }
  function syncSvc() {
    var sc = $('#nm-services .nm-svc-showcase');
    if (!sc) return;
    halos.forEach(function (h) {
      if (!h.e.classList.contains('atl-halo--svc')) return;
      var item = h.t.closest('.nm-svc-item');
      h.e.classList.toggle('is-on', !!(item && item.classList.contains('is-open')));
      h.e.classList.toggle('is-hot', h.t.matches(':hover'));
    });
  }
  function staticHalo(sel, host, o) {
    var t = $(sel);
    if (!t) return;
    var hst = typeof host === 'string' ? $(host) : host || t.parentElement;
    if (!hst) return;
    if (getComputedStyle(hst).position === 'static') hst.style.position = 'relative';
    hst.classList.add('atl-halo-host');
    halos.push(new Halo(t, hst, o));
  }

  // One floating halo that follows hovered tiles (gallery wall, home collage).
  function hoverHalo(scope, tileSel, host, opts) {
    var hh = null, cur = null;
    function show(tile) {
      if (!hh) {
        hh = el('i', 'atl-halo atl-halo--float', host);
      }
      cur = tile;
      var r = tile.getBoundingClientRect(), hr = host.getBoundingClientRect();
      var m = marginFor(r.width, r.height);
      var s = hh.style;
      var scale = opts.scaleOf ? opts.scaleOf() : 1;
      s.left = ((r.left - hr.left) / scale - m).toFixed(1) + 'px';
      s.top = ((r.top - hr.top) / scale - m).toFixed(1) + 'px';
      s.width = (r.width / scale + 2 * m).toFixed(1) + 'px';
      s.height = (r.height / scale + 2 * m).toFixed(1) + 'px';
      var w = Math.round(r.width / scale / 8) * 8, h = Math.round(r.height / scale / 8) * 8, src = srcOf(tile);
      var key = w + 'x' + h + ':' + src;
      tile.classList.add('atl-lit');
      hh.classList.remove('is-on');
      haloURL(w, h, { m: m, r: 0, heat: 0.9, seed: 21, scale: haloScale(w, h, m), src: src }, function (url) {
        if (cur !== tile) return;
        if (hh.getAttribute('data-k') !== key) { hh.style.backgroundImage = 'url(' + url + ')'; hh.setAttribute('data-k', key); }
        requestAnimationFrame(function () { if (cur === tile) hh.classList.add('is-on'); });
      });
    }
    function hide(tile) {
      if (tile) tile.classList.remove('atl-lit');
      if (cur === tile) { cur = null; if (hh) hh.classList.remove('is-on'); }
    }
    scope.addEventListener('pointerover', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (opts.when && !opts.when()) return;
      var t = e.target.closest && e.target.closest(tileSel);
      if (t && t !== cur) { if (cur) hide(cur); show(t); }
    });
    scope.addEventListener('pointerout', function (e) {
      var t = e.target.closest && e.target.closest(tileSel);
      if (!t) return;
      if (e.relatedTarget && t.contains(e.relatedTarget)) return;
      hide(t);
    });
    window.addEventListener('scroll', function () { if (cur && opts.hideOnScroll) hide(cur); }, { passive: true });
  }

  /* -------------------------------------------------------------- hero reticle
     The NM mark is catalogued like a galaxy on a finder chart: a dashed extent
     ellipse, crosshair ticks from the frame edges, and a catalogue label. It
     fades out within the first moments of the hero scroll. */
  var reticle = null;
  function buildReticle() {
    if (PAGE !== 'home') return;
    var W = window.innerWidth, H = window.innerHeight, narrow = W < 768;
    if (!reticle) {
      reticle = el('div', 'atl-reticle');
      document.body.appendChild(reticle);
      var onScroll = function () {
        var p = +window.__nmHeroProgress || 0;
        var o = 1 - smooth(0.004, 0.06, p);
        if (o !== reticle.__o) { reticle.__o = o; reticle.style.opacity = o.toFixed(3); reticle.style.visibility = o < 0.01 ? 'hidden' : ''; }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    // mark extent measured from the live hero at these viewports
    var mw = narrow ? W * 0.6 : Math.min(W * 0.394, H * 0.63), mh = mw * 0.5;
    var cx = W / 2, cy = narrow ? H * 0.438 : H * 0.5;
    var ex = mw * 0.58, ey = mh * 0.8, g = narrow ? 16 : 26;
    var t = [];
    // crosshair ticks pointing in from the extent ellipse
    t.push('M' + (cx - ex - g - (narrow ? 26 : 60)) + ' ' + cy + 'H' + (cx - ex - g));
    t.push('M' + (cx + ex + g) + ' ' + cy + 'H' + (cx + ex + g + (narrow ? 26 : 60)));
    t.push('M' + cx + ' ' + (cy - ey - g - (narrow ? 20 : 44)) + 'V' + (cy - ey - g));
    t.push('M' + cx + ' ' + (cy + ey + g) + 'V' + (cy + ey + g + (narrow ? 20 : 44)));
    // scale ticks along the horizontal hair
    var ticks = [];
    for (var i = 1; i <= 4; i++) {
      var dx = ex + g + i * (narrow ? 6 : 14);
      ticks.push('M' + (cx - dx) + ' ' + (cy - 3) + 'v6M' + (cx + dx) + ' ' + (cy - 3) + 'v6');
    }
    var rd = radec(cx, cy, root.clientWidth || W);
    var lx = narrow ? cx + 10 : cx + ex * 0.72, ly = narrow ? cy - ey - g - 6 : cy - ey - 16;
    reticle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<ellipse class="e" cx="' + cx + '" cy="' + cy + '" rx="' + (ex + g * 0.5).toFixed(1) + '" ry="' + (ey + g * 0.5).toFixed(1) + '"/>' +
      '<path class="h" d="' + t.join('') + '"/><path class="k" d="' + ticks.join('') + '"/>' +
      '<path class="l" d="M' + (lx - 6).toFixed(1) + ' ' + (ly + 8).toFixed(1) + 'L' + (lx + 18).toFixed(1) + ' ' + (ly - 14).toFixed(1) + 'H' + (lx + (narrow ? 70 : 96)).toFixed(1) + '"/>' +
      '<text class="c" x="' + (lx + 20).toFixed(1) + '" y="' + (ly - 19).toFixed(1) + '"><tspan class="b">NM 1</tspan></text>' +
      '<text class="n" x="' + (lx + 20).toFixed(1) + '" y="' + (ly - 1).toFixed(1) + '"><tspan class="g">α</tspan> ' + rd.ra + '  <tspan class="g">δ</tspan> ' + rd.dec + '</text>' +
      '</svg>';
  }

  // Home collage: the work emits light from its lower edge into the dark below.
  var made = null;
  function collageGlow() {
    var grid = $('#nm-made .index-feature');
    if (!grid) return;
    if (!made) made = el('i', 'atl-halo atl-halo--edge', grid);
    // the tiles' lower edge (the grid also holds the "View all" row)
    var w = grid.offsetWidth, h = 0;
    $$('.idx-cell', grid).forEach(function (c) { h = Math.max(h, c.offsetTop + c.offsetHeight); });
    if (w < 50 || h < 50) return;
    var m = window.innerWidth < 768 ? 90 : 140;
    var s = made.style;
    s.left = -m + 'px'; s.width = (w + 2 * m) + 'px'; s.top = h + 'px'; s.height = m + 'px';
    var key = w + 'x' + h;
    if (made.getAttribute('data-k') === key) return;
    made.setAttribute('data-k', key);
    haloURL(w, h, { m: m, r: 0, heat: 0.56, seed: 17, scale: Math.min(1, window.devicePixelRatio || 1), crop: [0, h + m, w + 2 * m, m] }, function (url) {
      made.style.backgroundImage = 'url(' + url + ')';
      made.classList.add('is-ready');
    });
  }

  /* ----------------------------------------------------------------- lightbox */
  var lbHalo = null;
  function lightboxHalo(img) {
    var fig = img.closest('figure');
    if (!fig) return;
    if (!lbHalo || !fig.contains(lbHalo.e)) {
      fig.classList.add('atl-halo-host');
      lbHalo = new Halo(img, fig, { r: 18, heat: 0.72, seed: 33, before: fig.firstChild, cls: 'atl-halo--lb' });
    }
    lbHalo.key = '';
    lbHalo.place();
  }

  /* -------------------------------------------------------------------- mount */
  var mounted = false;
  function mount() {
    if (mounted || !document.body) return;
    mounted = true;
    idle(paintGround, 300);
    if (PAGE === 'home') {
      annotateServices();
      annotateSites();
      buildReticle();
      servicesHalos();
      siteHalos();
      collageGlow();
      var feat = $('#nm-made .index-feature');
      if (feat) {
        hoverHalo(feat, '.idx-cell', feat, {
          when: function () { return root.classList.contains('nm-past-hero'); },
          scaleOf: function () { var r = feat.getBoundingClientRect(); return r.width / Math.max(1, feat.offsetWidth); }
        });
      }
      var sc = $('#nm-services .nm-svc-showcase');
      if (sc) {
        sc.addEventListener('click', function () { setTimeout(function () { syncSvc(); placeHalos(); }, 30); });
        sc.addEventListener('pointerover', syncSvc);
        sc.addEventListener('pointerout', syncSvc);
        sc.addEventListener('focusin', function () { setTimeout(syncSvc, 30); });
        sc.addEventListener('keyup', function () { setTimeout(syncSvc, 30); });
      }
    } else if (PAGE === 'about') {
      staticHalo('.about-product img', '.about-product', { r: 18, heat: 0.88, seed: 7, cls: 'atl-halo--capped' });
    } else {
      annotateGallery();
      var grid = $('#main.grid');
      if (grid) {
        // halos near the edges must not widen the page: a zero-height,
        // x-clipped container at the document origin holds the float halo
        var fh = el('div', 'atl-float-host');
        document.body.appendChild(fh);
        hoverHalo(grid, '.tile', fh, { hideOnScroll: false });
      }
    }
    // lightbox (index): the full image gets its halo once it has loaded
    document.addEventListener('load', function (e) {
      var t = e.target;
      if (t && t.tagName === 'IMG' && t.closest && t.closest('.nm-lb')) requestAnimationFrame(function () { lightboxHalo(t); });
    }, true);
    var relayout = debounce(function () {
      paintGround();
      buildPlate();
      placeHalos();
      if (PAGE === 'home') { buildReticle(); collageGlow(); }
    }, 160);
    window.addEventListener('resize', relayout, { passive: true });
    if (typeof ResizeObserver === 'function') {
      var lastH = 0;
      new ResizeObserver(function () {
        var h = document.body.offsetHeight;
        if (Math.abs(h - lastH) < 2) return;
        lastH = h; relayout();
      }).observe(document.body);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    idle(function () { buildPlate(); placeHalos(); }, 400);
  }
  // inspection hook for reviewing the direction (no behaviour depends on it)
  window.NMAtlas = { page: PAGE, renderHalo: renderHalo, rebuild: function () { buildPlate(); placeHalos(); } };
  var ready = window.__nmReady || function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  };
  ready(mount);
})();
