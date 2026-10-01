/* Night sky engine for the ?theme=stars preview. Brief: docs/night-sky.md.

   The live site, unchanged, over a real night sky: every catalogue star brighter than
   about V 6 from media/sky/PAGE.json, projected stereographically around the page's
   view (north up, east left, as you see it outside), sized and coloured from its
   magnitude and B-V, scintillating independently. The sky turns a little as you
   scroll (between the two framings in TUNE below) and drifts at the true sidereal rate
   (15 deg an hour, under 0.1 px a second: there, but never seen moving).

   window.NMSky
     .canvas        the fixed full-viewport 2D sky canvas; the homepage hero samples it
                    outside the NM mark (NMThemeConfig.heroBackdrop in js/theme-stars.js)
     .page          'home' | 'about' | 'index'
     .trigger(kind) 'meteor' | 'satellite' | 'ufo': start one now (review / testing)
     .set(opts)     { brightness: 1, twinkle: 1 } live multipliers
     .debug()       view, counts, featured-star screen positions and open-sky tests, timings
     .openSky(x,y)  true when nothing but sky is painted at that viewport point

   Layers, all on the one canvas (painted behind every section, z-index -20):
     - faint stars (V >= 4.6), and as the footer comes in the "heavy" sky (denser and
       brighter faint stars from a V 6-7.6 field concentrated on the real galactic plane),
       cached in one offscreen layer that is blitted at whole device pixels and re-rendered
       only when the view has turned ~25 px or the footer level steps;
     - a faint Milky Way glow along the true galactic equator (mottled, with the Great
       Rift where it should be), built for the footer's view in idle-time slices;
     - the brighter stars, drawn each frame with scintillation (bright ones twinkle
       more; the very brightest flash slight colours, as Sirius does);
     - rare events: a short meteor every minute or two, the occasional satellite (steady,
       slow, sometimes fading into Earth's shadow mid-sky), and very rarely three dim
       lights that glide, pause and dart away.
   Star cores are sprites rendered per device pixel and blitted at whole device pixels,
   so they stay single crisp points at any DPR.

   Featured stars (four per page): when a fine pointer comes within 28 px of one that
   sits in open sky (no text, image, video or control painted there), a label fades in
   beside it; a tap does the same on touch screens. No permanent markers.

   Footer: the NM mark is a constellation where the cloud was: 26 stars placed on the
   shape measured from textures/nm-mark-sdf.png (four uprights with round ends, narrow
   waists, three diagonals), joined by hairline chart lines, drawn with the same star
   sprites and twinkle on a small canvas that scrolls with the footer. It stays the
   Cloud Run door (the existing .nm-run-door on home/About, one added on Index).

   Budget: ~30 fps for twinkle, display rate only while the page scrolls or a fast
   event is in flight; stops in hidden tabs and while Cloud Run is open; one still frame
   (no twinkle, drift, pan or events) under prefers-reduced-motion. */
(function () {
  'use strict';
  if (window.NMSky) return;

  var root = document.documentElement;
  var DEG = Math.PI / 180;
  var SIDEREAL_H = 1.00273791 / 3600;   // hours of right ascension per second of time
  var MAG_DYN = 4.6;                    // brighter than this: drawn per frame and scintillating
  var MAG_OWN = 2.0;                    // brighter than this: a sprite of its own (exact size and colour)
  var BASE_L = 1440;                    // the framing in media/sky/*.json is for a 1440 px long side
  var CROP = { x: 57, y: 159, w: 406, h: 202 };   // the NM mark's box in textures/nm-mark-sdf.png
  var ASPECT = CROP.w / CROP.h;

  /* Framing (the brief lets the engine tune media/sky/PAGE.json `view`). Both ends of the
     scroll are pinned to the sky so every viewport frames the same scene:
       top   the sky point `at` [RA h, Dec deg] sits at viewport (x, y) (fractions, or px
             when > 1) at the top of the page, with `roll` degrees;
       foot  the sky point `at` sits under the centre of the NM constellation when the
             page is scrolled to the end.
     The view moves linearly between the two as you scroll (plus the sidereal drift).
     home   the hero opens on Canis Minor with Orion to the right of the mark and Sirius
            below it; the footer puts the NM in Monoceros, inside the Winter Triangle
            (Procyon, Betelgeuse, Sirius), with Orion beside it.
     about  the Summer Triangle over the intro; the footer puts the NM east of Cygnus,
            with Vega, Deneb, Altair and Albireo to its right in the Milky Way.
     index  Polaris in the open band above the wall at the top; the footer has the Big
            Dipper and Thuban beside the NM (above it on phones, where the field is a
            little wider so they fit the short footer).
     Every featured star reaches open sky somewhere in the scroll (checked at 1440x900,
     1920x1080 and 390x844). */
  var TUNE = {
    home: { top: { at: [7.1, 2.0], x: 0.5, y: 0.5, roll: 0 }, foot: { at: [6.85, -6.0], roll: 0 },
      phone: { top: { at: [5.6036, -1.2019], x: 0.5, y: 0.71, roll: 0 } } },   // Orion under the mark
    about: { top: { at: [20.6, 28.0], x: 0.5, y: 0.5, roll: 0 }, foot: { at: [21.9, 34.7], roll: 0 },
      phone: { top: { at: [19.7, 31.0], x: 0.5, y: 0.45, roll: 0 }, foot: { at: [19.95, 20.5], roll: 0 } } },
    // (Polaris is the pole, so it always lies straight "up" the rolled frame: x follows the roll)
    index: { top: { at: [2.5302, 89.2642], x: 0.705, y: 88, roll: -40 }, foot: { at: [15.5, 53.0], roll: -40 },
      phone: { fovScale: 1.22, top: { at: [2.5302, 89.2642], x: 0.5, y: 60, roll: 0 }, foot: { at: [12.4, 46.0], roll: 0 } } }
  };

  /* The NM constellation, in texture pixels of nm-mark-sdf.png: [x, y, V, B-V].
     Ball centres are the bright stars (the round ends), the waists sit on the narrowest
     rows, the junction stars where each diagonal leaves its lobe; the unconnected faint
     stars give each round end its body. */
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
  // indices into NM_STARS: T1 B1 T2 B2 T3 B3 T4 B4 = 0..7, W1..W4 = 8..11, junctions 12..14
  var NM_LINES = [[0, 12], [12, 8], [8, 1], [12, 3], [2, 13], [13, 9], [9, 3], [13, 5],
    [4, 10], [10, 5], [6, 14], [14, 11], [11, 7], [14, 5]];
  var NM_LABEL = { name: 'NM', designation: 'Nico Maggioli', coords: '42.3601° N · 71.0589° W', distance: 'Boston, MA', fact: 'Feeling lucky?' };

  var api = window.NMSky = { canvas: null, page: null, version: 1 };
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
  // smooth 1D value noise in -1..1
  function noise(x) {
    var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), a = hash(i | 0), b = hash((i + 1) | 0);
    return (a + (b - a) * u) * 2 - 1;
  }
  function h3(x, y, z) { return hash(Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)); }
  // 3D value noise 0..1 (no seams on the sphere)
  function noise3(x, y, z) {
    var ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    var fx = x - ix, fy = y - iy, fz = z - iz;
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    var a = h3(ix, iy, iz), b = h3(ix + 1, iy, iz), c = h3(ix, iy + 1, iz), d = h3(ix + 1, iy + 1, iz);
    var e = h3(ix, iy, iz + 1), f = h3(ix + 1, iy, iz + 1), g = h3(ix, iy + 1, iz + 1), h = h3(ix + 1, iy + 1, iz + 1);
    var x1 = a + (b - a) * ux, x2 = c + (d - c) * ux, x3 = e + (f - e) * ux, x4 = g + (h - g) * ux;
    var y1 = x1 + (x2 - x1) * uy, y2 = x3 + (x4 - x3) * uy;
    return y1 + (y2 - y1) * uz;
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
  function alphaOf(c) {
    if (!c || c === 'transparent') return 0;
    var m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return 1;
    var p = m[1].split(/[ ,\/]+/).filter(Boolean);
    return p.length > 3 ? parseFloat(p[3]) : 1;
  }
  function mq(q) { try { return matchMedia(q); } catch (e) { return { matches: false }; } }
  var reduceQ = mq('(prefers-reduced-motion: reduce)');
  var fineQ = mq('(hover: hover) and (pointer: fine)');
  function gameOpen() { return root.classList.contains('nm-run-open'); }

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
  // Peak of the core (0..1, may exceed 1 for the brightest: their cores saturate and
  // so read larger). V 6 is barely there on the #0a0a0a ground; V 1.3 reaches white.
  function peakOf(m) { return 0.112 * Math.pow(10, -0.2 * (m - 6)); }
  // Point-spread profile in CSS px: a crisp core, a soft wing that gives the brighter
  // stars presence, and a faint wide halo on the brightest (glare, as the eye sees it).
  function profile(m) {
    var k = clamp(4.2 - m, 0, 5.8);
    return { sc: 0.3 + 0.04 * k, w: m < 4.2 ? Math.min(0.55, 0.1 * Math.pow(k, 1.2)) : 0, sw: 0.55 + 0.2 * k,
      ha: m < 3 ? Math.min(0.18, 0.045 * (3 - m)) : 0, hr: 2.4 + 1.2 * (3 - m) };
  }

  /* --------------------------------------------------------------- projection */
  function View() {}
  function setView(v, raH, decD, rollD, fovD, vw, vh) {
    var a = raH * 15 * DEG, d = clamp(decD, -89.999, 89.999) * DEG;
    var ca = Math.cos(a), sa = Math.sin(a), cd = Math.cos(d), sd = Math.sin(d);
    v.c0 = cd * ca; v.c1 = cd * sa; v.c2 = sd;
    v.e0 = -sa; v.e1 = ca; v.e2 = 0;
    v.n0 = -sd * ca; v.n1 = -sd * sa; v.n2 = cd;
    v.s = (Math.max(vw, vh) / 2) / (2 * Math.tan(fovD * DEG / 4));
    v.cx = vw / 2; v.cy = vh / 2;
    v.cr = Math.cos(rollD * DEG); v.sr = Math.sin(rollD * DEG);
    v.ra = raH; v.dec = decD;
    return v;
  }
  var P = { x: 0, y: 0 };
  function proj(v, x, y, z, out) {
    var Z = x * v.c0 + y * v.c1 + z * v.c2;
    if (Z < 0) return false;                         // more than 90 deg from the centre
    var X = x * v.e0 + y * v.e1 + z * v.e2, Y = x * v.n0 + y * v.n1 + z * v.n2, k = 2 / (1 + Z) * v.s;
    var px = -X * k, py = Y * k;                     // east to the left, north up
    out.x = v.cx + px * v.cr - py * v.sr;
    out.y = v.cy - (px * v.sr + py * v.cr);
    return true;
  }
  function unproj(v, sx, sy, out) {
    var px = sx - v.cx, py = v.cy - sy;
    var qx = (px * v.cr + py * v.sr) / v.s, qy = (-px * v.sr + py * v.cr) / v.s;
    var rho = Math.sqrt(qx * qx + qy * qy);
    if (rho < 1e-9) { out[0] = v.c0; out[1] = v.c1; out[2] = v.c2; return out; }
    var c = 2 * Math.atan(rho / 2), sc = Math.sin(c) / rho, cc = Math.cos(c);
    out[0] = cc * v.c0 + sc * (-qx * v.e0 + qy * v.n0);
    out[1] = cc * v.c1 + sc * (-qx * v.e1 + qy * v.n1);
    out[2] = cc * v.c2 + sc * (-qx * v.e2 + qy * v.n2);
    return out;
  }
  function unit(raH, decD) {
    var a = raH * 15 * DEG, d = decD * DEG, cd = Math.cos(d);
    return [cd * Math.cos(a), cd * Math.sin(a), Math.sin(d)];
  }
  // J2000 equatorial -> galactic
  var GAL = [[-0.0548755604, -0.8734370902, -0.4838350155], [0.4941094279, -0.4448296300, 0.7469822445], [-0.8676661490, -0.1980763734, 0.4559837762]];
  function galactic(x, y, z, out) {
    out[0] = GAL[0][0] * x + GAL[0][1] * y + GAL[0][2] * z;
    out[1] = GAL[1][0] * x + GAL[1][1] * y + GAL[1][2] * z;
    out[2] = GAL[2][0] * x + GAL[2][1] * y + GAL[2][2] * z;
    return out;
  }
  // three octaves of value noise, each in its own rotated frame so no lattice shows
  var ROT = [[0.36, 0.48, -0.8, -0.8, 0.6, 0, 0.48, 0.64, 0.6], [0.6, -0.64, 0.48, 0.48, 0.77, 0.42, -0.64, 0, 0.77], [-0.42, 0.75, 0.51, 0.75, 0.6, -0.27, -0.51, 0.27, -0.82]];
  function fbm(g) {
    var out = 0, amp = 0.55, fr = 7;
    for (var o = 0; o < 3; o++) {
      var R = ROT[o], x = R[0] * g[0] + R[1] * g[1] + R[2] * g[2], y = R[3] * g[0] + R[4] * g[1] + R[5] * g[2], z = R[6] * g[0] + R[7] * g[1] + R[8] * g[2];
      out += amp * noise3(x * fr + 11.3 * o, y * fr - 7.1 * o, z * fr + 3.7 * o);
      amp *= 0.55; fr *= 2.3;
    }
    return out / 0.8525;
  }
  /* Naked-eye Milky Way brightness at galactic (l, b) in degrees, 0..~1.3: brightest
     toward the centre and the Cygnus star cloud, faint toward the anticentre (the winter
     sky), split by the Great Rift from Cygnus to Aquila, mottled by star clouds. */
  function milky(g) {
    var b = Math.asin(clamp(g[2], -1, 1)) / DEG, l = Math.atan2(g[1], g[0]) / DEG;
    if (l < 0) l += 360;
    var dl = Math.min(l, 360 - l);
    var bulge = Math.exp(-(dl * dl) / (2 * 28 * 28));
    var amp = 0.22 + 0.78 * Math.pow(0.5 + 0.5 * Math.cos(l * DEG), 1.4) + 0.32 * Math.exp(-Math.pow((l - 76) / 16, 2));
    var w = 4.2 + 5 * bulge;
    var core = Math.exp(-(b * b) / (2 * w * w)), wide = 0.22 * Math.exp(-(b * b) / (2 * 17 * 17));
    var n = fbm(g);
    var rift = 1;
    if (l > 8 && l < 96) rift -= 0.62 * smooth(8, 22, l) * (1 - smooth(82, 96, l)) * Math.exp(-Math.pow((b - 1.6 - 1.2 * Math.sin(l * 0.11)) / 2.4, 2));
    return amp * (core * (0.5 + 0.9 * n * n) * rift + wide);
  }

  /* -------------------------------------------------------------------- state */
  var S = {
    page: null, data: null, base: null, ready: false, mounted: false,
    vw: 0, vh: 0, dpr: 1, W: 0, H: 0, fov: 75, magLimit: 6,
    t: 0, last: 0, running: false, raf: 0, still: false, fade: 0,
    scrollY: -1, maxScroll: 1, footer: 0, footerQ: -1, gen: 0,
    dyn: null, faint: null, dust: null, featured: [],
    view: new View(), tmp: new View(),
    pointer: { x: -1e4, y: -1e4, fine: false, moved: false },
    stats: { frames: 0, ms: 0, worst: 0, rerenders: 0, since: 0 }
  };
  var canvas, ctx, layer, lctx, glow, gctx, atlas;

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
        var m = mLo(b), sp = renderSprite(m, -0.25 + c * 0.3, HEAD, false, null);
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
    atlas = { canvas: cv, bins: list, flash: flash };
  }
  function binSprite(m, bv) { return atlas.bins[mBin(m) * CBN + cBin(bv)]; }
  function baseAlpha(m) { return peakOf(m) / (peakOf(mLo(mBin(m))) * HEAD); }
  function ownSprite(m, bv) {
    return { core: renderSprite(m, bv, 1, false, null), flare: renderSprite(m, bv, 1, true, null) };
  }
  function blit(c, sp, xd, yd, a) {
    if (a <= 0.004) return;
    c.globalAlpha = a > 1 ? 1 : a;
    c.drawImage(sp.img, sp.sx, sp.sy, sp.s, sp.s, xd - sp.R, yd - sp.R, sp.s, sp.s);
  }

  /* --------------------------------------------------------------------- data */
  function detectPage() {
    if (document.body && document.body.classList.contains('nm-about-page')) return 'about';
    if (document.querySelector('footer .foot-mark')) return 'index';
    return 'home';
  }
  function ingest(d) {
    var v = d.view || {};
    // the data file's framing: its field of view always, its centre and pan only for a page
    // without a TUNE entry
    S.base = { ra: +v.ra || 0, dec: +v.dec || 0, fov: +v.fov || 75, roll: +v.roll || 0, pan: v.scrollPan || [0, 0] };
    var feats = (d.featured || []).slice(0, 4);
    var stars = (d.stars || []).filter(function (s) { return s && isFinite(s[0]) && isFinite(s[1]) && isFinite(s[2]); });
    var dyn = [], faint = [], R = rng(1979);
    feats.forEach(function (f) { f.u = unit(+f.ra, +f.dec); f.idx = -1; });
    stars.forEach(function (s) {
      var u = unit(+s[0], +s[1]), m = +s[2], bv = s[3] == null || !isFinite(s[3]) ? 0.6 : +s[3], fi = -1;
      for (var k = 0; k < feats.length; k++) {
        var f = feats[k];
        if (f.idx < 0 && u[0] * f.u[0] + u[1] * f.u[1] + u[2] * f.u[2] > 0.999998) { fi = k; break; }
      }
      var rec = { u: u, m: m, bv: bv, f: fi };
      if (fi >= 0) { feats[fi].idx = dyn.length; dyn.push(rec); }
      else if (m < MAG_DYN) dyn.push(rec);
      else faint.push(rec);
    });
    feats.forEach(function (f, k) {   // a featured star missing from the list is added from its own record
      if (f.idx < 0) { f.idx = dyn.length; dyn.push({ u: f.u, m: +f.vmag, bv: f.bv == null ? 0.6 : +f.bv, f: k }); }
    });
    var n = dyn.length;
    S.dyn = {
      n: n, rec: dyn,
      x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), m: new Float32Array(n),
      a: new Float32Array(n), r1: new Float32Array(n), r2: new Float32Array(n), o1: new Float32Array(n),
      o2: new Float32Array(n), o3: new Float32Array(n), depth: new Float32Array(n),
      sx: new Float32Array(n), sy: new Float32Array(n), on: new Uint8Array(n), sp: new Array(n)
    };
    dyn.forEach(function (s, i) {
      var D = S.dyn;
      D.x[i] = s.u[0]; D.y[i] = s.u[1]; D.z[i] = s.u[2]; D.m[i] = s.m;
      var rate = 0.75 + 1.5 * R();
      D.r1[i] = rate; D.r2[i] = rate * (2.2 + 0.9 * R());
      D.o1[i] = R() * 4000; D.o2[i] = R() * 4000; D.o3[i] = R() * 4000;
      D.depth[i] = 0.08 + 0.34 * clamp((MAG_DYN - s.m) / 5.4, 0, 1);
    });
    S.faint = faint;
    S.featured = feats;
    S.data = d;
  }
  function prepareSprites() {
    var D = S.dyn;
    for (var i = 0; i < D.n; i++) {
      var r = D.rec[i];
      if (r.m < MAG_OWN) { D.sp[i] = ownSprite(r.m, r.bv); D.a[i] = 1; }
      else { D.sp[i] = binSprite(r.m, r.bv); D.a[i] = baseAlpha(r.m); }
    }
    S.faint.forEach(function (r) { r.sp = binSprite(r.m, r.bv); r.a = baseAlpha(r.m); });
    if (cons.stars) cons.stars.forEach(function (s) { s.sp = s.m < MAG_OWN ? ownSprite(s.m, s.bv) : binSprite(s.m, s.bv); s.a = s.m < MAG_OWN ? 1 : baseAlpha(s.m); });
  }

  /* Field of faint (V 6-7.6) stars for the heavy footer sky, denser toward the galactic
     plane. Generated around the footer view; regenerated if the sky drifts far. */
  function makeDust(centre, view) {
    var R = rng(4242 + Math.round(centre[0] * 1000));
    var rad = (S.fov * 0.62 + 14) * DEG, cosR = Math.cos(rad);
    // tangent basis around the centre
    var c = centre, ax = Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    var e = [ax[1] * c[2] - ax[2] * c[1], ax[2] * c[0] - ax[0] * c[2], ax[0] * c[1] - ax[1] * c[0]];
    var el = Math.hypot(e[0], e[1], e[2]); e = [e[0] / el, e[1] / el, e[2] / el];
    var n = [c[1] * e[2] - c[2] * e[1], c[2] * e[0] - c[0] * e[2], c[0] * e[1] - c[1] * e[0]];
    var area = 2 * Math.PI * (1 - cosR) * 3282.8;   // square degrees
    var pxDeg = view.s * 2 * DEG;                    // px per degree at the centre
    var dens = 0.62 * clamp(Math.pow(pxDeg / 18, -1.2), 0.5, 1.4) * (S.phone ? 0.8 : 1);
    return { centre: centre, list: [], R: R, cosR: cosR, c: c, e: e, n: n, i: 0, tries: Math.round(area * dens * 2.2) };
  }
  // generate up to `k` candidates; true when done
  function dustStep(D, k) {
    var R = D.R, c = D.c, e = D.e, n = D.n, g = [0, 0, 0], end = Math.min(D.tries, D.i + k);
    for (; D.i < end; D.i++) {
      var cz = 1 - R() * (1 - D.cosR), sz = Math.sqrt(1 - cz * cz), ph = R() * 2 * Math.PI;
      var a = sz * Math.cos(ph), b = sz * Math.sin(ph);
      var x = cz * c[0] + a * e[0] + b * n[0], y = cz * c[1] + a * e[1] + b * n[1], z = cz * c[2] + a * e[2] + b * n[2];
      galactic(x, y, z, g);
      var w = 0.28 + 0.72 * clamp(milky(g), 0, 1.2);
      if (R() > w / 1.15) continue;
      var m = 6 + 1.6 * Math.pow(R(), 0.55), bv = 0.1 + 1.2 * R() * R() + 0.15 * R();
      D.list.push({ u: [x, y, z], m: m, bv: bv, sp: binSprite(m, bv), a: baseAlpha(m) * (0.7 + 0.3 * R()) });
    }
    return D.i >= D.tries;
  }

  /* -------------------------------------------------------------- the view */
  function scrollFrac() {
    if (S.still) return 0;
    return clamp((window.scrollY || 0) / S.maxScroll, 0, 1);
  }
  function viewAt(v, f, t) {
    var a = S.c0, b = S.c1, dra = b.ra - a.ra, drl = b.roll - a.roll;
    if (dra > 12) dra -= 24; else if (dra < -12) dra += 24;
    if (drl > 180) drl -= 360; else if (drl < -180) drl += 360;
    return setView(v, a.ra + dra * f + t * SIDEREAL_H, a.dec + (b.dec - a.dec) * f, a.roll + drl * f, S.fov, S.vw, S.vh);
  }
  // the view centre that puts sky point `at` at viewport (sx, sy) with `roll` (Newton steps
  // on RA/Dec from the mirrored first guess; near the pole north turns fast, so no shortcut)
  function anchorView(at, sx, sy, roll) {
    var u = unit(at[0], at[1]), v = new View(), c = [0, 0, 0];
    function err(ra, dec, out) {
      setView(v, ra, dec, roll, S.fov, S.vw, S.vh);
      if (!proj(v, u[0], u[1], u[2], P)) return false;
      out[0] = P.x - sx; out[1] = P.y - sy; return true;
    }
    setView(v, at[0], at[1], roll, S.fov, S.vw, S.vh);
    unproj(v, S.vw - sx, S.vh - sy, c);
    var ra = Math.atan2(c[1], c[0]) / DEG / 15, dec = Math.asin(clamp(c[2], -1, 1)) / DEG, e = [0, 0], e1 = [0, 0], e2 = [0, 0];
    for (var k = 0; k < 12; k++) {
      if (!err(ra, dec, e)) break;
      if (Math.abs(e[0]) < 0.25 && Math.abs(e[1]) < 0.25) break;
      var hr = 0.02, hd = 0.2;
      if (!err(ra + hr, dec, e1) || !err(ra, dec + hd, e2)) break;
      var a = (e1[0] - e[0]) / hr, b = (e2[0] - e[0]) / hd, cc = (e1[1] - e[1]) / hr, d = (e2[1] - e[1]) / hd, det = a * d - b * cc;
      if (!det) break;
      var dra = (-e[0] * d + b * e[1]) / det, ddec = (-a * e[1] + cc * e[0]) / det;
      var lim = Math.max(Math.abs(dra) * 15 / 6, Math.abs(ddec) / 6, 1);   // at most ~6 deg a step
      ra += dra / lim; dec = clamp(dec + ddec / lim, -89.9, 89.9);
    }
    ra = ((ra % 24) + 24) % 24;
    return { ra: ra, dec: dec, roll: roll };
  }
  function frameViews() {
    var b = S.base, tn = TUNE[S.page];
    if (!tn) {   // the data file's own framing
      S.c0 = { ra: b.ra, dec: b.dec, roll: b.roll };
      S.c1 = { ra: b.ra + b.pan[0], dec: b.dec + b.pan[1], roll: b.roll };
      return;
    }
    var ph = S.vw < 600 && tn.phone || {}, tp = ph.top || tn.top, ft = ph.foot || tn.foot;
    S.c0 = anchorView(tp.at, tp.x <= 1 ? tp.x * S.vw : tp.x, tp.y <= 1 ? tp.y * S.vh : tp.y, tp.roll || 0);
    var bx = cons.box1 ? cons.box1.x : S.vw / 2, by = cons.box1 ? cons.box1.y : S.vh * 0.42;
    S.c1 = anchorView(ft.at, bx, by, ft.roll || 0);
  }

  /* ---------------------------------------------------------- cached layer */
  // Faint catalogue stars plus, at footer level q, the heavy field. Rendered for view V0
  // with a margin; blitted at the whole-device-pixel offset of V0's centre under the
  // current view; re-rendered when that offset nears the margin or q steps.
  var L = { ok: false, ref: null, q: 0, M: 0 };
  function renderLayer(v) {
    var d = S.dpr, M = L.M = Math.round(64 * d), lw = S.W + 2 * M, lh = S.H + 2 * M;
    if (layer.width !== lw || layer.height !== lh) { layer.width = lw; layer.height = lh; }
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.globalAlpha = 1;
    lctx.clearRect(0, 0, lw, lh);
    lctx.globalCompositeOperation = 'lighter';
    lctx.imageSmoothingEnabled = false;
    var q = S.footerQ, boost = (1 + 0.4 * q) * opts.brightness, img = atlas.canvas, minX = -M / d, maxX = S.vw + M / d, minY = -M / d, maxY = S.vh + M / d;
    function draw(r, a) {
      if (!proj(v, r.u[0], r.u[1], r.u[2], P)) return;
      if (P.x < minX || P.x > maxX || P.y < minY || P.y > maxY) return;
      var sp = r.sp, xd = Math.round(P.x * d) + M, yd = Math.round(P.y * d) + M;
      lctx.globalAlpha = a > 1 ? 1 : a;
      lctx.drawImage(img, sp.sx, sp.sy, sp.s, sp.s, xd - sp.R, yd - sp.R, sp.s, sp.s);
    }
    var fl = S.faint;
    for (var i = 0; i < fl.length; i++) draw(fl[i], fl[i].a * boost);
    if (q > 0 && S.dust) {
      var dl = S.dust.list, k = q * opts.brightness;
      for (var j = 0; j < dl.length; j++) draw(dl[j], dl[j].a * k);
    }
    L.ref = [v.c0, v.c1, v.c2];
    L.q = q; L.ok = true;
    S.stats.rerenders++;
  }

  /* --------------------------------------------------------- Milky Way glow */
  // The field is sampled every 8 CSS px, then interpolated to one pixel per CSS px with
  // random rounding: a glow this faint lives in the bottom few 8-bit levels, and the
  // dither is what keeps it a soft haze instead of contour bands. It is built for the
  // footer's view in small idle-time slices (with the heavy field of faint stars), so
  // reaching the footer never costs a long task.
  var G = { ok: false, ref: null, job: null, step: 8, M: 140 };
  function slice(fn) {
    if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 250 }); else setTimeout(fn, 16);
  }
  function queueGlow() {
    if (G.job || !S.ready) return;
    var v = viewAt(new View(), S.still ? 0 : 1, S.still ? 0 : S.t), st = G.step, M = G.M, W = S.vw + 2 * M, H = S.vh + 2 * M;
    var gw = Math.ceil(W / st) + 2, gh = Math.ceil(H / st) + 2;
    G.job = { v: v, W: W, H: H, gw: gw, gh: gh, field: new Float32Array(gw * gh), fy: 0, img: null, y: 0, R: rng(77), dust: null, gen: S.gen };
    slice(runGlow);
  }
  function runGlow() {
    var j = G.job;
    if (!j) return;
    if (j.gen !== S.gen || !S.ready) { G.job = null; if (S.ready) queueGlow(); return; }
    var t0 = performance.now(), u = [0, 0, 0], g = [0, 0, 0], st = G.step, M = G.M, v = j.v;
    while (performance.now() - t0 < 6) {
      if (j.fy < j.gh) {
        for (var fx = 0, row = j.fy * j.gw; fx < j.gw; fx++) {
          unproj(v, fx * st - M, j.fy * st - M, u);
          galactic(u[0], u[1], u[2], g);
          j.field[row + fx] = clamp(milky(g) * 0.062, 0, 0.088) * 255;
        }
        j.fy++;
        continue;
      }
      if (j.y < j.H) {
        if (!j.img) j.img = gctx.createImageData(j.W, j.H);
        var px = j.img.data, f = j.field, gw = j.gw, R = j.R, yEnd = Math.min(j.H, j.y + 24);
        for (var y = j.y, i = y * j.W * 4; y < yEnd; y++) {
          var yy = y / st, iy = yy | 0, ty = yy - iy, r0 = iy * gw, r1 = r0 + gw;
          for (var x = 0; x < j.W; x++, i += 4) {
            var xx = x / st, ix = xx | 0, tx = xx - ix;
            var a0 = f[r0 + ix] + (f[r0 + ix + 1] - f[r0 + ix]) * tx, a1 = f[r1 + ix] + (f[r1 + ix + 1] - f[r1 + ix]) * tx;
            px[i] = 206; px[i + 1] = 212; px[i + 2] = 226;
            px[i + 3] = (a0 + (a1 - a0) * ty + R()) | 0;
          }
        }
        j.y = yEnd;
        continue;
      }
      var ref = [v.c0, v.c1, v.c2];
      if (!j.dust && (!S.dust || dist(S.dust.centre, ref) > 0.17)) j.dust = makeDust(ref, v);
      if (j.dust && !dustStep(j.dust, 1500)) continue;
      glow.width = j.W; glow.height = j.H;
      gctx.putImageData(j.img, 0, 0);
      G.ref = ref; G.ok = true; G.job = null;
      if (j.dust) { S.dust = j.dust; L.ok = false; }
      kick();
      return;
    }
    slice(runGlow);
  }
  function dist(a, b) { return Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)); }

  /* --------------------------------------------------------------- open sky */
  var MEDIA = /^(IMG|VIDEO|CANVAS|IFRAME|PICTURE|INPUT|TEXTAREA|SELECT|svg|SVG)$/;
  var INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="button"]';
  var textRange = document.createRange();
  var heroCanvas = null, headerEl = null;
  function own(el) { return el === canvas || el === labelEl || el === cons.canvas; }
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
  // a hairline (section rule, row divider, outline) of el lying inside the band 0..bottom
  function ruleIn(el, cs, bottom) {
    var r = el.getBoundingClientRect();
    function on(w, c) { return parseFloat(w) > 0 && alphaOf(c) > 0.1; }
    if (on(cs.borderTopWidth, cs.borderTopColor) && r.top >= -2 && r.top <= bottom) return true;
    if (on(cs.borderBottomWidth, cs.borderBottomColor) && r.bottom >= 0 && r.bottom <= bottom + 2) return true;
    if (r.top < bottom && r.bottom > 0 && (on(cs.borderLeftWidth, cs.borderLeftColor) || on(cs.borderRightWidth, cs.borderRightColor))) return true;
    return false;
  }
  // The homepage hero paints the sky itself outside the NM mark (heroClear); treat the
  // mark's box, and the whole hero once the zoom is under way, as covered.
  function heroZone() { return S.page === 'home' && (window.scrollY || 0) < S.vh * 2.4; }
  function heroSky(x, y) {
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
        if (heroZone() && !heroSky(x, y)) return false;
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
  var labelEl = null, label = { on: false, star: -1, a: 0, x: 0, y: 0, w: 0, h: 0, side: 1, pinned: 0, since: 0, sy: 0, kind: null, lastTest: 0 };
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
  function anchor() {
    if (label.kind === 'cons') return cons.anchor();
    var f = S.featured[label.star], D = S.dyn;
    return f && D.on[f.idx] ? { x: D.sx[f.idx], y: D.sy[f.idx] } : null;
  }
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
    var D = S.dyn, best = -1, bd = radius;
    S.featured.forEach(function (f, k) {
      var i = f.idx;
      if (!D.on[i]) return;
      var d = Math.hypot(D.sx[i] - x, D.sy[i] - y);
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  }
  function starOpen(k) {
    var f = S.featured[k], D = S.dyn, now = performance.now();
    if (f.openAt && now - f.openAt < 220 && Math.abs(f.openY - (window.scrollY || 0)) < 2) return f.open;
    f.open = openSky(D.sx[f.idx], D.sy[f.idx], false);
    f.openAt = now; f.openY = window.scrollY || 0;
    return f.open;
  }
  function hoverTick() {
    if (!S.ready || label.kind === 'cons' && label.on) return;
    var p = S.pointer;
    if (label.pinned) {
      var gone = !starVisible(label.star) || Math.abs((window.scrollY || 0) - label.sy) > 90 || performance.now() - label.since > 9000;
      if (gone) hideLabel();
      return;
    }
    if (!p.fine) { if (label.on && label.kind === 'star') hideLabel(); return; }
    var k = nearestFeatured(p.x, p.y, label.on ? 40 : 28);
    if (k >= 0 && starOpen(k)) showLabel('star', k);
    else if (label.on && label.kind === 'star') hideLabel();
  }
  function starVisible(k) { var f = S.featured[k]; return f && S.dyn.on[f.idx] && starOpen(k); }

  /* ------------------------------------------------------------------ events */
  // Positions are relative to the sky (the projected base centre), so events turn with it.
  var EV = { list: [], next: { meteor: 0, satellite: 0, ufo: 0 }, origin: { x: 0, y: 0 } };
  var evR = rng((Date.now() & 0xffff) ^ 0x51ed);
  function expo(mean, min) { return min + -Math.log(1 - evR()) * (mean - min); }
  function schedule(kind, first) {
    var t = S.t;
    if (kind === 'meteor') EV.next.meteor = t + (first ? 18 + evR() * 50 : expo(95, 25));
    else if (kind === 'satellite') EV.next.satellite = t + (first ? 35 + evR() * 70 : expo(150, 50));
    else EV.next.ufo = t + (first ? 200 + evR() * 400 : expo(720, 300));
  }
  function openPoint(margin, tries, test) {
    for (var i = 0; i < tries; i++) {
      var x = margin + evR() * (S.vw - 2 * margin), y = margin + evR() * (S.vh - 2 * margin);
      if (!test || test(x, y)) return { x: x, y: y };
    }
    return null;
  }
  function spawn(kind, forced) {
    var o = EV.origin, vw = S.vw, vh = S.vh, e = null;
    if (kind === 'meteor') {
      var len = (90 + evR() * 150) * clamp(Math.sqrt(Math.max(vw, vh) / BASE_L), 0.7, 1.2), ang = (evR() * 2 - 1) * Math.PI;
      if (Math.sin(ang) < -0.35) ang = -ang;                  // mostly falling, never straight up
      var dx = Math.cos(ang), dy = Math.sin(ang);
      var p = openPoint(40, forced ? 12 : 9, function (x, y) {
        return openSky(x, y, false) && openSky(x + dx * len * 0.5, y + dy * len * 0.5, false) && openSky(x + dx * len, y + dy * len, false);
      }) || (forced ? openPoint(40, 1) : null);
      if (!p) return false;
      var fire = evR() < 0.06;
      e = { kind: kind, x: p.x - o.x, y: p.y - o.y, dx: dx, dy: dy, len: len * (fire ? 1.35 : 1), t: 0,
        T: (0.45 + evR() * 0.5) * (fire ? 1.4 : 1), a: fire ? 0.95 : 0.42 + evR() * 0.4,
        rgb: fire ? [0.75, 1, 0.82] : evR() < 0.5 ? [1, 0.97, 0.9] : [0.9, 0.95, 1] };
    } else if (kind === 'satellite') {
      var side = Math.floor(evR() * 4), sx, sy, a2;
      if (side === 0) { sx = -10; sy = vh * (0.1 + 0.7 * evR()); a2 = (evR() - 0.5) * 0.9; }
      else if (side === 1) { sx = vw + 10; sy = vh * (0.1 + 0.7 * evR()); a2 = Math.PI + (evR() - 0.5) * 0.9; }
      else if (side === 2) { sx = vw * (0.1 + 0.8 * evR()); sy = -10; a2 = Math.PI / 2 + (evR() - 0.5) * 1.1; }
      else { sx = vw * (0.1 + 0.8 * evR()); sy = vh + 10; a2 = -Math.PI / 2 + (evR() - 0.5) * 1.1; }
      var m = 3.4 + evR() * 1.1, across = Math.abs(Math.cos(a2)) > 0.5 ? vw : vh;
      e = { kind: kind, x: sx - o.x, y: sy - o.y, dx: Math.cos(a2), dy: Math.sin(a2), v: 16 + evR() * 16, t: 0, m: m,
        sp: binSprite(m, 0.6), a0: baseAlpha(m), life: (across + 40) / 16,
        shadow: evR() < 0.4 ? (0.3 + evR() * 0.45) * across / 1 : -1, fadeT: 2.4 + evR() * 1.6, fading: -1 };
      e.shadowT = e.shadow > 0 ? e.shadow / e.v : -1;
    } else if (kind === 'ufo') {
      var q = openPoint(90, 14, function (x, y) { return openSky(x, y, false) && openSky(x + 40, y, false) && openSky(x - 40, y, false); }) || (forced ? openPoint(90, 1) : null);
      if (!q) return false;
      var ga = evR() * Math.PI * 2;
      e = { kind: kind, x: q.x - o.x, y: q.y - o.y, gx: Math.cos(ga), gy: Math.sin(ga) * 0.5, t: 0,
        glide: 6 + evR() * 4, pause: 1.8 + evR() * 2.2, dart: evR() < 0.7, rot: evR() * 6.28,
        da: evR() * Math.PI * 2, sp: binSprite(3.6, 0.5), amber: binSprite(3.9, 1.6), a0: baseAlpha(3.6) };
    }
    if (e) { EV.list.push(e); kick(); }
    return !!e;
  }
  function eventsTick(dt) {
    if (S.still) return;
    ['meteor', 'satellite', 'ufo'].forEach(function (k) {
      if (S.t >= EV.next[k]) { if (!spawn(k, false)) EV.next[k] = S.t + 8; else schedule(k, false); }
    });
    EV.list = EV.list.filter(function (e) {
      e.t += dt;
      if (e.kind === 'meteor') return e.t < e.T;
      if (e.kind === 'satellite') {
        if (e.shadowT > 0 && e.t > e.shadowT && e.fading < 0) e.fading = 0;
        if (e.fading >= 0) e.fading += dt;
        return e.t < e.life && !(e.fading > e.fadeT);
      }
      return e.t < e.glide + e.pause + 1.6;
    });
  }
  function fastEvent() {
    for (var i = 0; i < EV.list.length; i++) { var e = EV.list[i]; if (e.kind === 'meteor' || e.kind === 'ufo') return true; }
    return false;
  }
  function drawEvents(c) {
    var d = S.dpr, o = EV.origin;
    EV.list.forEach(function (e) {
      if (e.kind === 'meteor') {
        var u = e.t / e.T, head = 1 - Math.pow(1 - u, 1.6), A = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.8) * e.a * S.fade;
        var hx = o.x + e.x + e.dx * e.len * head, hy = o.y + e.y + e.dy * e.len * head;
        var tl = e.len * (0.22 + 0.5 * Math.min(1, u * 1.6)), tx = hx - e.dx * tl, ty = hy - e.dy * tl;
        var gr = c.createLinearGradient(tx * d, ty * d, hx * d, hy * d), rgb = e.rgb.map(function (v) { return Math.round(v * 255); }).join(',');
        gr.addColorStop(0, 'rgba(' + rgb + ',0)');
        gr.addColorStop(0.75, 'rgba(' + rgb + ',' + (A * 0.45).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(' + rgb + ',' + A.toFixed(3) + ')');
        c.globalAlpha = 1;
        c.strokeStyle = gr; c.lineWidth = Math.max(1, 1.1 * d); c.lineCap = 'round';
        c.beginPath(); c.moveTo(tx * d, ty * d); c.lineTo(hx * d, hy * d); c.stroke();
        blit(c, binSprite(2.2, 0.3), Math.round(hx * d), Math.round(hy * d), A * 0.9);
      } else if (e.kind === 'satellite') {
        var x = o.x + e.x + e.dx * e.v * e.t, y = o.y + e.y + e.dy * e.v * e.t;
        var a = e.a0 * Math.min(1, e.t / 1.2) * S.fade * (1 + 0.04 * Math.sin(e.t * 1.7));
        if (e.fading >= 0) a *= Math.pow(1 - clamp(e.fading / e.fadeT, 0, 1), 1.6);
        blit(c, e.sp, Math.round(x * d), Math.round(y * d), a);
      } else {
        var t = e.t, px = o.x + e.x, py = o.y + e.y, s = 1, A2 = S.fade;
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
          depth: 0.08 + 0.34 * clamp((MAG_DYN - s[2]) / 5.4, 0, 1) };
      });
    }
    if (atlas) cons.stars.forEach(function (s) { s.sp = s.m < MAG_OWN ? ownSprite(s.m, s.bv) : binSprite(s.m, s.bv); s.a = s.m < MAG_OWN ? 1 : baseAlpha(s.m); });
    if (door) {
      // the label carries the door's invitation, so the native tooltip would only double it
      if (door.title) { NM_LABEL.fact = door.title; door.setAttribute('data-nm-title', door.title); door.removeAttribute('title'); }
      if (!door.__nmSky) {
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
    }
    root.setAttribute('data-nm-sky', page);
    layoutFooter();
  }
  function layoutFooter() {
    var host = cons.host;
    if (!host || !host.isConnected) { if (S.page === 'home' && document.querySelector('main > section.h-lvh')) setupFooter(); return; }
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
    // where the NM's centre sits on screen once the page is scrolled to the end
    var max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    var nb = { x: hr.left + cx, y: hr.top + (window.scrollY || 0) + cy - max };
    if (!cons.box1 || Math.abs(nb.x - cons.box1.x) > 0.5 || Math.abs(nb.y - cons.box1.y) > 0.5) {
      cons.box1 = nb;
      if (S.base) { S.gen++; frameViews(); L.ok = false; G.ok = false; if (S.ready) queueGlow(); }
    }
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
    var hov = cons.hover, st = cons.stars, la = (0.14 + 0.16 * hov) * cons.linesIn * S.fade;
    if (la > 0.004) {
      c.strokeStyle = 'rgba(200,212,236,' + la.toFixed(3) + ')';
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
    var lift = (1 + 0.14 * hov) * S.fade * opts.brightness;
    for (var i = 0; i < st.length; i++) {
      var s = st[i], tw = twinkle(t, s.r1, s.r2, s.o1, s.o2, s.depth);
      drawOne(c, s.sp, s.m, Math.round(s.x * d), Math.round(s.y * d), s.a * lift, tw, t, s.o3);
    }
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

  /* -------------------------------------------------------------------- frame */
  function measure() {
    var vw = canvas.clientWidth || innerWidth, vh = canvas.clientHeight || innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (vw * vh > 2600000) dpr = Math.min(dpr, 1.5);
    var changed = vw !== S.vw || vh !== S.vh || dpr !== S.dpr;
    S.vw = vw; S.vh = vh;
    S.phone = Math.min(vw, vh) < 600;
    var L0 = Math.max(vw, vh);
    var tn = TUNE[S.page], ph = vw < 600 && tn && tn.phone, fs = ph && ph.fovScale || 1;
    S.fov = (S.base ? S.base.fov : 75) * clamp(Math.sqrt(L0 / BASE_L), 0.8, 1.12) * fs;
    S.magLimit = L0 < 1000 ? (fs > 1 ? 5.4 : 5.7) : 6.0;
    if (dpr !== S.dpr || !atlas) { S.dpr = dpr; if (S.ready || atlas) { buildAtlas(); if (S.dyn) prepareSprites(); } }
    S.W = Math.round(vw * dpr); S.H = Math.round(vh * dpr);
    if (canvas.width !== S.W || canvas.height !== S.H) { canvas.width = S.W; canvas.height = S.H; }
    S.maxScroll = Math.max(1, (document.documentElement.scrollHeight || 0) - innerHeight);
    if (S.base) frameViews();
    return changed;
  }
  function footerLevel() {
    var f = cons.foot;
    if (!f || !f.isConnected) return 0;
    var r = f.getBoundingClientRect(), span = Math.min(S.vh, r.height || S.vh);
    cons.visible = r.top < S.vh + 40 && r.bottom > -40;
    return smooth(0, 1, (S.vh - r.top) / (span * 0.85));
  }
  function frame(now) {
    var t0 = performance.now();
    var dt = S.last ? Math.min(0.1, (now - S.last) / 1000) : 0;
    S.last = now;
    if (!S.still) S.t += dt;
    if (S.fade < 1) S.fade = S.still ? 1 : Math.min(1, S.fade + dt / 1.4);
    var t = S.still ? 0 : S.t, f = scrollFrac(), v = viewAt(S.view, f, t), d = S.dpr;
    S.scrollY = window.scrollY || 0;

    // footer heaviness, quantised for the cached layer
    var fl = footerLevel();
    S.footer = fl;
    var q = Math.round(fl * 6) / 6;
    if (q > 0 && !G.ok) queueGlow();
    if (q !== S.footerQ) { S.footerQ = q; L.ok = false; }

    // cached layer offset
    var ox = 0, oy = 0;
    if (L.ok) {
      if (proj(v, L.ref[0], L.ref[1], L.ref[2], P)) { ox = P.x - v.cx; oy = P.y - v.cy; } else L.ok = false;
      if (Math.abs(ox) * d > L.M * 0.4 || Math.abs(oy) * d > L.M * 0.4) L.ok = false;
    }
    if (!L.ok) { renderLayer(v); ox = 0; oy = 0; }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, S.W, S.H);
    ctx.globalCompositeOperation = 'lighter';

    // Milky Way
    if (G.ok && fl > 0 && proj(v, G.ref[0], G.ref[1], G.ref[2], P) && (Math.abs(P.x - v.cx) > G.M * 0.8 || Math.abs(P.y - v.cy) > G.M * 0.8)) { G.ok = false; queueGlow(); }
    if (fl > 0.01 && G.ok && proj(v, G.ref[0], G.ref[1], G.ref[2], P)) {
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = Math.min(1, fl * S.fade);
      ctx.drawImage(glow, Math.round((P.x - v.cx - G.M) * d), Math.round((P.y - v.cy - G.M) * d), glow.width * d, glow.height * d);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = S.fade;
    ctx.drawImage(layer, Math.round(ox * d) - L.M, Math.round(oy * d) - L.M);

    // bright stars
    var D = S.dyn, img = atlas.canvas, lift = (1 + 0.22 * fl) * S.fade * opts.brightness, p = S.pointer;
    // the NM takes the place of the catalogue's brighter stars behind it
    var bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
    if (cons.visible && cons.canvas && fl > 0) {
      var cr = cons.canvas.getBoundingClientRect(), mx = (cr.width - cons.w) / 2 - 16, my = (cr.height - cons.h) / 2 - 16;
      bx0 = cr.left + mx; bx1 = cr.right - mx; by0 = cr.top + my; by1 = cr.bottom - my;
    }
    var minX = -30, maxX = S.vw + 30, minY = -30, maxY = S.vh + 30, mag = S.magLimit;
    for (var i = 0; i < D.n; i++) {
      D.on[i] = 0;
      if (D.m[i] > mag) continue;
      if (!proj(v, D.x[i], D.y[i], D.z[i], P)) continue;
      if (P.x < minX || P.x > maxX || P.y < minY || P.y > maxY) continue;
      D.on[i] = 1; D.sx[i] = P.x; D.sy[i] = P.y;
      var a = D.a[i] * lift;
      if (P.x > bx0 && P.x < bx1 && P.y > by0 && P.y < by1 && D.rec[i].f < 0) a *= 1 - fl;
      if (D.rec[i].f >= 0 && p.fine) {   // a barely-there lift as the pointer nears a featured star
        var pd = Math.hypot(P.x - p.x, P.y - p.y);
        if (pd < 90) a *= 1 + 0.3 * (1 - pd / 90);
      }
      var tw = twinkle(t, D.r1[i], D.r2[i], D.o1[i], D.o2[i], D.depth[i]);
      drawOne(ctx, D.sp[i], D.m[i], Math.round(P.x * d), Math.round(P.y * d), a, tw, t, D.o3[i]);
    }

    // the label's reticle and leader, in the sky
    var lt = label.on ? 1 : 0;
    label.a += (lt - label.a) * (S.still ? 1 : Math.min(1, dt * 7));
    if (label.on) placeLabel();
    if (label.a > 0.01 && label.kind === 'star' && label.ax != null) {
      var ax = label.ax * d, ay = label.ay * d, la = label.a * 0.32;
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

    // events
    if (proj(v, S.baseU[0], S.baseU[1], S.baseU[2], P)) { EV.origin.x = P.x; EV.origin.y = P.y; }
    eventsTick(dt);
    if (EV.list.length) drawEvents(ctx);

    // footer constellation
    cons.hover += (cons.hoverTo - cons.hover) * (S.still ? 1 : Math.min(1, dt * 6));
    cons.linesIn = S.still ? 1 : smooth(0.45, 0.95, fl);
    if (cons.visible && cons.ctx) drawCons(t);

    hoverTick();
    if (Math.abs(S.scrollY - veil.y) > 0.5) { veil.y = S.scrollY; veilSoon(); }

    var ms = performance.now() - t0, st = S.stats;
    st.frames++; st.ms += ms; if (ms > st.worst) st.worst = ms;
  }

  /* --------------------------------------------------------------- the loop */
  var lastY = -1;
  function loop(now) {
    S.raf = requestAnimationFrame(loop);
    var y = window.scrollY || 0, moving = y !== lastY || fastEvent() || Math.abs(cons.hover - cons.hoverTo) > 0.01 || Math.abs(label.a - (label.on ? 1 : 0)) > 0.01 || S.fade < 1;
    if (!moving && S.last && now - S.last < 31) return;
    lastY = y;
    frame(now);
  }
  function active() { return S.ready && S.mounted && !document.hidden && !gameOpen(); }
  function update() {
    S.still = reduceQ.matches;
    if (S.still) { EV.list.length = 0; S.fade = 1; }
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

  /* ------------------------------------------------------------------- mount */
  var resizeT = 0;
  function onResize() {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      var changed = measure();
      if (!S.ready) return;
      if (changed) { S.gen++; L.ok = false; G.ok = false; S.dust = null; queueGlow(); }
      layoutFooter();
      if (label.on) { fillLabel(label.kind === 'cons' ? NM_LABEL : S.featured[label.star]); placeLabel(); }
      checkVeil();
      kick();
    }, 140);
  }
  function mount() {
    if (S.mounted) return;
    S.mounted = true;
    S.page = api.page = detectPage();
    canvas = document.createElement('canvas');
    canvas.id = 'nm-sky';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100vh;height:100lvh;z-index:-20;pointer-events:none;display:block';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    layer = document.createElement('canvas'); lctx = layer.getContext('2d');
    glow = document.createElement('canvas'); gctx = glow.getContext('2d');
    heroCanvas = document.querySelector('#global-canvas canvas');
    headerEl = document.querySelector('header[data-nm-header], .nm-hdr');
    makeLabel();
    measure();
    buildAtlas();
    api.canvas = canvas;
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
    addEventListener('scroll', function () { if (S.still) { veilSoon(); clearTimeout(S.stillT); S.stillT = setTimeout(kick, 120); } else if (label.pinned && Math.abs((window.scrollY || 0) - label.sy) > 90) hideLabel(); }, { passive: true });
    if ('ResizeObserver' in window) {
      var hT = 0;
      new ResizeObserver(function () {
        clearTimeout(hT);
        hT = setTimeout(function () { S.maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight); layoutFooter(); checkVeil(); kick(); }, 160);
      }).observe(document.body);
    }

    fetch('/media/sky/' + S.page + '.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('sky data ' + r.status); return r.json(); })
      .then(function (d) {
        ingest(d);
        measure();
        S.baseU = unit(S.base.ra, S.base.dec);
        prepareSprites();
        setupFooter();
        S.ready = true;
        ['meteor', 'satellite', 'ufo'].forEach(function (k) { schedule(k, true); });
        update();
        checkVeil();
        setTimeout(checkVeil, 900);
        (window.requestIdleCallback || function (f) { return setTimeout(f, 1500); })(function () { if (!G.ok) queueGlow(); }, { timeout: 4000 });
      })
      .catch(function (err) { console.warn('[nm-sky] sky unavailable:', err && err.message); });
  }

  /* ------------------------------------------------------------------- API */
  api.set = function (o) {
    if (!o) return;
    if (o.brightness != null) opts.brightness = Math.max(0, +o.brightness || 0);
    if (o.twinkle != null) opts.twinkle = Math.max(0, +o.twinkle || 0);
    L.ok = false; kick();
  };
  api.debug = function () {
    var D = S.dyn;
    return {
      page: S.page, ready: S.ready, running: S.running, still: S.still, dpr: S.dpr, size: [S.vw, S.vh],
      fov: S.fov, view: S.view && { ra: S.view.ra, dec: S.view.dec }, footer: S.footer,
      counts: D && { bright: D.n, faint: S.faint.length, dust: S.dust ? S.dust.list.length : 0, onScreen: Array.prototype.reduce.call(D.on, function (a, b) { return a + b; }, 0) },
      featured: S.featured.map(function (f, k) {
        var i = f.idx, on = D && !!D.on[i];
        return { id: f.id, x: on ? Math.round(D.sx[i]) : null, y: on ? Math.round(D.sy[i]) : null, open: on ? openSky(D.sx[i], D.sy[i], false) : false };
      }),
      events: EV.list.map(function (e) {
        var k = e.kind === 'satellite' ? e.v * e.t : 0;
        return { kind: e.kind, t: +e.t.toFixed(2), x: Math.round(EV.origin.x + e.x + (e.dx || 0) * k), y: Math.round(EV.origin.y + e.y + (e.dy || 0) * k) };
      }), next: { meteor: Math.round(EV.next.meteor - S.t), satellite: Math.round(EV.next.satellite - S.t), ufo: Math.round(EV.next.ufo - S.t) },
      veilClear: veil.clear, label: label.on ? (label.kind === 'cons' ? 'NM' : S.featured[label.star].id) : null,
      stats: { frames: S.stats.frames, avgMs: S.stats.frames ? +(S.stats.ms / S.stats.frames).toFixed(2) : 0, worstMs: +S.stats.worst.toFixed(2), rerenders: S.stats.rerenders },
      cons: cons.canvas ? { w: Math.round(cons.w), h: Math.round(cons.h), door: !!cons.door, visible: cons.visible } : null
    };
  };
  api.resetStats = function () { S.stats = { frames: 0, ms: 0, worst: 0, rerenders: 0, since: performance.now() }; };

  var ready = window.__nmReady || function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };
  ready(mount);
})();
