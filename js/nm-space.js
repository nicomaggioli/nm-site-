/* NM Space: the particle space behind the ?theme=stars preview (brief: docs/night-sky.md).

   A full-viewport WebGL scene on the page's near-black ground: a great many fine luminous
   particles forming soft, undulating, layered sheets and wisps at many depths (a misty
   particle landscape, an aurora fog), loose drifting dust, and sparse brighter specks.
   Scrolling dives the camera forward through it; it keeps breathing when idle.

   The space (world units; x right, y up, z forward along the flight):
     - the floor: a broad sheet a few units below the camera, folded by smooth noise, that
       rises into walls at the sides (the canyon of the reference), ice and cream;
     - the aurora: a thin, high sheet with curtains hanging from it, peach, coral, a hint of
       violet, faint;
     - wisps: streaks combed along the flight, mid-height, cream and peach;
     - dust: a loose volume of the finest points everywhere; specks: sparse brighter points
       near the floor and in the volume, twinkling a little.
     The particles live in a window of depth D ahead of the camera that wraps as it moves;
     their shape is computed on the GPU from the world position, so the landscape changes
     all the way along (each page flies its own stretch of space).
   Light: additive soft points sized by depth, a touch of depth-of-field on the nearest (a
   flat bokeh disc), distance fog to black, accumulated in a float buffer, a quarter-res glow,
   then one composite pass: a soft ceiling, each line of text held under its WCAG AA limit
   (the page-length mask js/nm-sky.js builds, NMSky.mask), sRGB, dither.

   The camera (shared: NMSpace.camera, which js/nm-sky.js reads to turn the real sky with it):
     - scroll is a target along the flight path (dive forward as you scroll), with a slow
       roll that comes and goes (the spin) and gentle turns where the path bends;
     - the camera follows with critically damped inertia, its speed and turn rate capped,
       so a fling becomes a glide and it settles when scrolling stops;
     - idle: a weightless drift (sway, a little roll) and the field breathing;
     - homepage hero (window.__nmHeroProgress 0 -> 1): an extra dive, aimed at the centre of
       the NM logo (the vanishing point sits there while the hero is on screen).
   Footer finale: as the footer arrives, a few thousand particles leave the space and gather
   into Nico's NM mark (sampled from textures/nm-mark-sdf.png, green channel) exactly over the
   Cloud Run door (NMSky.nmRect()); the space behind it quiets; scrolling up dissolves it.

   window.NMSpace
     .canvas        the fixed canvas (opaque WebGL; paints the ground too)
     .camera        { y, vy, hp, roll (deg), yaw, pitch (rad), F, cx, cy, pos, moving, gather }
     .step(now)     advance the camera to this frame (idempotent; js/nm-sky.js calls it)
     .at(y)         the settled camera (no drift) at scroll y: { roll, yaw, pitch, z }
     .set(opts)     { brightness, glow, motion, density } live multipliers (1 = default)
     .debug()       counts, quality, camera, timings

   Budget: ~180k particles on desktop, ~50k on phones (fewer when frames run long), DPR <= 1.5;
   display rate while the camera moves, ~30 fps while it only breathes; stops in hidden tabs
   and while Cloud Run is open; one still frame (no flight, no drift) under reduced motion. */
(function () {
  'use strict';
  if (window.NMSpace) return;

  var root = document.documentElement;
  var CROP = { x: 57, y: 159, w: 406, h: 202 };   // the NM mark's box in textures/nm-mark-sdf.png
  var MARK_AR = CROP.w / CROP.h;

  /* Per page: its stretch of space (seed), the roll that comes and goes as you scroll
     ([scroll fraction, degrees]), how warm the palette leans, the hero dive (units). */
  var PAGES = {
    home: { seed: 0, warm: 0.0, dive: 15, roll: [[0, 0], [0.17, -7], [0.36, 22], [0.55, -12], [0.74, 18], [0.9, 4], [1, 0]] },
    about: { seed: 900, warm: 0.3, dive: 0, roll: [[0, 0], [0.28, 18], [0.55, -14], [0.8, 12], [1, 0]] },
    index: { seed: 1800, warm: 0.12, dive: 0, roll: [[0, -4], [0.2, 16], [0.42, -18], [0.64, 20], [0.84, -10], [1, 0]] }
  };
  var FOV = 72;            // degrees across the viewport's long side (the sky uses the same)
  var D = 78;              // depth of the particle window ahead of the camera
  var FOG = 30;            // fog length
  var PITCH = -5.5;        // degrees: the camera looks a little down at the floor
  var CAP_DEG = 26;        // deg/s: the most the camera rolls or turns while gliding
  var CAP_V = 46;          // units/s: the most it travels
  var CREEP = 0.16;        // units/s forward while idle
  var MARK_Z = 11;         // depth at which the NM forms

  /* Nico's palette, linear light (cream, warm white, ice, peach, coral, violet) */
  function lin(h) {
    return [1, 3, 5].map(function (i) { var v = parseInt(h.substr(i, 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  }
  var PAL = { cream: lin('#EDE1CC'), white: lin('#F4F8F0'), ice: lin('#BCD3E0'), peach: lin('#E9B4A3'), coral: lin('#E3837A'), violet: lin('#6E6BD6') };
  var GROUND = lin('#0a0a0a');

  var api = window.NMSpace = { canvas: null, camera: null, version: 1 };
  var opts = { brightness: 1, glow: 1, motion: 1, density: 1 };

  /* ------------------------------------------------------------------ helpers */
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mq(q) { try { return matchMedia(q); } catch (e) { return { matches: false }; } }
  var reduceQ = mq('(prefers-reduced-motion: reduce)');
  var coarseQ = mq('(pointer: coarse)');
  function gameOpen() { return root.classList.contains('nm-run-open'); }
  function detectPage() {
    if (document.body && document.body.classList.contains('nm-about-page')) return 'about';
    if (document.querySelector('footer .foot-mark')) return 'index';
    return 'home';
  }

  /* --------------------------------------------------------------- the path */
  // The flight path's centre line (the GLSL copy is PATH_GLSL): slow bends left and right,
  // a gentle rise and fall. The sheets are laid out around it, so the canyon follows it.
  function pathX(z) { return 7.0 * Math.sin(z * 0.013 + 1.3) + 3.5 * Math.sin(z * 0.031 + 0.4); }
  function pathXd(z) { return 0.091 * Math.cos(z * 0.013 + 1.3) + 0.1085 * Math.cos(z * 0.031 + 0.4); }
  function pathY(z) { return 1.2 * Math.sin(z * 0.017 + 2.1) + 0.5 * Math.sin(z * 0.041 + 0.7); }
  function pathYd(z) { return 0.0204 * Math.cos(z * 0.017 + 2.1) + 0.0205 * Math.cos(z * 0.041 + 0.7); }
  var PATH_GLSL = [
    'float pathX(float z) { return 7.0 * sin(z * 0.013 + 1.3) + 3.5 * sin(z * 0.031 + 0.4); }',
    'float pathY(float z) { return 1.2 * sin(z * 0.017 + 2.1) + 0.5 * sin(z * 0.041 + 0.7); }'
  ].join('\n');

  /* -------------------------------------------------------------------- state */
  var S = {
    page: null, cfg: null, ready: false, mounted: false, still: false, shown: false,
    vw: 0, vh: 0, dpr: 1, W: 0, H: 0, phone: false, maxY: 1, R: 0, zpx: 0.03,
    t: 0, last: 0, lastDraw: 0, running: false, raf: 0, force: false, stepAt: -1,
    N: 0, layers: null, q: 1, qT: 0, slow: 0, fast: 0,
    stats: { frames: 0, draws: 0, ms: 0, drawMs: 0, worst: 0, since: 0, gaps: [] }
  };
  var canvas, G = { ok: false, gl: null, failed: false, lost: false };

  /* ------------------------------------------------------------------- camera */
  var CAM = api.camera = {
    y: 0, vy: 0, hp: 0, vhp: 0, init: false, t: 0, z: 0, creep: 0,
    pos: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, 1],
    roll: 0, yaw: 0, pitch: PITCH * Math.PI / 180, pitch0: PITCH * Math.PI / 180, F: 1, cx: 0, cy: 0, moving: false,
    gather: 0, vg: 0, mark: null
  };
  function rollAt(y) {   // degrees, a Catmull-Rom curve through the page's keys in scroll fraction
    var K = S.cfg.roll, s = clamp(y / Math.max(1, S.maxY), 0, 1), i = 0, n = K.length;
    if (s <= K[0][0]) return K[0][1];
    if (s >= K[n - 1][0]) return K[n - 1][1];
    while (i < n - 2 && s >= K[i + 1][0]) i++;
    var a = K[i], b = K[i + 1], pa = K[i - 1] || a, nb = K[i + 2] || b, h = b[0] - a[0], u = (s - a[0]) / h;
    var ma = (b[1] - pa[1]) / ((b[0] - pa[0]) || 1) * h, mb = (nb[1] - a[1]) / ((nb[0] - a[0]) || 1) * h;
    var u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * ma + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * mb;
  }
  function heroY() { return S.vh * (S.vw < S.vh ? 0.44 : 0.486); }
  function ease(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function zAt(y, hp) { return S.cfg.seed + y * S.zpx + S.cfg.dive * ease(hp); }
  // the settled orientation at scroll y (no drift): roll (deg), yaw and pitch (rad)
  function poseAt(y, hp) {
    var z = zAt(y, hp);
    return { z: z, roll: rollAt(y), yaw: Math.atan(pathXd(z)) * 0.85, pitch: PITCH * Math.PI / 180 + Math.atan(pathYd(z)) * 0.6 };
  }
  // degrees of turn per px of scroll around y (roll plus yaw), for the angular cap
  function degPerPx(y) {
    var a = poseAt(y, CAM.hp), b = poseAt(y + 8, CAM.hp);
    return (Math.abs(b.roll - a.roll) + Math.abs(b.yaw - a.yaw) * 57.3 + Math.abs(b.pitch - a.pitch) * 57.3) / 8;
  }
  function sway(t, k) {   // weightless drift: position (units) and angles, bounded, slow
    return {
      x: k * 0.42 * (0.7 * Math.sin(t * 0.071 + 0.4) + 0.3 * Math.sin(t * 0.193 + 2.2)),
      y: k * 0.3 * (0.7 * Math.sin(t * 0.083 + 1.9) + 0.3 * Math.sin(t * 0.211 + 0.6)),
      yaw: k * 0.034 * (0.72 * Math.sin(t * 0.061 + 0.3) + 0.28 * Math.sin(t * 0.167 + 2.1)),
      pitch: k * 0.024 * (0.72 * Math.sin(t * 0.0757 + 1.7) + 0.28 * Math.sin(t * 0.2167 + 0.4)),
      roll: k * 3.2 * (0.8 * Math.sin(t * 0.047 + 4.2) + 0.2 * Math.sin(t * 0.1337 + 0.9))
    };
  }
  function camStep(dt) {
    var still = S.still, target = still ? 0 : clamp(window.scrollY || 0, 0, S.maxY);
    if (!CAM.init || still) { CAM.y = target; CAM.vy = 0; }
    else if (dt > 0) {
      var rate = degPerPx(CAM.y), cap = Math.min(rate > 1e-6 ? CAP_DEG / rate : 1e6, CAP_V / S.zpx), W0 = 3.4;
      var n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
      for (var i = 0; i < n; i++) {
        CAM.vy = clamp(CAM.vy + (W0 * W0 * (target - CAM.y) - 2 * W0 * CAM.vy) * h, -cap, cap);
        CAM.y += CAM.vy * h;
      }
      if (Math.abs(target - CAM.y) < 0.05 && Math.abs(CAM.vy) < 0.5) { CAM.y = target; CAM.vy = 0; }
    }
    var hpT = S.page === 'home' && !still ? clamp(+window.__nmHeroProgress || 0, 0, 1) : 0;
    if (!CAM.init || still) { CAM.hp = hpT; CAM.vhp = 0; }
    else if (dt > 0) {
      var W1 = 6, m = Math.max(1, Math.ceil(dt / 0.012)), k = dt / m;
      for (var j = 0; j < m; j++) { CAM.vhp += (W1 * W1 * (hpT - CAM.hp) - 2 * W1 * CAM.vhp) * k; CAM.hp += CAM.vhp * k; }
      if (Math.abs(hpT - CAM.hp) < 1e-4 && Math.abs(CAM.vhp) < 1e-3) { CAM.hp = hpT; CAM.vhp = 0; }
    }
    CAM.init = true;
    if (!still) { CAM.t += dt; CAM.creep += dt * CREEP * opts.motion; }
    var fk = still ? 0 : opts.motion, sw = sway(CAM.t, fk), pose = poseAt(CAM.y, CAM.hp);
    var z = pose.z + CAM.creep;
    CAM.z = z;
    CAM.pos[0] = pathX(z) + sw.x; CAM.pos[1] = pathY(z) + sw.y; CAM.pos[2] = z;
    CAM.roll = pose.roll + sw.roll;
    CAM.yaw = pose.yaw + sw.yaw;
    CAM.pitch = pose.pitch + sw.pitch;
    orient(CAM.yaw, CAM.pitch, CAM.roll * Math.PI / 180, CAM);
    CAM.F = Math.max(S.vw, S.vh) / 2 / Math.tan(FOV * Math.PI / 360);
    var heroW = S.page === 'home' && S.R > 0 ? 1 - smooth(S.R, S.R + S.vh * 0.4, CAM.y) : 0;
    CAM.cx = S.vw / 2; CAM.cy = S.vh / 2 + (heroY() - S.vh / 2) * heroW;
    CAM.moving = Math.abs(CAM.vy) > 1.5 || Math.abs(CAM.vhp) > 0.002;
    gatherStep(dt);
  }
  function orient(yaw, pitch, roll, o) {
    var cp = Math.cos(pitch), f = [Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp];
    var r = [f[2], 0, -f[0]], rl = Math.hypot(r[0], r[2]) || 1;   // up x forward, with up = +y
    r = [r[0] / rl, 0, r[2] / rl];
    var u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    var c = Math.cos(roll), s = Math.sin(roll);
    o.f = f;
    o.r = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s];
    o.u = [u[0] * c - r[0] * s, u[1] * c - r[1] * s, u[2] * c - r[2] * s];
    return o;
  }

  /* ------------------------------------------------------------ the NM gather */
  // How far the mark has formed: from where the footer's NM box sits relative to where it
  // will sit at the bottom of the page (it is fully formed a little before the end).
  function gatherStep(dt) {
    var sky = window.NMSky, rect = sky && sky.nmRect ? sky.nmRect() : null, gT = 0;
    CAM.mark = null;
    if (rect && rect[2] > rect[0]) {
      var my = (rect[1] + rect[3]) / 2, sy = window.scrollY || 0, myEnd = my + sy - S.maxY;
      gT = smooth(myEnd + S.vh * 0.62, myEnd + S.vh * 0.05, my);
      if (my < -S.vh || my > S.vh * 2.2) gT = 0;
      CAM.mark = [(rect[0] + rect[2]) / 2, my, rect[2] - rect[0]];
    }
    if (!S.marks) gT = 0;
    if (S.still || !CAM.init || dt <= 0) { CAM.gather = gT; CAM.vg = 0; return; }
    var W2 = 3.2, n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
    for (var i = 0; i < n; i++) { CAM.vg += (W2 * W2 * (gT - CAM.gather) - 2 * W2 * CAM.vg) * h; CAM.gather += CAM.vg * h; }
    CAM.gather = clamp(CAM.gather, 0, 1);
    if (Math.abs(gT - CAM.gather) < 1e-4 && Math.abs(CAM.vg) < 1e-3) { CAM.gather = gT; CAM.vg = 0; }
  }

  /* --------------------------------------------------------------- particles */
  // Per particle (11 floats): u, w, phase, layer | r1, r2, energy, gather stagger (-1 never) |
  // NM target x, y (0..1 in the mark's box), edge (1 on the contour and the thin diagonals).
  // Laid out by layer (coherent branches on the GPU), gather particles first in each layer
  // so drawing a prefix of a layer (lower quality) keeps them.
  var LAYERS = [
    { name: 'floor', share: 0.45, gather: 0 },
    { name: 'aurora', share: 0.13, gather: 0 },
    { name: 'wisp', share: 0.14, gather: 0.22 },
    { name: 'dust', share: 0.22, gather: 0.56 },
    { name: 'speck', share: 0.06, gather: 0.22 }
  ];
  var STRIDE = 11;
  function budget() {
    var phone = S.vw < 768 || (coarseQ.matches && S.vw < 1100);
    // the footer NM gathers from a light dusting, not a dense fill (Nico: "make this less dense")
    var n = phone ? 52000 : 184000, g = phone ? 1800 : 3800;
    var cores = navigator.hardwareConcurrency || 8;
    if (!phone && cores <= 4) n = 120000;
    return { n: Math.round(n * opts.density), g: g, phone: phone };
  }
  function makeParticles(b) {
    var R = rng(0x5eed ^ (S.cfg.seed * 7 + 13)), data = new Float32Array(b.n * STRIDE), k = 0, layers = [];
    LAYERS.forEach(function (L, li) {
      var n = Math.round(b.n * L.share), ng = Math.round(b.g * L.gather), start = k;
      for (var i = 0; i < n; i++, k++) {
        var o = k * STRIDE;
        data[o] = R() * 2 - 1; data[o + 1] = R(); data[o + 2] = R(); data[o + 3] = li;
        data[o + 4] = R(); data[o + 5] = R(); data[o + 6] = 0.55 + 0.9 * R(); data[o + 7] = i < ng ? R() : -1;
        data[o + 8] = -1; data[o + 9] = -1; data[o + 10] = 0;
      }
      layers.push({ start: start, n: n, ng: ng });
    });
    S.N = k;
    return { data: data, layers: layers };
  }
  // NM targets: points inside the mark (green > 0.22), the contour and the thin diagonals
  // (green below 0.42) twice as dense so they read.
  function loadMark(done) {
    var img = new Image();
    img.onload = function () {
      try {
        var c = document.createElement('canvas'); c.width = CROP.w; c.height = CROP.h;
        var x = c.getContext('2d');
        x.drawImage(img, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);
        var px = x.getImageData(0, 0, CROP.w, CROP.h).data, g = new Float32Array(CROP.w * CROP.h);
        for (var i = 0; i < g.length; i++) g[i] = px[i * 4 + 1] / 255;
        done(g);
      } catch (e) { done(null); }
    };
    img.onerror = function () { done(null); };
    img.src = '/textures/nm-mark-sdf.png';
  }
  function fillTargets(gmap) {
    if (!gmap || !G.ok) return;
    var R = rng(4711), d = G.data, filled = 0;
    S.layers.forEach(function (L) {
      for (var i = 0; i < L.ng; i++) {
        var o = (L.start + i) * STRIDE, tx = 0, ty = 0, edge = 0;
        for (var tries = 0; tries < 400; tries++) {
          tx = R() * CROP.w; ty = R() * CROP.h;
          var v = gmap[Math.min(CROP.h - 1, ty | 0) * CROP.w + Math.min(CROP.w - 1, tx | 0)];
          if (v < 0.22) continue;
          edge = v < 0.42 ? 1 : 0;
          if (!edge && R() > 0.3) continue;
          break;
        }
        d[o + 8] = tx / CROP.w; d[o + 9] = ty / CROP.h; d[o + 10] = edge;
        filled++;
      }
    });
    var gl = G.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, G.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d);
    S.marks = filled;
    kick();
  }

  /* ------------------------------------------------------------------ shaders */
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
    '}'
  ].join('\n');
  function v3(c) { return 'vec3(' + c.map(function (x) { return x.toFixed(5); }).join(', ') + ')'; }
  var PART_VS = [
    'precision highp float;',
    'attribute vec4 aA; attribute vec4 aB; attribute vec3 aT;',
    'uniform vec3 uC; uniform vec3 uR; uniform vec3 uU; uniform vec3 uF;',
    'uniform vec4 uV;    // vw, vh (css px), dpr, F',
    'uniform vec2 uPP;   // principal point (css px)',
    'uniform vec4 uP;    // time, depth D, fog, seed',
    'uniform vec4 uNM;   // mark centre x, y (css px), mark width (css px), gather',
    'uniform vec4 uL;    // energy gain, max point size (device px), focus depth, blur',
    'uniform vec4 uPal;  // warm lean, 0, 0, 0',
    'varying vec4 vC; varying float vD;',
    NOISE_GLSL,
    PATH_GLSL,
    'const vec3 CREAM = ' + v3(PAL.cream) + ';',
    'const vec3 WHITE = ' + v3(PAL.white) + ';',
    'const vec3 ICE = ' + v3(PAL.ice) + ';',
    'const vec3 PEACH = ' + v3(PAL.peach) + ';',
    'const vec3 CORAL = ' + v3(PAL.coral) + ';',
    'const vec3 VIOLET = ' + v3(PAL.violet) + ';',
    // the floor's height at world (x, z): the shared shape for the floor and the specks on it
    'float floorH(float xw, float x, float zw, float t, out float n1, out float n2) {',
    '  vec3 q = vec3(xw * 0.072, zw * 0.052 + uP.w, t * 0.028);',
    '  n1 = snoise(q);',
    '  n2 = snoise(q * 2.3 + vec3(3.1, 7.7, t * 0.017));',
    '  float wall = 3.0 * pow(abs(x) / 17.0, 2.3);',
    '  return -3.5 + wall + 1.8 * n1 + 0.55 * n2;',
    '}',
    'void main() {',
    '  float t = uP.x, D = uP.y;',
    '  float zl = mod(aA.z * D - uC.z, D);',
    '  float zw = uC.z + zl - 3.0;',
    '  float L = aA.w, r1 = aB.x, r2 = aB.y;',
    '  float px = pathX(zw), py = pathY(zw);',
    // the colour journey: a slow drift between cool and warm along the flight
    '  float warm = clamp(0.5 + 0.5 * sin(zw * 0.0105 + uP.w * 0.37 + 0.8) + uPal.x, 0.0, 1.0);',
    '  vec3 p; vec3 col; float E; float wsz;',
    '  if (L < 0.5) {',
    // floor: an undulating sheet that rises into walls at the sides; luminous bands drift over it
    '    float x = aA.x * 52.0, n1, n2;',
    '    float h = floorH(px + x, x, zw, t, n1, n2);',
    '    p = vec3(px + x + 0.8 * n2, py + h, zw);',
    '    float band = snoise(vec3((px + x) * 0.028 + 9.1, zw * 0.016 + uP.w, t * 0.018));',
    '    float lit = smoothstep(-0.45, 0.85, band);',
    '    E = 0.075 * (0.22 + 1.5 * lit * lit) * (0.7 + 0.6 * smoothstep(-0.3, 0.9, n1));',
    '    col = mix(ICE, CREAM, smoothstep(-0.2, 0.9, band) * 0.85);',
    '    col = mix(col, PEACH, 0.45 * warm * smoothstep(0.1, 0.9, n2));',
    '    col = mix(col, WHITE, 0.3 * smoothstep(0.5, 1.0, n1));',
    '    wsz = 0.016;',
    '  } else if (L < 1.5) {',
    // aurora: a high thin sheet; where it gathers, curtains hang from it
    '    float x = aA.x * 46.0;',
    '    vec3 q = vec3((px + x) * 0.045, zw * 0.03 + uP.w, t * 0.025);',
    '    float n1 = snoise(q);',
    '    float cur = smoothstep(0.0, 0.65, snoise(vec3((px + x) * 0.032 + 4.0, zw * 0.017 + uP.w, t * 0.02)));',
    '    float hang = aA.y * aA.y * 7.5 * cur;',
    '    p = vec3(px + x + 0.9 * n1, py + 9.0 + 1.6 * pow(abs(x) / 20.0, 2.0) + 2.0 * n1 - hang, zw);',
    '    E = 0.05 * (0.15 + 1.6 * cur) * (1.0 - 0.8 * aA.y);',
    '    col = mix(PEACH, CORAL, smoothstep(0.2, 0.9, aA.y + 0.4 * n1));',
    '    col = mix(col, VIOLET, 0.35 * smoothstep(0.4, 1.0, r1) * (1.0 - warm));',
    '    wsz = 0.02;',
    '  } else if (L < 2.5) {',
    // wisps: streaks combed along the flight at mid height
    '    float x = aA.x * 30.0;',
    '    vec3 q = vec3((px + x) * 0.1, zw * 0.011 + uP.w, t * 0.02 + 3.0);',
    '    float m = smoothstep(0.32, 0.85, snoise(q));',
    '    float lift = 2.6 * snoise(vec3((px + x) * 0.05, zw * 0.02 + uP.w + 7.0, t * 0.015));',
    '    p = vec3(px + x, py + 0.6 + lift + (aA.y - 0.5) * 1.1 + 0.1 * abs(x), zw);',
    '    E = 0.1 * m * (0.6 + 0.8 * r2);',
    '    col = mix(CREAM, PEACH, warm * 0.75 * r1);',
    '    col = mix(col, ICE, 0.4 * (1.0 - warm));',
    '    wsz = 0.02;',
    '  } else if (L < 3.5) {',
    // dust: the finest points everywhere, drifting
    '    float x = aA.x * 30.0;',
    '    p = vec3(px + x, py - 3.0 + aA.y * 14.0, zw);',
    '    p.x += 0.5 * sin(t * 0.11 + r1 * 40.0); p.y += 0.4 * sin(t * 0.09 + r2 * 40.0);',
    '    E = 0.03 * (0.5 + r2);',
    '    col = mix(ICE, CREAM, r1);',
    '    col = mix(col, WHITE, 0.3);',
    '    wsz = 0.014;',
    '  } else {',
    // specks: sparse, brighter, half of them resting just above the floor
    '    float x = aA.x * 34.0, n1, n2;',
    '    float y = r1 < 0.55 ? floorH(px + x, x, zw, t, n1, n2) + 0.25 + aA.y * 1.6 : -2.5 + aA.y * 12.0;',
    '    p = vec3(px + x, py + y, zw);',
    '    E = 0.42 * (0.25 + r2 * r2 * 1.5) * (0.8 + 0.2 * sin(t * (0.8 + r1 * 1.7) + r2 * 50.0));',
    '    col = mix(WHITE, CREAM, r2);',
    '    col = mix(col, PEACH, 0.6 * warm * step(0.72, r1));',
    '    wsz = 0.045 + 0.03 * r2;',
    '  }',
    '  E *= aB.z;',
    '  vec3 d = p - uC;',
    '  vec3 v = vec3(dot(d, uR), dot(d, uU), dot(d, uF));',
    '  float fog = exp(-max(v.z - 6.0, 0.0) / uP.z) * smoothstep(D - 3.0, D * 0.68, zl) * smoothstep(0.35, 1.8, v.z);',
    '  float I = E * fog;',
    // the gather: from wherever it floats, into the NM over the footer's door
    '  float g = 0.0;',
    '  if (aB.w >= 0.0 && aT.x >= 0.0 && uNM.w > 0.0005) {',
    '    g = smoothstep(aB.w * 0.42, aB.w * 0.42 + 0.58, uNM.w);',
    '    float dz = ' + MARK_Z.toFixed(1) + ' + (r1 - 0.5) * 1.6;',
    '    vec2 s = vec2(uNM.x + (aT.x - 0.5) * uNM.z, uNM.y + (aT.y - 0.5) * uNM.z / ' + MARK_AR.toFixed(5) + ');',
    '    s += vec2(sin(t * 0.63 + r1 * 61.0), cos(t * 0.57 + r2 * 53.0)) * (0.45 + 0.5 * (1.0 - aT.z));',
    '    vec3 tv = vec3((s.x - uPP.x) / uV.w * dz, -(s.y - uPP.y) / uV.w * dz, dz);',
    '    vec3 sv = vec3(v.xy, max(v.z, 3.0));',
    '    float ge = g * g * (3.0 - 2.0 * g);',
    '    v = mix(sv, tv, ge);',
    '    v.xy += (vec2(r2, r1) - 0.5) * 10.0 * ge * (1.0 - ge);',
    '    vec3 mc = mix(mix(CREAM, WHITE, r2), ICE, 0.35 * aT.z);',
    '    float me = (aT.z > 0.5 ? 0.2 : 0.13) * (0.75 + 0.5 * r2) * (0.85 + 0.15 * sin(t * (1.1 + r1) + r2 * 40.0));',
    '    I = mix(I, me, ge);',
    '    col = mix(col, mc, ge);',
    '    wsz = mix(wsz, 0.012, ge);',
    '  }',
    '  float z = max(v.z, 0.05);',
    '  vec2 sc = uPP + vec2(v.x, -v.y) / z * uV.w;',
    // the space behind the forming mark quiets so the mark reads first
    '  if (g == 0.0 && uNM.w > 0.0005) {',
    '    vec2 dm = abs(sc - uNM.xy) / vec2(uNM.z * 0.62, uNM.z * 0.36);',
    '    I *= 1.0 - 0.7 * uNM.w * smoothstep(1.3, 0.75, max(dm.x, dm.y));',
    '  }',
    '  float sz = wsz * uV.w / z;',
    '  float coc = uL.w * max(0.0, uL.z / z - 1.0) * (1.0 - g);',
    '  float sd = clamp(sqrt(sz * sz + coc * coc) * uV.z, 1.0, uL.y);',
    '  float nrm = max(1.0, 0.3 * sd * sd);',
    '  vC = vec4(col * I * uL.x * uV.z * uV.z / nrm, 0.0);',
    '  vD = smoothstep(3.0, 7.0, sd) * (1.0 - g);',
    '  float mg = sd * 0.5 / uV.z + 2.0;',
    '  bool vis = v.z > 0.3 && I > 0.00005 && sc.x > -mg && sc.y > -mg && sc.x < uV.x + mg && sc.y < uV.y + mg;',
    '  gl_Position = vis ? vec4(sc.x / uV.x * 2.0 - 1.0, 1.0 - sc.y / uV.y * 2.0, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);',
    '  gl_PointSize = vis ? sd : 0.0;',
    '}'
  ].join('\n');
  var PART_FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec4 vC; varying float vD;',
    'void main() {',
    '  vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q);',
    '  if (r2 > 1.0) discard;',
    '  float soft = exp(-r2 * 2.6);',
    // the nearest are out of focus: a flat disc, a touch brighter at its rim (same energy)
    '  float disc = smoothstep(1.0, 0.8, r2) * (0.82 + 0.3 * r2) * 0.41;',
    '  gl_FragColor = vec4(vC.rgb * mix(soft, disc, vD), 1.0);',
    '}'
  ].join('\n');
  var TRI_VS = 'attribute vec2 p; varying vec2 vUv; void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
  var DOWN_FS = [
    'precision highp float;',
    'uniform sampler2D uS; uniform vec2 uTx; varying vec2 vUv;',
    'void main() {',
    '  vec3 c = texture2D(uS, vUv + uTx * vec2(-1.0, -1.0)).rgb + texture2D(uS, vUv + uTx * vec2(1.0, -1.0)).rgb',
    '    + texture2D(uS, vUv + uTx * vec2(-1.0, 1.0)).rgb + texture2D(uS, vUv + uTx * vec2(1.0, 1.0)).rgb;',
    '  gl_FragColor = vec4(c * 0.25, 1.0);',
    '}'
  ].join('\n');
  var BLUR_FS = [
    'precision highp float;',
    'uniform sampler2D uS; uniform vec2 uDir; varying vec2 vUv;',
    'void main() {',
    '  vec3 c = texture2D(uS, vUv).rgb * 0.2270270;',
    '  c += (texture2D(uS, vUv + uDir * 1.3846154).rgb + texture2D(uS, vUv - uDir * 1.3846154).rgb) * 0.3162162;',
    '  c += (texture2D(uS, vUv + uDir * 3.2307692).rgb + texture2D(uS, vUv - uDir * 3.2307692).rgb) * 0.0702703;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');
  var COMP_FS = [
    'precision highp float;',
    'uniform sampler2D uA; uniform sampler2D uB; uniform sampler2D uM;',
    'uniform vec4 uMI;   // mask scale, w, h, on',
    'uniform vec4 uCo;   // gain, glow, ceiling, scroll y',
    'uniform vec3 uRes;  // device px w, h, dpr',
    'uniform vec3 uGround;',
    'varying vec2 vUv;',
    'float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }',
    'vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
    'void main() {',
    '  vec3 a = texture2D(uA, vUv).rgb * uCo.x + texture2D(uB, vUv).rgb * uCo.y;',
    '  a = uCo.z * (vec3(1.0) - exp(-a / uCo.z));',
    '  if (uMI.w > 0.5) {',
    '    vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes.z;',
    '    float mv = texture2D(uM, vec2(css.x / uMI.x / uMI.y, (css.y + uCo.w) / uMI.x / uMI.z)).r;',
    '    float cap = 0.2 * mv * mv;',
    '    float Lm = dot(a, vec3(0.2126, 0.7152, 0.0722));',
    '    if (Lm > cap) a *= cap / Lm;',
    '  }',
    '  vec3 c = toSrgb(uGround + a);',
    '  gl_FragColor = vec4(c + (hash13(vec3(gl_FragCoord.xy, 3.0)) - 0.5) / 255.0, 1.0);',
    '}'
  ].join('\n');

  /* --------------------------------------------------------------------- GL */
  function glInit() {
    if (G.gl || G.failed) return G.ok;
    var attrs = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true,
      preserveDrawingBuffer: S.page === 'home', powerPreference: 'high-performance' };
    try {
      var gl = canvas.getContext('webgl2', attrs), v2 = !!gl;
      if (!gl) gl = canvas.getContext('webgl', attrs);
      if (!gl) throw new Error('no webgl');
      G.gl = gl; G.v2 = v2;
      glBuild();
      canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); G.ok = false; G.lost = true; });
      canvas.addEventListener('webglcontextrestored', function () { G.lost = false; try { glBuild(); kick(); } catch (err) { G.ok = false; } });
    } catch (err) {
      G.failed = true; G.ok = false; G.gl = null;
      console.warn('[nm-space] particle space unavailable:', err && err.message);
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
      return { p: p, u: u };
    };
    G.P = {
      part: prog(PART_VS, PART_FS, ['aA', 'aB', 'aT'], ['uC', 'uR', 'uU', 'uF', 'uV', 'uPP', 'uP', 'uNM', 'uL', 'uPal']),
      down: prog(TRI_VS, DOWN_FS, ['p'], ['uS', 'uTx']),
      blur: prog(TRI_VS, BLUR_FS, ['p'], ['uS', 'uDir']),
      comp: prog(TRI_VS, COMP_FS, ['p'], ['uA', 'uB', 'uM', 'uMI', 'uCo', 'uRes', 'uGround'])
    };
    var pr = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    G.maxPt = Math.min(48, pr && pr[1] ? pr[1] : 32);
    // the float accumulation format: RGBA16F where it renders, else RGBA8 (scaled)
    G.fmt = pickFormat(gl);
    G.tri = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, G.tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var b = budget(), P = makeParticles(b);
    G.data = P.data; S.layers = P.layers; S.budget = b;
    G.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, G.buf);
    gl.bufferData(gl.ARRAY_BUFFER, G.data, gl.STATIC_DRAW);
    G.mask = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, G.mask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    texParams(gl, gl.LINEAR);
    G.maskVer = -1;
    G.fbW = G.fbH = 0;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    G.ok = true;
    if (S.markMap) fillTargets(S.markMap);
  }
  function texParams(gl, filter) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  function pickFormat(gl) {
    var tries = [];
    if (G.v2) {
      if (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')) {
        tries.push({ internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, linear: true, scale: 1, name: 'rgba16f' });
      }
    } else {
      var hf = gl.getExtension('OES_texture_half_float');
      gl.getExtension('EXT_color_buffer_half_float');
      if (hf) tries.push({ internal: gl.RGBA, format: gl.RGBA, type: hf.HALF_FLOAT_OES, linear: !!gl.getExtension('OES_texture_half_float_linear'), scale: 1, name: 'half' });
    }
    tries.push({ internal: gl.RGBA, format: gl.RGBA, type: gl.UNSIGNED_BYTE, linear: true, scale: 6, name: 'rgba8' });
    for (var i = 0; i < tries.length; i++) {
      var f = tries[i], t = gl.createTexture(), fb = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, f.internal, 4, 4, 0, f.format, f.type, null);
      texParams(gl, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb); gl.deleteTexture(t);
      if (ok) return f;
    }
    return tries[tries.length - 1];
  }
  function target(w, h, filter) {
    var gl = G.gl, f = G.fmt, t = gl.createTexture(), fb = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, f.internal, w, h, 0, f.format, f.type, null);
    texParams(gl, f.linear ? filter : gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { t: t, fb: fb, w: w, h: h };
  }
  function ensureTargets() {
    if (G.fbW === S.W && G.fbH === S.H) return;
    var gl = G.gl;
    [G.A, G.B, G.C].forEach(function (x) { if (x) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.fb); } });
    var qw = Math.max(1, Math.ceil(S.W / 4)), qh = Math.max(1, Math.ceil(S.H / 4));
    G.A = target(S.W, S.H, gl.LINEAR);
    G.B = target(qw, qh, gl.LINEAR);
    G.C = target(qw, qh, gl.LINEAR);
    G.fbW = S.W; G.fbH = S.H;
  }
  function attribsPart() {
    var gl = G.gl, st = STRIDE * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, G.buf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, st, 16);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 32);
  }
  function attribsTri() {
    var gl = G.gl;
    gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.tri);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  }
  function fullscreen(P, tgt, w, h) {
    var gl = G.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.fb : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(P.p);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function draw() {
    var gl = G.gl, t0 = performance.now(), sy = window.scrollY || 0;
    ensureTargets();
    var mask = window.NMSky && NMSky.mask;
    if (mask && mask.canvas && G.maskVer !== mask.ver) {
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.mask);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask.canvas);
      G.maskVer = mask.ver;
    }
    // 1. the particles, as light, into the float buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.A.fb);
    gl.viewport(0, 0, S.W, S.H);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    var P = G.P.part, u = P.u, c = CAM, t = S.still ? 40 : S.t;
    gl.useProgram(P.p);
    gl.uniform3fv(u.uC, c.pos); gl.uniform3fv(u.uR, c.r); gl.uniform3fv(u.uU, c.u); gl.uniform3fv(u.uF, c.f);
    gl.uniform4f(u.uV, S.vw, S.vh, S.dpr, c.F);
    gl.uniform2f(u.uPP, c.cx, c.cy);
    gl.uniform4f(u.uP, t, D, FOG, S.cfg.seed * 0.01);
    var mk = c.mark, gth = mk && S.marks ? c.gather : 0;
    gl.uniform4f(u.uNM, mk ? mk[0] : -1e4, mk ? mk[1] : -1e4, mk ? mk[2] : 1, gth);
    gl.uniform4f(u.uPal, S.cfg.warm, 0, 0, 0);
    attribsPart();
    var q = S.q, gain = opts.brightness / G.fmt.scale * (S.budget.phone ? 1.35 : 1);
    S.layers.forEach(function (L) {
      // a lower quality draws a prefix of each layer (gather particles first), a little brighter
      var n = Math.max(L.ng, Math.round(L.n * q));
      gl.uniform4f(u.uL, gain * L.n / Math.max(1, n), G.maxPt, 9.0, 2.4);
      gl.drawArrays(gl.POINTS, L.start, n);
    });
    gl.disable(gl.BLEND);
    // 2. the glow: a quarter-res, blurred copy
    var glow = 0.55 * opts.glow;
    attribsTri();
    if (glow > 0.001) {
      var Pd = G.P.down;
      gl.useProgram(Pd.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.A.t);
      gl.uniform1i(Pd.u.uS, 0); gl.uniform2f(Pd.u.uTx, 1 / S.W, 1 / S.H);
      fullscreen(Pd, G.B, G.B.w, G.B.h);
      var Pb = G.P.blur;
      gl.useProgram(Pb.p); gl.uniform1i(Pb.u.uS, 0);
      for (var pass = 0; pass < 2; pass++) {
        gl.bindTexture(gl.TEXTURE_2D, G.B.t); gl.uniform2f(Pb.u.uDir, 1.6 / G.B.w, 0);
        fullscreen(Pb, G.C, G.C.w, G.C.h);
        gl.bindTexture(gl.TEXTURE_2D, G.C.t); gl.uniform2f(Pb.u.uDir, 0, 1.6 / G.B.h);
        fullscreen(Pb, G.B, G.B.w, G.B.h);
      }
    }
    // 3. the composite: ground, soft ceiling, the AA hold on text, sRGB, dither
    var Pc = G.P.comp, uc = Pc.u;
    gl.useProgram(Pc.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.A.t); gl.uniform1i(uc.uA, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.B.t); gl.uniform1i(uc.uB, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.mask); gl.uniform1i(uc.uM, 2);
    var m = mask && mask.canvas ? mask : null;
    gl.uniform4f(uc.uMI, m ? m.scale : 1, m ? m.w : 1, m ? m.h : 1, m ? 1 : 0);
    gl.uniform4f(uc.uCo, G.fmt.scale, glow > 0.001 ? glow * G.fmt.scale : 0, 0.42, sy);
    gl.uniform3f(uc.uRes, S.W, S.H, S.dpr);
    gl.uniform3fv(uc.uGround, GROUND);
    fullscreen(Pc, null, S.W, S.H);
    S.stats.drawMs += performance.now() - t0;
    S.stats.draws++;
    if (!S.shown) {
      S.shown = true;
      canvas.style.transition = S.still ? 'none' : 'opacity 1.4s ease';
      requestAnimationFrame(function () { canvas.style.opacity = '1'; });
    }
  }

  /* ------------------------------------------------------------------ layout */
  function measure() {
    var vw = root.clientWidth || innerWidth, vh = canvas.clientHeight || innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    if (vw * vh * dpr * dpr > 4200000) dpr = Math.max(1, Math.sqrt(4200000 / (vw * vh)));
    dpr *= S.dprK || 1;
    S.vw = vw; S.vh = vh; S.dpr = dpr; S.phone = vw < 600;
    S.W = Math.max(1, Math.round(vw * dpr)); S.H = Math.max(1, Math.round(vh * dpr));
    if (canvas.width !== S.W || canvas.height !== S.H) { canvas.width = S.W; canvas.height = S.H; }
  }
  function relayout() {
    measure();
    var hero = S.page === 'home' ? document.querySelector('main > section.h-svh') : null;
    S.R = hero ? hero.offsetHeight : 0;
    var docH = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    S.maxY = Math.max(1, docH - (window.innerHeight || S.vh));
    // the whole page flies 110 units plus a little more for longer pages
    S.zpx = (110 + 0.012 * S.maxY) / S.maxY;
    kick();
  }

  /* -------------------------------------------------------------------- frame */
  function step(now) {
    if (S.stepAt === now) return;
    var dt = S.last ? Math.min(0.1, (now - S.last) / 1000) : 0;
    S.last = now; S.stepAt = now;
    if (!S.still) S.t += dt * opts.motion;
    camStep(dt);
  }
  api.step = function (now) { if (S.ready) step(now == null ? performance.now() : now); };
  function quality(now, dt) {
    // frames that run long while the camera moves lower the particle count, then the resolution
    if (S.still || !dt) return;
    var ms = dt * 1000;
    if (CAM.moving || CAM.vg) {
      if (ms > 24) S.slow++; else if (ms < 18) S.fast++;
      if (S.slow > 45) {
        S.slow = S.fast = 0;
        if (S.q > 0.5) S.q = Math.max(0.5, S.q - 0.15);
        else if (!S.dprK || S.dprK > 0.75) { S.dprK = 0.75; measure(); }
      } else if (S.fast > 600) { S.fast = S.slow = 0; if (S.q < 1 && !S.dprK) S.q = Math.min(1, S.q + 0.1); }
    }
  }
  function frame(now) {
    var t0 = performance.now(), prev = S.last;
    step(now);
    var dt = prev ? (now - prev) / 1000 : 0;
    quality(now, dt);
    var busy = CAM.moving || Math.abs(CAM.vg) > 1e-3;
    if (S.still || busy || now - S.lastDraw > 31 || !S.lastDraw || S.force) {
      S.lastDraw = now; S.force = false;
      if (G.ok && !G.lost) draw();
    }
    var st = S.stats, ms = performance.now() - t0;
    st.frames++; st.ms += ms; if (ms > st.worst) st.worst = ms;
    if (dt) { st.gaps.push(dt * 1000); if (st.gaps.length > 240) st.gaps.shift(); }
  }
  function loop(now) { S.raf = requestAnimationFrame(loop); frame(now); }
  function active() { return S.ready && !document.hidden && !gameOpen(); }
  function update() {
    var was = S.still;
    S.still = reduceQ.matches;
    if (was !== S.still) { CAM.init = false; S.force = true; }
    var go = active() && !S.still;
    if (go && !S.running) { S.running = true; S.last = 0; S.raf = requestAnimationFrame(loop); }
    else if (!go && S.running) { S.running = false; cancelAnimationFrame(S.raf); S.raf = 0; }
    if (active() && S.still) kick();
  }
  var kickRaf = 0;
  function kick() {
    S.force = true;
    if (S.running || kickRaf || !active()) return;
    kickRaf = requestAnimationFrame(function (now) { kickRaf = 0; S.last = 0; S.stepAt = -1; frame(now); });
  }

  /* -------------------------------------------------------------------- mount */
  var resizeT = 0, roT = 0;
  function mount() {
    if (S.mounted) return;
    S.mounted = true;
    S.page = api.page = detectPage();
    S.cfg = PAGES[S.page] || PAGES.home;
    canvas = document.createElement('canvas');
    canvas.id = 'nm-space';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100vh;height:100lvh;z-index:-22;pointer-events:none;display:block;opacity:0';
    document.body.insertBefore(canvas, document.body.firstChild);
    api.canvas = canvas;
    S.still = reduceQ.matches;
    measure();
    if (!glInit()) { canvas.remove(); api.canvas = null; return; }
    S.ready = true;
    relayout();
    loadMark(function (g) { S.markMap = g; if (g) fillTargets(g); });
    addEventListener('resize', function () {
      clearTimeout(resizeT);
      resizeT = setTimeout(relayout, 140);
    }, { passive: true });
    addEventListener('scroll', function () { if (!S.running) kick(); }, { passive: true });
    addEventListener('pageshow', update);
    document.addEventListener('visibilitychange', update);
    addEventListener('nm:gamechange', update);
    if (reduceQ.addEventListener) reduceQ.addEventListener('change', update);
    new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ['class'] });
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { clearTimeout(roT); roT = setTimeout(relayout, 220); }).observe(document.body);
    }
    setTimeout(relayout, 1200);
    update();
    kick();
  }

  /* ---------------------------------------------------------------------- API */
  api.set = function (o) {
    if (!o) return;
    ['brightness', 'glow', 'motion', 'density'].forEach(function (k) { if (o[k] != null) opts[k] = Math.max(0, +o[k] || 0); });
    if (o.quality != null) S.q = clamp(+o.quality, 0.2, 1);
    kick();
  };
  api.at = function (y) {
    if (!S.cfg) return null;
    var hp = S.page === 'home' && S.R > 0 ? clamp(y / S.R, 0, 1) : 0, p = poseAt(clamp(y, 0, S.maxY), hp);
    return { roll: p.roll, yaw: p.yaw, pitch: p.pitch, z: p.z };
  };
  api.debug = function () {
    var g = S.stats.gaps.slice().sort(function (a, b) { return a - b; }), pct = function (p) { return g.length ? +g[Math.min(g.length - 1, Math.floor(g.length * p))].toFixed(1) : 0; };
    return {
      page: S.page, ready: S.ready, running: S.running, still: S.still, gl: G.ok ? (G.v2 ? 'webgl2' : 'webgl') + '/' + G.fmt.name : false,
      size: [S.vw, S.vh], dpr: +S.dpr.toFixed(2), particles: S.N, quality: S.q, marks: S.marks || 0, maxY: S.maxY, zpx: +S.zpx.toFixed(4),
      cam: { y: +CAM.y.toFixed(1), vy: +CAM.vy.toFixed(1), hp: +CAM.hp.toFixed(3), z: +CAM.z.toFixed(2), roll: +CAM.roll.toFixed(2),
        yaw: +(CAM.yaw * 57.3).toFixed(2), pitch: +(CAM.pitch * 57.3).toFixed(2), pp: [Math.round(CAM.cx), Math.round(CAM.cy)], F: +CAM.F.toFixed(1),
        gather: +CAM.gather.toFixed(3), mark: CAM.mark && CAM.mark.map(Math.round) },
      stats: { frames: S.stats.frames, draws: S.stats.draws, avgMs: S.stats.frames ? +(S.stats.ms / S.stats.frames).toFixed(2) : 0,
        drawAvgMs: S.stats.draws ? +(S.stats.drawMs / S.stats.draws).toFixed(2) : 0, worstMs: +S.stats.worst.toFixed(1),
        gap: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99) } }
    };
  };
  api.resetStats = function () { S.stats = { frames: 0, draws: 0, ms: 0, drawMs: 0, worst: 0, since: performance.now(), gaps: [] }; };

  var ready = window.__nmReady || function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };
  ready(mount);
})();
