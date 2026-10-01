/* Night sky engine v2 for the ?theme=stars preview. Brief: docs/night-sky.md.

   The live site, unchanged, over a page-length strip of the real sky. The sky is attached
   to the page like a background image: every point of the document has its own stars,
   they move exactly with the content, and scrolling travels through new sky.

   The strip. Each page maps to a long band of real sky laid along a great circle (the
   "spine"), projected conformally (transverse Mercator about the spine, so constellation
   shapes stay true) and fitted to the page by two anchors: a sky point at a spot near the
   top, and a sky point under the centre of the footer's NM constellation. The spine is
   tilted against the galactic plane, so the Milky Way does not run as a stripe behind the
   text column but crosses the page in a long serpentine.
     home   Orion, Canis Major and Taurus around the hero mark (Sirius, Rigel, Betelgeuse;
            Aldebaran just below the collage), then Auriga, Perseus, Cassiopeia, Cygnus and
            the Great Rift, Aquila, and the galactic centre in Sagittarius behind the NM.
     about  Perseus at the top, the Summer Triangle (Vega, Deneb, Altair, Albireo) through
            the middle of the page, the core at the footer.
     index  the image wall hides almost everything, so the strip runs around a great circle
            through the pole (twice, under the wall): Polaris in the band above the wall, the
            Big Dipper with Mizar and Alcor, and Thuban, around the NM in the footer.
   Stars: every catalogue star with V <= 6 (media/sky/stars.json, BSC5); the page's four
   featured stars and their facts come from media/sky/PAGE.json.

   Layers.
     - The sheet: page-attached canvases (div.nm-sky-sheet, 512 px tiles, behind every
       section), so the compositor scrolls them with the content: no lag on any device,
       Lenis or native scroll. Each tile is the airbrushed Milky Way (one WebGL pass: the
       band with its star clouds, the Great Rift and other dust lanes, H-alpha nebulae in
       coral, warm orange and yellow washes, millions of unresolved faint stars, spray grain
       and dither, never above the AA contrast limit behind any text), the faint catalogue
       stars, and the bright stars, which are redrawn in place every frame to scintillate
       (patches restore what lies under them). Tiles are rendered as they come near the
       viewport and released far from it.
     - NMSky.canvas: the fixed full-viewport 2D canvas. It carries the rare events, the
       label reticle and, on the homepage while the hero samples it (NMThemeConfig.
       heroBackdrop), a copy of the sky slice behind the hero. The hero is pinned while it
       zooms, so its sky is too; the page-attached sky continues from the bottom edge of
       the collage, exactly where the hero's sky ends.
   Events (subtle, always in the visible part of the page): a shooting star 10-20 s after
   arriving, then every 40-80 s; a satellite every 1.5-3 min (steady, slow, sometimes
   fading into Earth's shadow); the UFO first after 1-2 min, then every 5-8 min. Add
   ?sky=show to see each within the first few seconds.

   window.NMSky
     .canvas        the fixed sky canvas (events; the hero's backdrop on the homepage)
     .page          'home' | 'about' | 'index'
     .trigger(kind) 'meteor' | 'satellite' | 'ufo': start one now
     .set(opts)     { brightness: 1, twinkle: 1 } live multipliers
     .debug()       strip, tiles, featured-star positions and open-sky tests, events, timings
     .openSky(x,y)  true when nothing but sky is painted at that viewport point

   Budget: scrolling costs nothing here (the sheet scrolls on the compositor); twinkle at
   ~30 fps on the tiles in view, events at display rate while one is in flight; stops in
   hidden tabs and while Cloud Run is open; one still frame (no twinkle, no events) under
   prefers-reduced-motion. */
(function () {
  'use strict';
  if (window.NMSky) return;

  var root = document.documentElement;
  var DEG = Math.PI / 180;
  var MAG_DYN = 4.0;                    // brighter than this (and every featured star): scintillates
  var MAG_OWN = 2.0;                    // brighter than this: a sprite of its own
  var TILE = 512;                       // CSS px of sky per sheet tile
  var SHOW = /[?&]sky=show\b/.test(location.search);
  var CROP = { x: 57, y: 159, w: 406, h: 202 };   // the NM mark's box in textures/nm-mark-sdf.png
  var ASPECT = CROP.w / CROP.h;

  /* ---------------------------------------------------------------- the strips
     spine: two sky points; s grows from the first toward the second (short arc) and on
     around the circle. A, B: a sky point and where it sits: [x, y] (x as a fraction of the
     width when <= 1.5; y in px of sky from the top of the page's sky), or 'nm' for the
     centre of the footer constellation (plus dx, dy). turns: extra full turns between A
     and B. Sky points are { gal: [l, b] } or { eq: [RA h, Dec deg] }. phone: below 600 px. */
  var STRIPS = {
    home: {
      desk: { spine: [{ gal: [90, 12] }, { gal: [0, 0] }], A: { eq: [6.7525, -16.7161], at: [0.5, 150] }, B: { gal: [1, 5.5], at: 'nm' } },
      phone: { spine: [{ gal: [90, 0] }, { gal: [0, 0] }], A: { gal: [205, -16], at: [0.5, 610] }, B: { gal: [0, 0], at: 'nm' } }
    },
    about: {
      desk: { spine: [{ gal: [90, 0] }, { gal: [0, 0] }], A: { gal: [84.3, 2.0], at: [0.42, 2700] }, B: { gal: [0, 0], at: 'nm' } },
      phone: { spine: [{ gal: [90, 0] }, { gal: [0, 0] }], A: { gal: [84.3, 2.0], at: [0.5, 3300] }, B: { gal: [0, 0], at: 'nm' } }
    },
    index: {
      desk: { spine: [{ eq: [2.5302, 89.2642] }, { eq: [13.3987, 54.9253] }], A: { eq: [2.5302, 89.2642], at: [0.705, 62] }, B: { eq: [12.9, 60.0], at: 'nm' }, turns: 2 },
      phone: { spine: [{ eq: [2.5302, 89.2642] }, { eq: [13.3987, 54.9253] }], A: { eq: [2.5302, 89.2642], at: [0.5, 50] }, B: { eq: [12.9, 60.0], at: 'nm' }, turns: 2 }
    }
  };
  /* Brightness envelope of the airbrushed sky: mid-page (behind content), the hero margins,
     and the footer ("go heavy into the stars"). */
  var GAIN = { mid: 1.1, hero: 2.4, foot: 2.1 };

  /* H-alpha (and a little reflection) nebulae on the way, galactic [l, b, radius deg,
     strength, kind]: 0 soft cloud, 1 ring, 2 eastern arc (Barnard's Loop), 3 blue reflection */
  var NEBULAE = [
    [206.3, -2.1, 0.8, 2.0, 0],    // Rosette
    [209.0, -19.4, 0.55, 2.6, 0],  // Orion Nebula
    [205.0, -15.5, 7.2, 1.7, 2],   // Barnard's Loop
    [195.1, -12.0, 3.0, 0.55, 0],  // Lambda Orionis (Sh2-264), a soft glow
    [160.6, -12.1, 1.3, 0.5, 0],   // California
    [134.7, 0.9, 0.9, 0.55, 0],    // Heart
    [137.2, 1.0, 0.8, 0.45, 0],    // Soul
    [99.3, 3.7, 1.4, 0.5, 0],      // IC 1396
    [85.6, -0.7, 1.5, 0.75, 0],    // North America
    [84.6, 1.2, 0.7, 0.45, 0],     // Pelican
    [78.2, 2.0, 2.6, 0.35, 0],     // the Sadr region
    [17.0, 0.8, 0.5, 0.6, 0],      // Eagle
    [15.1, -0.7, 0.45, 0.6, 0],    // Omega
    [7.0, -0.25, 0.32, 0.55, 0],   // Trifid
    [6.0, -1.2, 0.8, 1.1, 0],      // Lagoon
    [353.7, 17.7, 1.3, 0.55, 3],   // Rho Ophiuchi (blue reflection)
    [351.9, 15.1, 1.6, 0.35, 0]    // around Antares (warm)
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

  var api = window.NMSky = { canvas: null, page: null, version: 2 };
  var opts = { brightness: 1, twinkle: 1 };

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
  function ptOf(sp) { return sp.gal ? gal2eq(sp.gal[0], sp.gal[1]) : unit(sp.eq[0], sp.eq[1]); }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { var n = Math.sqrt(dot(a, a)); return [a[0] / n, a[1] / n, a[2] / n]; }

  /* The strip: model plane w = m + i s (degrees; s along the spine, m its Mercator
     latitude, positive toward -p, which keeps the view as seen from inside the sphere:
     never mirrored), and the page z = x + i y = alpha w + beta. */
  function Strip(cfg, posA, posB) {
    var P1 = ptOf(cfg.spine[0]), P2 = ptOf(cfg.spine[1]);
    this.p = norm(cross(P1, P2)); this.a0 = P1; this.a1 = cross(this.p, P1);
    this.smin = -180;
    var uA = ptOf(cfg.A), uB = ptOf(cfg.B), wA = this.model(uA), wB;
    this.smin = wA[1] - 60;
    wA = this.model(uA); wB = this.model(uB);
    wB[1] += 360 * (cfg.turns || 0);
    // alpha = (zB - zA) / (wB - wA), beta = zA - alpha wA (complex)
    var dzr = posB[0] - posA[0], dzi = posB[1] - posA[1], dwr = wB[0] - wA[0], dwi = wB[1] - wA[1], dd = dwr * dwr + dwi * dwi;
    this.ar = (dzr * dwr + dzi * dwi) / dd; this.ai = (dzi * dwr - dzr * dwi) / dd;
    this.br = posA[0] - (this.ar * wA[0] - this.ai * wA[1]);
    this.bi = posA[1] - (this.ai * wA[0] + this.ar * wA[1]);
    var k2 = this.ar * this.ar + this.ai * this.ai;
    this.k = Math.sqrt(k2); this.iar = this.ar / k2; this.iai = -this.ai / k2;
    this.theta = Math.atan2(this.ai, this.ar) / DEG;
  }
  Strip.prototype.model = function (u) {
    var c0 = dot(u, this.a0), c1 = dot(u, this.a1), c2 = clamp(dot(u, this.p), -0.999999, 0.999999);
    var s = Math.atan2(c1, c0) / DEG;
    while (s < this.smin) s += 360;
    while (s >= this.smin + 360) s -= 360;
    return [0.5 * Math.log((1 - c2) / (1 + c2)) / DEG, s];
  };
  Strip.prototype.page = function (m, s) { return [this.ar * m - this.ai * s + this.br, this.ai * m + this.ar * s + this.bi]; };
  Strip.prototype.modelOf = function (x, y) {   // page -> (m, s)
    var qx = x - this.br, qy = y - this.bi;
    return [qx * this.iar - qy * this.iai, qx * this.iai + qy * this.iar];
  };
  Strip.prototype.sky = function (x, y) {        // page -> unit vector (equatorial)
    var w = this.modelOf(x, y), s = w[1] * DEG, mm = w[0] * DEG, t = Math.atan(Math.sinh(mm)), c2 = -Math.sin(t), ct = Math.cos(t);
    var cs = Math.cos(s), ss = Math.sin(s), a0 = this.a0, a1 = this.a1, p = this.p;
    return [ct * (cs * a0[0] + ss * a1[0]) + c2 * p[0], ct * (cs * a0[1] + ss * a1[1]) + c2 * p[1], ct * (cs * a0[2] + ss * a1[2]) + c2 * p[2]];
  };

  /* -------------------------------------------------------------------- state */
  var S = {
    page: null, ready: false, mounted: false, data: null, cat: null,
    vw: 0, vh: 0, dpr: 1, W: 0, H: 0, phone: false,
    t: 0, last: 0, lastTw: 0, running: false, raf: 0, still: false, fade: 1,
    Y0: 0, L: 0, R: 0, docH: 0, strip: null, gen: 0, layoutKey: '',
    stat: null, dyn: null, featured: [], nm: null, nmBox: null,
    pointer: { x: -1e4, y: -1e4, fine: false },
    stats: { frames: 0, ms: 0, worst: 0, tiles: 0, tileMs: 0, tileWorst: 0, since: 0 }
  };
  var canvas, ctx, sheet, atlas;

  /* ------------------------------------------------------------------ sprites */
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
  function spriteR(sp) { return sp.core ? Math.max(sp.core.R, sp.flare.R, atlas.flash[0].R) : sp.R; }
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
  // one star: binned sprites carry headroom, own sprites dip and flare
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
    });
    S.cat = list; S.featured = feats; S.data = d;
  }

  /* ------------------------------------------------------------------- layout */
  // The page's sky: Y0 is where sky-y 0 sits in the document; L its length. On the homepage
  // the hero (and its collage) is pinned while it zooms, and its sky with it: the sheet
  // starts one viewport above the bottom of the collage, so the sky that scrolls in below
  // the collage is exactly the sky that stood behind the hero.
  function heroGeometry() {
    var hero = document.querySelector('main > section.h-svh'), made = document.getElementById('nm-made');
    var grid = made && made.querySelector('.index-feature');
    if (!hero || !grid) return null;
    var hold = hero.offsetHeight, gh = grid.offsetHeight, top = 0;
    for (var e = grid; e && e !== made; e = e.offsetParent) top += e.offsetTop;
    if (e !== made) top = 0;
    return { R: hold, P: Math.max(hold, top + gh) };
  }
  function docHeight() {
    if (sheet) sheet.style.height = '0px';
    var h = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    if (sheet && S.L) sheet.style.height = S.L + 'px';
    return h;
  }
  function stripCfg() {
    var c = STRIPS[S.page] || STRIPS.home;
    return S.vw < 600 && c.phone ? c.phone : c.desk;
  }
  function anchorPos(a) {
    if (a.at === 'nm') {
      var n = S.nm || { x: S.vw / 2, y: S.docH - S.vh * 0.58 };
      return [n.x + (a.dx || 0), n.y - S.Y0 + (a.dy || 0)];
    }
    return [a.at[0] <= 1.5 ? a.at[0] * S.vw : a.at[0], a.at[1]];
  }
  /* Place every catalogue star (once per turn of the spine) on the page, bucketed by tile. */
  function placeStars() {
    var st = S.strip, vw = S.vw, L = S.L, pad = 70, nb = Math.ceil(L / TILE) + 1;
    // the strip's s range over the page
    var sLo = 1e9, sHi = -1e9;
    [[-pad, -pad], [vw + pad, -pad], [-pad, L + pad], [vw + pad, L + pad]].forEach(function (c) {
      var w = st.modelOf(c[0], c[1]); sLo = Math.min(sLo, w[1]); sHi = Math.max(sHi, w[1]);
    });
    st.sLo = sLo; st.sHi = sHi;
    var stat = [], dyn = [], nb0 = S.nmBox;
    for (var i = 0; i < S.cat.length; i++) {
      var s = S.cat[i], w = st.model(s.u);
      for (var n = Math.ceil((sLo - w[1]) / 360); w[1] + 360 * n <= sHi; n++) {
        var p = st.page(w[0], w[1] + 360 * n);
        if (p[0] < -pad || p[0] > vw + pad || p[1] < -pad || p[1] > L + pad) continue;
        // the NM constellation takes the place of the catalogue's brighter stars behind it
        if (nb0 && s.f < 0 && s.m < 4.6 && p[0] > nb0[0] && p[0] < nb0[2] && p[1] > nb0[1] && p[1] < nb0[3]) continue;
        var inst = { s: s, x: p[0], y: p[1] };
        if (s.m < MAG_DYN || s.f >= 0) dyn.push(inst); else stat.push(inst);
      }
    }
    var bucket = function (list, rOf) {
      var b = []; for (var j = 0; j < nb; j++) b.push([]);
      list.forEach(function (it) {
        var r = rOf(it), t0 = clamp(Math.floor((it.y - r) / TILE), 0, nb - 1), t1 = clamp(Math.floor((it.y + r) / TILE), 0, nb - 1);
        for (var t = t0; t <= t1; t++) b[t].push(it);
      });
      return b;
    };
    S.featured.forEach(function (f) { f.insts = []; });
    stat.forEach(function (it) { it.sp = binSprite(it.s.m, it.s.bv); it.a = baseAlpha(it.s.m); it.fw = footW(it.y); });
    dyn.forEach(function (it, k) {
      var s = it.s; it.id = k;
      it.sp = s.m < MAG_OWN ? ownSprite(s.m, s.bv) : binSprite(s.m, s.bv);
      it.a = s.m < MAG_OWN ? 1 : baseAlpha(s.m);
      it.R = spriteR(it.sp);
      if (s.f >= 0) S.featured[s.f].insts.push(it);
      it.fw = footW(it.y);
    });
    S.stat = { list: stat, b: bucket(stat, function (it) { return it.sp.R / S.dpr + 1; }) };
    S.dyn = { list: dyn, b: bucket(dyn, function (it) { return it.R / S.dpr + 1; }), tw: new Float32Array(dyn.length), stamp: new Float64Array(dyn.length) };
  }
  // footer brightness envelope at sky-y (shared with the shader)
  function env() {
    var L = S.L, vh = S.vh, home = S.page === 'home';
    return { hero: home ? vh : 0, f0: L - vh * 1.9, f1: L - vh * 0.55 };
  }
  function footW(y) { return smooth(S.L - S.vh * 1.9, S.L - S.vh * 0.55, y); }

  function relayout(force) {
    if (!S.cat) return;
    measure();
    var hg = S.page === 'home' ? heroGeometry() : null;
    S.R = hg ? hg.R : 0; S.Y0 = hg ? hg.P : 0;
    S.docH = docHeight();
    layoutFooter();
    var L = Math.max(S.vh, S.docH - S.Y0);
    var sig = [S.vw, S.dpr, S.docH, S.Y0, S.nm && Math.round(S.nm.x), S.nm && Math.round(S.nm.y), document.body.offsetHeight].join('|');
    if (!force && sig === S.sig) return;
    S.sig = sig;
    // the mapping is solved once per width (and when the page changes length a lot), so the
    // sky never jumps when an accordion opens; the sheet just grows or shrinks
    var key = S.page + '|' + S.vw + '|' + S.dpr;
    var refit = force || key !== S.layoutKey || !S.strip || Math.abs(L - S.fitL) > S.vh * 0.6;
    S.L = L;
    sheet.style.top = S.Y0 + 'px'; sheet.style.height = L + 'px';
    if (refit) {
      var cfg = stripCfg();
      S.strip = new Strip(cfg, anchorPos(cfg.A), anchorPos(cfg.B));
      S.fitL = L; S.layoutKey = key;
      placeStars();
    } else if (Math.ceil(L / TILE) + 1 > S.stat.b.length) placeStars();
    buildMask();
    S.gen++;
    dropTiles();
    kick();
    if (!S.shown) { S.shown = true; requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.style.opacity = '1'; }); }); }
  }

  /* -------------------------------------------------------- AA contrast caps */
  // For every line of text on the page: the most light the sky may add behind it so the
  // text keeps its WCAG AA contrast (4.5:1, 3:1 for large text) against the #0a0a0a
  // ground, encoded sqrt(cap / 0.2) in a page-length mask the shader reads. Sticky text
  // claims its whole sticky range; fixed text (the header) has its own scrim.
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
    var sc = Math.max(4, Math.ceil(S.L / 4000)), w = Math.max(1, Math.ceil(S.vw / sc)), h = Math.max(1, Math.ceil(S.L / sc));
    var FEATHER = 30;   // CSS px of soft falloff around each line of text
    var c = MASK.canvas || (MASK.canvas = document.createElement('canvas'));
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'darken';
    var sy = window.scrollY || 0, rg = document.createRange(), Y0 = S.Y0;
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
        var pad = 8 + fs * 0.4 + FEATHER, top = r.top + sy - Y0, bot = r.bottom + sy - Y0;
        if (ext) { top = Math.min(top, ext[0] - Y0); bot = Math.max(bot, ext[1] - Y0); }
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

  /* ------------------------------------------------------- the airbrushed sky */
  var GL = { ok: false, gl: null, canvas: null, prog: null, loc: null, tex: null, texVer: -1, lost: false };
  function nebulaGLSL() {
    var out = [];
    NEBULAE.forEach(function (n) {
      var g = galUnit(n[0], n[1]);
      var v = 'vec3(' + g.map(function (x) { return x.toFixed(6); }).join(',') + ')';
      var r = n[2].toFixed(3), a = n[3].toFixed(3);
      if (n[4] === 0) out.push('  { float d = length(g - ' + v + ') * 57.29578 / ' + r + '; neb += ' + a + ' * exp(-0.5 * d * d) * (0.65 + 0.55 * nM); }');
      else if (n[4] === 3) out.push('  { float d = length(g - ' + v + ') * 57.29578 / ' + r + '; refl += ' + a + ' * exp(-0.5 * d * d) * (0.6 + 0.6 * nM); }');
      else {
        // rings and arcs: distance from the rim, in the tangent plane at the centre
        var e = norm(cross([0, 0, 1], g)), nn = cross(g, e);
        // celestial east at the centre, in galactic coordinates (Barnard's Loop is the eastern arc)
        var ue = gal2eq(n[0], n[1]), ee = norm(cross([0, 0, 1], ue));
        var east = [0, 1, 2].map(function (i) { return GAL[i][0] * ee[0] + GAL[i][1] * ee[1] + GAL[i][2] * ee[2]; });
        var vec = function (a) { return 'vec3(' + a.map(function (x) { return x.toFixed(6); }).join(',') + ')'; };
        var arc = n[4] === 2 ? ' * smoothstep(-0.3, 0.5, dot(q, ' + vec(east) + ') * 57.29578 / max(rq, 1e-3))' : '';
        out.push('  { vec3 q = g - ' + v + '; float rq = length(vec2(dot(q, ' + vec(e) + '), dot(q, ' + vec(nn) + '))) * 57.29578; float d = (rq - ' + r + ') / (0.16 * ' + r + '); neb += ' + a + ' * exp(-d * d) * (0.55 + 0.7 * nF2) * step(0.9, dot(g, ' + v + '))' + arc + '; }');
      }
    });
    return out.join('\n');
  }
  var FRAG = [
    'precision highp float;',
    'uniform vec2 uRes; uniform vec2 uOrg; uniform float uDpr; uniform vec2 uIA; uniform vec2 uB;',
    'uniform vec3 uA0; uniform vec3 uA1; uniform vec3 uP; uniform mat3 uGal;',
    'uniform vec4 uEnv; uniform vec4 uGain; uniform sampler2D uMask; uniform vec4 uMaskInfo; uniform float uSeed;',
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
    'float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }',
    'vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }',
    'float fbm(vec3 p) { return 0.5 * snoise(p) + 0.25 * snoise(p * 2.03 + 17.1) + 0.125 * snoise(p * 4.11 - 9.7); }',
    'float ridge(vec3 p) { float n = 1.0 - abs(snoise(p)); return n * n; }',
    'float bump(float x, float c, float w) { float d = (x - c) / w; return exp(-d * d); }',
    'float sq(float x) { return x * x; }',
    // gradient maps, keyed on light: warm (the core), peach (the transitions), cool (far out)
    'vec3 rampWarm(float v) {',
    '  vec3 c = mix(vec3(0.0), vec3(0.068, 0.053, 0.052), smoothstep(0.0, 0.06, v));',
    '  c = mix(c, vec3(0.19, 0.124, 0.112), smoothstep(0.05, 0.15, v));',
    '  c = mix(c, vec3(0.42, 0.255, 0.18), smoothstep(0.13, 0.3, v));',
    '  c = mix(c, vec3(0.72, 0.5, 0.3), smoothstep(0.27, 0.48, v));',
    '  c = mix(c, vec3(0.95, 0.76, 0.5), smoothstep(0.44, 0.66, v));',
    '  c = mix(c, vec3(1.0, 0.9, 0.72), smoothstep(0.62, 0.86, v));',
    '  return mix(c, vec3(1.0, 0.95, 0.86), smoothstep(0.86, 1.0, v));',
    '}',
    'vec3 rampPeach(float v) {',
    '  vec3 c = mix(vec3(0.0), vec3(0.064, 0.057, 0.056), smoothstep(0.0, 0.06, v));',
    '  c = mix(c, vec3(0.19, 0.13, 0.12), smoothstep(0.05, 0.16, v));',
    '  c = mix(c, vec3(0.42, 0.3, 0.25), smoothstep(0.14, 0.34, v));',
    '  c = mix(c, vec3(0.72, 0.56, 0.46), smoothstep(0.3, 0.6, v));',
    '  return mix(c, vec3(1.0, 0.9, 0.8), smoothstep(0.55, 1.0, v));',
    '}',
    'vec3 rampCool(float v) { return v * mix(vec3(0.93, 0.96, 1.05), vec3(1.0, 0.99, 0.97), smoothstep(0.2, 0.9, v)); }',
    'float sech2(float x) { float e = exp(-2.0 * abs(x)); return 4.0 * e / ((1.0 + e) * (1.0 + e)); }',
    'vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }',
    'float lumOf(vec3 add) { float a = max(add.r, max(add.g, add.b)); vec3 c = add + vec3(0.0392157) * (1.0 - a); return dot(toLin(c), vec3(0.2126, 0.7152, 0.0722)); }',
    'float fbm4(vec3 p) { return 0.5 * snoise(p) + 0.27 * snoise(p * 2.07 + 1.7) + 0.15 * snoise(p * 4.31 - 2.3) + 0.08 * snoise(p * 8.73 + 5.1); }',
    'void main() {',
    '  vec2 fc = gl_FragCoord.xy;',
    '  vec2 css = vec2(fc.x / uDpr, uOrg.y + (uRes.y - fc.y) / uDpr);',
    '  vec2 q = css - uB;',
    '  vec2 w = vec2(q.x * uIA.x - q.y * uIA.y, q.x * uIA.y + q.y * uIA.x);',
    '  float s = radians(w.y), mm = radians(w.x);',
    '  float t = atan(0.5 * (exp(mm) - exp(-mm)));',
    '  vec3 u = cos(t) * (cos(s) * uA0 + sin(s) * uA1) - sin(t) * uP;',
    '  vec3 g = uGal * u;',
    '  float b = degrees(asin(clamp(g.z, -1.0, 1.0)));',
    '  float l = degrees(atan(g.y, g.x));',
    '  float al = abs(l);',
    // structure lives on the sphere (seamless) and is drawn out along the plane, as the
    // Milky Way's clouds and lanes are
    '  vec3 ga = vec3(g.xy, g.z * 1.7);',
    '  vec3 warp = vec3(snoise(ga * 3.0 + 3.1), snoise(ga * 3.0 - 5.7), snoise(ga * 3.0 + 9.2));',
    '  float nC = fbm4(ga * 6.5 + warp * 0.7);',
    '  float nM = fbm(ga * 21.0 + warp * 0.8 - 4.3);',
    '  float nF = snoise(ga * 70.0 + warp);',
    '  float nF2 = snoise(g * 41.0 + 8.0) * 0.5 + 0.5;',
    '  vec3 gd = ga * 13.0 + warp * 1.1 + 2.0;',
    '  float dn = 0.5 * snoise(gd) + 0.26 * snoise(gd * 2.13 + 1.7) + 0.14 * snoise(gd * 4.41 - 2.3) + 0.08 * snoise(gd * 9.1 + 5.1) + 0.05 * snoise(gd * 18.7 - 7.7);',
    // the band: brightness along l, its width, the named star clouds, the bulge
    '  float A = 0.17 + 0.16 * bump(al, 180.0, 35.0) + 0.12 * bump(l, 138.0, 26.0) + 0.14 * bump(l, 108.0, 14.0)',
    '    + 0.55 * bump(l, 76.0, 14.0) + 0.36 * bump(l, 50.0, 13.0) + 0.6 * bump(l, 27.0, 8.0) + 0.45 * bump(l, 12.0, 6.0)',
    '    + 0.95 * bump(l, 3.0, 12.0) + 0.5 * bump(l, -22.0, 16.0) + 0.35 * bump(l, -70.0, 25.0);',
    '  float wd = 2.4 + 3.4 * bump(l, 0.0, 32.0) + 1.4 * bump(l, 72.0, 22.0) + 0.7 * bump(al, 180.0, 40.0);',
    '  float clouds = smoothstep(-0.55, 0.6, nC);',
    '  float disk = A * sech2((b + 0.7 * nM) / wd) * (0.45 + 0.85 * clouds) * (0.9 + 0.2 * nM);',
    '  float sc = 1.2 * exp(-(sq(l - 1.5) + sq(b + 4.6) * 1.3) / (2.0 * 3.4 * 3.4))',
    '    + 0.7 * exp(-(sq(l - 12.0) * 0.6 + sq(b + 0.8)) / (2.0 * 1.3 * 1.3))',
    '    + 0.75 * exp(-(sq(l - 27.5) * 0.7 + sq(b + 2.4)) / (2.0 * 2.4 * 2.4))',
    '    + 0.5 * exp(-(sq(l - 75.0) * 0.35 + sq(b - 0.8)) / (2.0 * 3.2 * 3.2));',
    '  sc *= 0.65 + 0.55 * clouds;',
    '  float bulge = 1.0 * exp(-(l * l + sq(b + 3.2) * 1.45) / (2.0 * 9.5 * 9.5)) * (0.6 + 0.6 * clouds);',
    '  float I = disk + bulge + sc;',
    '  float wing = (0.16 * A + 0.24 * bump(l, 0.0, 38.0)) * exp(-b * b / (2.0 * 15.0 * 15.0));',
    // dust: an envelope for each lane, one fractal texture the envelopes eat the light with
    '  float rc = 1.5 + 2.8 * smoothstep(85.0, 0.0, l), rw = 1.3 + 3.3 * smoothstep(80.0, 0.0, l);',
    '  float eRift = 0.95 * smoothstep(98.0, 83.0, l) * smoothstep(-14.0, -2.0, l) * exp(-sq((b - rc) / rw));',
    '  float eLane = 0.6 * exp(-sq(b / 1.3)) * (0.35 + 0.65 * bump(l, 10.0, 95.0));',
    '  float eOph = (0.62 + 0.3 * nC) * exp(-(sq(l - 1.0) / (2.0 * 7.0 * 7.0) + sq(b - 6.0) / (2.0 * 4.4 * 4.4))) + 0.7 * exp(-(sq(l + 6.0) + sq(b - 16.5)) / (2.0 * 2.8 * 2.8))',
    '    + 0.45 * exp(-(sq(b - 5.0 - 0.35 * (l + 3.0)) / (2.0 * 1.6 * 1.6))) * smoothstep(-13.0, -7.0, l) * smoothstep(4.0, -1.0, l);',
    '  float eTau = 0.55 * bump(l, 170.0, 9.0) * bump(b, -15.0, 6.0) + 0.3 * bump(l, 160.0, 7.0) * bump(b, -18.0, 5.0);',
    '  float eCir = 0.35 * exp(-b * b / (2.0 * 12.0 * 12.0)) * smoothstep(0.15, 0.6, nC * 0.5 + 0.5 * fbm(ga * 5.0 + 7.7));',
    '  float eD = eRift + eLane + eOph + eTau + eCir;',
    '  float dn2 = fbm(ga * 9.0 - warp * 0.8 + 11.0);',
    '  float D1 = 0.84 * smoothstep(-0.05, 0.5, dn + eD - 0.62);',
    '  float D2 = 0.5 * smoothstep(-0.35, 0.35, dn2 + 0.85 * eD - 0.38);',
    '  float Dst = 1.0 - (1.0 - D1) * (1.0 - D2);',
    '  float T = 1.0 - Dst;',
    // colour: cool white far from the centre, cream, peach, gold at the core; coral where
    // dust thins the light; the brightest clouds burn toward warm white
    '  float warm = bump(l, 2.0, 62.0);',
    '  float edge = clamp(Dst * (1.0 - Dst) * 4.0, 0.0, 1.0);',
    // nebulae
    '  float neb = 0.0, refl = 0.0;',
    '__NEBULAE__',
    // soft orange and yellow washes across the rest of the sky
    '  float wa = clamp(snoise(g * 0.9 + 4.0) * 0.6 + 0.5, 0.0, 1.0), wb = clamp(snoise(g * 1.7 - 2.0) * 0.6 + 0.5, 0.0, 1.0);',
    '  float wash = smoothstep(0.45, 1.0, wa) * (0.55 + 0.45 * wb) * (0.85 + 0.3 * nC);',
    // envelope: the hero margins, mid-page, the footer
    '  float heroW = uEnv.x > 0.0 ? 1.0 - smoothstep(uEnv.x * 0.8, uEnv.x * 1.4, css.y) : 0.0;',
    '  float footW = smoothstep(uEnv.y, uEnv.z, css.y);',
    '  float E = (uGain.x + (uGain.y - uGain.x) * heroW + (uGain.z - uGain.x) * footW) * uGain.w;',
    // light, then colour from light through the gradient maps
    '  float vB = ((I * T) * 0.15 + wing * 0.06 * (1.0 - 0.6 * Dst)) * E;',
    '  float vW = wash * 0.06 * E;',
    '  float v = vB + vW;',
    '  float vt = 0.95 * (1.0 - exp(-v / 0.95));',
    '  float wEff = (vB * clamp(warm + 0.35 * edge, 0.0, 1.0) + vW * 0.62) / max(v, 1e-5);',
    '  vec3 lightC = mix(rampCool(vt), rampPeach(vt), smoothstep(0.08, 0.45, wEff));',
    '  lightC = mix(lightC, rampWarm(vt), smoothstep(0.4, 0.88, wEff));',
    '  lightC *= 1.0 + 0.05 * vec3(nM, 0.3 * nC, -nM);',
    '  vec3 nebC = neb * vec3(1.0, 0.4, 0.47) * 0.1 * (1.0 - 0.7 * Dst) + refl * vec3(0.5, 0.64, 1.0) * 0.07;',
    '  lightC += nebC * E * 0.95 / (1.0 + 0.7 * length(nebC * E));',
    '  float g1 = hash13(vec3(fc, uSeed)) - 0.5;',
    '  float g2 = snoise(vec3(css * 0.55, uSeed * 0.01));',
    '  lightC *= 1.0 + 0.3 * g1 + 0.12 * g2;',
    // unresolved stars: points on a 2 px lattice of cells; the dust hides them too
    '  float rho = (0.003 + 0.13 * clamp(disk + bulge + sc, 0.0, 2.0) * (T * T + 0.12)) * (0.5 + 0.5 * E);',
    '  float cell = 2.0; vec2 cp = css / cell; vec2 ci = floor(cp); vec3 dust = vec3(0.0);',
    '  float pc = clamp(rho * cell * cell, 0.0, 0.85), sig = 0.36 / cell;',
    '  for (int dy = -1; dy <= 1; dy++) { for (int dx = -1; dx <= 1; dx++) {',
    '    vec2 cc = ci + vec2(float(dx), float(dy));',
    '    vec3 h = hash33(vec3(cc, uSeed + 3.0));',
    '    if (h.z < pc) {',
    '      vec2 d = cp - (cc + h.xy);',
    '      float br = 0.02 + 0.45 * pow(fract(h.z * 91.7), 5.0);',
    '      dust += br * exp(-dot(d, d) / (2.0 * sig * sig)) * mix(vec3(1.0), lightC / max(max(lightC.r, lightC.g), max(lightC.b, 1e-4)), 0.45);',
    '    }',
    '  } }',
    '  vec3 c = lightC + dust * (0.7 + 0.3 * E);',
    // AA: never more light behind text than its contrast allows
    '  if (uMaskInfo.w > 0.5) {',
    '    float mv = texture2D(uMask, vec2(css.x / uMaskInfo.x / uMaskInfo.y, css.y / uMaskInfo.x / uMaskInfo.z)).r;',
    '    float cap = 0.2 * mv * mv;',
    '    if (cap < 0.199) {',
    '      float lim = cap + 0.0030353;',
    '      if (lumOf(c) > lim) {',
    '        float lo = 0.0, hi = 1.0;',
    '        for (int k = 0; k < 7; k++) { float md = 0.5 * (lo + hi); if (lumOf(c * md) > lim) hi = md; else lo = md; }',
    '        c *= lo;',
    '      }',
    '    }',
    '  }',
    // dither below one 8-bit step, so the faintest gradients never band
    '  c += (hash13(vec3(fc, uSeed + 11.0)) - 0.5) / 255.0;',
    '  c = clamp(c, 0.0, 1.0);',
    '  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));',
    '}'
  ].join('\n');
  var VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
  function glInit() {
    if (GL.gl || GL.failed) return GL.ok;
    try {
      var c = GL.canvas = document.createElement('canvas');
      c.width = c.height = 4;
      var gl = c.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
      if (!gl) throw new Error('no webgl');
      var sh = function (type, src) {
        var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
        return o;
      };
      var pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG.replace('__NEBULAE__', nebulaGLSL())));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var ap = gl.getAttribLocation(pr, 'p');
      gl.enableVertexAttribArray(ap);
      gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
      var loc = {};
      ['uRes', 'uOrg', 'uDpr', 'uIA', 'uB', 'uA0', 'uA1', 'uP', 'uGal', 'uEnv', 'uGain', 'uMask', 'uMaskInfo', 'uSeed'].forEach(function (n) { loc[n] = gl.getUniformLocation(pr, n); });
      GL.tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, GL.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(loc.uMask, 0);
      gl.uniformMatrix3fv(loc.uGal, false, [GAL[0][0], GAL[1][0], GAL[2][0], GAL[0][1], GAL[1][1], GAL[2][1], GAL[0][2], GAL[1][2], GAL[2][2]]);
      c.addEventListener('webglcontextlost', function (e) { e.preventDefault(); GL.ok = false; GL.lost = true; });
      c.addEventListener('webglcontextrestored', function () { GL.gl = null; GL.lost = false; GL.texVer = -1; if (glInit()) { S.gen++; dropTiles(); kick(); } });
      GL.gl = gl; GL.prog = pr; GL.loc = loc; GL.ok = true;
    } catch (err) {
      GL.failed = true; GL.ok = false;
      console.warn('[nm-sky] airbrushed sky unavailable:', err && err.message);
    }
    return GL.ok;
  }
  // render the airbrush for tile t into the GL canvas (top-left W x h); false when unavailable
  function glTile(t) {
    if (!GL.ok || GL.lost) return false;
    var gl = GL.gl, c = GL.canvas, d = S.dpr, W = S.W, Hf = Math.round(TILE * d), h = t.hd, loc = GL.loc, st = S.strip, e = env();
    if (c.width !== W || c.height !== Hf) { c.width = W; c.height = Hf; }
    if (GL.texVer !== MASK.ver && MASK.canvas) {
      gl.bindTexture(gl.TEXTURE_2D, GL.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, MASK.canvas);
      GL.texVer = MASK.ver;
    }
    gl.viewport(0, Hf - h, W, h);
    gl.uniform2f(loc.uRes, W, Hf);
    gl.uniform2f(loc.uOrg, 0, t.y0);
    gl.uniform1f(loc.uDpr, d);
    gl.uniform2f(loc.uIA, st.iar, st.iai);
    gl.uniform2f(loc.uB, st.br, st.bi);
    gl.uniform3fv(loc.uA0, st.a0); gl.uniform3fv(loc.uA1, st.a1); gl.uniform3fv(loc.uP, st.p);
    gl.uniform4f(loc.uEnv, e.hero, e.f0, e.f1, S.L);
    gl.uniform4f(loc.uGain, GAIN.mid, GAIN.hero, GAIN.foot, opts.brightness);
    gl.uniform4f(loc.uMaskInfo, MASK.scale, MASK.w, MASK.h, MASK.canvas ? 1 : 0);
    gl.uniform1f(loc.uSeed, (t.i * 37.0) % 1000 + 1.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  /* ------------------------------------------------------------------- tiles */
  var TL = { live: {}, pool: [], count: 0 };
  function tileCount() { return Math.max(1, Math.ceil(S.L / TILE)); }
  function makeTile(i) {
    var c = TL.pool.pop() || document.createElement('canvas');
    var y0 = i * TILE, h = Math.min(TILE, S.L - y0), d = S.dpr, hd = Math.max(1, Math.round((y0 + h) * d) - Math.round(y0 * d));
    c.className = 'nm-sky-tile';
    c.setAttribute('aria-hidden', 'true');
    if (c.width !== S.W || c.height !== hd) { c.width = S.W; c.height = hd; }
    c.style.cssText = 'position:absolute;left:0;top:' + y0 + 'px;width:100%;height:' + h + 'px;display:block;pointer-events:none';
    var t = { i: i, y0: y0, h: h, hd: hd, canvas: c, ctx: c.getContext('2d'), dyn: null, patch: null, gen: S.gen, drawnAt: -1 };
    return t;
  }
  function renderTile(t) {
    var t0 = performance.now(), c = t.ctx, d = S.dpr, W = S.W;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'copy';
    if (glTile(t)) c.drawImage(GL.canvas, 0, 0, W, t.hd, 0, 0, W, t.hd);
    else { c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, W, t.hd); }
    c.globalCompositeOperation = 'lighter';
    c.imageSmoothingEnabled = false;
    // the faint catalogue stars (a little brighter in the heavy footer sky)
    var img = atlas.canvas, list = S.stat.b[t.i] || [], top = t.y0, br = opts.brightness;
    for (var k = 0; k < list.length; k++) {
      var it = list[k], sp = it.sp, a = it.a * br * (1 + 0.45 * it.fw);
      var xd = Math.round(it.x * d), yd = Math.round((it.y - top) * d);
      c.globalAlpha = a > 1 ? 1 : a;
      c.drawImage(img, sp.sx, sp.sy, sp.s, sp.s, xd - sp.R, yd - sp.R, sp.s, sp.s);
    }
    // the bright stars: keep what lies under each, then draw them
    var dl = S.dyn.b[t.i] || [], ents = [], pw = 0, ph = 0, rowH = 0, PX = 1024;
    for (var j = 0; j < dl.length; j++) {
      var it2 = dl[j], R = it2.R, xd2 = Math.round(it2.x * d), yd2 = Math.round((it2.y - top) * d);
      var bx = Math.max(0, xd2 - R), by = Math.max(0, yd2 - R), bx1 = Math.min(W, xd2 + R + 1), by1 = Math.min(t.hd, yd2 + R + 1);
      if (bx1 <= bx || by1 <= by) continue;
      var bw = bx1 - bx, bh = by1 - by;
      if (pw + bw > PX) { ph += rowH + 1; pw = 0; rowH = 0; }
      ents.push({ it: it2, xd: xd2, yd: yd2, bx: bx, by: by, bw: bw, bh: bh, px: pw, py: ph });
      pw += bw + 1; rowH = Math.max(rowH, bh);
    }
    if (ents.length) {
      var pc = t.patch || (t.patch = document.createElement('canvas'));
      var need = ph + rowH + 1;
      if (pc.width !== PX || pc.height < need) { pc.width = PX; pc.height = need; }
      var px = pc.getContext('2d');
      px.globalCompositeOperation = 'source-over';
      px.globalAlpha = 1;
      px.clearRect(0, 0, pc.width, pc.height);
      ents.forEach(function (e) { px.drawImage(t.canvas, e.bx, e.by, e.bw, e.bh, e.px, e.py, e.bw, e.bh); });
      t.dyn = ents;
    } else t.dyn = null;
    t.gen = S.gen;
    drawDyn(t, S.still ? 0 : S.t, true);
    var ms = performance.now() - t0, stt = S.stats;
    stt.tiles++; stt.tileMs += ms; if (ms > stt.tileWorst) stt.tileWorst = ms;
  }
  // redraw a tile's bright stars at their current scintillation
  function drawDyn(t, time, fresh) {
    var ents = t.dyn;
    if (!ents) return;
    var c = t.ctx, D = S.dyn, br = opts.brightness, p = S.pointer;
    c.globalAlpha = 1;
    if (!fresh) {
      c.globalCompositeOperation = 'source-over';
      for (var i = 0; i < ents.length; i++) {
        var e = ents[i];
        c.clearRect(e.bx, e.by, e.bw, e.bh);
        c.drawImage(t.patch, e.px, e.py, e.bw, e.bh, e.bx, e.by, e.bw, e.bh);
      }
    }
    c.globalCompositeOperation = 'lighter';
    var top = skyTop(), hov = p.fine && S.featured.length;
    for (var j = 0; j < ents.length; j++) {
      var en = ents[j], it = en.it, s = it.s, id = it.id, tw;
      if (D.stamp[id] === time && time) tw = D.tw[id];
      else { tw = twinkle(time, s.r1, s.r2, s.o1, s.o2, s.depth); D.tw[id] = tw; D.stamp[id] = time; }
      var a = it.a * br * (1 + 0.22 * it.fw);
      if (hov && s.f >= 0) {   // a barely-there lift as the pointer nears a featured star
        var pd = Math.hypot(it.x - p.x, it.y - top - p.y);
        if (pd < 90) a *= 1 + 0.3 * (1 - pd / 90);
      }
      drawOne(c, it.sp, s.m, en.xd, en.yd, a, tw, time, s.o3);
    }
    t.drawnAt = time;
  }
  function dropTiles() {
    for (var k in TL.live) releaseTile(TL.live[k]);
    TL.live = {};
  }
  function releaseTile(t) {
    if (t.canvas.parentNode) t.canvas.remove();
    if (TL.pool.length < 6) TL.pool.push(t.canvas); else { t.canvas.width = t.canvas.height = 0; }
    t.patch = null; t.dyn = null;
    delete TL.live[t.i];
  }
  // the sky-y at the top of the viewport (the hero's sky is pinned while it zooms)
  function skyTop() {
    var y = window.scrollY || 0;
    if (S.page === 'home' && y < S.R) return 0;
    return y - S.Y0;
  }
  function heroZone() { return S.page === 'home' && S.R > 0 && (window.scrollY || 0) < S.R; }
  // make sure the tiles in view exist (urgently) and those just around it (a few per frame)
  var dir = 1, lastTop = 0;
  function ensureTiles(budgetMs) {
    if (!S.ready) return;
    var n = tileCount(), vh = S.vh, top = skyTop(), t0 = performance.now();
    if (top !== lastTop) { dir = top > lastTop ? 1 : -1; lastTop = top; }
    var need = [], want = [];
    var addRange = function (arr, y0, y1) {
      for (var i = clamp(Math.floor(y0 / TILE), 0, n - 1), e = clamp(Math.floor(y1 / TILE), 0, n - 1); i <= e; i++) if (arr.indexOf(i) < 0) arr.push(i);
    };
    if (top + vh > 0) addRange(need, top, top + vh);
    if (heroZone() || S.page === 'home' && (window.scrollY || 0) < S.R + vh * 2) addRange(heroZone() ? need : want, 0, vh);
    addRange(want, top - vh * (dir < 0 ? 1.1 : 0.5), top + vh * (dir > 0 ? 2.1 : 1.5));
    for (var a = 0; a < need.length; a++) {
      var i = need[a], t = TL.live[i];
      if (!t || t.gen !== S.gen) { t = t || makeTile(i); renderTile(t); attach(t); }
    }
    for (var b = 0; b < want.length && performance.now() - t0 < budgetMs; b++) {
      var j = want[b], u = TL.live[j];
      if (!u || u.gen !== S.gen) { u = u || makeTile(j); renderTile(u); attach(u); }
    }
    // release what is far away
    var keep0 = top - vh * 1.6, keep1 = top + vh * 2.8;
    for (var k in TL.live) {
      var tt = TL.live[k], y0 = tt.y0, y1 = tt.y0 + tt.h;
      var heroKeep = S.page === 'home' && y0 < vh && (window.scrollY || 0) < S.R + vh * 2.5;
      if ((y1 < keep0 || y0 > keep1) && !heroKeep) releaseTile(tt);
    }
  }
  function attach(t) {
    TL.live[t.i] = t;
    if (t.canvas.parentNode !== sheet) sheet.appendChild(t.canvas);
  }
  // scintillate the bright stars on the tiles in view (and the hero's)
  function twinkleTiles(time) {
    var top = skyTop(), vh = S.vh, hero = heroZone();
    for (var k in TL.live) {
      var t = TL.live[k];
      if (!t.dyn) continue;
      var vis = t.y0 < top + vh && t.y0 + t.h > top || hero && t.y0 < vh;
      if (vis) drawDyn(t, time, false);
    }
  }

  /* --------------------------------------------------------------- open sky */
  var MEDIA = /^(IMG|VIDEO|CANVAS|IFRAME|PICTURE|INPUT|TEXTAREA|SELECT|svg|SVG)$/;
  var INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="button"]';
  var textRange = document.createRange();
  var heroCanvas = null, headerEl = null, labelEl = null;
  function own(el) { return el === canvas || el === labelEl || el === cons.canvas || el === sheet || el.className === 'nm-sky-tile'; }
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
  // The homepage hero paints the sky itself outside the NM mark (heroClear); treat the
  // mark's box, and the whole hero once the zoom is under way, as covered.
  function heroOpen(x, y) {
    if ((window.scrollY || 0) > S.vh * 0.1) return false;
    var mw = Math.min(S.vw * 0.62, S.vh * 0.65), mh = mw * 0.56, my = S.vh * (S.vw < S.vh ? 0.44 : 0.486);
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
  // a featured star's viewport position (null when off screen)
  function starScreen(k) {
    var f = S.featured[k], top = skyTop(), best = null;
    if (!f || !f.insts) return null;
    for (var i = 0; i < f.insts.length; i++) {
      var it = f.insts[i], x = it.x, y = it.y - top;
      if (x > -30 && x < S.vw + 30 && y > -30 && y < S.vh + 30 && (!best || Math.abs(y - S.vh / 2) < Math.abs(best.y - S.vh / 2))) best = { x: x, y: y };
    }
    return best;
  }
  function anchor() { return label.kind === 'cons' ? cons.anchor() : starScreen(label.star); }
  function placeLabel() {
    var a = anchor();
    if (!a) return;
    var gap = label.kind === 'cons' ? 18 : 20, w = label.w, h = label.h, vw = S.vw, vh = S.vh;
    var xl = a.xl != null ? a.xl : a.x;
    var side = a.x + gap + w <= vw - 12 ? 1 : xl - gap - w >= 12 ? -1 : 0;
    var x, y;
    if (side) { x = side > 0 ? a.x + gap : xl - gap - w; y = clamp(a.y - 18, 12, vh - h - 12); }
    else {
      var cx = a.cx != null ? a.cx : a.x, top = a.top != null ? a.top : a.y, bot = a.bottom != null ? a.bottom : a.y;
      x = clamp(cx - w / 2, 12, vw - w - 12); y = top - gap - h >= 12 ? top - gap - h : bot + gap;
    }
    label.x = x; label.y = y; label.side = side; label.ax = a.x; label.ay = a.y;
    labelEl.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
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
    if (f.openAt && now - f.openAt < 220 && Math.abs(f.openY - (window.scrollY || 0)) < 2) return f.open;
    f.open = openSky(p.x, p.y, false);
    f.openAt = now; f.openY = window.scrollY || 0;
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
  // Event positions are page sky coordinates (they ride with the sky as you scroll).
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
  function spawn(kind, forced) {
    var vw = S.vw, vh = S.vh, top = skyTop(), e = null, L0 = Math.max(vw, vh);
    if (kind === 'meteor') {
      var len = (110 + evR() * 170) * clamp(Math.sqrt(L0 / 1440), 0.65, 1.2), ang = (evR() * 2 - 1) * Math.PI;
      if (Math.sin(ang) < -0.3) ang = -ang;                   // mostly falling, never straight up
      var dx = Math.cos(ang), dy = Math.sin(ang);
      var p = openPoint(36, forced ? 16 : 10, function (x, y) {
        return openSky(x, y, false) && openSky(x + dx * len * 0.5, y + dy * len * 0.5, false) && openSky(x + dx * len, y + dy * len, false);
      }) || (forced ? openPoint(36, 1) : null);
      if (!p) return false;
      var fire = evR() < 0.08;   // now and then a brighter one with a little terminal burst
      e = { kind: kind, x: p.x, y: p.y + top, dx: dx, dy: dy, len: len * (fire ? 1.3 : 1), t: 0,
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
      e = { kind: kind, x: sx, y: sy + top, dx: Math.cos(a2), dy: Math.sin(a2), v: v, t: 0, m: m,
        sp: binSprite(m, 0.55), a0: baseAlpha(m), life: (across + 30) / v,
        fadeT: 2.4 + evR() * 1.8, fading: -1 };
      e.shadowT = evR() < 0.45 ? (0.35 + evR() * 0.4) * (across / v) : -1;
    } else if (kind === 'ufo') {
      var q = openPoint(90, 16, function (x, y) { return openSky(x, y, false) && openSky(x + 40, y, false) && openSky(x - 40, y, false); }) || (forced ? openPoint(90, 1) : null);
      if (!q) return false;
      var ga = evR() * Math.PI * 2;
      e = { kind: kind, x: q.x, y: q.y + top, gx: Math.cos(ga), gy: Math.sin(ga) * 0.5, t: 0,
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
  /* A meteor: a thin tapered streak whose head (a touch green or blue-white) brightens as
     it burns, a warm fading train behind it, gone in well under a second. */
  function drawMeteor(c, e, top) {
    var d = S.dpr, u = e.t / e.T, k = Math.min(1, u);
    var head = 1 - Math.pow(1 - k, 1.5);
    var bright = (u < 1 ? Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.04)), 0.7) : 0) * e.a;
    if (e.fire && u > 0.82 && u < 1) bright *= 1 + 1.4 * Math.sin((u - 0.82) / 0.18 * Math.PI);
    var hx = e.x + e.dx * e.len * head, hy = e.y - top + e.dy * e.len * head;
    var tl = e.len * (0.18 + 0.55 * Math.min(1, u * 1.5)), fadeOut = u > 1 ? 1 - (u - 1) / (0.25 / e.T) : 1;
    var tx = hx - e.dx * tl, ty = hy - e.dy * tl, nx = -e.dy, ny = e.dx;
    var wh = (e.fire ? 1.35 : 1.0) * Math.max(0.75, 1.1 / Math.sqrt(d)) * d * 0.5;   // half width of the head, device px
    var A = bright * S.fade;
    // the train (lingers a moment after the head is gone)
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
    var d = S.dpr, top = skyTop();
    c.globalCompositeOperation = 'lighter';
    EV.list.forEach(function (e) {
      if (e.kind === 'meteor') drawMeteor(c, e, top);
      else if (e.kind === 'satellite') {
        var x = e.x + e.dx * e.v * e.t, y = e.y - top + e.dy * e.v * e.t;
        var a = e.a0 * Math.min(1, e.t / 1.2) * S.fade * (1 + 0.04 * Math.sin(e.t * 1.7));
        if (e.fading >= 0) a *= Math.pow(1 - clamp(e.fading / e.fadeT, 0, 1), 1.6);
        blit(c, e.sp, Math.round(x * d), Math.round(y * d), a);
      } else {
        var t = e.t, px = e.x, py = e.y - top, s = 1, A2 = S.fade;
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
          blit(c, k === 2 ? e.amber : e.sp, Math.round(lx * d), Math.round(ly * d), e.a0 * 0.95 * A2 * pul);
        }
      }
    });
  }
  api.trigger = function (kind) {
    if (!S.ready || S.still) return false;
    if (kind !== 'meteor' && kind !== 'satellite' && kind !== 'ufo') return false;
    return spawn(kind, true);
  };

  /* ------------------------------------------------------- NM constellation */
  var cons = {
    host: null, door: null, canvas: null, ctx: null, stars: null, w: 0, h: 0, CW: 0, CH: 0,
    hover: 0, hoverTo: 0, linesIn: 0, visible: false, rect: null, foot: null,
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
    S.nmBox = [nx - w * 0.5 - 16, ny - h * 0.5 - 16 - S.Y0, nx + w * 0.5 + 16, ny + h * 0.5 + 16 - S.Y0];
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
    var hov = cons.hover, st = cons.stars, la = (0.2 + 0.18 * hov) * cons.linesIn;
    if (la > 0.004) {
      c.strokeStyle = 'rgba(214,224,244,' + la.toFixed(3) + ')';
      c.lineWidth = Math.max(1, Math.round(0.6 * d));
      c.lineCap = 'butt';
      c.beginPath();
      NM_LINES.forEach(function (ln) {
        var a = st[ln[0]], b = st[ln[1]], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
        var ga = 3.2 + 0.75 * (6 - a.m), gb = 3.2 + 0.75 * (6 - b.m);
        if (len <= ga + gb + 2) return;
        c.moveTo((a.x + dx / len * ga) * d, (a.y + dy / len * ga) * d);
        c.lineTo((b.x - dx / len * gb) * d, (b.y - dy / len * gb) * d);
      });
      c.stroke();
    }
    var lift = (1.25 + 0.16 * hov) * opts.brightness;
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

  /* -------------------------------------------------------------- fixed canvas */
  var fixedDirty = true;
  function drawFixed(dt) {
    var hero = heroZone(), d = S.dpr, need = hero || EV.list.length || label.a > 0.01;
    if (!need && !fixedDirty) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, S.W, S.H);
    fixedDirty = !!need;
    if (hero) {   // the hero samples this canvas: give it the sky behind the hero
      ctx.imageSmoothingEnabled = false;
      for (var k in TL.live) {
        var t = TL.live[k];
        if (t.y0 < S.vh) ctx.drawImage(t.canvas, 0, Math.round(t.y0 * d));
      }
    }
    // the label's reticle and leader, in the sky
    if (label.a > 0.01 && label.kind === 'star' && label.ax != null) {
      var ax = label.ax * d, ay = label.ay * d, la = label.a * 0.32;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(220,226,240,' + la.toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, Math.round(0.6 * d));
      ctx.beginPath(); ctx.arc(ax, ay, 9 * d, 0, Math.PI * 2); ctx.stroke();
      if (label.side) {
        var ex = (label.side > 0 ? label.x : label.x + label.w) * d, ey = (label.y + 15) * d;
        var sx0 = ax + (ex > ax ? 1 : -1) * 9 * d;
        ctx.beginPath(); ctx.moveTo(sx0, ay); ctx.lineTo(ex - (ex > ax ? 4 : -4) * d, ey); ctx.stroke();
      }
    }
    if (EV.list.length) drawEvents(ctx);
  }

  /* -------------------------------------------------------------------- frame */
  function measure() {
    var vw = root.clientWidth || innerWidth, vh = canvas.clientHeight || innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (vw * vh > 2600000) dpr = Math.min(dpr, 1.5);
    var changed = vw !== S.vw || vh !== S.vh || dpr !== S.dpr;
    S.vw = vw; S.vh = vh; S.phone = vw < 600;
    if (dpr !== S.dpr || !atlas) { S.dpr = dpr; buildAtlas(); consSprites(); }
    S.W = Math.round(vw * dpr); S.H = Math.round(vh * dpr);
    if (canvas.width !== S.W || canvas.height !== S.H) { canvas.width = S.W; canvas.height = S.H; fixedDirty = true; }
    return changed;
  }
  function frame(now) {
    var t0 = performance.now();
    var dt = S.last ? Math.min(0.1, (now - S.last) / 1000) : 0;
    S.last = now;
    if (!S.still) S.t += dt;
    var t = S.still ? 0 : S.t;
    ensureTiles(S.running ? 6 : 40);
    if (!S.still && (now - S.lastTw > 31 || !S.lastTw)) { S.lastTw = now; twinkleTiles(t); }
    label.a += ((label.on ? 1 : 0) - label.a) * (S.still ? 1 : Math.min(1, dt * 7));
    if (label.on) placeLabel();
    eventsTick(dt);
    drawFixed(dt);
    // footer constellation
    var fl = footerLevel();
    cons.hover += (cons.hoverTo - cons.hover) * (S.still ? 1 : Math.min(1, dt * 6));
    cons.linesIn = S.still ? 1 : smooth(0.45, 0.95, fl);
    if (cons.visible && cons.ctx) drawCons(t);
    hoverTick();
    var y = window.scrollY || 0;
    if (Math.abs(y - veil.y) > 0.5) { veil.y = y; veilSoon(); }
    var ms = performance.now() - t0, st = S.stats;
    st.frames++; st.ms += ms; if (ms > st.worst) st.worst = ms;
  }

  /* --------------------------------------------------------------- the loop */
  var lastY = -1;
  function loop(now) {
    S.raf = requestAnimationFrame(loop);
    var y = window.scrollY || 0, moving = y !== lastY || fastEvent() || Math.abs(cons.hover - cons.hoverTo) > 0.01 || Math.abs(label.a - (label.on ? 1 : 0)) > 0.01;
    if (!moving && S.last && now - S.last < 31) return;
    lastY = y;
    frame(now);
  }
  function active() { return S.ready && S.mounted && !document.hidden && !gameOpen(); }
  function update() {
    var was = S.still;
    S.still = reduceQ.matches;
    if (S.still) EV.list.length = 0;
    if (was !== S.still && S.ready) { S.gen++; }
    var go = active() && !S.still;
    if (go && !S.running) { S.running = true; S.last = 0; S.stats.since = performance.now(); S.raf = requestAnimationFrame(loop); }
    else if (!go && S.running) { S.running = false; cancelAnimationFrame(S.raf); S.raf = 0; }
    if (active() && S.still) kick();
  }
  var kickRaf = 0;
  function kick() {   // one frame now (still mode, or a change while idle)
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
    sheet = document.createElement('div');
    sheet.className = 'nm-sky-sheet';
    sheet.setAttribute('aria-hidden', 'true');
    sheet.style.cssText = 'position:absolute;left:0;right:0;top:0;height:0;overflow:hidden;z-index:-21;pointer-events:none;contain:strict;opacity:0;transition:opacity 1.4s ease';
    if (reduceQ.matches) sheet.style.transition = 'none';
    document.body.appendChild(sheet);
    canvas = document.createElement('canvas');
    canvas.id = 'nm-sky';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100vh;height:100lvh;z-index:-20;pointer-events:none;display:block';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    heroCanvas = document.querySelector('#global-canvas canvas');
    headerEl = document.querySelector('header[data-nm-header], .nm-hdr');
    makeLabel();
    measure();
    api.canvas = canvas;
    api.sheet = sheet;
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
        glInit();
        setupFooter();
        S.ready = true;
        relayout(true);
        ['meteor', 'satellite', 'ufo'].forEach(function (k) { schedule(k, true); });
        update();
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
    if (o.brightness != null) opts.brightness = Math.max(0, +o.brightness || 0);
    if (o.twinkle != null) opts.twinkle = Math.max(0, +o.twinkle || 0);
    S.gen++; kick();
  };
  api.debug = function () {
    var st = S.strip, top = S.ready ? skyTop() : 0;
    return {
      page: S.page, ready: S.ready, running: S.running, still: S.still, dpr: S.dpr, size: [S.vw, S.vh], gl: GL.ok,
      strip: st && { k: +st.k.toFixed(3), theta: +st.theta.toFixed(2), Y0: S.Y0, R: S.R, L: S.L, sky: [+(st.sLo || 0).toFixed(1), +(st.sHi || 0).toFixed(1)] },
      skyTop: top, tiles: Object.keys(TL.live).map(Number), mask: { lines: MASK.lines, scale: MASK.scale },
      counts: S.stat && { faint: S.stat.list.length, bright: S.dyn.list.length },
      featured: S.featured.map(function (f, k) {
        var p = starScreen(k), it = f.insts && f.insts.slice().sort(function (a, b) { return Math.abs(a.y - top - S.vh / 2) - Math.abs(b.y - top - S.vh / 2); })[0];
        return { id: f.id, n: f.insts ? f.insts.length : 0, x: it ? Math.round(it.x) : null, skyY: it ? Math.round(it.y) : null, docY: it ? Math.round(it.y + S.Y0) : null,
          screen: p && { x: Math.round(p.x), y: Math.round(p.y) }, open: p ? openSky(p.x, p.y, false) : false,
          all: (f.insts || []).map(function (q) { return [Math.round(q.x), Math.round(q.y + S.Y0)]; }) };
      }),
      events: EV.list.map(function (e) {
        var k = e.kind === 'satellite' ? e.v * e.t : 0;
        return { kind: e.kind, t: +e.t.toFixed(2), x: Math.round(e.x + (e.dx || 0) * k), y: Math.round(e.y - top + (e.dy || 0) * k) };
      }),
      next: { meteor: +(EV.next.meteor - S.t).toFixed(1), satellite: +(EV.next.satellite - S.t).toFixed(1), ufo: +(EV.next.ufo - S.t).toFixed(1) }, seen: EV.seen, show: SHOW,
      veilClear: veil.clear, label: label.on ? (label.kind === 'cons' ? 'NM' : S.featured[label.star].id) : null,
      stats: { frames: S.stats.frames, avgMs: S.stats.frames ? +(S.stats.ms / S.stats.frames).toFixed(2) : 0, worstMs: +S.stats.worst.toFixed(2),
        tiles: S.stats.tiles, tileAvgMs: S.stats.tiles ? +(S.stats.tileMs / S.stats.tiles).toFixed(2) : 0, tileWorstMs: +S.stats.tileWorst.toFixed(2) },
      cons: cons.canvas ? { w: Math.round(cons.w), h: Math.round(cons.h), door: !!cons.door, visible: cons.visible, nm: S.nm && [Math.round(S.nm.x), Math.round(S.nm.y)] } : null
    };
  };
  api.resetStats = function () { S.stats = { frames: 0, ms: 0, worst: 0, tiles: 0, tileMs: 0, tileWorst: 0, since: performance.now() }; };
  api.skyAt = function (x, docY) {   // galactic [l, b] under a document point (review)
    if (!S.strip) return null;
    var u = S.strip.sky(x, docY - S.Y0), g = [0, 1, 2].map(function (i) { return GAL[i][0] * u[0] + GAL[i][1] * u[1] + GAL[i][2] * u[2]; });
    return [+((Math.atan2(g[1], g[0]) / DEG + 360) % 360).toFixed(2), +(Math.asin(clamp(g[2], -1, 1)) / DEG).toFixed(2)];
  };

  var ready = window.__nmReady || function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };
  ready(mount);
})();
