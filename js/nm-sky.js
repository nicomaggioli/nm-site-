/* Night sky engine v3 for the ?theme=stars preview. Brief: docs/night-sky.md.

   The live site, unchanged, over a sky you float in. The sky is no longer glued to the
   page: a camera drifts in space behind the content, and scrolling flies it.

   The camera.
     - Float: with no input it drifts very slowly (a bounded sway in heading and pitch, a
       slow roll) while it glides through the nearby stars, as if weightless.
     - Spin: the scroll position is the camera's target along a path through the real sky
       (VIEWS: keyframes of view centre and roll, about half a turn of roll over a page).
       The camera follows that target with critically damped inertia and a cap on its
       angular speed, so it glides, settles when scrolling stops, and never whips.
     - Depth: the real catalogue sky (and the Milky Way) is the far layer, at infinity;
       nearer stars live in a wrapped volume around the camera at every depth, so when the
       camera moves they parallax against the far sky (and the camera orbits a point ahead
       of it when it turns, so turning shows depth too).
     - Into the logo (homepage): through the hero zoom (window.__nmHeroProgress 0 -> 1) the
       camera dollies toward the centre of the NM mark: the near stars stream outward and
       swell, the far sky widens a little. Scrolling back reverses it.
   Layers, all on one fixed WebGL canvas (NMSky.canvas, sampled by the homepage hero
   outside the NM mark):
     - The Milky Way: a faint veil, baked once into a cube map (the band, star clouds, the
       Great Rift and other dust lanes, a few small nebulae) and sampled through the camera
       each frame at a quarter of its old strength, nearly colourless with a hint of amber
       toward the core; never above the AA contrast limit behind any text (a page-length
       mask of every line of text).
     - Its grain: tens of thousands of unresolved faint stars, placed by the band's density.
     - The stars: every catalogue star with V <= 6 (media/sky/stars.json, BSC5) as point
       sprites with a pixel-integrated core (crisp and steady while moving at any DPR),
       colour from B-V, and scintillation for the brighter ones.
     - The near volume: faint procedural stars at finite depth.
   NMSky.fx: a fixed 2D overlay for the rare events and the hover reticle.
   The footer NM constellation (the Cloud Run door) stays on its own canvas in the footer
   and scrolls with it; the sky behind it is quieted so the mark reads first.
   Events (subtle, in open sky, riding with the sky): a shooting star 10-20 s after
   arriving, then every 40-80 s; a satellite every 1.5-3 min; the UFO first after 1-2 min,
   then every 5-8 min. Add ?sky=show to see each within the first few seconds.

   window.NMSky
     .canvas        the fixed sky canvas (WebGL; 2D without it)
     .fx            the fixed overlay (events, reticle)
     .page          'home' | 'about' | 'index'
     .trigger(kind) 'meteor' | 'satellite' | 'ufo': start one now
     .set(opts)     { brightness, twinkle, veil, motion } live multipliers (1 = default)
     .debug()       camera, featured-star positions and open-sky tests, events, timings
     .at(y)         where the featured stars sit with the camera settled at scroll y
     .openSky(x,y)  true when nothing but sky is painted at that viewport point

   Budget: one fullscreen pass and a few thousand points per frame; display rate while the
   camera glides, ~30 fps while it only floats; stops in hidden tabs and while Cloud Run
   is open; one still frame (no float, spin, dolly or events) under prefers-reduced-motion. */
(function () {
  'use strict';
  if (window.NMSky) return;

  var root = document.documentElement;
  var DEG = Math.PI / 180;
  var MAG_DYN = 4.0;                    // brighter than this (and every featured star): scintillates
  var MAG_OWN = 2.0;                    // brighter than this: flares rather than just brightens
  var SHOW = /[?&]sky=show\b/.test(location.search);
  var CROP = { x: 57, y: 159, w: 406, h: 202 };   // the NM mark's box in textures/nm-mark-sdf.png
  var ASPECT = CROP.w / CROP.h;

  /* ------------------------------------------------------------------ the paths
     keys: [scroll fraction, view centre RA h, Dec deg, roll deg (0 = north up, east left)].
     fov: degrees across the viewport's long side. float: drift amplitude. phone: < 600 px. */
  var VIEWS = {
    home: {
      // Orion's belt behind the logo (Sirius below, Aldebaran above), the dolly into it;
      // Orion, Canis Major and Taurus while the big statement scrolls; then south along the
      // winter Milky Way through Puppis and Vela to Carina and the Southern Cross at the footer.
      desk: { fov: 72, float: 1, keys: [[0, 5.62, -1.2, 0], [0.166, 5.8, -3, 24], [0.3, 6.1, -6, 52], [0.42, 6.0, -5, 72], [0.56, 7.0, -22, 98], [0.72, 8.5, -40, 128], [0.86, 10.0, -52, 156], [1, 11.0, -58, 180]] },
      phone: { fov: 74, float: 1, keys: [[0, 5.62, -1.2, 0], [0.13, 5.8, -3, 20], [0.24, 6.1, -6, 42], [0.36, 6.0, -5, 64], [0.52, 7.0, -22, 94], [0.7, 8.5, -40, 126], [0.86, 10.0, -52, 156], [1, 11.0, -58, 180]] }
    },
    about: {
      // Cepheus and northern Cygnus at the top, the Summer Triangle through the middle,
      // down Aquila to the galactic core in Sagittarius, a gentle glow behind the footer.
      desk: { fov: 72, float: 1, keys: [[0, 21.4, 57, 0], [0.25, 20.6, 44, 40], [0.5, 19.6, 28, 84], [0.72, 19.2, 10, 124], [1, 18.1, -24, 172]] },
      phone: { fov: 74, float: 1, keys: [[0, 21.4, 57, 0], [0.25, 20.6, 44, 40], [0.5, 19.6, 28, 84], [0.72, 19.2, 10, 124], [1, 18.1, -24, 172]] }
    },
    index: {
      // Polaris in the band above the image wall; the wall hides the turn; the Big Dipper
      // (Dubhe, Mizar and Alcor) and Thuban circle above the NM in the footer.
      desk: { fov: 72, float: 0.45, keys: [[0, 3.6, 66, -24], [0.5, 9.0, 60, 70], [0.94, 12.6, 38, 160], [1, 12.6, 38, 166]] },
      phone: { fov: 74, float: 0.45, keys: [[0, 3.6, 66, -24], [0.5, 9.0, 60, 70], [0.94, 12.6, 38, 160], [1, 12.6, 38, 166]] }
    }
  };
  var CAP = 34;            // deg/s: the most the camera turns (roll plus pan) while gliding
  var DOLLY = 0.3;         // near-volume units travelled through the hero zoom
  var FWD = 0.000028;      // near-volume units per px of scroll (a slow approach)
  var LEVER = 0.14;        // the camera orbits a point this far ahead when it turns
  var DRIFT = 0.0032;      // near-volume units per second while floating

  /* Small nebulae on the way, galactic [l, b, radius deg, strength]: soft and nearly grey. */
  var NEBULAE = [
    [209.0, -19.4, 0.45, 1.2],   // Orion Nebula: a small knot in the sword
    [287.6, -0.6, 1.0, 1.0],     // Carina Nebula
    [6.0, -1.2, 0.7, 0.8],       // Lagoon
    [15.1, -0.7, 0.4, 0.45],     // Omega
    [85.6, -0.7, 1.3, 0.35]      // North America
  ];

  /* The NM constellation, in texture pixels of nm-mark-sdf.png: [x, y, V, B-V]. */
  var NM_STARS = [
    [95, 196, 1.0, 0.05], [95, 320, 1.5, 1.10], [206, 196, 0.7, -0.08], [204, 320, 1.3, 0.30],
    [315, 194, 1.9, 0.90], [315, 318, 0.5, 0.00], [424, 196, 1.2, 1.45], [424, 320, 1.6, 0.15],
    [97, 262, 3.0, 0.40], [205, 262, 3.2, 0.90], [315, 258, 3.3, 0.20], [424, 262, 2.9, 0.60],
    [112, 214, 2.6, 0.20], [216, 224, 2.7, 1.20], [408, 222, 2.6, 0.50],
    [76, 186, 4.0, 0.50], [78, 330, 3.9, 1.00], [110, 306, 4.3, 0.30],
    [222, 180, 4.1, 0.60], [188, 334, 3.8, 0.10], [222, 306, 4.4, 0.80],
    [300, 182, 4.5, 0.40], [296, 330, 3.6, 1.30], [336, 330, 3.9, 0.00],
    [440, 184, 4.1, 0.10], [442, 332, 4.0, 0.90]
  ];
  var NM_LINES = [[0, 12], [12, 8], [8, 1], [12, 3], [2, 13], [13, 9], [9, 3], [13, 5],
    [4, 10], [10, 5], [6, 14], [14, 11], [11, 7], [14, 5]];
  var NM_LABEL = { name: 'NM', designation: 'Nico Maggioli', coords: '42.3601° N · 71.0589° W', distance: 'Boston, MA', fact: '' };

  var api = window.NMSky = { canvas: null, fx: null, page: null, version: 3 };
  var opts = { brightness: 1, twinkle: 1, veil: 1, motion: 1 };

  /* ------------------------------------------------------------------ helpers */
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function hash(n) {
    n = Math.imul(n ^ 0x27d4eb2d, 0x165667b1); n ^= n >>> 15;
    n = Math.imul(n, 0x85ebca6b); n ^= n >>> 13;
    n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  }
  function noise(x) {   // smooth 1D value noise in -1..1
    var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), a = hash(i | 0), b = hash((i + 1) | 0);
    return (a + (b - a) * u) * 2 - 1;
  }
  function vnoise3(x, y, z) {   // smooth 3D value noise in -1..1
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    var h = function (a, b, c) { return hash(Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)); };
    var l = function (a, b, t) { return a + (b - a) * t; };
    var r = l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
    return r * 2 - 1;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function parseRgba(c) {
    var m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    var p = m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  function alphaOf(c) {
    if (!c || c === 'transparent') return 0;
    var p = parseRgba(c);
    return p ? p[3] : 1;
  }
  function mq(q) { try { return matchMedia(q); } catch (e) { return { matches: false }; } }
  var reduceQ = mq('(prefers-reduced-motion: reduce)');
  var fineQ = mq('(hover: hover) and (pointer: fine)');
  function gameOpen() { return root.classList.contains('nm-run-open'); }
  function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function lum(r, g, b) { return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
  var GROUND = 10, L_GROUND = lum(GROUND, GROUND, GROUND);
  function bumpJ(x, c, w) { var d = (x - c) / w; return Math.exp(-d * d); }
  function sech2J(x) { var e = Math.exp(-2 * Math.abs(x)); return 4 * e / ((1 + e) * (1 + e)); }

  /* ------------------------------------------------------------- star colour */
  // B-V -> effective temperature (Ballesteros 2012) -> sRGB (Helland's blackbody fit)
  function bvRgb(bv) {
    bv = clamp(bv, -0.4, 2.0);
    var T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)), t = T / 100, r, g, b;
    if (t <= 66) {
      r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661;
      b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    } else {
      r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
      g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); b = 255;
    }
    r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
    var m = Math.max(r, g, b);
    return [r / m, g / m, b / m];
  }
  // the eye sees faint stars nearly colourless and bright ones with a clear tint
  function satOf(m) { return 0.2 + 0.52 * clamp((4.5 - m) / 5.5, 0, 1); }
  function starRgb(bv, m) {
    var c = bvRgb(bv), s = satOf(m), o = [1 + (c[0] - 1) * s, 1 + (c[1] - 1) * s, 1 + (c[2] - 1) * s];
    var mx = Math.max(o[0], o[1], o[2]);
    return [o[0] / mx, o[1] / mx, o[2] / mx];
  }

  /* -------------------------------------------------------- brightness model */
  // Peak of the core (0..1, may exceed 1 for the brightest, whose cores saturate and so
  // read larger). V 6 is barely there on the #0a0a0a ground; V 1.3 reaches white.
  function peakOf(m) { return 0.112 * Math.pow(10, -0.2 * (m - 6)); }
  // Point-spread profile in CSS px: a crisp core, a soft wing that gives the brighter
  // stars presence, and a faint wide halo on the brightest (glare, as the eye sees it).
  // (The GPU evaluates the same profile: PSF_GLSL.)
  function profile(m) {
    var k = clamp(4.2 - m, 0, 5.8);
    return { sc: 0.3 + 0.04 * k, w: m < 4.2 ? Math.min(0.55, 0.1 * Math.pow(k, 1.2)) : 0, sw: 0.55 + 0.2 * k,
      ha: m < 3 ? Math.min(0.18, 0.045 * (3 - m)) : 0, hr: 2.4 + 1.2 * (3 - m) };
  }

  /* ------------------------------------------------------------ sphere maths */
  function unit(raH, decD) {
    var a = raH * 15 * DEG, d = decD * DEG, cd = Math.cos(d);
    return [cd * Math.cos(a), cd * Math.sin(a), Math.sin(d)];
  }
  // J2000 equatorial -> galactic (rows); its transpose takes galactic back
  var GAL = [[-0.0548755604, -0.8734370902, -0.4838350155], [0.4941094279, -0.4448296300, 0.7469822445], [-0.8676661490, -0.1980763734, 0.4559837762]];
  function galUnit(l, b) {
    var cb = Math.cos(b * DEG);
    return [cb * Math.cos(l * DEG), cb * Math.sin(l * DEG), Math.sin(b * DEG)];
  }
  function gal2eq(l, b) {
    var g = galUnit(l, b);
    return [GAL[0][0] * g[0] + GAL[1][0] * g[1] + GAL[2][0] * g[2], GAL[0][1] * g[0] + GAL[1][1] * g[1] + GAL[2][1] * g[2], GAL[0][2] * g[0] + GAL[1][2] * g[1] + GAL[2][2] * g[2]];
  }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { var n = Math.sqrt(dot(a, a)) || 1; return [a[0] / n, a[1] / n, a[2] / n]; }

  /* -------------------------------------------------------------------- state */
  var S = {
    page: null, ready: false, mounted: false, data: null, cat: null,
    vw: 0, vh: 0, dpr: 1, W: 0, H: 0, phone: false,
    t: 0, last: 0, lastDraw: 0, running: false, raf: 0, still: false, shown: false,
    R: 0, docH: 0, maxY: 1, sig: '', featured: [], nm: null, nmBox: null, foot: 0,
    pointer: { x: -1e4, y: -1e4, fine: false },
    stats: { frames: 0, draws: 0, ms: 0, worst: 0, since: 0, drawMs: 0 }
  };
  var canvas, fx, fxc, atlas;

  /* ------------------------------------------------------------------- camera */
  var PATH = { keys: null, fov: 72, float: 1, max: 1 };
  var CAM = {
    y: 0, vy: 0, yPrev: null, hp: 0, vhp: 0, init: false, t: 0,
    P: [0.371, 0.613, 0.187], Pe: [0, 0, 0],
    f: [1, 0, 0], r: [0, -1, 0], u: [0, 0, 1], M: new Float32Array(9),
    cx: 0, cy: 0, F: 1, zoom: 1, roll: 0
  };
  function viewCfg() {
    var c = VIEWS[S.page] || VIEWS.home;
    return S.vw < 600 && c.phone ? c.phone : c.desk;
  }
  function buildPath() {
    var cfg = viewCfg(), max = Math.max(1, S.maxY);
    PATH.keys = cfg.keys.map(function (k) { return { y: k[0] * max, v: unit(k[1], k[2]), roll: k[3] }; });
    PATH.fov = cfg.fov; PATH.float = cfg.float == null ? 1 : cfg.float; PATH.max = max;
  }
  // the view centre and roll at scroll y: a cubic Hermite spline through the keys, in y
  function pathAt(y, out) {
    var K = PATH.keys, n = K.length, i = 0;
    if (n === 1 || y <= K[0].y) { out.v = K[0].v.slice(); out.roll = K[0].roll; return out; }
    if (y >= K[n - 1].y) { out.v = K[n - 1].v.slice(); out.roll = K[n - 1].roll; return out; }
    while (i < n - 2 && y >= K[i + 1].y) i++;
    var a = K[i], b = K[i + 1], pa = K[i - 1] || a, nb = K[i + 2] || b, h = b.y - a.y, s = (y - a.y) / h;
    var ka = h / (b.y - pa.y || 1), kb = h / (nb.y - a.y || 1);
    var s2 = s * s, s3 = s2 * s, h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    var v = [0, 0, 0];
    for (var j = 0; j < 3; j++) v[j] = h00 * a.v[j] + h10 * (b.v[j] - pa.v[j]) * ka + h01 * b.v[j] + h11 * (nb.v[j] - a.v[j]) * kb;
    out.v = norm(v);
    out.roll = h00 * a.roll + h10 * (b.roll - pa.roll) * ka + h01 * b.roll + h11 * (nb.roll - a.roll) * kb;
    return out;
  }
  // degrees of turn (roll and pan) per px of scroll around y
  var tmpA = { v: null, roll: 0 }, tmpB = { v: null, roll: 0 };
  function degPerPx(y) {
    pathAt(y, tmpA); pathAt(y + 8, tmpB);
    var c = clamp(dot(tmpA.v, tmpB.v), -1, 1);
    return (Math.acos(c) / DEG + Math.abs(tmpB.roll - tmpA.roll)) / 8;
  }
  // camera axes for a view centre, roll and a small heading/pitch offset (north up at roll 0)
  function orient(f, roll, yaw, pitch, o) {
    var z = Math.abs(f[2]) > 0.995 ? [1, 0, 0] : [0, 0, 1], d = dot(f, z);
    var u = norm([z[0] - f[0] * d, z[1] - f[1] * d, z[2] - f[2] * d]), r = cross(f, u);
    if (yaw || pitch) {
      f = norm([f[0] + r[0] * yaw + u[0] * pitch, f[1] + r[1] * yaw + u[1] * pitch, f[2] + r[2] * yaw + u[2] * pitch]);
      var du = dot(u, f);
      u = norm([u[0] - f[0] * du, u[1] - f[1] * du, u[2] - f[2] * du]); r = cross(f, u);
    }
    var c = Math.cos(roll), s = Math.sin(roll);
    o.f = f;
    o.r = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s];
    o.u = [u[0] * c - r[0] * s, u[1] * c - r[1] * s, u[2] * c - r[2] * s];
    return o;
  }
  function heroY() { return S.vh * (S.vw < S.vh ? 0.44 : 0.486); }
  function floatAt(t, k) {
    return {
      yaw: k * DEG * 3.4 * (0.72 * Math.sin(t * 0.0648 + 0.3) + 0.28 * Math.sin(t * 0.170 + 2.1)),
      pitch: k * DEG * 2.6 * (0.72 * Math.sin(t * 0.0757 + 1.7) + 0.28 * Math.sin(t * 0.2167 + 0.4)),
      roll: k * 10 * (0.8 * Math.sin(t * 0.044 + 4.2) + 0.2 * Math.sin(t * 0.1337 + 0.9))
    };
  }
  function camStep(dt) {
    var target = S.still ? 0 : clamp(window.scrollY || 0, 0, S.maxY);
    if (!CAM.init || S.still) { CAM.y = target; CAM.vy = 0; }
    else if (dt > 0) {
      // critically damped follow; the angular speed is capped so a fling becomes a glide
      var rate = degPerPx(CAM.y), cap = rate > 1e-6 ? CAP / rate : 1e6, W0 = 3.2;
      var n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
      for (var i = 0; i < n; i++) {
        var acc = W0 * W0 * (target - CAM.y) - 2 * W0 * CAM.vy;
        CAM.vy = clamp(CAM.vy + acc * h, -cap, cap);
        CAM.y += CAM.vy * h;
      }
      if (Math.abs(target - CAM.y) < 0.05 && Math.abs(CAM.vy) < 0.5) { CAM.y = target; CAM.vy = 0; }
    }
    var dy = CAM.yPrev == null ? 0 : CAM.y - CAM.yPrev;
    CAM.yPrev = CAM.y;
    // the hero dolly follows the logo zoom closely
    var hpT = S.page === 'home' && !S.still ? clamp(+window.__nmHeroProgress || 0, 0, 1) : 0, hp0 = CAM.hp;
    if (!CAM.init || S.still) { CAM.hp = hpT; CAM.vhp = 0; }
    else if (dt > 0) {
      var W1 = 7, m = Math.max(1, Math.ceil(dt / 0.012)), k = dt / m;
      for (var j = 0; j < m; j++) { CAM.vhp += (W1 * W1 * (hpT - CAM.hp) - 2 * W1 * CAM.vhp) * k; CAM.hp += CAM.vhp * k; }
      if (Math.abs(hpT - CAM.hp) < 1e-4 && Math.abs(CAM.vhp) < 1e-3) { CAM.hp = hpT; CAM.vhp = 0; }
    }
    var dh = CAM.hp - hp0;
    CAM.init = true;
    if (!S.still) CAM.t += dt;
    var fk = S.still ? 0 : PATH.float * opts.motion, fl = floatAt(CAM.t, fk);
    pathAt(CAM.y, tmpA);
    CAM.roll = tmpA.roll + fl.roll;
    orient(tmpA.v, CAM.roll * DEG, fl.yaw, fl.pitch, CAM);
    var hp = clamp(CAM.hp, 0, 1);
    CAM.zoom = 1 + 0.16 * hp * hp * (3 - 2 * hp);
    CAM.F = Math.max(S.vw, S.vh) / 2 / Math.tan(PATH.fov * DEG / 2) * CAM.zoom;
    var heroW = S.page === 'home' && S.R > 0 ? 1 - smooth(S.R, S.R + S.vh * 0.4, CAM.y) : 0;
    CAM.cx = S.vw / 2; CAM.cy = S.vh / 2 + (heroY() - S.vh / 2) * heroW;
    // the near volume: the dolly, a slow approach as you scroll, and the drift
    var f = CAM.f, adv = dh * DOLLY + dy * FWD, P = CAM.P, t = CAM.t;
    var dd = norm([Math.sin(t * 0.023 + 1) + 1.1 * f[0], Math.sin(t * 0.031 + 2.3) + 1.1 * f[1], Math.sin(t * 0.019 + 4.1) + 1.1 * f[2]]);
    var dr = S.still ? 0 : DRIFT * fk * dt;
    for (var q = 0; q < 3; q++) {
      P[q] += f[q] * adv + dd[q] * dr;
      P[q] -= Math.floor(P[q]);
      var pe = P[q] - f[q] * LEVER;
      CAM.Pe[q] = pe - Math.floor(pe);
    }
    var M = CAM.M, r = CAM.r, u = CAM.u;
    M[0] = r[0]; M[1] = r[1]; M[2] = r[2]; M[3] = u[0]; M[4] = u[1]; M[5] = u[2]; M[6] = f[0]; M[7] = f[1]; M[8] = f[2];
  }
  function project(d, c) {
    c = c || CAM;
    var z = dot(d, c.f);
    if (z < 0.05) return null;
    return { x: c.cx + dot(d, c.r) / z * c.F, y: c.cy - dot(d, c.u) / z * c.F };
  }
  function unproject(x, y) {
    var X = (x - CAM.cx) / CAM.F, Y = (CAM.cy - y) / CAM.F;
    return norm([X * CAM.r[0] + Y * CAM.u[0] + CAM.f[0], X * CAM.r[1] + Y * CAM.u[1] + CAM.f[1], X * CAM.r[2] + Y * CAM.u[2] + CAM.f[2]]);
  }
  function camGlides() { return Math.abs(CAM.vy) > 1.5 || Math.abs(CAM.vhp) > 0.002; }

  /* ------------------------------------------------------------------ sprites */
  // 2D sprites, for the footer constellation, the events and the no-WebGL fallback.
  // Binned sprites (V >= 2) in one atlas: 22 magnitude bins x 8 colour bins. Each is
  // rendered 1.35x brighter than its bin's brightest member so twinkle can lift it.
  var SB = 22, CBN = 8, HEAD = 1.35;
  function mLo(b) { return -1.75 + b * 0.5; }
  function mBin(m) { return clamp(Math.floor((m + 1.75) / 0.5), 0, SB - 1); }
  function cBin(bv) { return clamp(Math.floor((bv + 0.4) / 0.3), 0, CBN - 1); }
  function renderSprite(m, bv, peakScale, haloOnly, tint) {
    var d = S.dpr, pf = profile(m), sc = pf.sc * d, sw = pf.sw * d, hr = pf.hr * d;
    var peak = peakOf(m) * peakScale;
    var R = Math.max(1, Math.ceil(Math.max(sc * 2.8, pf.w ? sw * 3 : 0, pf.ha ? hr * 3.2 : 0)));
    var s = 2 * R + 1, c = document.createElement('canvas');
    c.width = c.height = s;
    var x = c.getContext('2d'), img = x.createImageData(s, s), px = img.data;
    var rgb = tint || starRgb(bv, m), i = 0;
    for (var yy = -R; yy <= R; yy++) {
      for (var xx = -R; xx <= R; xx++, i += 4) {
        var r2 = xx * xx + yy * yy, v = haloOnly ? 0 : peak * Math.exp(-r2 / (2 * sc * sc));
        if (pf.w) v += pf.w * peakScale * Math.exp(-r2 / (2 * sw * sw));
        if (pf.ha) { var q = 1 + r2 / (hr * hr); v += pf.ha * peakScale * (haloOnly ? 1.6 : 1) / (q * q); }
        v = Math.min(1, v);
        px[i] = 255 * rgb[0]; px[i + 1] = 255 * rgb[1]; px[i + 2] = 255 * rgb[2]; px[i + 3] = Math.round(255 * v);
      }
    }
    x.putImageData(img, 0, 0);
    return { img: c, sx: 0, sy: 0, s: s, R: R };
  }
  function buildAtlas() {
    var list = [], ax = 0, ay = 0, rowH = 0, AW = 512;
    for (var b = 0; b < SB; b++) {
      for (var c = 0; c < CBN; c++) {
        var sp = renderSprite(mLo(b), -0.25 + c * 0.3, HEAD, false, null);
        if (ax + sp.s > AW) { ax = 0; ay += rowH + 1; rowH = 0; }
        sp.sx = ax; sp.sy = ay; ax += sp.s + 1; rowH = Math.max(rowH, sp.s);
        list.push(sp);
      }
    }
    var cv = document.createElement('canvas');
    cv.width = AW; cv.height = ay + rowH + 1;
    var x = cv.getContext('2d');
    list.forEach(function (sp) { x.drawImage(sp.img, sp.sx, sp.sy); sp.img = cv; });
    // tinted cores for the colour flashes of the brightest stars: blue, red, green
    var flash = [[0.55, 0.72, 1], [1, 0.5, 0.38], [0.62, 1, 0.68]].map(function (t) { return renderSprite(1.2, 0, 1, false, t); });
    atlas = { canvas: cv, bins: list, flash: flash, own: {} };
  }
  function binSprite(m, bv) { return atlas.bins[mBin(m) * CBN + cBin(bv)]; }
  function baseAlpha(m) { return peakOf(m) / (peakOf(mLo(mBin(m))) * HEAD); }
  function ownSprite(m, bv) {
    var key = m.toFixed(2) + '/' + bv.toFixed(2);
    return atlas.own[key] || (atlas.own[key] = { core: renderSprite(m, bv, 1, false, null), flare: renderSprite(m, bv, 1, true, null) });
  }
  function blit(c, sp, xd, yd, a) {
    if (a <= 0.004) return;
    c.globalAlpha = a > 1 ? 1 : a;
    c.drawImage(sp.img, sp.sx, sp.sy, sp.s, sp.s, xd - sp.R, yd - sp.R, sp.s, sp.s);
  }

  /* ----------------------------------------------------------------- twinkle */
  function twinkle(t, r1, r2, o1, o2, depth) {
    if (S.still) return 1;
    var n = 0.62 * noise(t * r1 + o1) + 0.38 * noise(t * r2 + o2);
    return 1 + depth * opts.twinkle * n * 1.3;
  }
  // one star on a 2D canvas: binned sprites carry headroom, own sprites dip and flare
  function drawOne(c, sp, m, xd, yd, a, tw, t, o3) {
    if (sp.core) {
      blit(c, sp.core, xd, yd, a * Math.min(1, tw));
      if (tw > 1) blit(c, sp.flare, xd, yd, a * (tw - 1) * 1.6);
      if (m < 0.6 && !S.still) {   // chromatic scintillation of the brightest
        var k = clamp((0.6 - m) / 2, 0, 1), n = noise(t * 2.6 + o3), n2 = noise(t * 1.7 + o3 * 1.3);
        if (Math.abs(n) > 0.3) blit(c, atlas.flash[n > 0 ? 0 : 1], xd, yd, (Math.abs(n) - 0.3) * 0.55 * k * a);
        if (n2 > 0.55) blit(c, atlas.flash[2], xd, yd, (n2 - 0.55) * 0.6 * k * a);
      }
    } else blit(c, sp, xd, yd, a * tw);
  }
  var FLASH = [[0.55, 0.72, 1], [1, 0.5, 0.38], [0.62, 1, 0.68]];

  /* --------------------------------------------------------------------- data */
  function detectPage() {
    if (document.body && document.body.classList.contains('nm-about-page')) return 'about';
    if (document.querySelector('footer .foot-mark')) return 'index';
    return 'home';
  }
  function ingest(cat, d) {
    var st = cat.stars || [], list = [];
    for (var i = 0; i + 3 < st.length; i += 4) {
      if (!isFinite(st[i]) || !isFinite(st[i + 1]) || !isFinite(st[i + 2])) continue;
      list.push({ u: unit(+st[i], +st[i + 1]), m: +st[i + 2], bv: isFinite(st[i + 3]) ? +st[i + 3] : 0.6, f: -1 });
    }
    var feats = (d && d.featured || []).slice(0, 4);
    feats.forEach(function (f, k) {
      f.u = unit(+f.ra, +f.dec);
      var hit = null;
      for (var j = 0; j < list.length; j++) {
        var s = list[j];
        if (s.u[0] * f.u[0] + s.u[1] * f.u[1] + s.u[2] * f.u[2] > 0.999998) { hit = s; break; }
      }
      if (!hit) { hit = { u: f.u, m: +f.vmag, bv: f.bv == null ? 0.6 : +f.bv, f: -1 }; list.push(hit); }
      hit.f = k; f.rec = hit;
    });
    var R = rng(1979);
    list.forEach(function (s) {
      var rate = 0.75 + 1.5 * R();
      s.r1 = rate; s.r2 = rate * (2.2 + 0.9 * R());
      s.o1 = R() * 4000; s.o2 = R() * 4000; s.o3 = R() * 4000;
      s.depth = 0.08 + 0.34 * clamp((MAG_DYN + 0.6 - s.m) / 6, 0, 1);
      s.rgb = starRgb(s.bv, s.m);
    });
    S.cat = list; S.featured = feats; S.data = d;
    S.dyn = list.filter(function (s) { return s.m < MAG_DYN || s.f >= 0; });
    S.stat = list.filter(function (s) { return !(s.m < MAG_DYN || s.f >= 0); });
  }
  /* The Milky Way's density of unresolved stars (galactic l in -180..180, b): the band,
     its clouds, the bulge, the dust lanes that hide it. Places the grain. */
  function mwDensity(l, b, g) {
    var al = Math.abs(l);
    var A = 0.17 + 0.16 * bumpJ(al, 180, 35) + 0.12 * bumpJ(l, 138, 26) + 0.14 * bumpJ(l, 108, 14) + 0.55 * bumpJ(l, 76, 14) +
      0.36 * bumpJ(l, 50, 13) + 0.6 * bumpJ(l, 27, 8) + 0.45 * bumpJ(l, 12, 6) + 0.95 * bumpJ(l, 3, 12) + 0.5 * bumpJ(l, -22, 16) + 0.35 * bumpJ(l, -70, 25);
    var wd = 2.4 + 3.4 * bumpJ(l, 0, 32) + 1.4 * bumpJ(l, 72, 22) + 0.7 * bumpJ(al, 180, 40);
    var n = 0.65 * vnoise3(g[0] * 7 + 3, g[1] * 7 - 1, g[2] * 12 + 5) + 0.35 * vnoise3(g[0] * 19, g[1] * 19 + 7, g[2] * 30 - 2);
    var clouds = smooth(-0.5, 0.6, n);
    var disk = A * sech2J(b / wd) * (0.35 + 0.95 * clouds);
    var bulge = 0.6 * Math.exp(-(l * l + (b + 3.2) * (b + 3.2) * 1.45) / (2 * 9.5 * 9.5)) * (0.6 + 0.6 * clouds);
    var wing = (0.16 * A + 0.24 * bumpJ(l, 0, 38)) * Math.exp(-b * b / (2 * 225));
    var rc = 1.5 + 2.8 * smooth(85, 0, l), rw = 1.3 + 3.3 * smooth(80, 0, l);
    var eRift = 0.95 * smooth(98, 83, l) * smooth(-14, -2, l) * Math.exp(-Math.pow((b - rc) / rw, 2));
    var eLane = 0.6 * Math.exp(-Math.pow(b / 1.3, 2)) * (0.35 + 0.65 * bumpJ(l, 10, 95));
    var T = 1 - 0.85 * Math.min(1, eRift + eLane * 0.8);
    return (disk + bulge) * T + wing * 0.45 + 0.03;
  }
  // [x, y, z, V, r, g, b] per point
  function makeGrain(n) {
    var R = rng(4242), out = new Float32Array(n * 7), k = 0, tries = 0;
    while (k < n && tries < n * 80) {
      tries++;
      var near = R() < 0.75, sb = near ? (R() * 2 - 1) * 0.5 : R() * 2 - 1;
      var q = Math.abs(sb) < 0.5 ? 0.875 : 0.125;
      var l = R() * 360 - 180, b = Math.asin(sb) / DEG, g = galUnit(l, b);
      if (R() * 2.6 > mwDensity(l, b, g) * 0.875 / q) continue;
      var u = gal2eq(l, b), m = 6.3 + 2.3 * Math.pow(R(), 0.6);
      var bv = 0.3 + R() * 0.8 + 0.35 * bumpJ(l, 0, 45) * R();
      var c = starRgb(bv, m + 1);
      out.set([u[0], u[1], u[2], m, c[0], c[1], c[2]], k * 7);
      k++;
    }
    return out.subarray(0, k * 7);
  }
  // [x, y, z (0..1 in the wrapped volume), V at the reference depth, r, g, b, rate, phase]
  function makeNear(n) {
    var R = rng(777), out = new Float32Array(n * 9);
    for (var i = 0; i < n; i++) {
      var x = R(), M = R() < 0.03 ? 3.6 + R() * 1.2 : 4.9 + 2.4 * Math.pow(R(), 0.7);
      var p = R(), bv = p < 0.18 ? R() * 0.4 : p < 0.82 ? 0.45 + R() * 0.75 : 1.2 + R() * 0.4;
      var c = starRgb(bv, M);
      out.set([x, R(), R(), M, c[0], c[1], c[2], 0.6 + R() * 1.6, R() * 6.283], i * 9);
    }
    return out;
  }

  /* ------------------------------------------------------------------- layout */
  function heroGeometry() {
    var hero = document.querySelector('main > section.h-svh');
    return hero ? { R: hero.offsetHeight } : null;
  }
  function docHeight() { return Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0); }
  function relayout(force) {
    if (!S.cat) return;
    measure();
    var hg = S.page === 'home' ? heroGeometry() : null;
    S.R = hg ? hg.R : 0;
    S.docH = docHeight();
    S.maxY = Math.max(1, S.docH - (window.innerHeight || S.vh));
    layoutFooter();
    var sig = [S.vw, S.vh, S.dpr, S.docH, S.R, S.nm && Math.round(S.nm.x), S.nm && Math.round(S.nm.y), document.body.offsetHeight].join('|');
    if (!force && sig === S.sig) return;
    S.sig = sig;
    buildPath();
    buildMask();
    kick();
  }

  /* -------------------------------------------------------- AA contrast caps */
  // For every line of text on the page: the most light the sky may add behind it so the
  // text keeps its WCAG AA contrast (4.5:1, 3:1 for large text) against the #0a0a0a
  // ground, encoded sqrt(cap / 0.2) in a page-length mask the veil reads (offset by the
  // scroll). Sticky text claims its whole sticky range; fixed text (the header) has its
  // own scrim.
  var MASK = { canvas: null, scale: 4, w: 1, h: 1, ver: 0 };
  function capOf(col, large) {
    var c = parseRgba(col);
    if (!c) return 0.2;
    var a = c[3], r = c[0] * a + GROUND * (1 - a), g = c[1] * a + GROUND * (1 - a), b = c[2] * a + GROUND * (1 - a);
    var Lt = lum(r, g, b), need = large ? 3 : 4.5;
    if (Lt < L_GROUND) return 0.2;   // darker than the ground: not a light-on-dark text
    var max = (Lt + 0.05) / need - 0.05;
    return clamp((max - L_GROUND) * 0.8, 0, 0.2);
  }
  function buildMask() {
    var maxTex = G.maxTex || 4096, L = S.docH;
    var sc = Math.max(4, Math.ceil(L / 4000), Math.ceil(L / maxTex)), w = Math.max(1, Math.ceil(S.vw / sc)), h = Math.max(1, Math.ceil(L / sc));
    var FEATHER = 30;   // CSS px of soft falloff around each line of text
    var c = MASK.canvas || (MASK.canvas = document.createElement('canvas'));
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'darken';
    var sy = window.scrollY || 0, rg = document.createRange();
    var walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), n, seen = 0;
    while ((n = walk.nextNode())) {
      if (!/\S/.test(n.data)) continue;
      var el = n.parentElement;
      if (!el || el.closest('script,style,noscript,header,.nm-hdr,.nm-sky-label,#nm-theme-pill,[aria-hidden="true"] svg')) continue;
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      var fixed = false, stickyEl = null;
      for (var p = el; p && p !== document.body; p = p.parentElement) {
        var pos = p === el ? cs.position : getComputedStyle(p).position;
        if (pos === 'fixed') { fixed = true; break; }
        if (pos === 'sticky' && !stickyEl) stickyEl = p;
      }
      if (fixed) continue;
      var fs = parseFloat(cs.fontSize) || 16, fw = +cs.fontWeight || 400;
      var cap = capOf(cs.color, fs >= 24 || (fs >= 18.66 && fw >= 700));
      if (cap >= 0.199) continue;
      var v = Math.round(255 * Math.sqrt(cap / 0.2));
      x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      var ext = null;
      if (stickyEl && stickyEl.parentElement) { var pr = stickyEl.parentElement.getBoundingClientRect(); ext = [pr.top + sy, pr.bottom + sy]; }
      rg.selectNodeContents(n);
      var rs = rg.getClientRects();
      for (var j = 0; j < rs.length; j++) {
        var r = rs[j];
        if (r.width < 1 || r.height < 1) continue;
        var pad = 8 + fs * 0.4 + FEATHER, top = r.top + sy, bot = r.bottom + sy;
        if (ext) { top = Math.min(top, ext[0]); bot = Math.max(bot, ext[1]); }
        x.fillRect((r.left - pad) / sc, (top - pad) / sc, (r.width + 2 * pad) / sc, (bot - top + 2 * pad) / sc);
        seen++;
      }
    }
    // soften the edges a little (the shader also filters linearly)
    try {
      var c2 = MASK.tmp || (MASK.tmp = document.createElement('canvas'));
      c2.width = w; c2.height = h;
      var x2 = c2.getContext('2d');
      x2.fillStyle = '#fff'; x2.fillRect(0, 0, w, h);
      x2.filter = 'blur(' + (FEATHER / 2 / sc).toFixed(2) + 'px)';
      x2.drawImage(c, 0, 0);
      x2.filter = 'none';
      x.globalCompositeOperation = 'copy';   // (without canvas filters this is the same mask, hard-edged)
      x.drawImage(c2, 0, 0);
    } catch (e) { /* the hard-edged mask still holds the limit */ }
    MASK.scale = sc; MASK.w = w; MASK.h = h; MASK.ver++; MASK.lines = seen;
  }

  /* --------------------------------------------------------------- the GPU sky */
  var G = { ok: false, gl: null, lost: false, failed: false, maxTex: 4096, maxPt: 64, P: {}, B: {}, cube: null, N: 0, fbo: null, mask: null, maskVer: -1, bake: null, veilOn: 0 };
  var NOISE_GLSL = [
    // Simplex noise 3D: Ian McEwan, Ashima Arts / Stefan Gustavson (MIT licence)
    'vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
    'vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
    'vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }',
    'vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }',
    'float snoise(vec3 v) {',
    '  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);',
    '  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);',
    '  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);',
    '  vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;',
    '  i = mod289(i);',
    '  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));',
    '  float n_ = 0.142857142857; vec3 ns = n_ * D.wyz - D.xzx;',
    '  vec4 j = p - 49.0 * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);',
    '  vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);',
    '  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);',
    '  vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));',
    '  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;',
    '  vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);',
    '  vec4 nr = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));',
    '  p0 *= nr.x; p1 *= nr.y; p2 *= nr.z; p3 *= nr.w;',
    '  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0); m = m * m;',
    '  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));',
    '}',
    'float fbm(vec3 p) { return 0.5 * snoise(p) + 0.25 * snoise(p * 2.03 + 17.1) + 0.125 * snoise(p * 4.11 - 9.7); }',
    'float fbm4(vec3 p) { return 0.5 * snoise(p) + 0.27 * snoise(p * 2.07 + 1.7) + 0.15 * snoise(p * 4.31 - 2.3) + 0.08 * snoise(p * 8.73 + 5.1); }',
    'float bump(float x, float c, float w) { float d = (x - c) / w; return exp(-d * d); }',
    'float sq(float x) { return x * x; }',
    'float sech2(float x) { float e = exp(-2.0 * abs(x)); return 4.0 * e / ((1.0 + e) * (1.0 + e)); }'
  ].join('\n');
  function nebulaGLSL() {
    return NEBULAE.map(function (n) {
      var g = galUnit(n[0], n[1]), v = 'vec3(' + g.map(function (x) { return x.toFixed(6); }).join(',') + ')';
      return '  { float d = length(g - ' + v + ') * 57.29578 / ' + n[2].toFixed(3) + '; neb += ' + n[3].toFixed(3) + ' * exp(-0.5 * d * d) * (0.65 + 0.55 * nM); }';
    }).join('\n');
  }
  /* The bake: for each texel of each cube face, the Milky Way in that direction, stored as
     r = sqrt(light / 0.6), g = warmth (the core, and where dust thins the light), b = sqrt(nebula / 0.3). */
  var BAKE_FS = [
    'precision highp float;',
    'uniform float uFace; uniform float uN; uniform mat3 uGal;',
    NOISE_GLSL,
    'void main() {',
    '  vec2 st = gl_FragCoord.xy / uN * 2.0 - 1.0; float sc = st.x, tc = st.y; vec3 dv;',
    '  if (uFace < 0.5) dv = vec3(1.0, -tc, -sc); else if (uFace < 1.5) dv = vec3(-1.0, -tc, sc);',
    '  else if (uFace < 2.5) dv = vec3(sc, 1.0, tc); else if (uFace < 3.5) dv = vec3(sc, -1.0, -tc);',
    '  else if (uFace < 4.5) dv = vec3(sc, -tc, 1.0); else dv = vec3(-sc, -tc, -1.0);',
    '  vec3 g = uGal * normalize(dv);',
    '  float b = degrees(asin(clamp(g.z, -1.0, 1.0)));',
    '  float l = degrees(atan(g.y, g.x));',
    '  float al = abs(l);',
    // structure lives on the sphere and is drawn out along the plane, as the clouds and lanes are
    '  vec3 ga = vec3(g.xy, g.z * 1.7);',
    '  vec3 warp = vec3(snoise(ga * 3.0 + 3.1), snoise(ga * 3.0 - 5.7), snoise(ga * 3.0 + 9.2));',
    '  float nC = fbm4(ga * 6.5 + warp * 0.7);',
    '  float nM = fbm(ga * 21.0 + warp * 0.8 - 4.3);',
    '  float nF = 0.5 * snoise(ga * 48.0 + warp) + 0.5 * snoise(ga * 97.0 - warp * 1.3);',
    '  vec3 gd = ga * 13.0 + warp * 1.1 + 2.0;',
    '  float dn = 0.5 * snoise(gd) + 0.26 * snoise(gd * 2.13 + 1.7) + 0.14 * snoise(gd * 4.41 - 2.3) + 0.08 * snoise(gd * 9.1 + 5.1) + 0.05 * snoise(gd * 18.7 - 7.7);',
    // the band: brightness along l, its width, the star clouds (kept low: no blooms), the bulge
    '  float A = 0.17 + 0.16 * bump(al, 180.0, 35.0) + 0.12 * bump(l, 138.0, 26.0) + 0.14 * bump(l, 108.0, 14.0)',
    '    + 0.5 * bump(l, 76.0, 14.0) + 0.32 * bump(l, 50.0, 13.0) + 0.45 * bump(l, 27.0, 8.0) + 0.35 * bump(l, 12.0, 6.0)',
    '    + 0.7 * bump(l, 3.0, 12.0) + 0.5 * bump(l, -22.0, 16.0) + 0.4 * bump(l, -70.0, 25.0);',
    '  float wd = 2.4 + 3.4 * bump(l, 0.0, 32.0) + 1.4 * bump(l, 72.0, 22.0) + 0.7 * bump(al, 180.0, 40.0);',
    '  float clouds = smoothstep(-0.55, 0.6, nC);',
    '  float disk = A * sech2((b + 0.7 * nM) / wd) * (0.45 + 0.85 * clouds) * (0.9 + 0.2 * nM) * (0.86 + 0.28 * nF);',
    '  float sc2 = 0.55 * exp(-(sq(l - 1.5) + sq(b + 4.6) * 1.3) / (2.0 * 3.4 * 3.4))',
    '    + 0.35 * exp(-(sq(l - 12.0) * 0.6 + sq(b + 0.8)) / (2.0 * 1.3 * 1.3))',
    '    + 0.4 * exp(-(sq(l - 27.5) * 0.7 + sq(b + 2.4)) / (2.0 * 2.4 * 2.4))',
    '    + 0.3 * exp(-(sq(l - 75.0) * 0.35 + sq(b - 0.8)) / (2.0 * 3.2 * 3.2));',
    '  sc2 *= 0.65 + 0.55 * clouds;',
    '  float bulge = 0.55 * exp(-(l * l + sq(b + 3.2) * 1.45) / (2.0 * 9.5 * 9.5)) * (0.6 + 0.6 * clouds);',
    '  float I = disk + bulge + sc2;',
    '  float wing = (0.16 * A + 0.2 * bump(l, 0.0, 38.0)) * exp(-b * b / (2.0 * 15.0 * 15.0));',
    // dust: an envelope for each lane, one fractal texture the envelopes eat the light with
    '  float rc = 1.5 + 2.8 * smoothstep(85.0, 0.0, l), rw = 1.3 + 3.3 * smoothstep(80.0, 0.0, l);',
    '  float eRift = 0.95 * smoothstep(98.0, 83.0, l) * smoothstep(-14.0, -2.0, l) * exp(-sq((b - rc) / rw));',
    '  float eLane = 0.6 * exp(-sq(b / 1.3)) * (0.35 + 0.65 * bump(l, 10.0, 95.0));',
    '  float eOph = (0.62 + 0.3 * nC) * exp(-(sq(l - 1.0) / (2.0 * 7.0 * 7.0) + sq(b - 6.0) / (2.0 * 4.4 * 4.4))) + 0.7 * exp(-(sq(l + 6.0) + sq(b - 16.5)) / (2.0 * 2.8 * 2.8))',
    '    + 0.45 * exp(-(sq(b - 5.0 - 0.35 * (l + 3.0)) / (2.0 * 1.6 * 1.6))) * smoothstep(-13.0, -7.0, l) * smoothstep(4.0, -1.0, l);',
    '  float eTau = 0.55 * bump(l, 170.0, 9.0) * bump(b, -15.0, 6.0) + 0.3 * bump(l, 160.0, 7.0) * bump(b, -18.0, 5.0);',
    '  float eCoal = 0.8 * exp(-(sq(l + 59.0) + sq(b + 0.9)) / (2.0 * 2.6 * 2.6));',
    '  float eCir = 0.35 * exp(-b * b / (2.0 * 12.0 * 12.0)) * smoothstep(0.15, 0.6, nC * 0.5 + 0.5 * fbm(ga * 5.0 + 7.7));',
    '  float eD = eRift + eLane + eOph + eTau + eCoal + eCir;',
    '  float dn2 = fbm(ga * 9.0 - warp * 0.8 + 11.0);',
    '  float D1 = 0.84 * smoothstep(-0.05, 0.5, dn + eD - 0.62);',
    '  float D2 = 0.5 * smoothstep(-0.35, 0.35, dn2 + 0.85 * eD - 0.38);',
    '  float Dst = 1.0 - (1.0 - D1) * (1.0 - D2);',
    '  float T = 1.0 - Dst;',
    '  float warm = bump(l, 2.0, 55.0);',
    '  float edge = clamp(Dst * (1.0 - Dst) * 4.0, 0.0, 1.0);',
    '  float neb = 0.0;',
    '__NEBULAE__',
    '  float Ib = (I * T) * 0.15 + wing * 0.06 * (1.0 - 0.6 * Dst);',
    '  float Nb = neb * (1.0 - 0.7 * Dst) * 0.1;',
    '  gl_FragColor = vec4(sqrt(clamp(Ib / 0.6, 0.0, 1.0)), clamp(warm + 0.3 * edge * warm, 0.0, 1.0), sqrt(clamp(Nb / 0.3, 0.0, 1.0)), 1.0);',
    '}'
  ].join('\n');
  var TRI_VS = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
  /* The veil: the baked Milky Way through the camera, quiet and nearly colourless; dimmed
     behind the NM constellation; held under each line of text's AA limit. */
  var VEIL_FS = [
    'precision highp float;',
    'uniform mat3 uRot; uniform vec4 uView; uniform vec2 uPP; uniform vec2 uRes;',
    'uniform samplerCube uSky; uniform float uOn; uniform vec4 uTone; uniform vec3 uWarmC;',
    'uniform sampler2D uMask; uniform vec4 uMaskInfo; uniform float uScroll; uniform vec4 uNM; uniform float uNMk;',
    'float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }',
    'vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }',
    'float lumOf(vec3 c) { return dot(toLin(c), vec3(0.2126, 0.7152, 0.0722)); }',
    'void main() {',
    '  vec3 G0 = vec3(0.0392157);',
    '  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uView.z;',
    '  vec3 add = vec3(0.0);',
    '  if (uOn > 0.001) {',
    '    vec3 d = uRot * vec3((css.x - uPP.x) / uView.w, (uPP.y - css.y) / uView.w, 1.0);',
    '    vec4 tx = textureCube(uSky, d);',
    '    float I = tx.r * tx.r * 0.6, nb = tx.b * tx.b * 0.3;',
    '    vec3 col = mix(vec3(0.86, 0.9, 1.0), uWarmC, tx.g * uTone.y);',
    '    add = I * uTone.x * col + nb * uTone.z * vec3(0.92, 0.7, 0.72);',
    '    vec2 a = smoothstep(uNM.xy - 30.0, uNM.xy + 14.0, css) * smoothstep(uNM.zw + 30.0, uNM.zw - 14.0, css);',
    '    add *= 1.0 - 0.45 * uNMk * a.x * a.y;',
    '    add = uTone.w * (vec3(1.0) - exp(-add / uTone.w)) * uOn;',
    '    if (uMaskInfo.w > 0.5) {',
    '      float mv = texture2D(uMask, vec2(css.x / uMaskInfo.x / uMaskInfo.y, (css.y + uScroll) / uMaskInfo.x / uMaskInfo.z)).r;',
    '      float cap = 0.2 * mv * mv;',
    '      if (cap < 0.199) {',
    '        float lim = cap + 0.0030353;',
    '        if (lumOf(G0 + add) > lim) {',
    '          float lo = 0.0, hi = 1.0;',
    '          for (int k = 0; k < 6; k++) { float md = 0.5 * (lo + hi); if (lumOf(G0 + add * md) > lim) hi = md; else lo = md; }',
    '          add *= lo;',
    '        }',
    '      }',
    '    }',
    '  }',
    // dither below one 8-bit step, so the faintest gradients never band
    '  gl_FragColor = vec4(G0 + add + (hash13(vec3(gl_FragCoord.xy, 7.0)) - 0.5) / 255.0, 1.0);',
    '}'
  ].join('\n');
  /* Stars as point sprites. The profile is the CPU one (profile(), peakOf()); the core is
     integrated over each device pixel, so a star moving by a fraction of a pixel keeps its
     brightness (no crawling shimmer), and the brightest saturate and read larger. */
  var PSF_GLSL = [
    'void psf(float m, float swell, float dpr, float maxPt, out vec4 A, out vec4 B) {',
    '  float k = clamp(4.2 - m, 0.0, 5.8);',
    '  float sc = (0.3 + 0.04 * k) * swell;',
    '  float w = m < 4.2 ? min(0.55, 0.1 * pow(max(k, 1e-4), 1.2)) : 0.0;',
    '  float sw = (0.55 + 0.2 * k) * swell;',
    '  float ha = m < 3.0 ? min(0.18, 0.045 * (3.0 - m)) : 0.0;',
    '  float hr = 2.4 + 1.2 * (3.0 - m);',
    '  float R = max(sc * 2.8, max(w > 0.0 ? sw * 3.0 : 0.0, ha > 0.0 ? hr * 3.2 : 0.0));',
    '  float size = min((2.0 * R + 2.0) * dpr, maxPt);',
    '  A = vec4(0.112 * pow(10.0, -0.2 * (m - 6.0)), sc * dpr, w, sw * dpr);',
    '  B = vec4(ha, hr * dpr, size, m < 2.0 ? 1.0 : 0.0);',
    '}',
    'float inNM(vec2 s, vec4 b) { vec2 a = smoothstep(b.xy - 22.0, b.xy + 6.0, s) * smoothstep(b.zw + 22.0, b.zw - 6.0, s); return a.x * a.y; }'
  ].join('\n');
  var STAR_VS = [
    'attribute vec3 aDir; attribute float aMag; attribute vec3 aCol; attribute vec4 aTw;',
    'uniform mat3 uRot; uniform vec4 uView; uniform vec2 uPP; uniform vec4 uK; uniform vec4 uNM; uniform float uNMk;',
    'varying vec3 vCol; varying vec4 vA; varying vec4 vB; varying vec4 vC;',
    PSF_GLSL,
    'void main() {',
    '  vec3 v = aDir * uRot;',
    '  float z = max(v.z, 1e-3);',
    '  vec2 s = uPP + vec2(v.x, -v.y) / z * uView.w;',
    '  psf(aMag, 1.0, uView.z, uK.z, vA, vB);',
    '  float g = uK.x * (1.0 + uK.y * (aMag >= 4.0 ? 0.45 : 0.22));',
    '  g *= mix(1.0, aMag < 4.6 ? 0.05 : 0.4, uNMk * inNM(s, uNM));',
    '  vCol = aCol * g; vC = aTw;',
    '  bool vis = v.z > 0.05 && s.x > -60.0 && s.y > -60.0 && s.x < uView.x + 60.0 && s.y < uView.y + 60.0;',
    '  gl_Position = vis ? vec4(s.x / uView.x * 2.0 - 1.0, 1.0 - s.y / uView.y * 2.0, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);',
    '  gl_PointSize = vis ? vB.z : 0.0;',
    '}'
  ].join('\n');
  var NEAR_VS = [
    'attribute vec3 aPos; attribute float aMag; attribute vec3 aCol; attribute vec2 aPh;',
    'uniform mat3 uRot; uniform vec4 uView; uniform vec2 uPP; uniform vec4 uK; uniform vec4 uNM; uniform float uNMk; uniform vec3 uCamP; uniform float uT;',
    'varying vec3 vCol; varying vec4 vA; varying vec4 vB; varying vec4 vC;',
    PSF_GLSL,
    'void main() {',
    '  vec3 p = fract(aPos - uCamP + 0.5) - 0.5;',
    '  float dist = length(p);',
    '  vec3 v = p * uRot;',
    '  float z = max(v.z, 1e-4);',
    '  vec2 s = uPP + vec2(v.x, -v.y) / z * uView.w;',
    '  float fade = smoothstep(0.5, 0.33, dist) * smoothstep(0.012, 0.05, dist);',
    '  float m = max(2.8, aMag + 1.0857 * log(dist / 0.25));',
    '  float swell = 1.0 + 0.7 * smoothstep(0.13, 0.03, dist);',
    '  psf(m, swell, uView.z, uK.z, vA, vB);',
    '  vA.x /= swell * swell;',
    '  float g = uK.x * fade * mix(1.0, 0.4, uNMk * inNM(s, uNM));',
    '  vCol = aCol * g;',
    '  vC = vec4(1.0 + 0.08 * sin(uT * aPh.x + aPh.y), 0.0, 0.0, 0.0);',
    '  bool vis = v.z > 0.004 && fade > 0.002 && s.x > -60.0 && s.y > -60.0 && s.x < uView.x + 60.0 && s.y < uView.y + 60.0;',
    '  gl_Position = vis ? vec4(s.x / uView.x * 2.0 - 1.0, 1.0 - s.y / uView.y * 2.0, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);',
    '  gl_PointSize = vis ? vB.z : 0.0;',
    '}'
  ].join('\n');
  var STAR_FS = [
    'precision highp float;',
    'varying vec3 vCol; varying vec4 vA; varying vec4 vB; varying vec4 vC;',
    'float erfA(float x) { float x2 = x * x; float e = sqrt(1.0 - exp(-x2 * (1.2732395 + 0.147 * x2) / (1.0 + 0.147 * x2))); return x < 0.0 ? -e : e; }',
    'float boxG(float x, float s) { float k = 0.70710678 / s; return 0.5 * (erfA((x + 0.5) * k) - erfA((x - 0.5) * k)); }',
    'void main() {',
    '  vec2 q = (gl_PointCoord - 0.5) * vB.z;',
    '  float s = vA.y, r2 = dot(q, q);',
    '  float core = vA.x * max(6.2831853 * s * s, 1.0) * boxG(q.x, s) * boxG(q.y, s);',
    '  float wing = vA.z * exp(-r2 / (2.0 * vA.w * vA.w));',
    '  float qq = 1.0 + r2 / (vB.y * vB.y), halo = vB.x / (qq * qq);',
    '  float win = smoothstep(0.5, 0.36, length(gl_PointCoord - 0.5));',
    '  float v = (core + wing + halo) * win;',
    '  float tw = vC.x;',
    '  float o = vB.w > 0.5 ? min(1.0, v) * min(tw, 1.0) + max(tw - 1.0, 0.0) * 1.6 * min(1.0, (wing + halo * 1.6) * win) : min(1.0, v * tw);',
    '  gl_FragColor = vec4(vCol * o + vC.yzw * min(1.0, (core + wing) * win), 1.0);',
    '}'
  ].join('\n');

  function glInit() {
    if (G.gl || G.failed) return G.ok;
    try {
      var gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true,
        preserveDrawingBuffer: S.page === 'home', powerPreference: 'default' });
      if (!gl) throw new Error('no webgl');
      G.gl = gl;
      glBuild();
      canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); G.ok = false; G.lost = true; });
      canvas.addEventListener('webglcontextrestored', function () { G.lost = false; try { glBuild(); kick(); } catch (err) { G.ok = false; } });
    } catch (err) {
      G.failed = true; G.ok = false; G.gl = null;
      console.warn('[nm-sky] WebGL sky unavailable, drawing a simpler one:', err && err.message);
    }
    return G.ok;
  }
  function glBuild() {
    var gl = G.gl;
    var sh = function (type, src) {
      var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(o));
      return o;
    };
    var prog = function (vs, fs, attrs, unis) {
      var p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      attrs.forEach(function (a, i) { gl.bindAttribLocation(p, i, a); });
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p));
      var u = {};
      unis.forEach(function (n) { u[n] = gl.getUniformLocation(p, n); });
      return { p: p, u: u, n: attrs.length };
    };
    G.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    var pr = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    G.maxPt = pr && pr[1] ? pr[1] : 64;
    var common = ['uRot', 'uView', 'uPP', 'uK', 'uNM', 'uNMk'];
    G.P.bake = prog(TRI_VS, BAKE_FS.replace('__NEBULAE__', nebulaGLSL()), ['p'], ['uFace', 'uN', 'uGal']);
    G.P.veil = prog(TRI_VS, VEIL_FS, ['p'], ['uRot', 'uView', 'uPP', 'uRes', 'uSky', 'uOn', 'uTone', 'uWarmC', 'uMask', 'uMaskInfo', 'uScroll', 'uNM', 'uNMk']);
    G.P.star = prog(STAR_VS, STAR_FS, ['aDir', 'aMag', 'aCol', 'aTw'], common);
    G.P.near = prog(NEAR_VS, STAR_FS, ['aPos', 'aMag', 'aCol', 'aPh'], common.concat(['uCamP', 'uT']));
    var buf = function (data, usage) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW); return b; };
    G.B.tri = buf(new Float32Array([-1, -1, 3, -1, -1, 3]));
    // the catalogue: faint (static) and scintillating (with a per-frame twinkle buffer)
    var pack = function (list) {
      var a = new Float32Array(list.length * 7);
      list.forEach(function (s, i) { a.set([s.u[0], s.u[1], s.u[2], s.m, s.rgb[0], s.rgb[1], s.rgb[2]], i * 7); });
      return a;
    };
    G.B.stat = buf(pack(S.stat)); G.B.statN = S.stat.length;
    G.B.dyn = buf(pack(S.dyn)); G.B.dynN = S.dyn.length;
    G.twData = new Float32Array(S.dyn.length * 4);
    G.B.tw = buf(G.twData, gl.DYNAMIC_DRAW);
    var phone = S.vw < 600, grain = makeGrain(phone ? 15000 : 26000), near = makeNear(phone ? 4200 : 7000);
    G.B.grain = buf(grain); G.B.grainN = grain.length / 7;
    G.B.near = buf(near); G.B.nearN = near.length / 9;
    // the Milky Way cube, baked a face per frame
    var N = Math.min(phone ? 512 : 1024, gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE) || 512);
    G.N = N;
    G.cube = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, G.cube);
    for (var f = 0; f < 6; f++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    G.fbo = gl.createFramebuffer();
    G.bake = { face: 0, strip: 0, strips: phone ? 2 : 4, done: false, ms: 0, at: 0 };
    G.veilOn = 0;
    G.mask = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, G.mask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    G.maskVer = -1;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    G.ok = true;
  }
  function attribs(list) {   // [loc, buffer, size, stride, offset] | [loc, null, x, y, z, w]
    var gl = G.gl;
    for (var i = 0; i < 4; i++) gl.disableVertexAttribArray(i);
    list.forEach(function (a) {
      if (a[1]) { gl.bindBuffer(gl.ARRAY_BUFFER, a[1]); gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[2], gl.FLOAT, false, a[3] * 4, a[4] * 4); }
      else gl.vertexAttrib4f(a[0], a[2], a[3], a[4], a[5]);
    });
  }
  function bakeStep() {
    var gl = G.gl, B = G.bake, P = G.P.bake, N = G.N, t0 = performance.now();
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + B.face, G.cube, 0);
    var h = Math.ceil(N / B.strips), y0 = B.strip * h;
    gl.viewport(0, 0, N, N);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0, y0, N, Math.min(h, N - y0));
    gl.disable(gl.BLEND);
    gl.useProgram(P.p);
    gl.uniform1f(P.u.uFace, B.face); gl.uniform1f(P.u.uN, N);
    gl.uniformMatrix3fv(P.u.uGal, false, [GAL[0][0], GAL[1][0], GAL[2][0], GAL[0][1], GAL[1][1], GAL[2][1], GAL[0][2], GAL[1][2], GAL[2][2]]);
    attribs([[0, G.B.tri, 2, 2, 0]]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (++B.strip >= B.strips) { B.strip = 0; B.face++; }
    if (B.face >= 6) { B.done = true; B.at = S.t; }
    B.ms += performance.now() - t0;
  }
  // per-frame scintillation (and the pointer's lift, and the colour flashes of the brightest)
  function updateTwinkle(time) {
    var d = G.twData, list = S.dyn, p = S.pointer, hov = p.fine && S.featured.length;
    for (var i = 0; i < list.length; i++) {
      var s = list[i], tw = twinkle(time, s.r1, s.r2, s.o1, s.o2, s.depth), fr = 0, fg = 0, fb = 0;
      if (hov && s.f >= 0) {   // a barely-there lift as the pointer nears a featured star
        var sp = project(s.u);
        if (sp) { var pd = Math.hypot(sp.x - p.x, sp.y - p.y); if (pd < 90) tw *= 1 + 0.3 * (1 - pd / 90); }
      }
      if (s.m < 0.6 && !S.still) {
        var k = clamp((0.6 - s.m) / 2, 0, 1), n = noise(time * 2.6 + s.o3), n2 = noise(time * 1.7 + s.o3 * 1.3);
        if (Math.abs(n) > 0.3) { var c = FLASH[n > 0 ? 0 : 1], a = (Math.abs(n) - 0.3) * 0.55 * k * peakOf(1.2) * 0.5; fr += c[0] * a; fg += c[1] * a; fb += c[2] * a; }
        if (n2 > 0.55) { var c2 = FLASH[2], a2 = (n2 - 0.55) * 0.6 * k * peakOf(1.2) * 0.5; fr += c2[0] * a2; fg += c2[1] * a2; fb += c2[2] * a2; }
      }
      var o = i * 4; d[o] = tw; d[o + 1] = fr * opts.brightness; d[o + 2] = fg * opts.brightness; d[o + 3] = fb * opts.brightness;
    }
  }
  function nmRect() {   // the constellation's box in viewport px, or far away
    var b = S.nmBox, y = window.scrollY || 0;
    return b && cons.visible ? [b[0], b[1] - y, b[2], b[3] - y] : [-1e5, -1e5, -1e5, -1e5];
  }
  function drawGL(time) {
    var gl = G.gl, u, sy = window.scrollY || 0, t0 = performance.now();
    if (G.maskVer !== MASK.ver && MASK.canvas) {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.mask);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, MASK.canvas);
      G.maskVer = MASK.ver;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, S.W, S.H);
    var view = [S.vw, S.vh, S.dpr, CAM.F], nm = nmRect(), nmk = cons.visible ? 1 : 0;
    // the veil (opaque: the ground and the Milky Way)
    if (G.bake.done) G.veilOn = S.still ? 1 : Math.min(1, G.veilOn + 0.022);
    var P = G.P.veil; u = P.u;
    gl.disable(gl.BLEND);
    gl.useProgram(P.p);
    gl.uniformMatrix3fv(u.uRot, false, CAM.M);
    gl.uniform4fv(u.uView, view); gl.uniform2f(u.uPP, CAM.cx, CAM.cy); gl.uniform2f(u.uRes, S.W, S.H);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_CUBE_MAP, G.cube); gl.uniform1i(u.uSky, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.mask); gl.uniform1i(u.uMask, 1);
    var veil = G.veilOn * opts.veil * opts.brightness;
    gl.uniform1f(u.uOn, G.bake.done ? veil : 0);
    // gain, warmth, nebulae, the soft ceiling (a gentle glow at most)
    gl.uniform4f(u.uTone, 0.3 * (1 + 0.3 * S.foot), 0.42, 0.22, 0.055);
    gl.uniform3f(u.uWarmC, 1.0, 0.86, 0.68);
    gl.uniform4f(u.uMaskInfo, MASK.scale, MASK.w, MASK.h, MASK.canvas ? 1 : 0);
    gl.uniform1f(u.uScroll, sy);
    gl.uniform4fv(u.uNM, nm); gl.uniform1f(u.uNMk, nmk);
    attribs([[0, G.B.tri, 2, 2, 0]]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // the stars, added as light
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    var br = opts.brightness, setCommon = function (u2, k) {
      gl.uniformMatrix3fv(u2.uRot, false, CAM.M);
      gl.uniform4fv(u2.uView, view); gl.uniform2f(u2.uPP, CAM.cx, CAM.cy);
      gl.uniform4f(u2.uK, k, S.foot, G.maxPt, 0);
      gl.uniform4fv(u2.uNM, nm); gl.uniform1f(u2.uNMk, nmk);
    };
    P = G.P.star; u = P.u;
    gl.useProgram(P.p);
    setCommon(u, br * 0.85 * (0.35 + 0.65 * G.veilOn));
    attribs([[0, G.B.grain, 3, 7, 0], [1, G.B.grain, 1, 7, 3], [2, G.B.grain, 3, 7, 4], [3, null, 1, 0, 0, 0]]);
    gl.drawArrays(gl.POINTS, 0, G.B.grainN);
    gl.uniform4f(u.uK, br, S.foot, G.maxPt, 0);
    attribs([[0, G.B.stat, 3, 7, 0], [1, G.B.stat, 1, 7, 3], [2, G.B.stat, 3, 7, 4], [3, null, 1, 0, 0, 0]]);
    gl.drawArrays(gl.POINTS, 0, G.B.statN);
    updateTwinkle(time);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.B.tw); gl.bufferSubData(gl.ARRAY_BUFFER, 0, G.twData);
    attribs([[0, G.B.dyn, 3, 7, 0], [1, G.B.dyn, 1, 7, 3], [2, G.B.dyn, 3, 7, 4], [3, G.B.tw, 4, 4, 0]]);
    gl.drawArrays(gl.POINTS, 0, G.B.dynN);
    P = G.P.near; u = P.u;
    gl.useProgram(P.p);
    setCommon(u, br);
    gl.uniform3fv(u.uCamP, CAM.Pe); gl.uniform1f(u.uT, time);
    attribs([[0, G.B.near, 3, 9, 0], [1, G.B.near, 1, 9, 3], [2, G.B.near, 3, 9, 4], [3, G.B.near, 2, 9, 7]]);
    gl.drawArrays(gl.POINTS, 0, G.B.nearN);
    S.stats.drawMs += performance.now() - t0;
  }
  // without WebGL: the brighter catalogue stars on a 2D canvas, through the same camera
  function draw2D(time) {
    var c = S.c2d, d = S.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, S.W, S.H);
    c.globalCompositeOperation = 'lighter';
    var list = S.cat, br = opts.brightness;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.m > 5.2) continue;
      var p = project(s.u);
      if (!p || p.x < -20 || p.y < -20 || p.x > S.vw + 20 || p.y > S.vh + 20) continue;
      var sp = s.sp || (s.sp = s.m < MAG_OWN ? ownSprite(s.m, s.bv) : binSprite(s.m, s.bv)), a = (s.m < MAG_OWN ? 1 : baseAlpha(s.m)) * br;
      var tw = s.m < MAG_DYN || s.f >= 0 ? twinkle(time, s.r1, s.r2, s.o1, s.o2, s.depth) : 1;
      drawOne(c, sp, s.m, Math.round(p.x * d), Math.round(p.y * d), a, tw, time, s.o3);
    }
  }
  function drawSky(time) {
    if (G.ok && !G.lost) {
      if (G.bake && !G.bake.done) bakeStep();
      drawGL(time);
    } else if (S.c2d) draw2D(time);
    S.stats.draws++;
    if (!S.shown) {
      S.shown = true;
      canvas.style.transition = S.still ? 'none' : 'opacity 1.2s ease';
      requestAnimationFrame(function () { canvas.style.opacity = '1'; });
    }
  }

  /* --------------------------------------------------------------- open sky */
  var MEDIA = /^(IMG|VIDEO|CANVAS|IFRAME|PICTURE|INPUT|TEXTAREA|SELECT|svg|SVG)$/;
  var INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="button"]';
  var textRange = document.createRange();
  var heroCanvas = null, headerEl = null, labelEl = null;
  function own(el) { return el === canvas || el === fx || el === labelEl || el === cons.canvas; }
  function inHeader(el) { return headerEl && (el === headerEl || headerEl.contains(el)); }
  function textAt(el, x, y) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 3 || !/\S/.test(n.data)) continue;
      textRange.selectNodeContents(n);
      var rs = textRange.getClientRects();
      for (var j = 0; j < rs.length; j++) {
        var r = rs[j];
        if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 4 && y <= r.bottom + 4) return true;
      }
    }
    return false;
  }
  function ruleIn(el, cs, bottom) {   // a hairline of el lying inside the band 0..bottom
    var r = el.getBoundingClientRect();
    function on(w, c) { return parseFloat(w) > 0 && alphaOf(c) > 0.1; }
    if (on(cs.borderTopWidth, cs.borderTopColor) && r.top >= -2 && r.top <= bottom) return true;
    if (on(cs.borderBottomWidth, cs.borderBottomColor) && r.bottom >= 0 && r.bottom <= bottom + 2) return true;
    if (r.top < bottom && r.bottom > 0 && (on(cs.borderLeftWidth, cs.borderLeftColor) || on(cs.borderRightWidth, cs.borderRightColor))) return true;
    return false;
  }
  function heroZone() { return S.page === 'home' && S.R > 0 && (window.scrollY || 0) < S.R; }
  // The homepage hero paints the sky itself outside the NM mark (heroClear); treat the
  // mark's box, and the whole hero once the zoom is under way, as covered.
  function heroOpen(x, y) {
    if ((window.scrollY || 0) > S.vh * 0.1) return false;
    var mw = Math.min(S.vw * 0.62, S.vh * 0.65), mh = mw * 0.56, my = heroY();
    return Math.abs(x - S.vw / 2) > mw / 2 + 22 || Math.abs(y - my) > mh / 2 + 22;
  }
  function openSky(x, y, skipHeader) {
    if (!(x >= 0 && y >= 0 && x < S.vw && y < S.vh)) return false;
    var list = document.elementsFromPoint(x, y);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === root || el === document.body) return true;
      if (own(el)) continue;
      if (inHeader(el)) {
        if (skipHeader) continue;
        if (el === headerEl) { if (!root.classList.contains('nm-sky-clear')) return false; continue; }
        return false;
      }
      if (el === heroCanvas) {   // past the hero it only draws the (skipped) footer cloud: clear
        if (heroZone() && !heroOpen(x, y)) return false;
        continue;
      }
      if (MEDIA.test(el.tagName) || el instanceof SVGElement) return false;
      var cs = getComputedStyle(el);
      if (+cs.opacity < 0.05) continue;
      if (alphaOf(cs.backgroundColor) > 0.2 || cs.backgroundImage !== 'none') return false;
      if (skipHeader > 0 && ruleIn(el, cs, skipHeader)) return false;
      if (el.matches(INTERACTIVE)) return false;
      if (textAt(el, x, y)) return false;
    }
    return true;
  }
  api.openSky = function (x, y) { return openSky(x, y, false); };

  /* --------------------------------------------- header scrim (open-sky veil) */
  // The header's dark gradient exists so the nav stays readable over content. Over open
  // sky it would only hide stars, so it is lifted (html.nm-sky-clear) while nothing but
  // sky passes under the header band, and returns the moment content does.
  var veil = { t: 0, last: 0, clear: null, y: -1 };
  function checkVeil() {
    veil.last = performance.now();
    if (!headerEl || !headerEl.isConnected) headerEl = document.querySelector('header[data-nm-header], .nm-hdr');
    if (!headerEl) return;
    var hb = Math.min(headerEl.getBoundingClientRect().bottom, 150), clear = true;
    if (hb <= 0) clear = true;
    else if (heroCanvas && heroZone() && getComputedStyle(heroCanvas).visibility !== 'hidden' && (window.scrollY || 0) > S.vh * 0.1) clear = false;
    else {
      var ys = [hb * 0.35, hb * 0.7, hb - 3], xs = [0.015, 0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88, 0.985];
      for (var a = 0; a < ys.length && clear; a++) for (var b = 0; b < xs.length; b++) {
        if (!openSky(xs[b] * S.vw, ys[a], hb)) { clear = false; break; }
      }
    }
    if (clear !== veil.clear) { veil.clear = clear; root.classList.toggle('nm-sky-clear', clear); }
  }
  function veilSoon() {
    clearTimeout(veil.t);
    var wait = Math.max(0, 140 - (performance.now() - veil.last));
    veil.t = setTimeout(checkVeil, wait);
  }

  /* -------------------------------------------------------------------- label */
  var label = { on: false, star: -1, a: 0, x: 0, y: 0, w: 0, h: 0, side: 1, pinned: 0, since: 0, sy: 0, kind: null };
  function makeLabel() {
    labelEl = document.createElement('div');
    labelEl.className = 'nm-sky-label';
    labelEl.setAttribute('aria-hidden', 'true');
    labelEl.innerHTML = '<p class="nm-sky-l-name"><b></b><span></span></p><p class="nm-sky-l-co"></p><p class="nm-sky-l-co nm-sky-l-dist"></p><p class="nm-sky-l-fact"></p>';
    document.body.appendChild(labelEl);
  }
  function fillLabel(f) {
    var p = labelEl.children;
    p[0].firstChild.textContent = f.name || '';
    p[0].lastChild.textContent = f.designation || '';
    p[1].textContent = f.coords || '';
    p[2].textContent = f.distance || '';
    p[3].textContent = f.fact || '';
    p[3].style.display = f.fact ? '' : 'none';
    label.w = labelEl.offsetWidth; label.h = labelEl.offsetHeight;
  }
  function showLabel(kind, idx) {
    if (label.on && label.kind === kind && label.star === idx) return;
    label.kind = kind; label.star = idx;
    fillLabel(kind === 'cons' ? NM_LABEL : S.featured[idx]);
    label.on = true; label.since = performance.now(); label.sy = window.scrollY || 0;
    placeLabel();
    labelEl.classList.add('is-on');
    kick();
  }
  function hideLabel() {
    if (!label.on) return;
    label.on = false; label.pinned = 0;
    labelEl.classList.remove('is-on');
    kick();
  }
  // a featured star's viewport position, where the camera has it now (null off screen)
  function starScreen(k) {
    var f = S.featured[k];
    if (!f || !f.u) return null;
    var p = project(f.u);
    return p && p.x > -30 && p.x < S.vw + 30 && p.y > -30 && p.y < S.vh + 30 ? p : null;
  }
  function anchor() { return label.kind === 'cons' ? cons.anchor() : starScreen(label.star); }
  function placeLabel() {
    var a = anchor();
    if (!a) return;
    var gap = label.kind === 'cons' ? 18 : 20, w = label.w, h = label.h, vw = S.vw, vh = S.vh;
    var xl = a.xl != null ? a.xl : a.x;
    // keep the side the label opened on while the star drifts, unless it no longer fits
    var fitR = a.x + gap + w <= vw - 12, fitL = xl - gap - w >= 12;
    var side = label.side === 1 && fitR ? 1 : label.side === -1 && fitL ? -1 : fitR ? 1 : fitL ? -1 : 0;
    var x, y;
    if (side) { x = side > 0 ? a.x + gap : xl - gap - w; y = clamp(a.y - 18, 12, vh - h - 12); }
    else {
      var cx = a.cx != null ? a.cx : a.x, top = a.top != null ? a.top : a.y, bot = a.bottom != null ? a.bottom : a.y;
      x = clamp(cx - w / 2, 12, vw - w - 12); y = top - gap - h >= 12 ? top - gap - h : bot + gap;
    }
    label.x = x; label.y = y; label.side = side; label.ax = a.x; label.ay = a.y;
    labelEl.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
  }
  function nearestFeatured(x, y, radius) {
    var best = -1, bd = radius;
    S.featured.forEach(function (f, k) {
      var p = starScreen(k);
      if (!p) return;
      var d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  }
  function starOpen(k) {
    var f = S.featured[k], now = performance.now(), p = starScreen(k);
    if (!p) return false;
    if (f.openAt && now - f.openAt < 220 && Math.abs(f.openY - (window.scrollY || 0)) < 2 && Math.hypot(p.x - f.openX, p.y - f.openPY) < 4) return f.open;
    f.open = openSky(p.x, p.y, false);
    f.openAt = now; f.openY = window.scrollY || 0; f.openX = p.x; f.openPY = p.y;
    return f.open;
  }
  function hoverTick() {
    if (!S.ready || label.kind === 'cons' && label.on) return;
    var p = S.pointer;
    if (label.pinned) {
      var gone = !starOpen(label.star) || Math.abs((window.scrollY || 0) - label.sy) > 90 || performance.now() - label.since > 9000;
      if (gone) hideLabel();
      return;
    }
    if (!p.fine) { if (label.on && label.kind === 'star') hideLabel(); return; }
    var k = nearestFeatured(p.x, p.y, label.on ? 40 : 28);
    if (k >= 0 && starOpen(k)) showLabel('star', k);
    else if (label.on && label.kind === 'star') hideLabel();
  }

  /* ------------------------------------------------------------------ events */
  // Events live on the sky: their points are sky directions, so they ride with the camera.
  var EV = { list: [], next: { meteor: 0, satellite: 0, ufo: 0 }, seen: { meteor: 0, satellite: 0, ufo: 0 } };
  var evR = rng((Date.now() & 0xffff) ^ 0x51ed);
  function between(a, b) { return a + evR() * (b - a); }
  function schedule(kind, first) {
    var t = S.t, n = EV.next;
    if (SHOW) {
      if (kind === 'meteor') n.meteor = t + (first ? 1.5 : between(6, 10));
      else if (kind === 'satellite') n.satellite = t + (first ? 3 : between(28, 40));
      else n.ufo = t + (first ? 5 : between(30, 45));
      return;
    }
    if (kind === 'meteor') n.meteor = t + (first ? between(10, 20) : between(40, 80));
    else if (kind === 'satellite') n.satellite = t + (first ? between(40, 90) : between(90, 180));
    else n.ufo = t + (first ? between(60, 120) : between(300, 480));
  }
  function openPoint(margin, tries, test) {
    for (var i = 0; i < tries; i++) {
      var x = margin + evR() * (S.vw - 2 * margin), y = margin + evR() * (S.vh - 2 * margin);
      if (!test || test(x, y)) return { x: x, y: y };
    }
    return null;
  }
  // a point along the great circle from a toward b (frac 1 = b)
  function slerpDir(a, b, frac) {
    var c = clamp(dot(a, b), -1, 1), ang = Math.acos(c);
    if (ang < 1e-6) return a.slice();
    var s = Math.sin(ang), wa = Math.sin((1 - frac) * ang) / s, wb = Math.sin(frac * ang) / s;
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
  }
  function spawn(kind, forced) {
    var vw = S.vw, vh = S.vh, e = null, L0 = Math.max(vw, vh);
    if (kind === 'meteor') {
      var len = (110 + evR() * 170) * clamp(Math.sqrt(L0 / 1440), 0.65, 1.2), ang = (evR() * 2 - 1) * Math.PI;
      if (Math.sin(ang) < -0.3) ang = -ang;                   // mostly falling, never straight up
      var dx = Math.cos(ang), dy = Math.sin(ang);
      var p = openPoint(36, forced ? 16 : 10, function (x, y) {
        return openSky(x, y, false) && openSky(x + dx * len * 0.5, y + dy * len * 0.5, false) && openSky(x + dx * len, y + dy * len, false);
      }) || (forced ? openPoint(36, 1) : null);
      if (!p) return false;
      var fire = evR() < 0.08;   // now and then a brighter one with a little terminal burst
      var L1 = len * (fire ? 1.3 : 1);
      e = { kind: kind, u0: unproject(p.x, p.y), u1: unproject(p.x + dx * L1, p.y + dy * L1), t: 0,
        T: (0.42 + evR() * 0.4) * (fire ? 1.35 : 1), a: fire ? 1 : 0.5 + evR() * 0.35, fire: fire,
        hue: evR() < 0.55 ? [0.80, 1, 0.86] : [0.86, 0.93, 1] };
    } else if (kind === 'satellite') {
      // crosses the visible sky slowly; enters from an edge and leaves (or fades) in view
      var side = Math.floor(evR() * 4), sx, sy, a2;
      if (side === 0) { sx = -8; sy = vh * (0.15 + 0.6 * evR()); a2 = (evR() - 0.5) * 0.9; }
      else if (side === 1) { sx = vw + 8; sy = vh * (0.15 + 0.6 * evR()); a2 = Math.PI + (evR() - 0.5) * 0.9; }
      else if (side === 2) { sx = vw * (0.15 + 0.7 * evR()); sy = -8; a2 = Math.PI / 2 + (evR() - 0.5) * 1.1; }
      else { sx = vw * (0.15 + 0.7 * evR()); sy = vh + 8; a2 = -Math.PI / 2 + (evR() - 0.5) * 1.1; }
      var m = 3.3 + evR() * 1.0, across = Math.abs(Math.cos(a2)) > 0.5 ? vw : vh, v = (22 + evR() * 20) * clamp(L0 / 1440, 0.6, 1.2);
      e = { kind: kind, u0: unproject(sx, sy), u1: unproject(sx + Math.cos(a2) * across, sy + Math.sin(a2) * across), across: across, v: v, t: 0, m: m,
        sp: binSprite(m, 0.55), a0: baseAlpha(m), life: (across + 30) / v, fadeT: 2.4 + evR() * 1.8, fading: -1 };
      e.shadowT = evR() < 0.45 ? (0.35 + evR() * 0.4) * (across / v) : -1;
    } else if (kind === 'ufo') {
      var q = openPoint(90, 16, function (x, y) { return openSky(x, y, false) && openSky(x + 40, y, false) && openSky(x - 40, y, false); }) || (forced ? openPoint(90, 1) : null);
      if (!q) return false;
      var ga = evR() * Math.PI * 2;
      e = { kind: kind, u0: unproject(q.x, q.y), gx: Math.cos(ga), gy: Math.sin(ga) * 0.5, t: 0,
        glide: 6 + evR() * 4, pause: 1.8 + evR() * 2.2, dart: evR() < 0.7, rot: evR() * 6.28,
        da: evR() * Math.PI * 2, sp: binSprite(3.5, 0.5), amber: binSprite(3.8, 1.6), a0: baseAlpha(3.5) };
    }
    if (e) { EV.list.push(e); EV.seen[kind]++; kick(); }
    return !!e;
  }
  function eventsTick(dt) {
    if (S.still) return;
    ['meteor', 'satellite', 'ufo'].forEach(function (k) {
      if (S.t >= EV.next[k]) { if (!spawn(k, SHOW)) EV.next[k] = S.t + 4; else schedule(k, false); }
    });
    EV.list = EV.list.filter(function (e) {
      e.t += dt;
      if (e.kind === 'meteor') return e.t < e.T + 0.25;
      if (e.kind === 'satellite') {
        if (e.shadowT > 0 && e.t > e.shadowT && e.fading < 0) e.fading = 0;
        if (e.fading >= 0) e.fading += dt;
        return e.t < e.life && !(e.fading > e.fadeT);
      }
      return e.t < e.glide + e.pause + 1.6;
    });
  }
  function fastEvent() {
    for (var i = 0; i < EV.list.length; i++) { var k = EV.list[i].kind; if (k === 'meteor' || k === 'ufo') return true; }
    return false;
  }
  function evPos(e) {   // where an event is on screen now
    if (e.kind === 'satellite') return project(slerpDir(e.u0, e.u1, e.v * e.t / e.across));
    return project(e.u0);
  }
  /* A meteor: a thin tapered streak whose head (a touch green or blue-white) brightens as
     it burns, a warm fading train behind it, gone in well under a second. */
  function drawMeteor(c, e) {
    var a0 = project(e.u0), b0 = project(e.u1);
    if (!a0 || !b0) return;
    var d = S.dpr, u = e.t / e.T, k = Math.min(1, u), len = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1;
    var dx = (b0.x - a0.x) / len, dy = (b0.y - a0.y) / len;
    var head = 1 - Math.pow(1 - k, 1.5);
    var bright = (u < 1 ? Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.04)), 0.7) : 0) * e.a;
    if (e.fire && u > 0.82 && u < 1) bright *= 1 + 1.4 * Math.sin((u - 0.82) / 0.18 * Math.PI);
    var hx = a0.x + dx * len * head, hy = a0.y + dy * len * head;
    var tl = len * (0.18 + 0.55 * Math.min(1, u * 1.5)), fadeOut = u > 1 ? 1 - (u - 1) / (0.25 / e.T) : 1;
    var tx = hx - dx * tl, ty = hy - dy * tl, nx = -dy, ny = dx;
    var wh = (e.fire ? 1.35 : 1.0) * Math.max(0.75, 1.1 / Math.sqrt(d)) * d * 0.5;   // half width of the head, device px
    var A = bright;
    var trainA = Math.max(0, (u < 1 ? A : e.a * 0.35 * fadeOut));
    if (trainA > 0.004) {
      var gr = c.createLinearGradient(tx * d, ty * d, hx * d, hy * d);
      gr.addColorStop(0, 'rgba(255,170,110,0)');
      gr.addColorStop(0.55, 'rgba(255,214,170,' + (trainA * 0.22).toFixed(3) + ')');
      gr.addColorStop(0.9, 'rgba(255,246,228,' + (trainA * 0.6).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(255,255,250,' + (trainA * 0.8).toFixed(3) + ')');
      c.globalAlpha = 1;
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(tx * d, ty * d);
      c.lineTo(hx * d + nx * wh, hy * d + ny * wh);
      c.lineTo(hx * d - nx * wh, hy * d - ny * wh);
      c.closePath();
      c.fill();
    }
    if (u < 1 && A > 0.01) {
      var h = e.hue, rgb = Math.round(255 * h[0]) + ',' + Math.round(255 * h[1]) + ',' + Math.round(255 * h[2]);
      var rg = c.createRadialGradient(hx * d, hy * d, 0, hx * d, hy * d, wh * 3.2);
      rg.addColorStop(0, 'rgba(' + rgb + ',' + Math.min(1, A).toFixed(3) + ')');
      rg.addColorStop(0.35, 'rgba(' + rgb + ',' + (A * 0.35).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(' + rgb + ',0)');
      c.fillStyle = rg;
      c.beginPath(); c.arc(hx * d, hy * d, wh * 3.2, 0, Math.PI * 2); c.fill();
    }
  }
  function drawEvents(c) {
    var d = S.dpr;
    c.globalCompositeOperation = 'lighter';
    c.imageSmoothingEnabled = true;
    EV.list.forEach(function (e) {
      if (e.kind === 'meteor') { drawMeteor(c, e); return; }
      var p = evPos(e);
      if (!p) return;
      if (e.kind === 'satellite') {
        var a = e.a0 * Math.min(1, e.t / 1.2) * (1 + 0.04 * Math.sin(e.t * 1.7));
        if (e.fading >= 0) a *= Math.pow(1 - clamp(e.fading / e.fadeT, 0, 1), 1.6);
        blit(c, e.sp, p.x * d, p.y * d, a);
      } else {
        var t = e.t, px = p.x, py = p.y, s = 1, A2 = 1;
        if (t < e.glide) {
          var g = t * (11 + 3 * Math.sin(t * 0.5));
          px += e.gx * g; py += e.gy * g + Math.sin(t * 0.8) * 3; A2 *= Math.min(1, t / 2.4);
        } else {
          var gl = e.glide * (11 + 3 * Math.sin(e.glide * 0.5));
          px += e.gx * gl; py += e.gy * gl + Math.sin(e.glide * 0.8) * 3;
          var tp = t - e.glide - e.pause;
          if (tp > 0) {
            if (e.dart) { var dd = Math.pow(tp, 2.4) * 2600; px += Math.cos(e.da) * dd; py += Math.sin(e.da) * dd; A2 *= Math.max(0, 1 - tp / 1.1); }
            else A2 *= Math.max(0, 1 - tp / 0.35);
            s = 1 + tp * 0.6;
          }
        }
        var rot = e.rot + t * 0.25, R3 = 4.2 * s;
        for (var k = 0; k < 3; k++) {
          var ang = rot + k * 2.0944, lx = px + Math.cos(ang) * R3, ly = py + Math.sin(ang) * R3;
          var pul = 0.85 + 0.15 * Math.sin(t * 2.3 + k * 2.1);
          blit(c, k === 2 ? e.amber : e.sp, lx * d, ly * d, e.a0 * 0.95 * A2 * pul);
        }
      }
    });
  }
  api.fxBusy = function () { return fxBusy(); };
  api.trigger = function (kind) {
    if (!S.ready || S.still) return false;
    if (kind !== 'meteor' && kind !== 'satellite' && kind !== 'ufo') return false;
    return spawn(kind, true);
  };

  /* --------------------------------------------------------------- the overlay */
  var fxDirty = true;
  function fxBusy() { return EV.list.length > 0 || label.a > 0.01; }
  function drawFx() {
    var need = fxBusy(), d = S.dpr;
    if (!need && !fxDirty) return;
    fxc.setTransform(1, 0, 0, 1, 0, 0);
    fxc.globalCompositeOperation = 'source-over';
    fxc.globalAlpha = 1;
    fxc.clearRect(0, 0, fx.width, fx.height);
    fxDirty = need;
    // the label's reticle and leader, in the sky
    if (label.a > 0.01 && label.kind === 'star' && label.ax != null) {
      var ax = label.ax * d, ay = label.ay * d, la = label.a * 0.32;
      fxc.strokeStyle = 'rgba(220,226,240,' + la.toFixed(3) + ')';
      fxc.lineWidth = Math.max(1, Math.round(0.6 * d));
      fxc.beginPath(); fxc.arc(ax, ay, 9 * d, 0, Math.PI * 2); fxc.stroke();
      if (label.side) {
        var ex = (label.side > 0 ? label.x : label.x + label.w) * d, ey = (label.y + 15) * d;
        var sx0 = ax + (ex > ax ? 1 : -1) * 9 * d;
        fxc.beginPath(); fxc.moveTo(sx0, ay); fxc.lineTo(ex - (ex > ax ? 4 : -4) * d, ey); fxc.stroke();
      }
    }
    if (EV.list.length) drawEvents(fxc);
  }

  /* ------------------------------------------------------- NM constellation */
  var cons = {
    host: null, door: null, canvas: null, ctx: null, stars: null, w: 0, h: 0, CW: 0, CH: 0,
    hover: 0, hoverTo: 0, linesIn: 0, visible: false, rect: null, foot: null, lastT: -1,
    anchor: function () {   // the door's edges, level with the top of the fourth upright
      if (!cons.canvas || !cons.rect) return null;
      var r = cons.canvas.getBoundingClientRect(), s = cons.stars[6], hw = cons.w * 0.54 + 8, hh = cons.h * 0.65 + 8;
      var cx = r.left + cons.CW / 2, cy = r.top + cons.CH / 2;
      return { x: cx + hw, xl: cx - hw, y: r.top + s.y, top: cy - hh, bottom: cy + hh, cx: cx };
    }
  };
  function makeDoor(host) {
    var door = document.createElement('button');
    door.type = 'button';
    door.className = 'nm-run-door nm-sky-door';
    door.setAttribute('aria-label', 'Play Cloud Run');
    door.setAttribute('aria-haspopup', 'dialog');
    door.addEventListener('click', function () { openRun(door); });
    host.removeAttribute('aria-hidden');
    host.appendChild(door);
    return door;
  }
  var runLoading = null;
  function openRun(door) {   // the archive has no Cloud Run script of its own: load the shared door
    if (window.__nmRun) { window.__nmRun.open(); return; }
    if (!runLoading) {
      door.setAttribute('aria-busy', 'true');
      runLoading = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = '/js/nm-run.js';
        s.onload = resolve;
        s.onerror = function () { s.remove(); runLoading = null; reject(new Error('Cloud Run could not load')); };
        document.head.appendChild(s);
      });
    }
    runLoading.then(function () { door.removeAttribute('aria-busy'); if (window.__nmRun) window.__nmRun.open(); },
      function () { door.removeAttribute('aria-busy'); });
  }
  function setupFooter() {
    var page = S.page, host, door, foot;
    if (page === 'home') { host = document.querySelector('main > section.h-lvh'); foot = host; }
    else if (page === 'about') { host = document.querySelector('[data-nm-footer]'); foot = host; }
    else { host = document.querySelector('footer .foot-mark'); foot = host && host.closest('footer'); }
    if (!host) return;
    door = page === 'index' ? host.querySelector('.nm-sky-door') || makeDoor(host) : host.querySelector('.nm-run-door');
    if (cons.canvas && cons.canvas.parentNode) cons.canvas.remove();
    cons.host = host; cons.door = door; cons.foot = foot;
    var c = cons.canvas = document.createElement('canvas');
    c.className = 'nm-sky-cons';
    c.setAttribute('aria-hidden', 'true');
    host.appendChild(c);
    cons.ctx = c.getContext('2d');
    if (!cons.stars) {
      var R = rng(31);
      cons.stars = NM_STARS.map(function (s) {
        var rate = 0.75 + 1.5 * R();
        return { u: (s[0] - CROP.x) / CROP.w, v: (s[1] - CROP.y) / CROP.h, m: s[2], bv: s[3], x: 0, y: 0,
          r1: rate, r2: rate * (2.2 + 0.9 * R()), o1: R() * 4000, o2: R() * 4000, o3: R() * 4000,
          depth: 0.08 + 0.34 * clamp((MAG_DYN + 0.6 - s[2]) / 6, 0, 1) };
      });
    }
    consSprites();
    if (door && !door.__nmSky) {
      door.__nmSky = true;
      var on = function () { cons.hoverTo = 1; showLabel('cons', 0); kick(); };
      var off = function (e) {
        if (e && e.type === 'blur' && door.matches(':hover')) return;
        if (e && e.type === 'pointerleave' && document.activeElement === door && door.matches(':focus-visible')) return;
        cons.hoverTo = 0; if (label.kind === 'cons') hideLabel(); kick();
      };
      door.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' || e.pointerType === 'pen' && fineQ.matches) on(); });
      door.addEventListener('pointerleave', off);
      door.addEventListener('focus', function () { if (door.matches(':focus-visible')) on(); });
      door.addEventListener('blur', off);
      door.addEventListener('click', function () { cons.hoverTo = 0; hideLabel(); });
    }
    root.setAttribute('data-nm-sky', page);
  }
  function consSprites() {
    if (atlas && cons.stars) cons.stars.forEach(function (s) { s.sp = s.m < MAG_OWN ? ownSprite(s.m, s.bv) : binSprite(s.m, s.bv); s.a = s.m < MAG_OWN ? 1 : baseAlpha(s.m); });
  }
  function layoutFooter() {
    var host = cons.host;
    if (!host || !host.isConnected) { if (S.page === 'home' && document.querySelector('main > section.h-lvh')) setupFooter(); host = cons.host; }
    if (!host || !host.isConnected) return;
    var hr = host.getBoundingClientRect(), phone = mq('(max-width:767px)').matches, w, cx, cy;
    if (!hr.width || !hr.height) return;
    if (S.page === 'index') {
      var cs = getComputedStyle(host), pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
      w = Math.min(hr.width * 0.92, Math.max(Math.min(426, S.vw * 0.62), S.vw * 0.221875));
      cx = hr.width / 2; cy = pt + (hr.height - pt - pb) / 2;
    } else {
      var bw = hr.width * (phone ? 0.64 : 0.32), bh = hr.height * (phone ? 0.28 : 0.32);
      w = Math.min(bw, bh * ASPECT) * 0.95; cx = hr.width / 2; cy = hr.height * 0.42;
    }
    var h = w / ASPECT, CW = Math.ceil(w * 1.2), CH = Math.ceil(h * 1.6), d = S.dpr;
    cons.w = w; cons.h = h; cons.CW = CW; cons.CH = CH;
    var c = cons.canvas;
    c.style.left = Math.round(cx - CW / 2) + 'px'; c.style.top = Math.round(cy - CH / 2) + 'px';
    c.style.width = CW + 'px'; c.style.height = CH + 'px';
    if (c.width !== Math.round(CW * d) || c.height !== Math.round(CH * d)) { c.width = Math.round(CW * d); c.height = Math.round(CH * d); }
    cons.stars.forEach(function (s) { s.x = (CW - w) / 2 + s.u * w; s.y = (CH - h) / 2 + s.v * h; });
    // the NM's centre and box in document coordinates
    var sy = window.scrollY || 0, nx = hr.left + cx, ny = hr.top + sy + cy;
    S.nm = { x: nx, y: ny };
    S.nmBox = [nx - w * 0.5 - 14, ny - h * 0.5 - 14, nx + w * 0.5 + 14, ny + h * 0.5 + 14];
    var rs = root.style;
    rs.setProperty('--nm-sky-door-w', Math.round(w * 1.08) + 'px');
    rs.setProperty('--nm-sky-door-h', Math.round(h * 1.3) + 'px');
    rs.setProperty('--nm-sky-door-y', Math.round(cy) + 'px');
    cons.rect = true;
  }
  function drawCons(t) {
    var c = cons.ctx, d = S.dpr;
    if (!c || !cons.stars || !cons.stars[0].sp) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, cons.canvas.width, cons.canvas.height);
    c.globalCompositeOperation = 'lighter';
    c.imageSmoothingEnabled = false;
    var hov = cons.hover, st = cons.stars, la = (0.3 + 0.2 * hov) * cons.linesIn;
    if (la > 0.004) {
      c.strokeStyle = 'rgba(206,218,242,' + la.toFixed(3) + ')';
      c.lineWidth = Math.max(1, Math.round(0.7 * d));
      c.lineCap = 'round';
      c.beginPath();
      NM_LINES.forEach(function (ln) {
        var a = st[ln[0]], b = st[ln[1]], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
        var ga = 3.4 + 0.8 * (6 - a.m), gb = 3.4 + 0.8 * (6 - b.m);
        if (len <= ga + gb + 2) return;
        c.moveTo((a.x + dx / len * ga) * d, (a.y + dy / len * ga) * d);
        c.lineTo((b.x - dx / len * gb) * d, (b.y - dy / len * gb) * d);
      });
      c.stroke();
    }
    var lift = (1.5 + 0.2 * hov) * opts.brightness;
    for (var i = 0; i < st.length; i++) {
      var s = st[i], tw = twinkle(t, s.r1, s.r2, s.o1, s.o2, s.depth);
      drawOne(c, s.sp, s.m, Math.round(s.x * d), Math.round(s.y * d), s.a * lift, tw, t, s.o3);
    }
  }
  function footerLevel() {
    var f = cons.foot;
    if (!f || !f.isConnected) return 0;
    var r = f.getBoundingClientRect(), span = Math.min(S.vh, r.height || S.vh);
    cons.visible = r.top < S.vh + 40 && r.bottom > -40;
    return smooth(0, 1, (S.vh - r.top) / (span * 0.85));
  }

  /* -------------------------------------------------------------------- frame */
  function measure() {
    var vw = root.clientWidth || innerWidth, vh = canvas.clientHeight || innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (vw * vh > 2600000) dpr = Math.min(dpr, 1.5);
    var changed = vw !== S.vw || vh !== S.vh || dpr !== S.dpr;
    S.vw = vw; S.vh = vh; S.phone = vw < 600;
    if (dpr !== S.dpr || !atlas) { S.dpr = dpr; buildAtlas(); consSprites(); S.cat && S.cat.forEach(function (s) { s.sp = null; }); }
    S.W = Math.round(vw * dpr); S.H = Math.round(vh * dpr);
    if (canvas.width !== S.W || canvas.height !== S.H) { canvas.width = S.W; canvas.height = S.H; }
    if (fx && (fx.width !== S.W || fx.height !== S.H)) { fx.width = S.W; fx.height = S.H; fxDirty = true; }
    return changed;
  }
  function frame(now) {
    var t0 = performance.now();
    var dt = S.last ? Math.min(0.1, (now - S.last) / 1000) : 0;
    S.last = now;
    if (!S.still) S.t += dt;
    var t = S.still ? 0 : S.t;
    camStep(dt);
    // the footer, its constellation and the sky's footer lift
    var fl = footerLevel();
    S.foot = fl;
    var glide = camGlides();
    if (S.still || glide || fastEvent() || now - S.lastDraw > 31 || !S.lastDraw || (G.bake && !G.bake.done) || S.force) {
      S.lastDraw = now; S.force = false;
      drawSky(t);
    }
    label.a += ((label.on ? 1 : 0) - label.a) * (S.still ? 1 : Math.min(1, dt * 7));
    if (label.on) placeLabel();
    eventsTick(dt);
    drawFx();
    cons.hover += (cons.hoverTo - cons.hover) * (S.still ? 1 : Math.min(1, dt * 6));
    cons.linesIn = S.still ? 1 : smooth(0.4, 0.9, fl);
    if (cons.visible && cons.ctx && (S.still || now - cons.lastT > 31 || Math.abs(cons.hover - cons.hoverTo) > 0.01)) { cons.lastT = now; drawCons(t); }
    hoverTick();
    var y = window.scrollY || 0;
    if (Math.abs(y - veil.y) > 0.5) { veil.y = y; veilSoon(); }
    var ms = performance.now() - t0, st = S.stats;
    st.frames++; st.ms += ms; if (ms > st.worst) st.worst = ms;
  }

  /* --------------------------------------------------------------- the loop */
  function loop(now) {
    S.raf = requestAnimationFrame(loop);
    frame(now);
  }
  function active() { return S.ready && S.mounted && !document.hidden && !gameOpen(); }
  function update() {
    var was = S.still;
    S.still = reduceQ.matches;
    if (S.still) EV.list.length = 0;
    if (was !== S.still) { CAM.init = false; S.force = true; }
    var go = active() && !S.still;
    if (go && !S.running) { S.running = true; S.last = 0; S.stats.since = performance.now(); S.raf = requestAnimationFrame(loop); }
    else if (!go && S.running) { S.running = false; cancelAnimationFrame(S.raf); S.raf = 0; }
    if (active() && S.still) kick();
  }
  var kickRaf = 0;
  function kick() {   // one frame now (still mode, or a change while idle)
    S.force = true;
    if (S.running || kickRaf || !active()) return;
    kickRaf = requestAnimationFrame(function (now) { kickRaf = 0; S.last = 0; frame(now); });
  }

  /* ------------------------------------------------------------------- input */
  function onMove(e) {
    var p = S.pointer;
    p.fine = e.pointerType === 'mouse' || (e.pointerType === 'pen' && fineQ.matches);
    if (!p.fine) return;
    p.x = e.clientX; p.y = e.clientY;
    if (!S.running) { hoverTick(); kick(); }
  }
  var tap = null;
  function onDown(e) {
    if (e.pointerType === 'mouse') return;
    tap = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  }
  function onUp(e) {
    if (!tap || e.pointerId !== tap.id || e.pointerType === 'mouse') { tap = null; return; }
    var moved = Math.hypot(e.clientX - tap.x, e.clientY - tap.y), dt = performance.now() - tap.t;
    tap = null;
    if (moved > 12 || dt > 650 || !S.ready) return;
    var tgt = e.target && e.target.closest ? e.target.closest(INTERACTIVE) : null;
    if (tgt && !own(tgt)) return;
    S.pointer.fine = false;
    var k = nearestFeatured(e.clientX, e.clientY, 38);
    if (k >= 0 && starOpen(k)) { label.on = false; showLabel('star', k); label.pinned = 1; }
    else hideLabel();
  }
  function onLeave(e) { if (!e.relatedTarget) { S.pointer.x = S.pointer.y = -1e4; if (label.kind === 'star' && !label.pinned) hideLabel(); } }
  function onScroll() {
    if (label.pinned && Math.abs((window.scrollY || 0) - label.sy) > 90) hideLabel();
    if (!S.running) { veilSoon(); kick(); }
  }

  /* ------------------------------------------------------------------- mount */
  var resizeT = 0, roT = 0;
  function onResize() {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (!S.ready) { measure(); return; }
      var changed = measure();
      relayout(changed);
      if (label.on) { fillLabel(label.kind === 'cons' ? NM_LABEL : S.featured[label.star]); placeLabel(); }
      checkVeil();
    }, 160);
  }
  function mount() {
    if (S.mounted) return;
    S.mounted = true;
    S.page = api.page = detectPage();
    canvas = document.createElement('canvas');
    canvas.id = 'nm-sky';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100vh;height:100lvh;z-index:-21;pointer-events:none;display:block;opacity:0';
    document.body.appendChild(canvas);
    fx = document.createElement('canvas');
    fx.className = 'nm-sky-fx';
    fx.setAttribute('aria-hidden', 'true');
    fx.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100vh;height:100lvh;z-index:-20;pointer-events:none;display:block';
    document.body.appendChild(fx);
    fxc = fx.getContext('2d');
    heroCanvas = document.querySelector('#global-canvas canvas');
    headerEl = document.querySelector('header[data-nm-header], .nm-hdr');
    makeLabel();
    measure();
    api.canvas = canvas;
    api.fx = fx;
    root.classList.add('nm-sky-on');

    addEventListener('resize', onResize, { passive: true });
    addEventListener('pageshow', update);
    document.addEventListener('visibilitychange', update);
    addEventListener('nm:gamechange', update);
    if (reduceQ.addEventListener) reduceQ.addEventListener('change', update);
    new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointerout', onLeave, { passive: true });
    addEventListener('scroll', onScroll, { passive: true });
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () {
        clearTimeout(roT);
        roT = setTimeout(function () { if (S.ready) { relayout(false); checkVeil(); } }, 220);
      }).observe(document.body);
    }

    var get = function (u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }); };
    Promise.all([get('/media/sky/stars.json'), get('/media/sky/' + S.page + '.json').catch(function () { return {}; })])
      .then(function (res) {
        ingest(res[0], res[1]);
        S.still = reduceQ.matches;
        if (!glInit()) S.c2d = canvas.getContext('2d');
        setupFooter();
        S.ready = true;
        relayout(true);
        ['meteor', 'satellite', 'ufo'].forEach(function (k) { schedule(k, true); });
        update();
        kick();
        checkVeil();
        setTimeout(checkVeil, 900);
        // the homepage keeps mounting for a moment after hydration: settle the layout again
        setTimeout(function () { relayout(false); }, 1200);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { relayout(false); });
      })
      .catch(function (err) { console.warn('[nm-sky] sky unavailable:', err && err.message); });
  }

  /* ------------------------------------------------------------------- API */
  api.set = function (o) {
    if (!o) return;
    ['brightness', 'twinkle', 'veil', 'motion'].forEach(function (k) { if (o[k] != null) opts[k] = Math.max(0, +o[k] || 0); });
    kick();
  };
  function radec(v) { return [+((Math.atan2(v[1], v[0]) / DEG / 15 + 24) % 24).toFixed(3), +(Math.asin(clamp(v[2], -1, 1)) / DEG).toFixed(2)]; }
  // the settled camera (no float) at scroll y
  function camAt(y) {
    var o = pathAt(clamp(y, 0, S.maxY), { v: null, roll: 0 }), c = orient(o.v, o.roll * DEG, 0, 0, {});
    var heroW = S.page === 'home' && S.R > 0 ? 1 - smooth(S.R, S.R + S.vh * 0.4, y) : 0;
    var hp = S.page === 'home' && S.R > 0 ? clamp(y / S.R, 0, 1) : 0, zoom = 1 + 0.16 * hp * hp * (3 - 2 * hp);
    c.cx = S.vw / 2; c.cy = S.vh / 2 + (heroY() - S.vh / 2) * heroW;
    c.F = Math.max(S.vw, S.vh) / 2 / Math.tan(PATH.fov * DEG / 2) * zoom;
    c.roll = o.roll;
    return c;
  }
  api.at = function (y) {
    var c = camAt(y);
    return { y: Math.round(y), centre: radec(c.f), roll: +c.roll.toFixed(1), featured: S.featured.map(function (f) {
      var p = project(f.u, c);
      return { id: f.id, x: p ? Math.round(p.x) : null, y: p ? Math.round(p.y) : null, on: !!p && p.x > 0 && p.y > 0 && p.x < S.vw && p.y < S.vh };
    }) };
  };
  api.debug = function () {
    return {
      page: S.page, ready: S.ready, running: S.running, still: S.still, dpr: S.dpr, size: [S.vw, S.vh], gl: G.ok, maxY: S.maxY, R: S.R,
      cam: { y: +CAM.y.toFixed(1), vy: +CAM.vy.toFixed(1), target: Math.round(window.scrollY || 0), hp: +CAM.hp.toFixed(3), roll: +CAM.roll.toFixed(2),
        centre: radec(CAM.f), zoom: +CAM.zoom.toFixed(3), F: +CAM.F.toFixed(1), pp: [Math.round(CAM.cx), Math.round(CAM.cy)], P: CAM.Pe.map(function (v) { return +v.toFixed(4); }), t: +CAM.t.toFixed(2) },
      bake: G.bake && { done: G.bake.done, ms: +G.bake.ms.toFixed(1), N: G.N, veil: +G.veilOn.toFixed(2) },
      counts: G.ok ? { faint: G.B.statN, bright: G.B.dynN, grain: G.B.grainN, near: G.B.nearN } : null,
      mask: { lines: MASK.lines, scale: MASK.scale, h: MASK.h },
      featured: S.featured.map(function (f, k) {
        var p = starScreen(k);
        return { id: f.id, screen: p && { x: Math.round(p.x), y: Math.round(p.y) }, open: p ? openSky(p.x, p.y, false) : false };
      }),
      events: EV.list.map(function (e) { var p = e.kind === 'meteor' ? project(e.u0) : evPos(e); return { kind: e.kind, t: +e.t.toFixed(2), x: p ? Math.round(p.x) : null, y: p ? Math.round(p.y) : null }; }),
      next: { meteor: +(EV.next.meteor - S.t).toFixed(1), satellite: +(EV.next.satellite - S.t).toFixed(1), ufo: +(EV.next.ufo - S.t).toFixed(1) }, seen: EV.seen, show: SHOW,
      veilClear: veil.clear, label: label.on ? (label.kind === 'cons' ? 'NM' : S.featured[label.star].id) : null,
      stats: { frames: S.stats.frames, draws: S.stats.draws, avgMs: S.stats.frames ? +(S.stats.ms / S.stats.frames).toFixed(2) : 0, worstMs: +S.stats.worst.toFixed(2),
        drawAvgMs: S.stats.draws ? +(S.stats.drawMs / S.stats.draws).toFixed(2) : 0 },
      cons: cons.canvas ? { w: Math.round(cons.w), h: Math.round(cons.h), door: !!cons.door, visible: cons.visible, nm: S.nm && [Math.round(S.nm.x), Math.round(S.nm.y)] } : null
    };
  };
  api.resetStats = function () { S.stats = { frames: 0, draws: 0, ms: 0, worst: 0, since: performance.now(), drawMs: 0 }; };

  var ready = window.__nmReady || function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };
  ready(mount);
})();
