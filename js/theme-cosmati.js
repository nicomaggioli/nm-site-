/* Cosmati direction: the universe, inlaid (docs/cosmic-directions.md, section 4).

   The page is a carpet runner. An indigo-black field carries a faint star-and-cross
   micro-tiling; borders (reciprocal teeth either side of a Cosmati guilloche) run
   down both edges and close in an end border and a fringe; majolica tile friezes
   (cord, bead-and-reel, sixteen hand-painted tiles) and narrow guilloche bands divide
   the sections. The homepage hero is the carpet's centre: an oval toranj whose calm
   field is a sixteen-point girih star holding the NM collage, quarter medallions
   (lachak) in the corners, the whole field bordered. The footer black hole is the porphyry disc at the heart
   of a Cosmati roundel: spiralling tesserae, an interlaced guilloche ring that turns
   imperceptibly, and the one violet porphyry fleck.

   Everything is drawn once, procedurally, with Canvas 2D (exact geometry, then a
   seeded wobble field, glaze pooling, colour bleed and craquelure for the painted
   pieces) and handed to CSS as images: no live DOM ornament, no extra WebGL.
   Motion is limited to the roundel ring and a few stars glinting in the tiling,
   both compositor-only, running only while on screen, and still under
   prefers-reduced-motion (CSS). The hero ground is an <img> sampled once by the
   hero shader (heroClear); it is rebuilt as a new element on resize.

   Runs before nm-cosmos.js / nm-blackhole.js and before the DOM is ready: the
   config is written synchronously, DOM work waits for window.__nmReady.
   window.NMCosmati exposes the painters for inspection. */
(function () {
  'use strict';
  var root = document.documentElement;
  var C = window.NMThemeConfig = window.NMThemeConfig || {};
  var PATH = location.pathname;
  var PAGE = /^\/about(\/|$)/.test(PATH) ? 'about' : /^\/index(\/|$)/.test(PATH) ? 'index' : 'home';
  root.setAttribute('data-cm-page', PAGE);

  // Hoodie glazes plus one deep ink (indigo-black) for the field and the linework.
  var K = {
    ink: '#110D1D', ink2: '#191428', ink3: '#231C37',
    cream: '#EDE1CC', white: '#F4F8F0', ice: '#C6CDC6', sky: '#BCD3E0',
    peach: '#E9B4A3', coral: '#E3837A', deep: '#CA5855', violet: '#6E6BD6',
    trek: '#3A2433', clay: '#B9785C'
  };

  /* ------------------------------------------------ shared-module configuration */
  var hero = { img: null, on: true, key: '' };
  C.heroClear = true;
  C.heroBase = K.ink;
  C.heroBackdrop = function () { return hero.img && hero.on ? [hero.img] : []; };
  C.airbrush = false;
  C.stars = false;
  // spray speckle over the field (the painted pieces carry their own)
  C.grain = { opacity: 0.2, blend: 'overlay', density: 0.4, light: 0.12, seed: 11 };
  C.blackHole = {
    palette: ['#CA5855', '#E3837A', '#E9B4A3', '#EDE1CC', '#F4F8F0', '#BCD3E0'],
    scale: 0.95, tilt: 6, spin: 0.85, intensity: 1.05, stars: 0.55, grain: 1.1,
    violet: true, arrive: 6
  };

  /* --------------------------------------------------------------- utilities */
  function rng(seed) {
    var a = (seed * 2654435761) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hex(c) {
    var n = parseInt(c.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgba(c, a) { var v = hex(c); return 'rgba(' + v[0] + ',' + v[1] + ',' + v[2] + ',' + (a == null ? 1 : a) + ')'; }
  function mixc(a, b, t) {
    var x = hex(a), y = hex(b);
    return '#' + [0, 1, 2].map(function (i) { return ('0' + Math.round(x[i] + (y[i] - x[i]) * t).toString(16)).slice(-2); }).join('');
  }
  function scaleFor(max) {
    var d = window.devicePixelRatio || 1;
    return Math.max(1, Math.min(max || 3, Math.round(d)));
  }
  // canvas in CSS px, backed at s device px per CSS px
  function mk(w, h, s) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    var x = c.getContext('2d');
    x.setTransform(s, 0, 0, s, 0, 0);
    return { c: c, x: x, w: w, h: h, s: s };
  }
  // smooth 2D value noise in -1..1 (seeded); used as the hand-painting wobble field
  function noise2(seed) {
    var r = rng(seed), N = 64, t = new Float32Array(N * N);
    for (var i = 0; i < N * N; i++) t[i] = r() * 2 - 1;
    return function (x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      var a = (xi & 63) + (yi & 63) * N, b = ((xi + 1) & 63) + (yi & 63) * N;
      var c = (xi & 63) + ((yi + 1) & 63) * N, d = ((xi + 1) & 63) + ((yi + 1) & 63) * N;
      return (t[a] + (t[b] - t[a]) * fx) + ((t[c] + (t[d] - t[c]) * fx) - (t[a] + (t[b] - t[a]) * fx)) * fy;
    };
  }

  /* ----------------------------------------------------------------- geometry */
  var TAU = Math.PI * 2;
  function polar(cx, cy, r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function ring(cx, cy, r, n, a0) {
    var p = [];
    for (var i = 0; i < n; i++) p.push(polar(cx, cy, r, (a0 || 0) + i / n * TAU));
    return p;
  }
  // regular star polygon: n points, outer R, inner r
  function star(cx, cy, n, R, r, rot) {
    var p = [];
    for (var i = 0; i < n * 2; i++) p.push(polar(cx, cy, i & 1 ? r : R, (rot || 0) + i / (n * 2) * TAU));
    return p;
  }
  // radius as a function of angle -> closed outline
  function radial(cx, cy, fn, n) {
    var p = [];
    for (var i = 0; i < n; i++) { var a = i / n * TAU; p.push(polar(cx, cy, fn(a), a)); }
    return p;
  }
  // pointed petal (vesica) along angle a from radius r0 to r1
  function petal(cx, cy, a, r0, r1, w, n) {
    n = n || 18;
    var p = [], ca = Math.cos(a), sa = Math.sin(a);
    for (var side = 0; side < 2; side++) {
      for (var i = 0; i <= n; i++) {
        var t = side ? 1 - i / n : i / n;
        var rr = r0 + (r1 - r0) * t, hw = w * Math.pow(Math.sin(Math.PI * t), 0.85) * (side ? -1 : 1);
        p.push([cx + ca * rr - sa * hw, cy + sa * rr + ca * hw]);
      }
    }
    return p;
  }
  // subdivide straight edges so the wobble field can bend them
  function dens(p, step, open) {
    var out = [], n = p.length, m = open ? n - 1 : n;
    for (var i = 0; i < m; i++) {
      var a = p[i], b = p[(i + 1) % n], d = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(d / step));
      for (var j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
    }
    if (open) out.push(p[n - 1]);
    return out;
  }
  function wob(p, f, amp, freq) {
    if (!f || !amp) return p;
    return p.map(function (q) {
      return [q[0] + amp * f(q[0] * freq, q[1] * freq), q[1] + amp * f(q[0] * freq + 31.7, q[1] * freq + 17.3)];
    });
  }
  function trace(x, p, open) {
    x.beginPath();
    x.moveTo(p[0][0], p[0][1]);
    for (var i = 1; i < p.length; i++) x.lineTo(p[i][0], p[i][1]);
    if (!open) x.closePath();
  }
  function fillP(x, p, c) { trace(x, p); x.fillStyle = c; x.fill(); }
  function strokeP(x, p, c, w, open) { trace(x, p, open); x.strokeStyle = c; x.lineWidth = w; x.stroke(); }
  // per-pixel spray grain + speckle on a finished canvas region (device px)
  function spray(g, amt, specks, seed, x0, y0, w, h) {
    var r = rng(seed || 3), x = g.x, s = g.s;
    var X = Math.round((x0 || 0) * s), Y = Math.round((y0 || 0) * s);
    var W = Math.round((w || g.w) * s), H = Math.round((h || g.h) * s);
    var img;
    try { img = x.getImageData(X, Y, W, H); } catch (e) { return; }
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      var n = (r() - 0.5) * amt;
      if (r() < specks) n -= 40 + r() * 60;
      d[i] = d[i] + n; d[i + 1] = d[i + 1] + n; d[i + 2] = d[i + 2] + n;
    }
    x.putImageData(img, X, Y);
  }

  // spray speckle for large canvases: a seeded noise tile composited by the GPU
  var grainTiles = {};
  function grainOverlay(g, alpha, seed) {
    var key = (seed || 1) + '@' + g.s, t = grainTiles[key];
    if (!t) {
      var n = 128, c = document.createElement('canvas'); c.width = c.height = n;
      var cx = c.getContext('2d'), img = cx.createImageData(n, n), d = img.data, r = rng(seed || 1);
      for (var i = 0; i < n * n; i++) {
        var v = r(), sp = r() < 0.006;
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = sp ? 0 : v < 0.5 ? 40 : 230;
        d[i * 4 + 3] = sp ? 160 : Math.round(Math.abs(v - 0.5) * 2 * 70);
      }
      cx.putImageData(img, 0, 0);
      t = grainTiles[key] = c;
    }
    var x = g.x;
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = alpha; x.globalCompositeOperation = 'overlay';
    x.fillStyle = x.createPattern(t, 'repeat');
    x.fillRect(0, 0, g.c.width, g.c.height);
    x.restore();
  }

  /* ------------------------------------------------------- the field (ground) */
  // Star-and-cross: 8-point stars (two squares) on a checkerboard; the crosses are
  // the gaps between them. Period T in CSS px, low contrast on the ink.
  function paintGround(x, T, ox, oy, s) {
    var R = T / (2 * Math.SQRT2), r = R * 0.7654;
    var cs = [[0, 0], [T, 0], [0, T], [T, T], [T / 2, T / 2]];
    x.save(); x.translate(ox, oy);
    // kept faint: the weave should surface on a close look, not sit behind the copy
    // like wallpaper (the stars only just lift off the ink, the crosses barely sink)
    cs.forEach(function (c) { fillP(x, star(c[0], c[1], 8, R, r, 0), rgba('#1A1530', 0.3)); });
    var lw = 1 / s;
    cs.forEach(function (c) { strokeP(x, star(c[0], c[1], 8, R - lw * 0.5, r - lw * 0.5, 0), rgba('#3A3058', 0.26), lw); });
    // a pin of colour at each star heart and cross heart: the field rewards a close look
    cs.forEach(function (c) {
      fillP(x, star(c[0], c[1], 4, R * 0.2, R * 0.07, Math.PI / 4), rgba(K.coral, 0.22));
    });
    [[T / 2, 0], [0, T / 2], [T, T / 2], [T / 2, T]].forEach(function (c) {
      x.beginPath(); x.arc(c[0], c[1], Math.max(0.6, T * 0.018), 0, TAU); x.fillStyle = rgba(K.sky, 0.22); x.fill();
    });
    x.restore();
  }
  function groundTile(T, s) {
    var g = mk(T, T, s);
    g.x.fillStyle = K.ink; g.x.fillRect(0, 0, T, T);
    paintGround(g.x, T, 0, 0, s);
    spray(g, 7, 0.004, 21);
    return g;
  }

  /* --------------------------------------------------------- guard stripes */
  // Each draws one horizontal run of length L (a whole number of periods) at y..y+h.
  var guards = {
    // twisted cord: slanted strands, cream and coral, a shadow under each twist
    cord: function (x, L, y, h, per) {
      var n = Math.round(L / per); per = L / n;
      x.save(); x.beginPath(); x.rect(0, y, L, h); x.clip();
      x.fillStyle = K.ink; x.fillRect(0, y, L, h);
      for (var i = -1; i <= n; i++) {
        var cx = i * per + per / 2, c = i & 1 ? K.coral : K.cream;
        x.save(); x.translate(cx, y + h / 2); x.rotate(-0.62);
        x.beginPath(); x.ellipse(0, 0, per * 0.78, h * 0.36, 0, 0, TAU);
        x.fillStyle = c; x.fill();
        x.beginPath(); x.ellipse(0, h * 0.1, per * 0.7, h * 0.18, 0, 0, Math.PI);
        x.fillStyle = rgba(K.trek, 0.35); x.fill();
        x.restore();
      }
      x.restore();
    },
    // bead and reel (astragal)
    beads: function (x, L, y, h, per) {
      var n = Math.round(L / per); per = L / n;
      x.save(); x.beginPath(); x.rect(0, y, L, h); x.clip();
      x.fillStyle = K.ink; x.fillRect(0, y, L, h);
      for (var i = 0; i < n; i++) {
        var x0 = i * per, cy = y + h / 2;
        x.beginPath(); x.ellipse(x0 + per * 0.36, cy, per * 0.25, h * 0.34, 0, 0, TAU);
        x.fillStyle = K.cream; x.fill();
        x.beginPath(); x.ellipse(x0 + per * 0.33, cy - h * 0.1, per * 0.08, h * 0.09, 0, 0, TAU);
        x.fillStyle = rgba(K.white, 0.8); x.fill();
        [0.74, 0.86].forEach(function (f) {
          x.beginPath(); x.ellipse(x0 + per * f, cy, per * 0.035, h * 0.27, 0, 0, TAU);
          x.fillStyle = K.peach; x.fill();
        });
      }
      x.restore();
    },
    // reciprocal triangles: coral teeth up, lifted-ink teeth down, hairline between
    teeth: function (x, L, y, h, per, flip) {
      var n = Math.round(L / per); per = L / n;
      x.save(); x.beginPath(); x.rect(0, y, L, h); x.clip();
      x.fillStyle = K.ink3; x.fillRect(0, y, L, h);
      var b = flip ? y : y + h, t = flip ? y + h : y;
      for (var i = 0; i < n; i++) {
        var x0 = i * per;
        x.beginPath(); x.moveTo(x0, b); x.lineTo(x0 + per / 2, t); x.lineTo(x0 + per, b); x.closePath();
        x.fillStyle = i % 4 === 1 ? K.deep : K.coral; x.fill();
        x.strokeStyle = rgba(K.cream, 0.7); x.lineWidth = Math.max(0.5, h * 0.06); x.stroke();
      }
      x.restore();
    },
    line: function (x, L, y, h, per, c) { x.fillStyle = c || rgba(K.cream, 0.6); x.fillRect(0, y, L, h); },
    // guilloche: two bands interlacing round a chain of discs (porphyry and serpentine)
    guil: function (x, L, y, h, per) {
      var n = Math.round(L / per); per = L / n;
      x.save(); x.beginPath(); x.rect(0, y, L, h); x.clip();
      x.fillStyle = K.ink; x.fillRect(0, y, L, h);
      var cy = y + h / 2, a = h * 0.3, bw = Math.max(0.9, h * 0.13), seg = per / 2;
      // discs in the loops (centres at odd quarter-periods)
      for (var i = -1; i <= 2 * n; i++) {
        var dxp = (i + 0.5) * seg, col = i % 4 === 1 ? K.deep : i & 1 ? K.coral : K.sky;
        x.beginPath(); x.arc(dxp, cy, a * 0.62, 0, TAU); x.fillStyle = col; x.fill();
        x.beginPath(); x.arc(dxp, cy, a * 0.22, 0, TAU); x.fillStyle = K.cream; x.fill();
      }
      function pts(k, x0, x1) {
        var p = [];
        for (var j = 0; j <= 12; j++) { var xx = x0 + (x1 - x0) * j / 12; p.push([xx, cy + (k ? -1 : 1) * a * Math.sin(xx / per * TAU)]); }
        return p;
      }
      x.lineCap = 'butt'; x.lineJoin = 'round';
      function lay(k, x0, x1) {
        var p = pts(k, x0, x1);
        strokeP(x, p, K.ink, bw + Math.max(1, h * 0.09), true);
        strokeP(x, p, k ? K.cream : K.peach, bw, true);
      }
      // whole strands, then the upper strand re-laid over each crossing (no seams)
      var steps = Math.max(24, Math.round(L / 2));
      [0, 1].forEach(function (k) {
        var p = [];
        for (var j = 0; j <= steps; j++) { var xx = -seg + (L + 2 * seg) * j / steps; p.push([xx, cy + (k ? -1 : 1) * a * Math.sin(xx / per * TAU)]); }
        strokeP(x, p, K.ink, bw + Math.max(1, h * 0.09), true);
        strokeP(x, p, k ? K.cream : K.peach, bw, true);
      });
      for (i = -1; i <= 2 * n + 1; i++) lay(i & 1, i * seg - seg * 0.36, i * seg + seg * 0.36);
      x.restore();
    }
  };
  // stack guards across a band: spec = [[kind, h, period, flip]...], returns total height
  function band(x, L, y0, spec) {
    var y = y0;
    spec.forEach(function (g) { guards[g[0]](x, L, y, g[1], g[2], g[3]); y += g[1]; });
    return y - y0;
  }

  /* ------------------------------------------------------------ majolica tiles */
  // One hand-painted 4-fold tile, S CSS px, centred at (cx, cy). Exact D4 geometry,
  // then the tile's own wobble field, colour bleed, glaze pooling, trek outlines,
  // a clay chip or two and hairline craquelure.
  function paintTile(x, cx, cy, S, motif, seed, s, opts) {
    opts = opts || {};
    var r = rng(seed), f = noise2(seed * 7 + 1), u = S / 2;
    var amp = S * 0.011, fq = 5 / S;
    var trekW = Math.max(0.5, S * 0.014);
    // three layers at tile size: glaze fills, trek outlines, fine brushwork
    var F = mk(S, S, s), O = mk(S, S, s), D = mk(S, S, s);
    var fx = F.x, ox = O.x, dx = D.x;
    var c0 = u; // local centre
    function Wp(p) { return wob(dens(p, Math.max(0.8, S / 70)), f, amp, fq); }
    function region(p, col, a) {
      var q = Wp(p);
      fillP(fx, q, rgba(col, a == null ? 0.94 : a));
      strokeP(ox, q, rgba(K.trek, 0.85), trekW);
      return q;
    }
    function dot(px, py, rad, col) {
      var q = Wp(ring(px, py, rad, 20));
      fillP(fx, q, col);
      strokeP(ox, q, rgba(K.trek, 0.65), trekW * 0.75);
    }
    function dotted(px, py, rad, n, size, col) {
      for (var i = 0; i < n; i++) {
        var p = polar(px, py, rad, i / n * TAU + r() * 0.02);
        dx.beginPath(); dx.arc(p[0], p[1], size * (0.8 + r() * 0.4), 0, TAU); dx.fillStyle = col; dx.fill();
      }
    }
    function hatch(q, ang, gap, col) {
      dx.save(); trace(dx, q); dx.clip();
      var ca = Math.cos(ang), sa = Math.sin(ang);
      dx.strokeStyle = col; dx.lineWidth = Math.max(0.4, S * 0.006);
      for (var t = -S; t < S; t += gap) {
        dx.beginPath();
        dx.moveTo(c0 + ca * -S - sa * t, c0 + sa * -S + ca * t);
        dx.lineTo(c0 + ca * S - sa * t, c0 + sa * S + ca * t);
        dx.stroke();
      }
      dx.restore();
    }
    function vein(p0, p1, col) { strokeP(dx, Wp([p0, p1]), col, Math.max(0.4, S * 0.007), true); }

    // corner quarter-rondels: four tiles meeting make a twelve-petal disc at the grout cross
    [[0, 0], [S, 0], [S, S], [0, S]].forEach(function (k) {
      region(ring(k[0], k[1], S * 0.215, 40), K.deep, 0.95);
      for (var i = 0; i < 12; i++) {
        var pa = i / 12 * TAU;
        region(petal(k[0], k[1], pa, S * 0.06, S * 0.19, S * 0.028, 8), K.peach, 0.95);
      }
      dot(k[0], k[1], S * 0.05, K.cream);
    });
    // a thin painted circle framing the motif, dotted inside
    strokeP(dx, Wp(ring(c0, c0, S * 0.425, 96)), rgba(K.sky, 0.9), Math.max(0.5, S * 0.01));
    dotted(c0, c0, S * 0.395, 36, S * 0.008, rgba(K.trek, 0.55));
    var vio = opts.violet, i, p;
    if (motif === 'star8') {
      var st = region(star(c0, c0, 8, S * 0.35, S * 0.245, 0), K.coral);
      hatch(st, 0.6, S * 0.03, rgba(K.deep, 0.35));
      strokeP(dx, Wp(star(c0, c0, 8, S * 0.3, S * 0.205, 0)), rgba(K.cream, 0.75), Math.max(0.5, S * 0.009));
      region(ring(c0, c0, S * 0.16, 40), K.cream);
      for (i = 0; i < 8; i++) {
        var pq = region(petal(c0, c0, i / 8 * TAU + TAU / 16, S * 0.03, S * 0.145, S * 0.032, 10), K.sky);
        vein(polar(c0, c0, S * 0.04, i / 8 * TAU + TAU / 16), polar(c0, c0, S * 0.13, i / 8 * TAU + TAU / 16), rgba(K.trek, 0.4));
      }
      dot(c0, c0, S * 0.035, K.deep);
      for (i = 0; i < 8; i++) { p = polar(c0, c0, S * 0.385, i / 8 * TAU); dot(p[0], p[1], S * 0.022, K.peach); }
    } else if (motif === 'quatrefoil') {
      var qf = region(radial(c0, c0, function (a) { return S * (0.2 + 0.19 * Math.abs(Math.cos(2 * a))); }, 120), K.sky);
      hatch(qf, -0.7, S * 0.028, rgba('#7F9DB4', 0.4));
      strokeP(dx, Wp(radial(c0, c0, function (a) { return S * (0.16 + 0.16 * Math.abs(Math.cos(2 * a))); }, 120)), rgba(K.white, 0.75), Math.max(0.5, S * 0.009));
      region(radial(c0, c0, function (a) { return S * (0.09 + 0.08 * Math.abs(Math.cos(2 * a + Math.PI / 2))); }, 80), K.peach);
      for (i = 0; i < 4; i++) {
        var la = i / 4 * TAU + TAU / 8;
        region(petal(c0, c0, la, S * 0.2, S * 0.4, S * 0.05, 12), K.coral);
        vein(polar(c0, c0, S * 0.22, la), polar(c0, c0, S * 0.37, la), rgba(K.trek, 0.45));
      }
      dot(c0, c0, S * 0.045, K.deep);
      dotted(c0, c0, S * 0.13, 12, S * 0.01, rgba(K.trek, 0.6));
    } else if (motif === 'rosette') {
      region(ring(c0, c0, S * 0.37, 64), K.ice, 0.6);
      dotted(c0, c0, S * 0.345, 48, S * 0.007, rgba(K.deep, 0.6));
      for (i = 0; i < 8; i++) {
        var ra = i / 8 * TAU;
        region(petal(c0, c0, ra, S * 0.06, S * 0.34, S * 0.068, 16), i & 1 ? K.peach : K.coral);
        vein(polar(c0, c0, S * 0.08, ra), polar(c0, c0, S * 0.3, ra), rgba(i & 1 ? K.deep : K.cream, 0.6));
        p = polar(c0, c0, S * 0.3, ra + TAU / 16);
        dot(p[0], p[1], S * 0.016, K.sky);
      }
      region(ring(c0, c0, S * 0.09, 32), K.deep);
      dot(c0, c0, S * 0.035, K.cream);
    } else if (motif === 'star12') {
      var s12 = region(star(c0, c0, 12, S * 0.37, S * 0.27, 0), K.deep);
      hatch(s12, 1.1, S * 0.03, rgba(K.trek, 0.3));
      region(ring(c0, c0, S * 0.2, 48), K.cream);
      dotted(c0, c0, S * 0.18, 24, S * 0.008, rgba(K.coral, 0.9));
      region(star(c0, c0, 6, S * 0.15, S * 0.09, Math.PI / 6), K.sky);
      for (i = 0; i < 12; i++) { p = polar(c0, c0, S * 0.3, i / 12 * TAU + TAU / 24); dx.beginPath(); dx.arc(p[0], p[1], S * 0.012, 0, TAU); dx.fillStyle = rgba(K.cream, 0.9); dx.fill(); }
      dot(c0, c0, S * 0.045, vio ? K.violet : K.coral);
    } else {
      var arm = S * 0.37, w0 = S * 0.07, w1 = S * 0.14, cr = [];
      for (i = 0; i < 4; i++) {
        var ag = i / 4 * TAU, ca = Math.cos(ag), sa = Math.sin(ag);
        [[w0, w0], [arm * 0.62, w1 * 0.55], [arm, w1], [arm, -w1], [arm * 0.62, -w1 * 0.55], [w0, -w0]].forEach(function (q) {
          cr.push([c0 + q[0] * ca - q[1] * sa, c0 + q[0] * sa + q[1] * ca]);
        });
      }
      var cq = region(cr, K.coral);
      hatch(cq, 0.785, S * 0.03, rgba(K.deep, 0.35));
      region(star(c0, c0, 4, S * 0.13, S * 0.06, Math.PI / 4), K.sky);
      for (i = 0; i < 4; i++) { p = polar(c0, c0, S * 0.29, i / 4 * TAU + TAU / 8); dot(p[0], p[1], S * 0.04, K.peach); dotted(p[0], p[1], S * 0.065, 10, S * 0.007, rgba(K.trek, 0.5)); }
      dot(c0, c0, S * 0.03, K.deep);
    }

    // composite onto the frieze: glaze ground, bleed, pooled fills, trek, brushwork
    var half = u - Math.max(0.6, S * 0.012), rad = S * 0.05, X0 = cx - u, Y0 = cy - u;
    x.save();
    x.beginPath();
    if (x.roundRect) x.roundRect(cx - half, cy - half, half * 2, half * 2, rad); else x.rect(cx - half, cy - half, half * 2, half * 2);
    x.fillStyle = mixc(K.white, K.cream, 0.3 + r() * 0.55); x.fill();
    x.clip();
    for (var m = 0; m < 3; m++) {
      var gx = cx + (r() - 0.5) * S, gy = cy + (r() - 0.5) * S, gr = S * (0.3 + r() * 0.4);
      var gg = x.createRadialGradient(gx, gy, 0, gx, gy, gr);
      gg.addColorStop(0, rgba(m === 1 ? K.sky : K.peach, 0.12)); gg.addColorStop(1, rgba(K.peach, 0));
      x.fillStyle = gg; x.fillRect(X0, Y0, S, S);
    }
    // colour bleed: a soft copy of the glaze fills under the crisp ones
    x.globalAlpha = 0.45;
    x.drawImage(soft(F.c, 3 * s), X0, Y0, S, S);
    // glaze pooling: the outlines, blurred, darken the fills toward their edges
    fx.save();
    fx.setTransform(1, 0, 0, 1, 0, 0);
    fx.globalCompositeOperation = 'source-atop'; fx.globalAlpha = 0.5;
    fx.drawImage(soft(O.c, 2 * s), 0, 0, F.c.width, F.c.height);
    fx.restore();
    x.globalAlpha = 1;
    x.drawImage(F.c, X0, Y0, S, S);
    x.drawImage(O.c, X0, Y0, S, S);
    x.drawImage(D.c, X0, Y0, S, S);
    // the glaze thins and darkens toward the tile edge
    var e = Math.max(1, S * 0.07);
    [[0, 1, 0, 0], [0, -1, 0, S], [1, 0, 0, 0], [-1, 0, S, 0]].forEach(function (k) {
      var ex = X0 + k[2], ey = Y0 + k[3];
      var eg = x.createLinearGradient(ex, ey, ex + k[0] * e, ey + k[1] * e);
      eg.addColorStop(0, rgba(K.trek, 0.26)); eg.addColorStop(1, rgba(K.trek, 0));
      x.fillStyle = eg; x.fillRect(X0, Y0, S, S);
    });
    // a streak where the glaze ran thin, a clay chip or two
    x.fillStyle = rgba(K.white, 0.35);
    x.beginPath(); x.ellipse(X0 + S * (0.2 + r() * 0.6), Y0 + S * (0.15 + r() * 0.3), S * (0.06 + r() * 0.08), S * 0.016, -0.5 + r(), 0, TAU); x.fill();
    var chips = r() < 0.6 ? 1 : 2;
    for (var c2 = 0; c2 < chips; c2++) {
      var side = Math.floor(r() * 4), t = 0.15 + r() * 0.7, chx, chy;
      if (side === 0) { chx = X0 + t * S; chy = Y0; } else if (side === 1) { chx = X0 + S; chy = Y0 + t * S; }
      else if (side === 2) { chx = X0 + t * S; chy = Y0 + S; } else { chx = X0; chy = Y0 + t * S; }
      fillP(x, wob(ring(chx, chy, S * (0.025 + r() * 0.03), 14), f, amp, fq), rgba(K.clay, 0.8));
    }
    // craquelure: hairline cracks that wander and branch
    x.lineCap = 'round';
    for (var k = 0; k < 9; k++) {
      var px0 = cx + (r() - 0.5) * S, py0 = cy + (r() - 0.5) * S, ang = r() * TAU, len = 3 + Math.floor(r() * 9);
      x.beginPath(); x.moveTo(px0, py0);
      for (var j = 0; j < len; j++) {
        ang += (r() - 0.5) * 1.1;
        px0 += Math.cos(ang) * S * 0.035; py0 += Math.sin(ang) * S * 0.035;
        x.lineTo(px0, py0);
      }
      x.strokeStyle = rgba(K.trek, 0.2); x.lineWidth = 0.6 / s; x.stroke();
    }
    x.restore();
  }
  // cheap colour-preserving blur: two halvings down, one smooth scale up
  function soft(src, f) {
    var w = Math.max(1, Math.round(src.width / f)), h = Math.max(1, Math.round(src.height / f));
    var a = document.createElement('canvas'); a.width = Math.max(1, src.width >> 1); a.height = Math.max(1, src.height >> 1);
    var ax = a.getContext('2d'); ax.imageSmoothingQuality = 'high'; ax.drawImage(src, 0, 0, a.width, a.height);
    var b = document.createElement('canvas'); b.width = w; b.height = h;
    var bx = b.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(a, 0, 0, w, h);
    return b;
  }

  function friezeH(S) {
    var gr = Math.max(2, Math.round(S * 0.05)), gh = Math.max(3, Math.round(S * 0.075)), bh = Math.max(4, Math.round(S * 0.11)), th = Math.max(4, Math.round(S * 0.1));
    return (1 + gh + bh + th) * 2 + S + gr * 2;
  }
  // frieze: guards + a row of 16 hand-painted tiles (period P = S + grout), repeat-x
  // seamless. Built as steps (a few tiles each) so it never holds the main thread.
  var MOTIF_ROW = ['star8', 'quatrefoil', 'rosette', 'star12', 'cross', 'rosette', 'quatrefoil', 'star8',
    'star12', 'quatrefoil', 'rosette', 'cross', 'star8', 'rosette', 'quatrefoil', 'star12'];
  function friezeJob(S, s, seed) {
    var gr = Math.max(2, Math.round(S * 0.05)), P = S + gr, n = MOTIF_ROW.length, L = P * n;
    var gh = Math.max(3, Math.round(S * 0.075)), bh = Math.max(4, Math.round(S * 0.11)), th = Math.max(4, Math.round(S * 0.1));
    var H = friezeH(S), g = mk(L, H, s), x = g.x, ty = 1 + gh + bh + th + gr;
    var steps = [function () {
      x.fillStyle = K.ink; x.fillRect(0, 0, L, H);
      band(x, L, 0, [['line', 1, 0], ['cord', gh, P / 6], ['beads', bh, P / 3], ['teeth', th, P / 4, false]]);
      band(x, L, ty + S + gr, [['teeth', th, P / 4, true], ['beads', bh, P / 3], ['cord', gh, P / 6], ['line', 1, 0]]);
    }];
    for (var k = 0; k < n; k += 4) (function (k0) {
      steps.push(function () {
        for (var i = k0; i < Math.min(n, k0 + 4); i++) {
          paintTile(x, i * P + gr / 2 + S / 2, ty + S / 2, S, MOTIF_ROW[i], (seed || 9) * 31 + i * 7, s, { violet: i === 9 });
        }
      });
    })(k);
    steps.push(function () { spray(g, 9, 0.002, seed || 4); });
    return { g: g, w: L, h: H, P: P, steps: steps };
  }
  function friezeStrip(S, s, seed) {
    var j = friezeJob(S, s, seed);
    j.steps.forEach(function (f) { f(); });
    return j;
  }
  // narrow border band between sections: teeth, guilloche, teeth
  function borderStrip(h, s) {
    var per = Math.round(h * 1.6), n = 10, L = per * n;
    var g = mk(L, h, s), x = g.x;
    var th = Math.max(3, Math.round(h * 0.2));
    band(x, L, 0, [['line', 1, 0], ['teeth', th, per / 4, false], ['guil', h - 2 * th - 2, per], ['teeth', th, per / 4, true], ['line', 1, 0]]);
    spray(g, 8, 0.002, 7);
    return { g: g, w: L, h: h };
  }
  // vertical side border (runner edges): rendered horizontally, then turned
  function sideStrip(B, s) {
    var per = B <= 10 ? 12 : Math.round(B * 1.5), n = 16, L = per * n;
    var h = mk(L, B, s), x = h.x;
    if (B <= 10) band(x, L, 0, [['line', 1, 0], ['guil', B - 2, per], ['line', 1, 0]]);
    else {
      var th = Math.max(3, Math.round(B * 0.19));
      band(x, L, 0, [['line', 1, 0], ['teeth', th, per / 4, false], ['guil', B - 2 * th - 2, per], ['teeth', th, per / 4, true], ['line', 1, 0]]);
    }
    spray(h, 8, 0.002, 5);
    var v = mk(B, L, s);
    v.x.setTransform(1, 0, 0, 1, 0, 0);
    v.x.translate(v.c.width, 0); v.x.rotate(Math.PI / 2);
    v.x.drawImage(h.c, 0, 0);
    return { g: v, w: B, h: L };
  }

  /* -------------------------------------------- inlaid (Cosmati) roundels */
  // stone fill with porphyry speckle
  function stone(x, p, col, s, seed, speck) {
    fillP(x, p, col);
    if (speck === 0) return;
    var r = rng(seed || 1), b = bbox(p);
    x.save(); trace(x, p); x.clip();
    var n = Math.min(400, Math.round((b[2] - b[0]) * (b[3] - b[1]) * 0.06 * (speck || 1)));
    for (var i = 0; i < n; i++) {
      x.fillStyle = r() < 0.5 ? rgba(K.white, 0.18 + r() * 0.2) : rgba(K.trek, 0.2 + r() * 0.2);
      x.fillRect(b[0] + r() * (b[2] - b[0]), b[1] + r() * (b[3] - b[1]), 0.8 / s + r() / s, 0.8 / s + r() / s);
    }
    x.restore();
  }
  function bbox(p) {
    var b = [1e9, 1e9, -1e9, -1e9];
    p.forEach(function (q) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); });
    return b;
  }
  // ring of alternating triangles between r0 and r1 (opus sectile), optional twist
  function tessRing(x, cx, cy, r0, r1, n, cols, twist, s) {
    for (var i = 0; i < n; i++) {
      var a0 = i / n * TAU, a1 = (i + 1) / n * TAU, am = (a0 + a1) / 2, tw = twist || 0;
      var up = [polar(cx, cy, r0, a0 + tw), polar(cx, cy, r0, a1 + tw), polar(cx, cy, r1, am)];
      var dn = [polar(cx, cy, r1, am), polar(cx, cy, r1, am + TAU / n), polar(cx, cy, r0, a1 + tw)];
      fillP(x, up, cols[i % cols.length]);
      fillP(x, dn, cols[(i + 1) % cols.length] === cols[i % cols.length] ? K.ink : K.ink2);
    }
    x.lineWidth = 0.6 / s * 1.5;
    x.beginPath(); x.arc(cx, cy, r0, 0, TAU); x.strokeStyle = rgba(K.cream, 0.7); x.stroke();
    x.beginPath(); x.arc(cx, cy, r1, 0, TAU); x.stroke();
  }
  // beads around a circle
  function beadRing(x, cx, cy, r, n, size, col) {
    for (var i = 0; i < n; i++) {
      var p = polar(cx, cy, r, i / n * TAU);
      x.beginPath(); x.arc(p[0], p[1], size, 0, TAU); x.fillStyle = col || K.cream; x.fill();
    }
  }
  // small inlaid rosette block (frieze ends, border corners)
  function cornerBlock(sz, s) {
    var g = mk(sz, sz, s), x = g.x, c = sz / 2;
    x.fillStyle = K.ink; x.fillRect(0, 0, sz, sz);
    x.strokeStyle = rgba(K.cream, 0.6); x.lineWidth = 1; x.strokeRect(1.5, 1.5, sz - 3, sz - 3);
    x.strokeStyle = rgba(K.coral, 0.8); x.strokeRect(4.5, 4.5, sz - 9, sz - 9);
    // corner triangles (spandrels) in deep coral
    [[0, 0], [sz, 0], [sz, sz], [0, sz]].forEach(function (k) {
      var dx = k[0] ? -1 : 1, dy = k[1] ? -1 : 1, q = sz * 0.3;
      stone(x, [[k[0] + dx * 6, k[1] + dy * 6], [k[0] + dx * q, k[1] + dy * 6], [k[0] + dx * 6, k[1] + dy * q]], K.deep, s, k[0] + k[1] + 3);
    });
    var R = sz * 0.42;
    tessRing(x, c, c, R * 0.78, R, 24, [K.cream, K.coral], 0, s);
    stone(x, ring(c, c, R * 0.76, 64), K.ink2, s, 2, 0);
    fillP(x, star(c, c, 8, R * 0.72, R * 0.5, TAU / 16), K.coral);
    stone(x, star(c, c, 8, R * 0.52, R * 0.36, TAU / 16), K.cream, s, 4, 0.6);
    stone(x, ring(c, c, R * 0.26, 48), K.deep, s, 5);
    x.beginPath(); x.arc(c, c, R * 0.08, 0, TAU); x.fillStyle = K.white; x.fill();
    spray(g, 9, 0.002, 13);
    return g;
  }

  /* ----------------------------------------------- the star window's sky */
  // The toranj's calm field opens onto the night: a deep ground lifting toward the
  // strapwork, one airbrushed band in the hoodie's corals breaking into overspray,
  // and a power-law scatter of stars (many faint, few bright, a handful with a
  // cross glint). Drawn inside the medallion's x-scaled space, so round marks are
  // drawn as ellipses 1/ax wide. Painted once into the hero ground.
  function windowSky(x, cx, cy, R, poly, s, ax, seed, mark) {
    var r = rng(seed), i, p;
    // the band runs round the NM, not across it: inside the mark's ellipse it fades
    // away so the collage keeps its dark surround (mark = half extents, scaled units)
    var mw = mark ? mark.w : R * 0.5, mh = mark ? mark.h : R * 0.36;
    function clear(px, py) {
      var e = Math.sqrt(Math.pow((px - cx) / mw, 2) + Math.pow((py - cy) / mh, 2));
      var t = Math.max(0, Math.min(1, (e - 0.8) / 0.55));
      return t * t * (3 - 2 * t);
    }
    x.save(); trace(x, poly); x.clip();
    var vg = x.createRadialGradient(cx, cy, R * 0.12, cx, cy, R * 0.68);
    vg.addColorStop(0, '#0D0A17'); vg.addColorStop(0.62, K.ink2); vg.addColorStop(1, '#2B2142');
    x.fillStyle = vg; x.fillRect(cx - R, cy - R, R * 2, R * 2);
    // the band: soft strokes painted small, blurred by scaling, then sprayed
    var bw = Math.round(R * 0.5), bc = document.createElement('canvas'); bc.width = bc.height = bw;
    var bx = bc.getContext('2d'), k = bw / (2 * R);
    bx.lineCap = 'round';
    // a steep sweep (lower left to upper right) so it shows above and below the mark,
    // where the window has room; control points in units of R from the centre
    var BZ = [[-0.6, 0.85], [-0.22, 0.28], [0.22, -0.22], [0.62, -0.85]];
    function curve(off, wd, col, al) {
      function q(j) { return [(BZ[j][0] * R + off + R) * k, (BZ[j][1] * R + R) * k]; }
      var a0 = q(0), a1 = q(1), a2 = q(2), a3 = q(3);
      bx.beginPath(); bx.moveTo(a0[0], a0[1]); bx.bezierCurveTo(a1[0], a1[1], a2[0], a2[1], a3[0], a3[1]);
      bx.strokeStyle = rgba(col, al); bx.lineWidth = wd * k; bx.stroke();
    }
    curve(0, R * 0.34, K.deep, 0.55);
    curve(-R * 0.02, R * 0.19, K.coral, 0.6);
    curve(-R * 0.04, R * 0.07, K.peach, 0.5);
    curve(R * 0.3, R * 0.11, K.violet, 0.34);
    var bl = soft(soft(bc, 2), 2), blx = bl.getContext('2d'), bs = bl.width / (2 * R);
    blx.save();
    blx.globalCompositeOperation = 'destination-out';
    blx.translate(bl.width / 2, bl.height / 2); blx.scale(mw / mh, 1);
    var mg = blx.createRadialGradient(0, 0, 0, 0, 0, mh * bs * 1.35);
    mg.addColorStop(0, 'rgba(0,0,0,1)'); mg.addColorStop(0.6, 'rgba(0,0,0,0.96)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
    blx.fillStyle = mg; blx.fillRect(-bl.width, -bl.height, bl.width * 2, bl.height * 2);
    blx.restore();
    x.save();
    x.globalAlpha = 0.5;
    x.drawImage(bl, cx - R, cy - R, R * 2, R * 2);
    x.restore();
    // overspray: droplets thrown off the band, densest along its spine
    var drops = Math.round(R * R * 0.016);
    for (i = 0; i < drops; i++) {
      var t = r(), u = 1 - t;
      var bxp = u * u * u * BZ[0][0] + 3 * u * u * t * BZ[1][0] + 3 * u * t * t * BZ[2][0] + t * t * t * BZ[3][0];
      var byp = u * u * u * BZ[0][1] + 3 * u * u * t * BZ[1][1] + 3 * u * t * t * BZ[2][1] + t * t * t * BZ[3][1];
      var spread = (r() + r() + r() - 1.5) * 0.34;
      p = [cx + bxp * R + spread * R * 0.8, cy + byp * R + spread * R * 0.4];
      var near = 1 - Math.min(1, Math.abs(spread) / 0.5), cl = clear(p[0], p[1]);
      if (cl < 0.02) continue;
      x.fillStyle = rgba(r() < 0.6 ? K.coral : r() < 0.6 ? K.peach : K.deep, (0.12 + r() * 0.4) * (0.35 + near * 0.65) * cl);
      var dsz = (0.7 + r() * 0.9) / s * 1.4;
      x.fillRect(p[0], p[1], dsz / ax, dsz);
    }
    // stars
    var n = Math.round(R * R * 0.0016), cols = [K.white, K.sky, K.cream, K.peach, K.white, K.sky];
    for (i = 0; i < n; i++) {
      var a = r() * TAU, d = R * 0.665 * Math.sqrt(r()), b = Math.pow(r(), 3.2);
      p = polar(cx, cy, d, a);
      var rad = (0.35 + b * 1.25) * Math.max(1, R / 380), col = cols[(r() * cols.length) | 0];
      x.beginPath(); x.ellipse(p[0], p[1], rad / ax, rad, 0, 0, TAU);
      x.fillStyle = rgba(col, 0.28 + b * 0.72); x.fill();
      if (b > 0.5) {
        // a bright one: soft halo, and on the very brightest a faint four-point glint
        var hr = rad * 5;
        x.save(); x.translate(p[0], p[1]); x.scale(1 / ax, 1);
        var hg = x.createRadialGradient(0, 0, 0, 0, 0, hr);
        hg.addColorStop(0, rgba(col, 0.22)); hg.addColorStop(1, rgba(col, 0));
        x.fillStyle = hg; x.beginPath(); x.arc(0, 0, hr, 0, TAU); x.fill();
        x.restore();
        if (b > 0.82) {
          x.strokeStyle = rgba(K.white, 0.4); x.lineWidth = 0.6 / s;
          x.beginPath(); x.moveTo(p[0] - rad * 3.6 / ax, p[1]); x.lineTo(p[0] + rad * 3.6 / ax, p[1]);
          x.moveTo(p[0], p[1] - rad * 3.6); x.lineTo(p[0], p[1] + rad * 3.6); x.stroke();
        }
      }
    }
    x.restore();
  }

  /* ----------------------------------------------- the toranj and lachak */
  // Sixteen-fold girih rosette, drawn fine and mid-contrast so the collage in the
  // NM stays the brightest thing on the carpet. ax > 1 makes the oval medallion of
  // a landscape carpet; the calm inner field (r < .58R) holds the mark.
  function rosette(x, cx, cy, R, s, opts) {
    opts = opts || {};
    var ax = opts.ax || 1, r = rng(opts.seed || 3), lw = Math.max(0.75, R * 0.0028), i, a;
    var dim = opts.dim == null ? 1 : opts.dim;
    x.save();
    x.translate(cx, cy); x.scale(ax, 1); x.translate(-cx, -cy);
    // airbrushed overspray behind it: a soft coral bloom that breaks into droplets
    var hg = x.createRadialGradient(cx, cy, R * 0.75, cx, cy, R * 1.3);
    hg.addColorStop(0, rgba(K.coral, 0.13 * dim)); hg.addColorStop(0.5, rgba(K.deep, 0.05 * dim)); hg.addColorStop(1, rgba(K.deep, 0));
    x.fillStyle = hg; x.beginPath(); x.arc(cx, cy, R * 1.3, 0, TAU); x.fill();
    var drops = Math.round(R * R * 0.014 * dim);
    for (i = 0; i < drops; i++) {
      a = r() * TAU;
      var d = R * (0.97 + Math.pow(r(), 0.8) * 0.36), fall = 1 - (d - R * 0.97) / (R * 0.36);
      if (r() > fall * fall) continue;
      var p = polar(cx, cy, d, a);
      x.fillStyle = rgba(r() < 0.75 ? K.coral : K.peach, (0.22 + r() * 0.4) * dim);
      x.fillRect(p[0], p[1], (0.8 + r()) / s * 1.3 / ax, (0.8 + r()) / s * 1.3);
    }
    x.globalAlpha = dim;
    // ivory: the medallion's ground is tin-glaze cream (the hoodie's own field) and the
    // drawing turns dark like painted trek; otherwise it is inlaid on lifted ink
    var iv = !!opts.ivory, LINE = iv ? rgba(K.trek, 0.85) : rgba(K.cream, 0.8);
    // rim: 32 scallops, each holding a small palmette
    var lobes = function (q) { return R * (0.935 + 0.065 * Math.pow(Math.abs(Math.cos(16 * q)), 0.55)); };
    var rim = radial(cx, cy, lobes, 1280);
    if (iv) {
      // tin glaze in the hoodie's cream (less white: the work, not the plate, should glow)
      fillP(x, rim, mixc(K.cream, K.white, 0.16));
      x.save(); trace(x, rim); x.clip();
      for (i = 0; i < 12; i++) {
        var ga = r() * TAU, gd = R * (0.6 + r() * 0.35), gp0 = polar(cx, cy, gd, ga), gr = R * (0.16 + r() * 0.22);
        var mg = x.createRadialGradient(gp0[0], gp0[1], 0, gp0[0], gp0[1], gr);
        mg.addColorStop(0, rgba(i % 3 === 0 ? K.sky : K.peach, 0.26)); mg.addColorStop(1, rgba(K.peach, 0));
        x.fillStyle = mg; x.fillRect(cx - R * 1.1, cy - R * 1.1, R * 2.2, R * 2.2);
      }
      // the glaze thins and warms toward the scalloped edge
      var eg = x.createRadialGradient(cx, cy, R * 0.82, cx, cy, R * 1.0);
      eg.addColorStop(0, rgba(K.peach, 0)); eg.addColorStop(1, rgba(K.clay, 0.28));
      x.fillStyle = eg; x.fillRect(cx - R * 1.1, cy - R * 1.1, R * 2.2, R * 2.2);
      x.restore();
    } else fillP(x, rim, K.ink2);
    strokeP(x, rim, LINE, lw * (iv ? 1.3 : 1));
    strokeP(x, radial(cx, cy, function (q) { return lobes(q) - R * 0.016; }, 1280), rgba(iv ? K.deep : K.coral, 0.55), lw * 0.8);
    for (i = 0; i < 32; i++) {
      a = i / 32 * TAU;
      fillP(x, petal(cx, cy, a, R * 0.925, R * 0.985, R * 0.011, 10), rgba(iv ? (i & 1 ? K.coral : K.deep) : (i & 1 ? K.peach : K.coral), 0.85));
      fillP(x, petal(cx, cy, a - 0.035, R * 0.93, R * 0.965, R * 0.006, 8), rgba(iv ? K.sky : K.deep, iv ? 0.95 : 0.7));
      fillP(x, petal(cx, cy, a + 0.035, R * 0.93, R * 0.965, R * 0.006, 8), rgba(iv ? K.sky : K.deep, iv ? 0.95 : 0.7));
    }
    beadRing(x, cx, cy, R * 0.912, 160, Math.max(0.7, R * 0.0032), iv ? rgba(K.deep, 0.75) : rgba(K.cream, 0.85));
    // fine opus-sectile band
    for (i = 0; i < 192; i++) {
      var a0 = i / 192 * TAU, a1 = (i + 1) / 192 * TAU;
      fillP(x, [polar(cx, cy, R * 0.858, a0), polar(cx, cy, R * 0.858, a1), polar(cx, cy, R * 0.897, (a0 + a1) / 2)],
        iv ? rgba([K.deep, K.coral, K.trek, K.sky][i % 4], 0.85) : rgba([K.cream, K.coral, K.cream, K.sky][i % 4], 0.78));
    }
    strokeP(x, ring(cx, cy, R * 0.858, 512), iv ? rgba(K.trek, 0.6) : rgba(K.cream, 0.6), lw * 0.7);
    strokeP(x, ring(cx, cy, R * 0.897, 512), iv ? rgba(K.trek, 0.6) : rgba(K.cream, 0.6), lw * 0.7);
    // ivory field detail, under the petals: an echo of the star's strapwork, and in
    // every gap a hand-drawn stem with paired leaves, a bud where the star turns in
    var wf = iv ? noise2((opts.seed || 3) * 13 + 5) : null;
    function hand(p) { return iv ? wob(dens(p, R * 0.012), wf, R * 0.0032, 7 / R) : p; }
    if (iv) {
      var echo = [];
      for (i = 0; i < 32; i++) echo.push(polar(cx, cy, i & 1 ? R * 0.603 : R * 0.693, (i / 32 + 1 / 64) * TAU));
      x.lineJoin = 'miter';
      strokeP(x, hand(echo), rgba(K.deep, 0.62), lw * 0.9);
      for (i = 0; i < 32; i++) {
        var gA = (i + 0.5) / 32 * TAU, even = !(i & 1), st0 = even ? 0.712 : 0.648;
        strokeP(x, hand([polar(cx, cy, R * st0, gA), polar(cx, cy, R * 0.772, gA)]), rgba(K.trek, 0.55), lw * 0.75, true);
        [even ? 0.735 : 0.69, 0.752].forEach(function (lr, li) {
          var lp = polar(cx, cy, R * lr, gA), ll = R * (li ? 0.019 : 0.024);
          fillP(x, petal(lp[0], lp[1], gA + 0.75, 0, ll, R * 0.0055, 8), rgba(li ? K.coral : K.sky, 0.85));
          fillP(x, petal(lp[0], lp[1], gA - 0.75, 0, ll, R * 0.0055, 8), rgba(li ? K.coral : K.sky, 0.85));
        });
        if (!even) {
          // a trefoil bud in the bay where the star's edge turns inward
          var bp = polar(cx, cy, R * 0.618, gA);
          [0, 0.62, -0.62].forEach(function (o, oi) {
            fillP(x, hand(petal(bp[0], bp[1], gA + o, 0, R * (oi ? 0.021 : 0.03), R * (oi ? 0.006 : 0.008), 8)), rgba(oi ? K.coral : K.deep, 0.9));
          });
          x.beginPath(); x.ellipse(bp[0], bp[1], R * 0.0035 / ax, R * 0.0035, 0, 0, TAU); x.fillStyle = K.cream; x.fill();
        }
      }
    }
    // 32 slender petals with veins, tips, small stars between
    for (i = 0; i < 32; i++) {
      a = i / 32 * TAU;
      var pp = hand(petal(cx, cy, a, R * 0.62, R * 0.84, R * 0.032, 18));
      if (iv) stone(x, pp, rgba(i & 1 ? K.sky : K.coral, 0.92), s, 90 + i, 0.5);
      else stone(x, pp, rgba(i & 1 ? K.sky : K.coral, i & 1 ? 0.42 : 0.55), s, 90 + i, 0.7);
      strokeP(x, pp, LINE, lw * (iv ? 1.1 : 0.8));
      strokeP(x, hand(petal(cx, cy, a, R * 0.655, R * 0.81, R * 0.016, 14)), iv ? rgba(i & 1 ? K.white : K.deep, 0.7) : rgba(i & 1 ? K.cream : K.peach, 0.45), lw * 0.6);
      for (var dd = 0; dd < 5; dd++) {
        var vp = polar(cx, cy, R * (0.67 + dd * 0.03), a);
        x.beginPath(); x.arc(vp[0], vp[1], R * 0.0028, 0, TAU); x.fillStyle = rgba(i & 1 ? (iv ? K.trek : K.white) : (iv ? K.white : K.deep), 0.7); x.fill();
      }
      var tp = polar(cx, cy, R * 0.85, a);
      x.beginPath(); x.arc(tp[0], tp[1], R * 0.006, 0, TAU); x.fillStyle = iv ? K.deep : rgba(K.cream, 0.9); x.fill();
      var sp = polar(cx, cy, R * 0.79, a + TAU / 64);
      fillP(x, star(sp[0], sp[1], 4, R * 0.017, R * 0.006, a), iv ? rgba(K.deep, 0.9) : rgba(K.peach, 0.85));
    }
    // the calm field is a sixteen-point girih star: its points slot between the
    // petal bases, its edge drawn as strapwork (a cream strap with an ink core)
    var gst = [];
    for (i = 0; i < 32; i++) gst.push(polar(cx, cy, i & 1 ? R * 0.575 : R * 0.665, (i / 32 + 1 / 64) * TAU));
    fillP(x, gst, K.ink2);
    if (iv) windowSky(x, cx, cy, R, gst, s, ax, (opts.seed || 3) * 7 + 2, opts.mark);
    x.lineJoin = 'miter';
    if (iv) strokeP(x, gst, rgba(K.trek, 0.9), lw * 5);
    strokeP(x, gst, rgba(K.cream, iv ? 1 : 0.82), lw * 3.4);
    strokeP(x, gst, K.ink2, lw * 1.5);
    strokeP(x, star(cx, cy, 16, R * 0.632, R * 0.548, TAU / 64), rgba(K.coral, 0.45), lw * 0.8);
    for (i = 0; i < 16; i++) {
      var gp = polar(cx, cy, R * 0.682, (i / 16 + 1 / 64) * TAU);
      x.beginPath(); x.arc(gp[0], gp[1], R * 0.0055, 0, TAU); x.fillStyle = rgba(K.peach, 0.9); x.fill();
    }
    // a ghost of the star repeated inward, faint enough to keep the mark clear
    strokeP(x, star(cx, cy, 16, R * 0.5, R * 0.42, TAU / 64), rgba(K.cream, 0.07), lw * 0.8);
    x.restore();
  }
  // pendants (lamp finials) along an axis
  function pendant(x, cx, cy, dir, R, len, s) {
    var x0 = cx + dir * R, w = Math.min(R * 0.06, len * 0.3);
    strokeP(x, [[x0, cy], [x0 + dir * len * 0.4, cy]], rgba(K.cream, 0.7), Math.max(0.8, w * 0.12), true);
    var lx = x0 + dir * len * 0.58;
    var loz = [[lx - dir * len * 0.2, cy], [lx, cy - w], [lx + dir * len * 0.2, cy], [lx, cy + w]];
    stone(x, loz, rgba(K.deep, 0.8), s, 61);
    strokeP(x, loz, rgba(K.cream, 0.8), Math.max(0.8, w * 0.06));
    fillP(x, star(lx, cy, 8, w * 0.55, w * 0.33, TAU / 16), rgba(K.cream, 0.85));
    x.beginPath(); x.arc(lx, cy, w * 0.15, 0, TAU); x.fillStyle = K.coral; x.fill();
    fillP(x, petal(lx + dir * len * 0.2, cy, dir > 0 ? 0 : Math.PI, 0, len * 0.22, w * 0.42, 12), rgba(K.peach, 0.85));
    x.beginPath(); x.arc(x0 + dir * len, cy, w * 0.14, 0, TAU); x.fillStyle = K.cream; x.fill();
  }
  // Where the hero puts the mark (measured: width min(.63H, .6W), centred, rising
  // from .5H in landscape to .44H on tall phones) and a toranj sized so its calm
  // star-shaped field always holds it. Shared with the glints.
  function heroGeo(W, H) {
    var a = H / W, markW = Math.min(H * 0.63, W * 0.6), markH = markW * 0.52;
    var cy = H * (a <= 1 ? 0.5 : a >= 1.6 ? 0.439 : 0.5 - (a - 1) / 0.6 * 0.061);
    var portrait = a > 1.05, needX = markW * 0.54, needY = markH * 0.5 + markW * 0.06;
    var R = Math.max(portrait ? Math.min(H * 0.33, W * 0.62) : Math.min(H * 0.435, W * 0.3), needY / 0.575);
    var ax = Math.max(1, Math.min(1.42, needX / (0.575 * R)));
    if (0.575 * R * ax < needX) R = needX / (0.575 * ax);
    return {
      phone: portrait, cx: W / 2, cy: cy, markW: markW, B: sideW(W), R: R, ax: ax,
      Rs: portrait ? Math.min(W * 0.3, H * 0.16) : Math.min(H * 0.26, W * 0.17)
    };
  }

  // The hero ground: field + edge border + lachak corners + toranj around the mark.
  // Painted in steps that yield to the page (each well under a frame budget's worth
  // of long task); done(g) receives the finished canvas.
  function heroSteps(W, H, s) {
    var g = mk(W, H, s), x = g.x, G = heroGeo(W, H), B = G.B, cx = G.cx, cy = G.cy, R = G.R;
    function clip() { x.save(); x.beginPath(); x.rect(B, B, W - 2 * B, H - 2 * B); x.clip(); }
    return { g: g, steps: [
      function () {
        x.fillStyle = K.ink; x.fillRect(0, 0, W, H);
        var tile = groundTile(groundT(W), s);
        var pat = x.createPattern(tile.c, 'repeat');
        if (pat.setTransform && window.DOMMatrix) pat.setTransform(new DOMMatrix([1 / s, 0, 0, 1 / s, 0, 0]));
        x.fillStyle = pat; x.fillRect(0, 0, W, H);
      },
      function () {
        clip();
        [[B, B], [W - B, B]].forEach(function (k, i) { rosette(x, k[0], k[1], G.Rs, s, { seed: 11 + i, dim: 0.8 }); });
        x.restore();
      },
      function () {
        clip();
        [[W - B, H - B], [B, H - B]].forEach(function (k, i) { rosette(x, k[0], k[1], G.Rs, s, { seed: 13 + i, dim: 0.8 }); });
        x.restore();
      },
      function () {
        clip();
        if (!G.phone) {
          var room = (W / 2 - B) - R * G.ax;
          if (room > R * 0.18) {
            var len = Math.min(room * 0.78, R * 0.4);
            pendant(x, cx, cy, -1, R * G.ax, len, s); pendant(x, cx, cy, 1, R * G.ax, len, s);
          }
        } else {
          var vroom = cy - R - B - 74;
          if (vroom > 18) {
            x.save(); x.translate(cx, cy); x.rotate(Math.PI / 2); x.translate(-cx, -cy);
            pendant(x, cx, cy, -1, R, Math.min(vroom * 0.85, R * 0.4), s); pendant(x, cx, cy, 1, R, Math.min(vroom * 0.85, R * 0.4), s);
            x.restore();
          }
        }
        rosette(x, cx, cy, R, s, { seed: 5, ax: G.ax, ivory: true, mark: { w: G.markW / 2 / G.ax, h: G.markW * 0.26 } });
        x.restore();
      },
      function () {
        edgeBorder(x, W, H, B, s);
        grainOverlay(g, 0.55, 17);
      }
    ] };
  }
  function heroCanvas(W, H, s) {
    var h = heroSteps(W, H, s);
    h.steps.forEach(function (f) { f(); });
    return h.g;
  }
  function runSteps(steps, done) {
    var i = 0;
    (function next() {
      if (i >= steps.length) { done(); return; }
      steps[i++]();
      setTimeout(next, 0);
    })();
  }
  function edgeBorder(x, W, H, B, s) {
    var side = sideStrip(B, s);
    var pv = x.createPattern(side.g.c, 'repeat');
    if (pv.setTransform && window.DOMMatrix) pv.setTransform(new DOMMatrix([1 / s, 0, 0, 1 / s, 0, 0]));
    x.fillStyle = pv;
    x.fillRect(0, 0, B, H);
    x.save(); x.translate(W - B, 0); x.fillRect(0, 0, B, H); x.restore();
    // top and bottom: the same strip turned back to horizontal
    x.save(); x.translate(0, B); x.rotate(-Math.PI / 2); x.fillRect(0, 0, B, W); x.restore();
    x.save(); x.translate(0, H); x.rotate(-Math.PI / 2); x.fillRect(0, 0, B, W); x.restore();
    var cb = cornerBlock(B, s);
    [[0, 0], [W - B, 0], [W - B, H - B], [0, H - B]].forEach(function (k) { x.drawImage(cb.c, k[0], k[1], B, B); });
  }

  /* ---------------------------------------------------------- the footer rota */
  // Static rings around the black hole (u = px per black-hole world unit).
  var ROTA_R = 7.3;
  function rotaCanvas(u, s) {
    var R = u * ROTA_R, sz = Math.ceil(R * 2 + 8), g = mk(sz, sz, s), x = g.x, c = sz / 2;
    var r = rng(19);
    // overspray halo
    var hg = x.createRadialGradient(c, c, R * 0.6, c, c, R * 1.0);
    hg.addColorStop(0, rgba(K.coral, 0.12)); hg.addColorStop(1, rgba(K.deep, 0));
    x.fillStyle = hg; x.fillRect(0, 0, sz, sz);
    // outer cord + bead rim
    x.beginPath(); x.arc(c, c, R * 0.985, 0, TAU); x.fillStyle = K.ink2; x.fill();
    beadRing(x, c, c, R * 0.965, 120, Math.max(0.9, u * 0.07), K.cream);
    strokeP(x, ring(c, c, R * 0.94, 256), rgba(K.coral, 0.9), Math.max(1, u * 0.04));
    // outer tessera band
    tessRing(x, c, c, R * 0.84, R * 0.925, 96, [K.cream, K.coral, K.cream, K.sky], 0, s);
    // the guilloche lives on its own turning canvas between R*.6 and R*.82
    x.beginPath(); x.arc(c, c, R * 0.83, 0, TAU); x.fillStyle = K.ink; x.fill();
    // spiralling tesserae into the singularity: rings of the same count shrink toward
    // the centre, each turned half a stone, so the joints run as logarithmic spirals;
    // they dim as they fall in, leaving dark ground round the photon ring
    // Opus sectile triangles, each row shrinking by the same ratio and turned half a
    // stone: the coloured stones of one index line up into leaning chains, so the
    // glazes run in as spiral arms. They thin out (alpha, not grey) toward the hole
    // so the lensed arc and photon ring keep dark ground around them.
    var cnt = 64, q = 0.955, rr = R * 0.6, k = 0, da = TAU / cnt, rin = R * 0.455;
    var arms = [K.deep, K.coral, K.peach, K.cream, K.coral, K.sky];
    while (rr > rin && k < 40) {
      var rn = Math.max(rin, rr * q), tw = k * da * 0.5, t = (R * 0.6 - rr) / (R * 0.6 - rin);
      var al = 0.95 * Math.pow(1 - t, 1.6), gp = Math.max(0.35, u * 0.03);
      for (var i = 0; i < cnt; i++) {
        var a0 = i * da + tw, am = a0 + da / 2, a1 = a0 + da;
        var ti = [polar(c, c, rr - gp, a0 + 0.02 * da), polar(c, c, rr - gp, a1 - 0.02 * da), polar(c, c, rn + gp, am)];
        fillP(x, ti, rgba(arms[i % arms.length], al));
        var to = [polar(c, c, rn + gp, am + 0.03 * da), polar(c, c, rn + gp, am + da - 0.03 * da), polar(c, c, rr - gp, a1)];
        fillP(x, to, rgba(K.ink3, al * 0.9));
      }
      rr = rn; k++;
    }
    strokeP(x, ring(c, c, R * 0.6, 256), rgba(K.cream, 0.6), Math.max(0.8, u * 0.03));
    spray(g, 10, 0.002, 23);
    return { g: g, size: sz, R: R };
  }
  // The turning ring: an interlaced guilloche (two strands weaving round 16 discs,
  // one of them violet porphyry) between R*.6 and R*.83.
  function guillocheCanvas(u, s) {
    var R = u * ROTA_R, sz = Math.ceil(R * 2 + 8), g = mk(sz, sz, s), x = g.x, c = sz / 2;
    var rm = R * 0.715, n = 16, amp = R * 0.092, bw = Math.max(2, u * 0.3);
    // discs
    for (var i = 0; i < n; i++) {
      var dp = polar(c, c, rm, (i + 0.5) / n * TAU);
      var dc = ring(dp[0], dp[1], amp * 0.66, 40);
      stone(x, dc, i === 3 ? K.violet : i % 2 ? K.deep : K.sky, s, 70 + i, 1.4);
      strokeP(x, dc, rgba(K.cream, 0.6), Math.max(0.6, u * 0.02));
      fillP(x, star(dp[0], dp[1], 8, amp * 0.36, amp * 0.22, (i + 0.5) / n * TAU), rgba(K.cream, i === 3 ? 0.9 : 0.75));
    }
    // two strands: r = rm +/- amp*sin(n/2*a) cross n times; each segment holds one
    // crossing, and the strand on top alternates from crossing to crossing
    function strandPt(k, a) { return polar(c, c, rm + (k ? -1 : 1) * amp * Math.sin(n / 2 * a), a); }
    // each strand whole first, then the strand on top re-laid across each crossing
    function lay(k, a0, a1, steps) {
      var pts = [];
      for (var j = 0; j <= steps; j++) pts.push(strandPt(k, a0 + (a1 - a0) * j / steps));
      x.lineCap = 'butt'; x.lineJoin = 'round';
      strokeP(x, pts, K.ink, bw + 2.4, true);
      strokeP(x, pts, k ? K.cream : K.coral, bw, true);
      strokeP(x, pts, rgba(k ? K.white : K.peach, 0.7), bw * 0.28, true);
    }
    lay(0, 0, TAU, 720); lay(1, 0, TAU, 720);
    for (var ci = 0; ci < n; ci++) {
      var ac = ci / n * TAU, span = TAU / n * 0.36;
      lay(ci & 1, ac - span, ac + span, 24);
    }
    spray(g, 8, 0.0015, 29);
    return { g: g, size: sz };
  }

  /* --------------------------------------------------------- inlay frames */
  // border-image source: k px tessera frame (corners: a porphyry square)
  function frameImage(k, s) {
    var sz = k * 4, g = mk(sz, sz, s), x = g.x;
    x.fillStyle = K.ink; x.fillRect(0, 0, sz, sz);
    var tri = function (ax, ay, bx, by, cxp, cyp, col) { fillP(x, [[ax, ay], [bx, by], [cxp, cyp]], col); };
    // edges: reciprocal triangles along each side, period k
    for (var i = 1; i < 3; i++) {
      var a = i * k, cA = i & 1 ? K.coral : K.cream, cB = i & 1 ? K.cream : K.coral, m = 1, w = k - 2;
      tri(a, m, a + k, m, a + k / 2, m + w, cA); tri(a + k / 2, m + w, a + k * 1.5, m + w, a + k, m, cB);   // top
      tri(a, sz - m, a + k, sz - m, a + k / 2, sz - m - w, cA); tri(a + k / 2, sz - m - w, a + k * 1.5, sz - m - w, a + k, sz - m, cB);
      tri(m, a, m, a + k, m + w, a + k / 2, cA); tri(m + w, a + k / 2, m + w, a + k * 1.5, m, a + k, cB);       // left
      tri(sz - m, a, sz - m, a + k, sz - m - w, a + k / 2, cA); tri(sz - m - w, a + k / 2, sz - m - w, a + k * 1.5, sz - m, a + k, cB);
    }
    // the half-teeth that spill into the middle cell are clipped by the slice
    [[0, 0], [sz - k, 0], [sz - k, sz - k], [0, sz - k]].forEach(function (q) {
      x.fillStyle = K.ink; x.fillRect(q[0], q[1], k, k);
      stone(x, [[q[0] + 1, q[1] + 1], [q[0] + k - 1, q[1] + 1], [q[0] + k - 1, q[1] + k - 1], [q[0] + 1, q[1] + k - 1]], K.deep, s, q[0] + q[1] + 1);
      fillP(x, star(q[0] + k / 2, q[1] + k / 2, 4, k * 0.34, k * 0.12, Math.PI / 4), K.cream);
    });
    x.strokeStyle = rgba(K.cream, 0.85); x.lineWidth = 1 / s;
    x.strokeRect(0.5 / s, 0.5 / s, sz - 1 / s, sz - 1 / s);
    x.strokeRect(k - 0.5 / s, k - 0.5 / s, sz - 2 * k + 1 / s, sz - 2 * k + 1 / s);
    return g;
  }

  /* ---------------------------------------------------------------- sizing */
  function vw() { return document.documentElement.clientWidth || innerWidth; }
  function isPhone(w) { return (w || vw()) < 768; }
  function sideW(w) { w = w || vw(); return w < 768 ? 8 : w <= 1920 ? 16 : Math.round(w / 120); }
  function groundT(w) { w = w || vw(); return w < 768 ? 34 : w <= 1920 ? 44 : Math.round(w / 43.6); }
  function tileS(w) { w = w || vw(); return w < 768 ? 40 : w <= 1440 ? 58 : w <= 1920 ? 66 : Math.round(w / 29); }
  function bandH(w) { w = w || vw(); return w < 768 ? 18 : w <= 1920 ? 26 : Math.round(w / 74); }

  /* ------------------------------------------------------------ CSS images */
  function toURL(canvas, cb) {
    if (canvas.toBlob) {
      canvas.toBlob(function (b) { cb(b ? URL.createObjectURL(b) : canvas.toDataURL('image/png')); }, 'image/png');
    } else cb(canvas.toDataURL('image/png'));
  }
  // release an image URL once nothing paints it any more
  function release(u) {
    if (u && u.indexOf('blob:') === 0) setTimeout(function () { URL.revokeObjectURL(u); }, 3000);
  }
  function setVar(name, value) { root.style.setProperty(name, value); }
  var live = {};
  function cssImage(name, canvas, w, h) {
    var key = built.key;
    toURL(canvas, function (u) {
      if (key !== built.key) { release(u); return; } // a newer size superseded this one
      setVar('--cm-' + name, 'url("' + u + '")');
      if (w) setVar('--cm-' + name + '-w', w + 'px');
      if (h) setVar('--cm-' + name + '-h', h + 'px');
      release(live[name]);
      live[name] = u;
    });
  }

  var built = { key: '' };
  function buildImages() {
    var w = vw(), s = scaleFor(3);
    var bp = [isPhone(w), sideW(w), groundT(w), tileS(w), bandH(w), s].join('|');
    if (bp === built.key) return;
    built.key = bp;
    var T = groundT(w), B = sideW(w), S = tileS(w), bh = bandH(w);
    setVar('--cm-side-b', B + 'px');
    var gt = groundTile(T, s);
    cssImage('ground', gt.c, T, T);
    var side = sideStrip(B, s);
    cssImage('side', side.g.c, side.w, side.h);
    setVar('--cm-band-h', bh + 'px');
    setVar('--cm-frieze-h', friezeH(S) + 'px');
    var bs = borderStrip(bh, s);
    cssImage('band', bs.g.c, bs.w, bs.h);
    var k = isPhone(w) ? 6 : 8;
    setVar('--cm-frame-k', k + 'px');
    cssImage('frame', frameImage(k, s).c);
    // the painted pieces take longer: after the first paint
    var cb2 = cornerBlock(bh, s);
    cssImage('corner-sm', cb2.c, bh, bh);
    var key = built.key;
    idle(function () {
      if (key !== built.key) return;
      var fz = friezeJob(S, s, 9);
      runSteps(fz.steps, function () {
        if (key !== built.key) return;
        cssImage('frieze', fz.g.c, fz.w, fz.h);
        var cb = cornerBlock(fz.h, s);
        cssImage('corner', cb.c, fz.h, fz.h);
      });
    });
  }
  function idle(fn) {
    if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 600 });
    else setTimeout(fn, 60);
  }

  /* ------------------------------------------------------------ hero (home) */
  // the hero canvas's own box (the backdrop is sampled where it sits on screen)
  function heroSize() {
    var gc = document.getElementById('global-canvas'), b = gc && gc.getBoundingClientRect();
    if (b && b.width > 0 && b.height > 0) return { x: b.left, y: b.top, W: Math.round(b.width), H: Math.round(b.height) };
    return { x: 0, y: 0, W: vw(), H: innerHeight };
  }
  function buildHero() {
    if (PAGE !== 'home') return;
    var hs = heroSize(), W = hs.W, H = hs.H, phone = isPhone(W);
    // phones: toolbar height changes do not rebuild (the hero canvas keeps its size too)
    var key = W + 'x' + (phone ? Math.round(H / 120) : H) + '@' + scaleFor(2);
    if (key === hero.key) return;
    hero.key = key;
    var s = scaleFor(2), job = heroSteps(W, H, s), g = job.g;
    runSteps(job.steps, function () {
      if (key !== hero.key) return; // a newer size superseded this one
      toURL(g.c, function (u) {
        if (key !== hero.key) { release(u); return; }
        var img = new Image();
        img.alt = ''; img.decoding = 'async';
        img.className = 'cm-hero-ground';
        img.setAttribute('aria-hidden', 'true');
        img.onload = function () {
          // a new element each time: the hero uploads an <img> texture only once
          if (hero.img && hero.img.parentNode) hero.img.parentNode.removeChild(hero.img);
          if (hero.img) release(hero.img.src);
          hero.img = img;
          img.style.left = hs.x + 'px'; img.style.top = hs.y + 'px';
          img.style.width = W + 'px'; img.style.height = H + 'px';
          document.body.appendChild(img);
          heroVisibility();
        };
        img.src = u;
      });
    });
  }
  function heroVisibility() {
    var y = window.scrollY || 0;
    if ((y > 6) !== root.classList.contains('cm-scrolled')) root.classList.toggle('cm-scrolled', y > 6);
    if (glintsHero && (y > 10) !== glintsHero.classList.contains('is-off')) glintsHero.classList.toggle('is-off', y > 10);
    if (!hero.img) return;
    var p = window.__nmHeroProgress, on = (typeof p === 'number' ? p < 0.999 : true) && y < innerHeight * 2.2;
    if (on !== hero.on) { hero.on = on; hero.img.style.visibility = on ? '' : 'hidden'; }
  }

  /* --------------------------------------------------------------- glints */
  var glintsHero = null, glintsPage = null, glintIO = null;
  // a glint animates only while it is on screen
  function watchGlint(el) {
    if (!('IntersectionObserver' in window)) { el.classList.add('is-live'); return; }
    if (!glintIO) glintIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { e.target.classList.toggle('is-live', e.isIntersecting); });
    });
    glintIO.observe(el);
  }
  function glint(host, x, y, i, size) {
    var el = document.createElement('i');
    el.className = 'cm-glint';
    el.style.left = x.toFixed(1) + 'px'; el.style.top = y.toFixed(1) + 'px';
    el.style.setProperty('--d', (7 + (i * 3.7) % 7).toFixed(2) + 's');
    el.style.setProperty('--o', (-(i * 2.3) % 9).toFixed(2) + 's');
    if (size) el.style.setProperty('--z', size);
    host.appendChild(el);
    return el;
  }
  // hero: a few points of the toranj catch the light
  function heroGlints() {
    if (PAGE !== 'home') return;
    if (glintsHero) glintsHero.remove();
    var hs = heroSize(), G = heroGeo(hs.W, hs.H);
    var el = glintsHero = document.createElement('div');
    el.className = 'cm-glints cm-glints--hero';
    el.setAttribute('aria-hidden', 'true');
    el.style.left = hs.x + 'px'; el.style.top = hs.y + 'px';
    // on dark ground: inside the star window above and below the mark, and just
    // beyond the scallops on the field
    [[12.6, 0.6], [3.6, 0.61], [1.5, 1.07], [9.5, 1.08], [6.2, 1.07]].forEach(function (k, i) {
      var a = k[0] / 16 * TAU, p = [G.cx + Math.cos(a) * G.R * k[1] * G.ax, G.cy + Math.sin(a) * G.R * k[1]];
      if (p[0] < G.B * 2 || p[0] > hs.W - G.B * 2 || p[1] < G.B * 2 || p[1] > hs.H - G.B * 2) return;
      glint(el, p[0], p[1], i, i === 0 ? 1.3 : 1).classList.add('is-live');
    });
    document.body.appendChild(el);
    heroVisibility();
  }
  // the field: stars in the tiling, on the lattice, a handful per screen
  function pageGlints() {
    if (glintsPage) glintsPage.remove();
    var T = groundT(), H = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight), W = vw();
    // only where the field is open: below the collage (home), past the wall (index)
    var startY = 0;
    if (PAGE === 'home') { var ab = document.getElementById('about'); startY = ab ? ab.getBoundingClientRect().top + scrollY : innerHeight * 3; }
    else if (PAGE === 'index') { var ft = document.querySelector('body > footer'); startY = ft ? ft.getBoundingClientRect().top + scrollY : H - innerHeight; }
    var el = glintsPage = document.createElement('div');
    el.className = 'cm-glints';
    el.setAttribute('aria-hidden', 'true');
    el.style.height = H + 'px';
    var r = rng(PAGE.length * 13 + 5), per = innerHeight, n = Math.round((H - startY) / per * 2.2);
    for (var i = 0; i < n; i++) {
      var y = startY + r() * (H - startY), x = r() * W;
      var half = r() < 0.5;
      x = Math.round(x / T) * T + (half ? T / 2 : 0); y = Math.round(y / T) * T + (half ? T / 2 : 0);
      if (x < T || x > W - T) continue;
      watchGlint(glint(el, x, y, i, r() < 0.2 ? 1.25 : 0.8 + r() * 0.3));
    }
    document.body.appendChild(el);
  }

  /* ------------------------------------------------------- runner borders */
  // Side borders from where the runner starts to its end border, which sits just
  // above the footer's meta row (the plain "elem" of a carpet); a fringe of warp
  // threads closes the page.
  var rails = null;
  function metaRow() {
    return document.querySelector(PAGE === 'home' ? '#contact footer' : PAGE === 'about' ? '.nm-footer-meta' : 'body > footer .foot-bar');
  }
  function placeRails() {
    var top = 0, doc = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    if (PAGE === 'home') {
      var ab = document.getElementById('about');
      if (!ab) return;
      top = ab.getBoundingClientRect().top + scrollY;
    } else if (PAGE === 'index') {
      var mg = document.querySelector('main.grid');
      if (!mg) return;
      top = mg.getBoundingClientRect().bottom + scrollY - parseFloat(getComputedStyle(mg).paddingBottom || 0) / 2 - (parseFloat(getComputedStyle(root).getPropertyValue('--cm-frieze-h')) || 0) / 2;
    }
    var meta = metaRow(), end = meta ? meta.getBoundingClientRect().top + scrollY : doc - 64;
    if (!rails) {
      rails = document.createElement('div');
      rails.className = 'cm-rails';
      rails.setAttribute('aria-hidden', 'true');
      rails.innerHTML = '<i class="cm-rail cm-rail--l"></i><i class="cm-rail cm-rail--r"></i><i class="cm-end"></i>';
      document.body.appendChild(rails);
      var fr = document.createElement('div');
      fr.className = 'cm-fringe';
      fr.setAttribute('aria-hidden', 'true');
      document.body.appendChild(fr);
      rails.fringe = fr;
    }
    rails.style.top = Math.round(top) + 'px';
    rails.style.height = Math.max(0, Math.round(end - top)) + 'px';
    rails.fringe.style.top = Math.round(doc) + 'px';
  }

  /* ------------------------------------------------------------ the rota */
  var rota = { key: '', el: null, ring: null, io: null };
  function buildRota() {
    var bh = document.querySelector('.nm-bh');
    if (!bh) return false;
    var h = bh.offsetHeight;
    if (!h) return false;
    var u = h / (2 * 7.6), s = scaleFor(2);
    var key = Math.round(u * 10) + '@' + s;
    if (rota.el && rota.el.parentNode === bh && key === rota.key) return true;
    rota.key = key;
    var stat = rotaCanvas(u, s), gl = guillocheCanvas(u, s);
    if (!rota.el) {
      rota.el = document.createElement('div');
      rota.el.className = 'cm-rota';
      rota.el.setAttribute('aria-hidden', 'true');
      rota.el.innerHTML = '<canvas class="cm-rota-base"></canvas><canvas class="cm-rota-ring"></canvas>';
    }
    if (rota.el.parentNode !== bh) bh.insertBefore(rota.el, bh.firstChild);
    var cs = rota.el.querySelectorAll('canvas');
    [stat.g, gl.g].forEach(function (g, i) {
      cs[i].width = g.c.width; cs[i].height = g.c.height;
      cs[i].getContext('2d').drawImage(g.c, 0, 0);
    });
    rota.el.style.width = rota.el.style.height = stat.size + 'px';
    if (!rota.io && 'IntersectionObserver' in window) {
      rota.io = new IntersectionObserver(function (e) {
        rota.el.classList.toggle('is-on', e[e.length - 1].isIntersecting);
      }, { rootMargin: '80px 0px' });
      rota.io.observe(rota.el);
    }
    return true;
  }
  function waitRota(tries) {
    if (buildRota() || tries > 120) return;
    setTimeout(function () { waitRota(tries + 1); }, 100);
  }

  /* ----------------------------------------------------------------- wiring */
  function init() {
    if (!document.body) return;
    root.classList.add('cm-on');
    buildImages();
    buildHero();
    heroGlints();
    placeRails();
    waitRota(0);
    setTimeout(pageGlints, 400);
    var rt = 0, lastW = vw();
    addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        buildImages();
        buildHero();
        if (vw() !== lastW) { lastW = vw(); heroGlints(); pageGlints(); }
        placeRails();
        buildRota();
      }, 160);
    }, { passive: true });
    addEventListener('scroll', heroVisibility, { passive: true });
    // the page grows as sections mount and accordions open: keep the rails to it
    if ('ResizeObserver' in window) {
      var pending = 0;
      new ResizeObserver(function () {
        if (pending) return;
        pending = requestAnimationFrame(function () { pending = 0; placeRails(); });
      }).observe(document.body);
    }
    heroVisibility();
  }
  if (window.__nmReady) window.__nmReady(init);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.NMCosmati = {
    K: K,
    paint: {
      groundTile: groundTile, friezeStrip: friezeStrip, borderStrip: borderStrip, sideStrip: sideStrip,
      cornerBlock: cornerBlock, heroCanvas: heroCanvas, rotaCanvas: rotaCanvas, guillocheCanvas: guillocheCanvas,
      frameImage: frameImage, paintTile: paintTile, mk: mk
    }
  };
})();
