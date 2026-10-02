/* NM Space: the particle space behind the Night Sky design (brief: docs/night-sky.md).

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
   Footer finale, the NM gather (one scroll-driven progress on a spring, so it is reversible
   and a fling plays out as a glide; every position is a function of that progress):
     - as the footer comes into view the sky gets heavier: a light field of extra stars
       (1800 phone / 3800 desktop, the 'mark' layer) settles in across the whole view, star-like
       points of varied brightness that turn with the camera like the rest of the far sky;
     - then they lift off and fly to their places in Nico's NM mark (sampled from
       textures/nm-mark-sdf.png, green channel) over the Space Run door (NMSky.nmRect()),
       staggered so the contour builds first, sweeping left to right, then the inside fills;
       each curves in on a gentle swirl about the mark's centre, brightens a little and draws a
       short soft trail while it moves (extra draws of the layer a moment back along its path,
       only while the progress is moving), and lands with a tiny twinkle;
     - while it forms, the mark waits low in the view for the footer to bring the door up to
       it, then rides with the footer; the space behind it quiets;
     - scrolling back up sends every star back out along its path to its place in the sky.
     NMSky's constellation star-nodes fly in on the same progress (camera.gather/.presence/.mark).
     Reduced motion: the mark is simply there, formed, with the footer.
   The pointer's wake (NMSpace.wake, shared with js/nm-sky.js so the sky moves as one thing):
     - fine pointers only ((hover: hover) and (pointer: fine), mouse or pen), off under reduced
       motion, in hidden tabs and while Space Run is open; no new path behind the Index lightbox;
     - as the cursor moves, the stars near its path ease away from it and drift back once it has
       passed, like water parting behind a hand. A passive pointermove listener only records the
       path, as short segments (each WK.SLICE ms of travel or WK.SEG_MAX px, whichever comes
       first, so a fast sweep parts one lane rather than a chain of bubbles); each pushes for
       WK.T s with the envelope u^1.5 (1-u)^4.5 (u = age / T: from rest, out by ~0.25 T, back to
       rest at T), weighted by its length and the pointer's speed (a slow drift barely stirs, a
       sweep parts the sky). Time-based, so 60 and 120 Hz look the same (and 60, 120 or 250 Hz
       pointer events, within ~0.3 px); it settles when the pointer rests or leaves the window;
     - the push at a point is away from the nearest point of each segment, r (1 - r²/R²)²:
       zero on the path itself, largest ~0.43 R out, nothing beyond WK.R. The segments add, and
       one scale per frame (from the strongest push anywhere, sampled along every segment) keeps
       the peak at about WK.A css px however fast the pointer moves or often it crosses itself
       (measured 14.8 px on an ordinary reach, 15.1-15.3 on fast sweeps and flicks up to
       4000 px/s, ~16.7 in a heavy scribble), so the field keeps its smooth shape: no hole, ring
       or edge. The nearest particles move at most ~85 px/s on an ordinary reach and ~135 on a
       flick; one pass changes their local density by about x0.7..x1.35, and where passes
       overlap (a scribble) they bunch between them up to ~x1.8. Only positions move: no
       brightness or colour change;
     - evaluated in screen space after projection: on the GPU (WAKE_GLSL, the particles here and
       the catalogue stars in nm-sky.js) and on the CPU (wake.at: the featured stars' hover test
       and reticle, the NM's nodes and chart lines), so what is drawn and what is hit agree.
       Depth parallax: particles at view depth <= WK.NEAR take the full push, beyond WK.FAR
       WK.K_FAR of it; the catalogue stars WK.K_SKY; the formed NM mark WK.K_MARK (legible);
     - both layers draw at display rate while it settles, then idle again at ~30 fps (and the
       home hero refreshes its copy of them every frame while it settles: wake.live()).
       The auto quality (quality()) still counts slow frames only while the camera moves.
     Tuning: the WK constants below (live: NMSpace.set({ push: 0.5 }) scales the push, 0 = off;
     NMSpace.debug().wake shows the live segments and the peak push in px).

   window.NMSpace
     .canvas        the fixed canvas (opaque WebGL; paints the ground too)
     .camera        { y, vy, hp, roll (deg), yaw, pitch (rad), F, cx, cy, pos, moving,
                      gather (0..1 the NM's progress), presence (0..1 its stars in the sky), vP
                      (gather per second), mark ([x, y, width, footer y]: where it forms, css px),
                      seat ([cos, sin, dx, dy]: how its sky seats turn with the camera) }
     .GATHER        { W, start(i), path(...) } the shared timing and flight path (NMSky's nodes)
     .step(now)     advance the camera to this frame (idempotent; js/nm-sky.js calls it)
     .at(y)         the settled camera (no drift) at scroll y: { roll, yaw, pitch, z }
     .set(opts)     { brightness, glow, motion, density, push } live multipliers (1 = default)
     .wake          the pointer's wake: { K (the WK constants), GLSL (vec2 wake(vec2 css px)),
                      uniforms, bind(gl, uniforms, now), at(x, y, now, out) (css px of push at
                      full strength; callers scale by their K), busy(now), live() (busy at the
                      frame last evaluated, without evaluating one), reset() }
     .debug()       counts, quality, camera, timings

   Budget: ~180k particles on desktop, ~50k on phones (fewer when frames run long), DPR <= 1.5;
   display rate while the camera moves or the wake settles, ~30 fps while it only breathes; the
   wake costs a passive pointermove listener and a few uniforms a frame; stops in hidden tabs
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
  /* The NM gather, in viewport heights of the mark's travel up the view: its stars settle into
     the sky over G_PRE, fly over G_RUN, and the mark is whole G_END before the page ends. */
  var G_PRE = 0.55, G_RUN = 0.75, G_END = 0.04;
  var GW = 0.42;           // each star's share of the gather progress: its flight
  var SWIRL = 0.5;         // radians: how far the flights bow around the mark's centre
  var TRAIL_T = 0.11;      // seconds of flight the trail shows
  var TRAIL_N = 9;         // samples along it

  /* Nico's palette, linear light (cream, warm white, ice, peach, coral, violet) */
  function lin(h) {
    return [1, 3, 5].map(function (i) { var v = parseInt(h.substr(i, 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  }
  var PAL = { cream: lin('#EDE1CC'), white: lin('#F4F8F0'), ice: lin('#BCD3E0'), peach: lin('#E9B4A3'), coral: lin('#E3837A'), violet: lin('#6E6BD6') };
  var GROUND = lin('#0a0a0a');

  /* The pointer's wake (see the header). Displacements are css px. */
  var WK = {
    SLICE: 50,      // ms of pointer travel per path segment ...
    SEG_MAX: 60,    // ... or this many css px, whichever comes first (a fast sweep parts one lane, not a chain of bubbles)
    T: 1.15,        // s: how long a segment pushes (strongest ~0.25 T after the pointer passed, at rest by T)
    R: 170,         // css px: the reach; nothing moves farther than this from the pointer's path
    A: 16,          // css px: about the most the nearest particles move (a sweep ~0.93 A, a heavy scribble ~1.04 A)
    GAIN: 1.25,     // a sweep's strength (with how the segments add, its peak ~0.93 A: 14.8-15.3 px)
    V0: 60,         // px/s: at and below this the pointer's speed factor is S_MIN ...
    V1: 1400,       // ... rising to 1 at this speed (a slow drift barely stirs, a sweep parts the sky)
    S_MIN: 0.4,
    NEAR: 3,        // view depth at and nearer than which particles take the full push
    FAR: 26,        // and beyond which they take K_FAR of it (depth parallax)
    K_FAR: 0.5,
    K_SKY: 0.3,     // the catalogue stars and the footer's sky seats, at infinity
    K_MARK: 0.3     // the formed NM mark (its particles, nodes and chart lines): stays legible
  };
  // segments the shaders take (2 N + 14 vertex uniform vectors, inside WebGL's minimum of 128): all
  // that SLICE alone leaves alive, and room for SEG_MAX's extra ones up to ~35 a second (2100 px/s)
  WK.N = Math.max(Math.ceil(WK.T * 1000 / WK.SLICE) + 4, 40);
  var api = window.NMSpace = { canvas: null, camera: null, version: 1 };
  var opts = { brightness: 1, glow: 1, motion: 1, density: 1, push: 1 };

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

  /* -------------------------------------------------------- the pointer's wake */
  // The pointer's path as segments { ax, ay, bx, by, t (s, when the pointer was at a), w }, the
  // newest last. Recorded by a passive pointermove listener; read once per frame (frameOf) by
  // both layers' draws and the CPU mirror (at).
  var fineQ = mq('(hover: hover) and (pointer: fine)');
  var WAKE_C = 0.286 * WK.R;              // a segment's peak push at unit weight (r (1 - r²/R²)² at r = R / √5)
  var WAKE_L = 0.965 * WK.R;              // the path length whose chain of segments adds up to one long sweep
  var WAKE_P = 0.43 * WK.R;               // where the push peaks beside the path (R/√6 a line .. R/√5 a point)
  var wake = api.wake = { K: WK, segs: [], cur: null, lx: 0, ly: 0, lt: -1, vs: 0 };
  // the frame's path for the shaders: a (start x, y, extent x, y), b (weight / WAKE_C, 1 / |extent|²),
  // r (1 / R², css px per unit of push, segments, the strongest push in units), the box it reaches
  var WF = { now: -1, n: 0, a: new Float32Array(WK.N * 4), b: new Float32Array(WK.N * 4), box: [0, 0, 0, 0], r: [1 / (WK.R * WK.R), 0, 0, 0] };
  // Off: Nico tried the wake on 2026-10-01 and asked for it to be removed. No listener is attached
  // and nothing is displaced; the code goes with the next engine pass.
  var WAKE_ON = false;
  function wakeOK() {
    return WAKE_ON && fineQ.matches && !reduceQ.matches && !document.hidden && !gameOpen() && opts.push > 0;
  }
  // the Index lightbox covers the sky (94%): no new path behind it, and what was already moving
  // settles on its own (no snap back as it fades in), then the layers idle at ~30 fps again
  function lbOpen() { return root.classList.contains('nm-lb-open'); }
  // a segment's strength at u = age / T: u^1.5 (1 - u)^4.5, 1 at its peak (u = 0.25); it starts
  // from rest (no kick as the pointer passes) and settles smoothly back to rest at u = 1
  function wakeEnv(u) { var v = 1 - u, v2 = v * v; return 29.1961 * u * Math.sqrt(u) * v2 * v2 * Math.sqrt(v); }
  wake.reset = function () { wake.segs.length = 0; wake.cur = null; wake.lt = -1; wake.vs = 0; WF.now = -1; WF.n = 0; WF.r[2] = WF.r[3] = 0; };
  function wakeMove(e) {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    if (!wakeOK() || lbOpen()) { wake.lt = -1; return; }
    var now = performance.now() / 1000, x = e.clientX, y = e.clientY, lx = wake.lx, ly = wake.ly, lt = wake.lt;
    if (!isFinite(x) || !isFinite(y)) return;
    if (lt >= 0 && x === lx && y === ly) return;
    wake.lx = x; wake.ly = y; wake.lt = now;
    // a fresh start (first move, back in the window, after a pause): no segment across the jump
    if (lt < 0 || now - lt > 0.14) { wake.vs = 0; wake.cur = null; return; }
    var dx = x - lx, dy = y - ly, d = Math.sqrt(dx * dx + dy * dy), dt = Math.max(0.004, now - lt);
    wake.vs += (d / dt - wake.vs) * Math.min(1, dt / 0.05);   // the pointer's speed, px/s, smoothed
    // the open segment grows until it holds SLICE ms of travel or SEG_MAX px of path, then the next
    // one starts where it ends. Long segments would push out at their rounded ends like a chain of
    // bubbles; the length limit keeps a fast sweep one smooth lane. On time alone at most
    // T / SLICE + 2 are alive; only a sustained frantic scribble (over ~2100 px/s for a second)
    // makes more than N, and then the oldest goes (by then dozens overlap: no visible step)
    var S2 = wake.segs, cur = wake.cur;
    while (S2.length && now - S2[0].t >= WK.T) S2.shift();
    if (cur && cur.bx === lx && cur.by === ly && (lt - cur.t) * 1000 < WK.SLICE &&
        Math.hypot(cur.bx - cur.ax, cur.by - cur.ay) < WK.SEG_MAX) { cur.bx = x; cur.by = y; }
    else {
      cur = wake.cur = { ax: lx, ay: ly, bx: x, by: y, t: lt, w: 0 };
      S2.push(cur);
      if (S2.length > WK.N) S2.shift();
    }
    var len = Math.hypot(cur.bx - cur.ax, cur.by - cur.ay);
    cur.w = WK.GAIN * Math.min(1, len / WAKE_L) * (WK.S_MIN + (1 - WK.S_MIN) * smooth(WK.V0, WK.V1, wake.vs));
  }
  // the summed push at (x, y) in units (1: one full-strength segment's peak), into out
  function fieldAt(f, x, y, out) {
    var A = f.a, B = f.b, R2i = f.r[0], Fx = 0, Fy = 0;
    for (var i = 0; i < f.n; i++) {
      var o = i * 4, px = x - A[o], py = y - A[o + 1], h = clamp((px * A[o + 2] + py * A[o + 3]) * B[o + 1], 0, 1);
      var rx = px - A[o + 2] * h, ry = py - A[o + 3] * h, q = 1 - (rx * rx + ry * ry) * R2i;
      if (q > 0) { Fx += rx * B[o] * q * q; Fy += ry * B[o] * q * q; }
    }
    out[0] = Fx; out[1] = Fy;
    return out;
  }
  var wTmp = [0, 0];
  // the path as the shaders take it at now (a rAF timestamp, ms; default performance.now())
  function frameOf(now) {
    var t = (now == null ? performance.now() : now) / 1000;
    if (WF.now === t) return WF;
    WF.now = t; WF.n = 0; WF.r[2] = WF.r[3] = 0;
    var S2 = wake.segs;
    while (S2.length && t - S2[0].t >= WK.T) S2.shift();
    if (!S2.length) return WF;
    if (!wakeOK()) { wake.reset(); WF.now = t; return WF; }
    var A = WF.a, B = WF.b, n = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < S2.length && n < WK.N; i++) {
      var s = S2[i], w = s.w * wakeEnv(clamp((t - s.t) / WK.T, 0, 1));
      if (w < 1e-4) continue;
      var ex = s.bx - s.ax, ey = s.by - s.ay, e2 = ex * ex + ey * ey, o = n * 4;
      A[o] = s.ax; A[o + 1] = s.ay; A[o + 2] = ex; A[o + 3] = ey;
      B[o] = w / WAKE_C; B[o + 1] = e2 > 1e-6 ? 1 / e2 : 0; B[o + 2] = 0; B[o + 3] = 0;
      x0 = Math.min(x0, s.ax, s.bx); y0 = Math.min(y0, s.ay, s.by); x1 = Math.max(x1, s.ax, s.bx); y1 = Math.max(y1, s.ay, s.by);
      n++;
    }
    WF.n = n;
    if (!n) return WF;
    WF.box[0] = x0 - WK.R; WF.box[1] = y0 - WK.R; WF.box[2] = x1 + WK.R; WF.box[3] = y1 + WK.R;
    // The strongest push anywhere (sampled WAKE_P either side of each segment at its ends, quarters
    // and middle, where it peaks) sets one scale for the whole frame: M / cbrt(1 + M³) of A at the
    // peak. One scale keeps the field's shape however many passes overlap (a cap per point would
    // flatten the overlap into a step: a groove along the path, a hollow round a scribble).
    var M = 0;
    for (var j = 0; j < n; j++) {
      var p = j * 4, el = Math.sqrt(A[p + 2] * A[p + 2] + A[p + 3] * A[p + 3]);
      var nx = el > 1e-3 ? -A[p + 3] / el * WAKE_P : WAKE_P, ny = el > 1e-3 ? A[p + 2] / el * WAKE_P : 0;
      for (var k = 0; k <= 4; k++) {
        var mx = A[p] + A[p + 2] * k * 0.25, my = A[p + 1] + A[p + 3] * k * 0.25;
        for (var sd = -1; sd <= 1; sd += 2) {
          fieldAt(WF, mx + nx * sd, my + ny * sd, wTmp);
          M = Math.max(M, Math.sqrt(wTmp[0] * wTmp[0] + wTmp[1] * wTmp[1]));
        }
      }
    }
    WF.r[1] = WK.A * opts.push / Math.cbrt(1 + M * M * M); WF.r[2] = n; WF.r[3] = M;
    return WF;
  }
  // true while any of the path still pushes (the layers draw at display rate until it settles)
  wake.busy = function (now) { return frameOf(now).n > 0; };
  // the same for the frame last evaluated, without evaluating one (the hero's backdrop reads it)
  wake.live = function () { return WF.n > 0; };
  // the push at (x, y), css px at full strength (the caller scales it by its layer's K)
  wake.at = function (x, y, now, out) {
    var f = frameOf(now);
    out = out || [0, 0]; out[0] = 0; out[1] = 0;
    if (!f.n || x < f.box[0] || y < f.box[1] || x > f.box[2] || y > f.box[3]) return out;
    fieldAt(f, x, y, out);
    out[0] *= f.r[1]; out[1] *= f.r[1];
    return out;
  };
  // set a program's wake uniforms (uWa, uWb, uWr, uWx) for the frame at now
  wake.bind = function (gl, u, now) {
    var f = frameOf(now);
    if (f.n) {
      gl.uniform4fv(u.uWa, f.a); gl.uniform4fv(u.uWb, f.b);
      gl.uniform4f(u.uWx, f.box[0], f.box[1], f.box[2], f.box[3]);
    }
    gl.uniform4f(u.uWr, f.r[0], f.r[1], f.n, 0);
  };
  wake.uniforms = ['uWa', 'uWb', 'uWr', 'uWx'];
  // The same push on the GPU: wake(p) is the css px of push at p (full strength).
  var WAKE_GLSL = wake.GLSL = [
    'uniform vec4 uWa[' + WK.N + '];   // the path: segment start x, y and extent x, y (css px)',
    'uniform vec4 uWb[' + WK.N + '];   // its weight (per unit peak), 1 / |extent|²',
    'uniform vec4 uWr;          // 1 / R², css px per unit (this frame\'s scale), segments, peak',
    'uniform vec4 uWx;          // the path\'s box grown by R',
    'vec2 wake(vec2 p) {',
    '  if (uWr.z < 0.5 || p.x < uWx.x || p.y < uWx.y || p.x > uWx.z || p.y > uWx.w) return vec2(0.0);',
    '  vec2 F = vec2(0.0);',
    '  for (int i = 0; i < ' + WK.N + '; i++) {',
    '    if (float(i) >= uWr.z) break;',
    '    vec4 s = uWa[i]; vec4 b = uWb[i];',
    '    vec2 ap = p - s.xy;',
    '    vec2 r = ap - s.zw * clamp(dot(ap, s.zw) * b.y, 0.0, 1.0);',
    '    float q = 1.0 - dot(r, r) * uWr.x;',
    '    if (q > 0.0) F += r * (b.x * q * q);',
    '  }',
    '  return F * uWr.y;',
    '}'
  ].join('\n');
  // (capture: the path is recorded whatever the page does with the event)
  if (WAKE_ON) document.addEventListener('pointermove', wakeMove, { passive: true, capture: true });
  document.addEventListener('pointerout', function (e) { if (!e.relatedTarget) wake.lt = -1; }, { passive: true, capture: true });

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
    gather: 0, vg: 0, graw: 0, presence: 0, vP: 0, mark: null, seat: [1, 0, 0, 0]
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
  // One progress, linear in scroll from where the footer's NM box sits relative to where it
  // will sit at the bottom of the page, followed by a critically damped spring (graw). Its
  // first part brings the stars into the sky (presence), the rest is the flight (gather).
  var G_A = G_PRE / (G_PRE + G_RUN - G_END);
  function gatherStep(dt) {
    var sky = window.NMSky, rect = sky && sky.nmRect ? sky.nmRect() : null, rT = 0, live = false;
    CAM.mark = null;
    if (rect && rect[2] > rect[0]) {
      var my = (rect[1] + rect[3]) / 2, mh = rect[3] - rect[1], sy = window.scrollY || 0, myEnd = my + sy - S.maxY;
      var fin = myEnd + S.vh * G_END, pre = myEnd + S.vh * (G_RUN + G_PRE);
      rT = clamp((pre - my) / Math.max(1, pre - fin), 0, 1);
      live = my > -S.vh && my < S.vh * 2.8;
      if (!live) rT = 0;
      // while it forms, the mark waits low in the view until the footer brings the door up to it
      var hold = S.still ? my : Math.max(myEnd, S.vh - mh * 0.5 - S.vh * 0.06);
      CAM.mark = [(rect[0] + rect[2]) / 2, Math.min(my, hold), rect[2] - rect[0], my];
    }
    if (!S.marks) { rT = 0; live = false; }
    var P0 = CAM.gather;
    if (S.still) {   // reduced motion: no flight, the mark is simply there with the footer
      CAM.graw = rT; CAM.vg = 0; CAM.gather = live ? 1 : 0; CAM.presence = live ? 1 : 0; CAM.vP = 0;
    } else {
      if (!CAM.init || dt <= 0) { CAM.graw = rT; CAM.vg = 0; }
      else {
        var W2 = 3.2, n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
        for (var i = 0; i < n; i++) { CAM.vg += (W2 * W2 * (rT - CAM.graw) - 2 * W2 * CAM.vg) * h; CAM.graw += CAM.vg * h; }
        CAM.graw = clamp(CAM.graw, 0, 1);
        if (Math.abs(rT - CAM.graw) < 1e-4 && Math.abs(CAM.vg) < 1e-3) { CAM.graw = rT; CAM.vg = 0; }
      }
      CAM.presence = smooth(0, G_A, CAM.graw);
      CAM.gather = clamp((CAM.graw - G_A) / (1 - G_A), 0, 1);
      var vP = dt > 0 ? (CAM.gather - P0) / dt : 0;
      CAM.vP += (vP - CAM.vP) * (dt > 0 ? Math.min(1, dt * 18) : 1);
      if (Math.abs(CAM.vP) < 1e-3 && CAM.vg === 0) CAM.vP = 0;
    }
    // the sky seats turn with the camera (like stars at infinity) from its pose at the page's end
    var end = poseAt(S.maxY, CAM.hp), dr = (CAM.roll - end.roll) * Math.PI / 180;
    CAM.seat = [Math.cos(dr), Math.sin(dr), -(CAM.yaw - end.yaw) * CAM.F, (CAM.pitch - end.pitch) * CAM.F];
  }
  // The shared timing and path (the GLSL copy is in PART_VS): a star's progress through its
  // own flight, and where it is along a flight from seat (sx, sy) to place (tx, ty) about the
  // mark's centre (cx, cy). swirl: SWIRL scaled per star.
  function flightPos(e, sx, sy, tx, ty, cx, cy, swirl, out) {
    var dx = sx + (tx - sx) * e - cx, dy = sy + (ty - sy) * e - cy;
    var th = swirl * 4 * e * (1 - e), c = Math.cos(th), s = Math.sin(th);
    out.x = cx + dx * c - dy * s; out.y = cy + dx * s + dy * c;
    return out;
  }
  api.GATHER = {
    W: GW, SWIRL: SWIRL, TRAIL_T: TRAIL_T,
    g: function (P, start) { return clamp((P - start) / GW, 0, 1); },
    ease: function (g) { return g * g * (3 - 2 * g); },
    path: flightPos
  };

  /* --------------------------------------------------------------- particles */
  // Per particle (11 floats): u, w, phase, layer | r1, r2, energy, gather start (-1 never) |
  // NM target x, y (0..1 in the mark's box), edge (1 on the contour and the thin diagonals).
  // Laid out by layer (coherent branches on the GPU). The last layer is the NM's own stars:
  // u, w is its seat in the sky (0..1 across the view and a little beyond), drawn whole at any
  // quality and only near the footer.
  // (rng: how many of a layer once drew one more random number; kept so the space is unchanged)
  var LAYERS = [
    { name: 'floor', share: 0.45, rng: 0 },
    { name: 'aurora', share: 0.13, rng: 0 },
    { name: 'wisp', share: 0.14, rng: 0.22 },
    { name: 'dust', share: 0.22, rng: 0.56 },
    { name: 'speck', share: 0.06, rng: 0.22 },
    { name: 'mark', share: 0, rng: 0, mark: true }
  ];
  var MARK_L = LAYERS.length - 1;
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
    var total = LAYERS.reduce(function (s, L) { return s + (L.mark ? b.g : Math.round(b.n * L.share)); }, 0);
    var R = rng(0x5eed ^ (S.cfg.seed * 7 + 13)), data = new Float32Array(total * STRIDE), k = 0, layers = [];
    LAYERS.forEach(function (L, li) {
      var n = L.mark ? b.g : Math.round(b.n * L.share), ng = L.mark ? n : 0, nr = Math.round(b.g * L.rng), start = k;
      for (var i = 0; i < n; i++, k++) {
        var o = k * STRIDE;
        data[o] = L.mark ? R() : R() * 2 - 1; data[o + 1] = R(); data[o + 2] = R(); data[o + 3] = li;
        data[o + 4] = R(); data[o + 5] = R(); data[o + 6] = 0.55 + 0.9 * R(); data[o + 7] = L.mark ? 0 : -1;
        if (i < nr) R();
        data[o + 8] = -1; data[o + 9] = -1; data[o + 10] = 0;
      }
      layers.push({ start: start, n: n, ng: ng, mark: !!L.mark });
    });
    S.N = k;
    return { data: data, layers: layers };
  }
  // NM targets: points inside the mark (green > 0.22), the contour and the thin diagonals
  // (green below 0.42) denser so they read (only 30% of the inside is kept: a light dusting).
  // Each star's start in the gather: the contour first, sweeping left to right, then the inside.
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
        d[o + 7] = clamp((edge ? 0 : 0.36) + 0.3 * tx / CROP.w + 0.34 * R(), 0, 1) * (1 - GW);
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
    'uniform vec4 uG;    // presence, trail lag (gather units), trail weight, swirl (rad)',
    'uniform vec4 uSeat; // the sky seats\' turn: cos, sin, shift x, y (css px)',
    'uniform vec4 uL;    // energy gain, max point size (device px), focus depth, blur',
    'uniform vec4 uPal;  // warm lean, 0, 0, 0',
    'varying vec4 vC; varying float vD;',
    WAKE_GLSL,
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
    '  if (aA.w > ' + (MARK_L - 0.5).toFixed(1) + ') {',
    // the NM's stars: a seat in the sky, a curving flight, a place in the mark
    '    float P = uNM.w, A = uG.x, r1 = aB.x, r2 = aB.y;',
    '    if (aT.x < 0.0 || A < 0.0005) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vC = vec4(0.0); vD = 0.0; return; }',
    '    float gn = clamp((P - aB.w) / ' + GW.toFixed(3) + ', 0.0, 1.0);',            // its progress now
    '    float g = clamp((P - uG.y - aB.w) / ' + GW.toFixed(3) + ', 0.0, 1.0);',       // this sample's (a trail looks back)
    '    float e = g * g * (3.0 - 2.0 * g);',
    '    vec2 st = (aA.xy * 1.24 - 0.12) * uV.xy - uPP;',
    '    st = uPP + vec2(st.x * uSeat.x - st.y * uSeat.y, st.x * uSeat.y + st.y * uSeat.x) + uSeat.zw;',
    '    vec2 tg = uNM.xy + (aT.xy - 0.5) * vec2(uNM.z, uNM.z / ' + MARK_AR.toFixed(5) + ');',
    '    tg += vec2(sin(t * 0.63 + r1 * 61.0), cos(t * 0.57 + r2 * 53.0)) * (0.45 + 0.5 * (1.0 - aT.z));',
    '    vec2 dd = mix(st, tg, e) - uNM.xy;',
    '    float th = uG.w * (0.55 + 0.9 * r1) * 4.0 * e * (1.0 - e), cs = cos(th), sn = sin(th);',
    '    vec2 sc = uNM.xy + vec2(dd.x * cs - dd.y * sn, dd.x * sn + dd.y * cs);',
    // the pointer's wake: K_SKY of it in their sky seats (like the catalogue stars), K_MARK in the mark
    '    sc += wake(sc) * mix(' + WK.K_SKY.toFixed(3) + ', ' + WK.K_MARK.toFixed(3) + ', e);',
    // in the sky: a star among stars (a few bright, most faint); in flight: a little brighter;
    // landing: a tiny twinkle; in the mark: as it always was
    '    float seatI = 0.14 * (0.35 + 1.65 * pow(r2, 3.0) + 1.5 * smoothstep(0.93, 1.0, r2)) * A * (0.82 + 0.18 * sin(t * (0.9 + 1.4 * r1) + r2 * 60.0));',
    '    float me = (aT.z > 0.5 ? 0.2 : 0.13) * (0.75 + 0.5 * r2) * (0.85 + 0.15 * sin(t * (1.1 + r1) + r2 * 40.0));',
    '    float fly = sin(3.14159 * g);',
    '    float land = smoothstep(0.78, 0.93, g) * (1.0 - smoothstep(0.93, 1.0, g));',
    '    float I = mix(seatI, me, smoothstep(0.25, 0.95, g)) * (1.0 + 1.6 * fly + 0.8 * land * (0.65 + 0.35 * sin(t * 13.0 + r1 * 70.0)));',
    '    if (uG.z > 0.0) I *= uG.z * clamp(abs(gn - g) * 30.0, 0.0, 1.0);',
    '    vec3 col = mix(mix(mix(WHITE, ICE, 0.55 * r1), CREAM, 0.6 * r2), mix(mix(CREAM, WHITE, r2), ICE, 0.35 * aT.z), e);',
    '    float sd = clamp(0.012 * uV.w / (' + MARK_Z.toFixed(1) + ' + (r1 - 0.5) * 1.6) * (1.0 + 0.3 * fly) * uV.z, 1.0, uL.y);',
    '    vC = vec4(col * I * uL.x * uV.z * uV.z / max(1.0, 0.3 * sd * sd), 0.0); vD = 0.0;',
    '    bool on = I > 0.00005 && sc.x > -4.0 && sc.y > -4.0 && sc.x < uV.x + 4.0 && sc.y < uV.y + 4.0;',
    '    gl_Position = on ? vec4(sc.x / uV.x * 2.0 - 1.0, 1.0 - sc.y / uV.y * 2.0, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);',
    '    gl_PointSize = on ? sd : 0.0;',
    '    return;',
    '  }',
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
    '  float z = max(v.z, 0.05);',
    '  vec2 sc = uPP + vec2(v.x, -v.y) / z * uV.w;',
    // the pointer's wake, in screen space; the nearer the particle, the more it moves
    '  sc += wake(sc) * mix(' + WK.K_FAR.toFixed(3) + ', 1.0, smoothstep(' + WK.FAR.toFixed(1) + ', ' + WK.NEAR.toFixed(1) + ', z));',
    // the space behind the forming mark quiets so the mark reads first
    '  if (uNM.w > 0.0005) {',
    '    vec2 dm = abs(sc - uNM.xy) / vec2(uNM.z * 0.62, uNM.z * 0.36);',
    '    I *= 1.0 - 0.7 * uNM.w * smoothstep(1.3, 0.75, max(dm.x, dm.y));',
    '  }',
    '  float sz = wsz * uV.w / z;',
    '  float coc = uL.w * max(0.0, uL.z / z - 1.0);',
    '  float sd = clamp(sqrt(sz * sz + coc * coc) * uV.z, 1.0, uL.y);',
    '  float nrm = max(1.0, 0.3 * sd * sd);',
    '  vC = vec4(col * I * uL.x * uV.z * uV.z / nrm, 0.0);',
    '  vD = smoothstep(3.0, 7.0, sd);',
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
      part: prog(PART_VS, PART_FS, ['aA', 'aB', 'aT'], ['uC', 'uR', 'uU', 'uF', 'uV', 'uPP', 'uP', 'uNM', 'uG', 'uSeat', 'uL', 'uPal'].concat(wake.uniforms)),
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
  function draw(now) {
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
    var mk = c.mark, on = !!(mk && S.marks), gth = on ? c.gather : 0, pres = on ? c.presence : 0, st = c.seat;
    gl.uniform4f(u.uNM, mk ? mk[0] : -1e4, mk ? mk[1] : -1e4, mk ? mk[2] : 1, gth);
    gl.uniform4f(u.uG, pres, 0, 0, SWIRL);
    gl.uniform4f(u.uSeat, st[0], st[1], st[2], st[3]);
    gl.uniform4f(u.uPal, S.cfg.warm, 0, 0, 0);
    wake.bind(gl, u, now);
    attribsPart();
    var q = S.q, gain = opts.brightness / G.fmt.scale * (S.budget.phone ? 1.35 : 1), ML = null;
    S.layers.forEach(function (L) {
      if (L.mark) { ML = L; if (pres < 0.0005) return; }
      // a lower quality draws a prefix of each layer, a little brighter (the NM's stars: all)
      var n = Math.max(L.ng, Math.round(L.n * q));
      gl.uniform4f(u.uL, gain * L.n / Math.max(1, n), G.maxPt, 9.0, 2.4);
      gl.drawArrays(gl.POINTS, L.start, n);
    });
    // the trails of the NM's stars in flight: the layer again, each pass a moment further back
    // along the flight and fainter (only while the progress moves, so a held pose leaves none)
    var lag = clamp(c.vP * TRAIL_T, -0.08, 0.08);
    if (ML && pres >= 0.0005 && gth > 0 && Math.abs(lag) > 0.0015 && !S.still) {
      gl.uniform4f(u.uL, gain, G.maxPt, 9.0, 2.4);
      for (var k = 1; k <= TRAIL_N; k++) {
        gl.uniform4f(u.uG, pres, lag * k / TRAIL_N, 0.9 * (1 - k / (TRAIL_N + 1)), SWIRL);
        gl.drawArrays(gl.POINTS, ML.start, ML.n);
      }
      gl.uniform4f(u.uG, pres, 0, 0, SWIRL);
    }
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
    // (not while only the pointer's wake runs: a moving cursor also drives other work on the page,
    // like the hero logo, and the wake's own cost is small next to a camera flight)
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
    // display rate while the camera moves or the pointer's wake settles, else ~30 fps
    var busy = CAM.moving || Math.abs(CAM.vg) > 1e-3 || wake.busy(now);
    if (S.still || busy || now - S.lastDraw > 31 || !S.lastDraw || S.force) {
      S.lastDraw = now; S.force = false;
      if (G.ok && !G.lost) draw(now);
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
    if (!go) wake.reset();   // paused (hidden, Space Run) or reduced motion: the stars are at rest
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
    ['brightness', 'glow', 'motion', 'density', 'push'].forEach(function (k) { if (o[k] != null) opts[k] = Math.max(0, +o[k] || 0); });
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
        gather: +CAM.gather.toFixed(3), presence: +CAM.presence.toFixed(3), vP: +CAM.vP.toFixed(3), mark: CAM.mark && CAM.mark.map(Math.round) },
      wake: (function (f) { return { on: wakeOK() && !lbOpen(), segs: wake.segs.length, live: f.n, speed: Math.round(wake.vs), push: opts.push,
        peakPx: +(f.r[3] * f.r[1]).toFixed(2) }; })(frameOf(S.last || undefined)),
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
