/* ── hold the mark ─────────────────────────────────────────────────────────
   The footer easter egg. The point cloud at the bottom of the homepage is the
   NM mark, 15,000 particles that already scatter under the cursor and spring
   home. Click it and the wind gets worse until you realise you are playing.

   The rules, all from one mechanic:
     · every particle is tethered to its home in the mark
     · wind pushes; past a break distance the tether snaps and the particle is
       gone for good, streaming off downwind
     · the cursor is shelter -- inside its ring, no wind
     · a wave every ten seconds: more wind, more gusts, a smaller ring, and a
       new shape to the wind (shifting, crosswind, vortex, chaos)
     · below 40% of the mark, it blows away. Time survived is the score.

   The wind has a front. Only the leading edge -- the particles furthest
   upwind -- takes the full force; everything behind is shielded by them,
   and as the edge is stripped the front moves inward. That is what makes
   it erosion rather than a slide, and it is what makes it a game: the wind
   names one place, the place is small enough to shelter, and it moves.
   Sit in the middle and both ends go. On top of that the blurred edge of
   the SDF flakes a little everywhere, and exposure rises as integrity
   falls, so a mark that has lost its edges loses its core faster. Losing
   accelerates. That is the tension.

   Self-contained on purpose. The cloud itself is three.js inside the site's
   single WebGL canvas, and its particle state lives on the GPU; this does not
   try to reach it. It draws its own mark from the SAME source texture the
   cloud samples (see js/nm-footmark.js, which this shares its sampler with),
   full-viewport over everything, and fades the page to black underneath. No
   bundle patch, nothing touching React or the RSC payload.

   Two doors: clicking the cloud on desktop; a long press on the copyright
   line anywhere, because the cloud is not drawn under 768px and a run shared
   from a phone has to be playable on a phone. A third: #hold in the URL,
   which is what the share card links to. */
(function () {
  'use strict';

  /* ── config ──────────────────────────────────────────────────────────── */
  /* Lead capture. GitHub Pages is static, so the form posts to Formspree:
     make a form there, paste its endpoint here, done. While this is empty
     the form falls back to a pre-filled mailto, which works today with no
     account and still lands the lead in the inbox. */
  var CAPTURE_ENDPOINT = '';
  var MAIL = 'nicomaggioli@gmail.com';
  var SHARE_URL = 'https://nicomaggioli.com/#hold';
  var TEX = '/textures/nm-mark-sdf.png';
  /* bounding box of the mark inside the 512x512 texture -- see nm-footmark */
  var CROP = { x: 57, y: 159, w: 406, h: 202 };
  var ASPECT = CROP.w / CROP.h;

  var WAVE_LEN = 10;                 /* seconds per wave */
  var FAIL_AT = 0.45;                /* integrity that ends the run */
  var DYING_LEN = 1.2;               /* the slow-motion blowout */
  var BASE = 7500;                   /* count the alpha was tuned at */

  /* Waves. w: base wind as a fraction of the force that snaps a tether (so
     the game is the same at every size and pixel ratio -- a gust of 0.8
     breaks the weakest, most exposed particles and nothing else, one of 1.3
     takes every exposed edge), f: gust frequency (Hz), s: shelter radius as
     a fraction of the mark's width, m: the wind's shape. */
  var WAVES = [
    { w: 0.60, f: 0.30, s: 0.30, m: 'steady' },
    { w: 0.70, f: 0.38, s: 0.27, m: 'swing'  },
    { w: 0.80, f: 0.46, s: 0.24, m: 'swing'  },
    { w: 0.90, f: 0.54, s: 0.21, m: 'cross'  },
    { w: 1.00, f: 0.62, s: 0.20, m: 'cross'  },
    { w: 1.10, f: 0.70, s: 0.18, m: 'vortex' },
    { w: 1.20, f: 0.78, s: 0.16, m: 'vortex' },
    { w: 1.30, f: 0.86, s: 0.14, m: 'chaos'  }
  ];
  var NAMES = { steady: 'STEADY', swing: 'SHIFTING', cross: 'CROSSWIND', vortex: 'VORTEX', chaos: 'CHAOS' };
  function waveDef(i) {
    if (i < WAVES.length) return WAVES[i];
    var k = i - WAVES.length + 1;
    return { w: 1.30 + 0.1 * k, f: 0.86 + 0.06 * k, s: Math.max(0.10, 0.14 - 0.01 * k), m: 'chaos' };
  }

  /* It is wind. Nobody who asked for less motion gets a room full of it. */
  var reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (reduce || !window.requestAnimationFrame) return;

  function phone() { try { return matchMedia('(max-width:767px)').matches; } catch (e) { return false; } }
  function coarse() { try { return matchMedia('(hover:none)').matches; } catch (e) { return false; } }

  /* ── state ───────────────────────────────────────────────────────────── */
  var root = null, cv = null, ctx = null, hud = {}, msg = null, card = null;
  var state = 'idle';                /* idle | intro | playing | paused | dying | over */
  var pts = null, N = 0, GAIN = 1, sprite = null, sprR = 0, dpr = 1;
  var mark = { x: 0, y: 0, w: 0, h: 0 };
  var cur = { x: -1e5, y: -1e5, has: false };
  var elapsed = 0, lastT = 0, raf = 0, wave = -1, hudAt = 0, waveTimer = 0;
  var integrity = 1, alive = 0, shelterR = 0;
  var dirA = 0, vortexSign = 1, chaosMode = 'swing', chaosT = 0, focusPt = { x: 0, y: 0 };
  var dyingT = 0, frozen = null, frozenMark = null, result = null, best = 0, newBest = false;
  var img = null, imgOK = false, inerted = [], lastFocus = null, objURL = null;

  try { best = parseFloat(localStorage.getItem('nm-hold-best')) || 0; } catch (e) {}

  /* ── the mark ────────────────────────────────────────────────────────── */
  /* Preloaded now: the same file the WebGL scene samples, so it is usually
     already in cache and the game opens on the first click, not the second. */
  img = new Image();
  img.decoding = 'async';
  img.onload = function () { imgOK = true; };
  img.src = TEX;

  function makeSprite(r) {
    var s = document.createElement('canvas');
    s.width = s.height = r * 2;
    var c = s.getContext('2d');
    var g = c.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.42)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, r * 2, r * 2);
    return s;
  }

  /* Rejection-sample the crop, density following luminance -- and keep the
     luminance, because it IS the exposure: the blurred edge of the SDF is
     where the wind gets in, the bright core is shielded by everything
     around it. */
  function sample(count) {
    var off = document.createElement('canvas');
    off.width = CROP.w; off.height = CROP.h;
    var oc = off.getContext('2d', { willReadFrequently: true });
    oc.drawImage(img, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);
    var data;
    try { data = oc.getImageData(0, 0, CROP.w, CROP.h).data; } catch (e) { return null; }
    var out = [], guard = count * 260;
    while (out.length < count && guard-- > 0) {
      var x = (Math.random() * CROP.w) | 0, y = (Math.random() * CROP.h) | 0;
      var l = data[(y * CROP.w + x) * 4] / 255;
      if (l <= 0.04 || Math.random() > l) continue;
      out.push({
        u: x / CROP.w, v: y / CROP.h,
        x: 0, y: 0, vx: 0, vy: 0, alive: true, a: 1,
        /* standing exposure: how much a particle flakes even when it is NOT
           on the front. The blurred edge of the SDF flakes, the bright core
           barely does. The front itself is computed per frame in step(). */
        e: 0.10 + 0.25 * Math.pow(1 - l, 1.5) + 0.08 * Math.random(),
        pr: 0, la: 0,                                 /* along / across the wind, per frame */
        d: Math.random(),                             /* depth: size + alpha */
        s: Math.random(),                             /* seed: break distance, flutter */
        sz: 0.55 + Math.random() * 0.75,              /* size jitter */
        ph: Math.random() * Math.PI * 2               /* idle drift phase */
      });
    }
    return out.length ? out : null;
  }

  /* ── layout ──────────────────────────────────────────────────────────── */
  function layout() {
    /* clientWidth can read 0 for a frame after mount in a tab that has not
       painted yet (a background tab, a pane opening). A 0x0 canvas draws
       nothing and never recovers on its own, so fall back to the viewport
       and let frame() re-run this the moment a real size exists. */
    var W = root.clientWidth || window.innerWidth, H = root.clientHeight || window.innerHeight;
    if (!W || !H) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var old = { x: mark.x, y: mark.y, w: mark.w, h: mark.h };
    var w = Math.min(W * (phone() ? 0.86 : 0.72), 920) * dpr;
    var h = w / ASPECT;
    if (h > cv.height * 0.56) { h = cv.height * 0.56; w = h * ASPECT; }   /* landscape phones */
    mark.w = w; mark.h = h;
    mark.x = (cv.width - w) / 2;
    mark.y = (cv.height - h) / 2 - cv.height * 0.03;
    sprR = Math.max(3, Math.round((w / 406) * 9));
    sprite = makeSprite(sprR);
    if (pts && old.w) {
      /* a resize mid-run must not read as a gust: carry every particle across
         in mark-relative terms, so a scaled window is the same game */
      for (var i = 0; i < N; i++) {
        var p = pts[i];
        p.x = mark.x + (p.x - old.x) / old.w * mark.w;
        p.y = mark.y + (p.y - old.y) / old.h * mark.h;
      }
    }
    return true;
  }

  function home() {
    for (var i = 0; i < N; i++) {
      var p = pts[i];
      p.x = mark.x + p.u * mark.w; p.y = mark.y + p.v * mark.h;
      p.vx = p.vy = 0; p.alive = true; p.a = 1;
    }
    alive = N; integrity = 1;
    shelterR = waveDef(0).s * mark.w;                /* the ring before the first step */
  }

  /* ── wind ────────────────────────────────────────────────────────────── */
  /* Two overlapping pulses: a broad one and a sharper, faster one. Base wind
     sits at half strength and gusts to 145%, which is what makes a run feel
     like holding on rather than being pushed at a constant rate. */
  function gust(t, f) {
    var a = Math.sin(6.2832 * f * t + 1.3); a = a > 0 ? a * a * a : 0;
    var b = Math.sin(6.2832 * f * 1.71 * t + 4.1); b = b > 0 ? Math.pow(b, 6) : 0;
    return Math.min(1.35, a + 0.5 * b);
  }

  function steer(dt, t, m) {
    var mode = m;
    if (m === 'chaos') {
      chaosT -= dt;
      if (chaosT <= 0) {
        chaosT = 2.5 + Math.random() * 1.5;
        chaosMode = ['swing', 'cross', 'vortex'][(Math.random() * 3) | 0];
      }
      mode = chaosMode;
    }
    var target;
    if (mode === 'steady') target = 0;
    else if (mode === 'swing') target = Math.sin(t * 0.35) * 0.9;
    else if (mode === 'cross') target = (Math.floor(t / 6) % 2) ? 1.5708 : -1.5708;
    else { target = Math.sin(t * 0.5) * 0.6; vortexSign = (Math.floor(t / 8) % 2) ? -1 : 1; }
    /* A crosswind turns slowly, so the front walks round the end of the mark
       from one long edge to the other and can be followed through the turn.
       Snapped in 0.6s it teleported, and the cost of the jump was reaction
       time, not skill. */
    dirA += (target - dirA) * Math.min(1, dt * (mode === 'cross' ? 1.1 : 3.5));
    return mode;
  }

  function smooth(a, b, x) {                       /* 0 at a, 1 at b */
    var u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  }

  /* The front. A 64-bin histogram of every living particle's home along the
     wind axis, walked in from the windward side until 2.5% of them are
     behind the line: that line is the leading edge. Particles within
     `depth` of it take the full wind; everything behind is shielded by them.
     Strip the edge and the line moves inward. That is erosion, and it is
     why this is a game: the wind names a place, the place is small enough
     to shelter, and it moves. Sit in the middle and both ends go. Under a
     vortex the axis is the radius, so it peels from the outside in. */
  var hist = new Int32Array(64);
  function step(dt, t) {
    var wd = waveDef(Math.max(0, wave));
    var mode = steer(dt, t, wd.m);
    var k = 60, c = 9;
    var breakBase = 0.22 * mark.h;
    var snap = k * breakBase;                          /* the force that breaks a mean tether */
    var W0 = wd.w * snap;
    var Wt = W0 * (0.5 + 0.95 * gust(t, wd.f));
    var dx = Math.cos(dirA), dy = Math.sin(dirA);
    var dying = state === 'dying';
    shelterR = wd.s * mark.w;
    var expDyn = (1 - integrity) * 0.8;
    var cx = mark.x + mark.w / 2, cy = mark.y + mark.h / 2;
    var vortex = mode === 'vortex';
    var scale = dying ? 3 : 1;
    var n = 0, i, p, b;

    /* The wind is a beam, not a wall. Along the front there is a focus that
       walks back and forth (under a vortex, an angle that goes round), and
       the front only truly bites near it -- elsewhere it barely flakes. So the place to shelter is always small enough for
       the ring, even when the front is the whole long edge, and finding it
       is the skill: the spot shimmers before it breaks. */
    var px = -dy, py = dx;                                   /* across the wind */
    var extP = Math.abs(dy) * mark.w + Math.abs(dx) * mark.h;
    var foc = Math.sin(t * 0.7 + 2.0) * 0.32 * extP;         /* focus, across */
    var thF = t * 0.5 * vortexSign;                          /* focus angle, vortex */
    var R = 0.5 * Math.sqrt(mark.w * mark.w + mark.h * mark.h);
    var nAlive = 0;
    for (b = 0; b < 64; b++) hist[b] = 0;
    for (i = 0; i < N; i++) {
      p = pts[i];
      if (!p.alive) continue;
      var ux = mark.x + p.u * mark.w - cx, uy = mark.y + p.v * mark.h - cy;
      if (vortex) { p.pr = -Math.sqrt(ux * ux + uy * uy); p.la = Math.atan2(uy, ux); }
      else { p.pr = ux * dx + uy * dy; p.la = ux * px + uy * py; }
      b = ((p.pr + R) / (2 * R) * 64) | 0;
      hist[b < 0 ? 0 : b > 63 ? 63 : b]++;
      nAlive++;
    }
    var acc = 0, fb = 0, need = 0.025 * nAlive + 1;
    for (b = 0; b < 64; b++) { acc += hist[b]; if (acc >= need) { fb = b; break; } }
    var front = -R + (fb / 64) * 2 * R;
    /* how deep the leading edge is. Thin: each gust takes one layer, and a
       layer this thin is a few percent of the mark, so being off the front
       for a second costs a little, not the game */
    var depth = 0.16 * (vortex ? R : Math.abs(dx) * mark.w + Math.abs(dy) * mark.h);
    /* the spot a player sees and covers: the middle of the bite, not its
       leading line */
    var mid = front + depth * 0.5;
    if (vortex) focusPt.x = cx + Math.cos(thF) * -mid, focusPt.y = cy + Math.sin(thF) * -mid;
    else focusPt.x = cx + dx * mid + px * foc, focusPt.y = cy + dy * mid + py * foc;

    for (i = 0; i < N; i++) {
      p = pts[i];
      if (!p.alive) {
        if (p.a <= 0) continue;
        p.a -= dt / 0.7;
        p.vx += dx * Wt * 0.6 * dt; p.vy += dy * Wt * 0.6 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        continue;
      }
      var hx = mark.x + p.u * mark.w, hy = mark.y + p.v * mark.h;
      var fr = dying ? 1 : 1 - smooth(0, depth, p.pr - front);
      var wnd;
      /* the bite is a fixed fraction of the mark, whatever the wind's angle:
         sized to the ring, so it can always be covered by a player who is
         where it is -- not to the front's length, which for a diagonal wind
         is wider than the mark and would make the spot uncoverable */
      if (vortex) { var da = Math.abs(((p.la - thF + Math.PI) % 6.2832 + 6.2832) % 6.2832 - Math.PI); wnd = 1 - smooth(0.35, 0.8, da); }
      else wnd = 1 - smooth(0.12 * mark.w, 0.26 * mark.w, Math.abs(p.la - foc));
      wnd = dying ? 1 : 0.10 + 0.90 * wnd;
      var ex = Math.min(1.8, p.e + fr * wnd * (0.9 + 0.3 * p.s) + expDyn);
      var sh = 1;
      if (!dying && cur.has) {
        var ddx = p.x - cur.x, ddy = p.y - cur.y;
        sh = smooth(shelterR * 0.7, shelterR, Math.sqrt(ddx * ddx + ddy * ddy));
      }
      var wx = dx * Wt, wy = dy * Wt;
      if (vortex) {
        var rx = p.x - cx, ry = p.y - cy, rl = Math.sqrt(rx * rx + ry * ry) || 1;
        wx = wx * 0.5 + (-ry / rl) * Wt * 0.9 * vortexSign;
        wy = wy * 0.5 + (rx / rl) * Wt * 0.9 * vortexSign;
      }
      var fl = Math.sin(t * 7 + p.s * 50) * W0 * 0.12 * (0.3 + 0.7 * fr * wnd);   /* flutter: the attacked spot shimmers */
      wx += -dy * fl; wy += dx * fl;
      var g = ex * sh * scale;
      p.vx += (k * (hx - p.x) - c * p.vx + wx * g) * dt;
      p.vy += (k * (hy - p.y) - c * p.vy + wy * g) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      var ox = p.x - hx, oy = p.y - hy;
      var br = breakBase * (0.65 + 0.7 * p.s);
      if (ox * ox + oy * oy > br * br) { p.alive = false; p.a = 1; continue; }
      n++;
    }
    alive = n; integrity = n / N;
  }

  /* ── draw ────────────────────────────────────────────────────────────── */
  function draw(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'lighter';
    var idle = state === 'intro' || state === 'idle';
    for (var i = 0; i < N; i++) {
      var p = pts[i], a = (0.022 + p.d * 0.030) * GAIN;
      if (!p.alive) { if (p.a <= 0) continue; a *= p.a; }
      var r = sprR * p.sz * (0.62 + p.d * 0.72), x = p.x, y = p.y;
      if (idle) {
        var wob = Math.sin(t * 0.55 + p.ph) * 0.010 + Math.sin(t * 0.31 + p.ph * 1.7) * 0.006;
        x += wob * mark.w; y += wob * 0.7 * mark.h;
      }
      ctx.globalAlpha = a;
      ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (cur.has && (state === 'playing' || state === 'intro' || state === 'paused')) ring();
  }

  /* the shelter: a hairline ring at the current radius, a soft fill so its
     edge reads, and a dot for the cursor itself (the real one is hidden) */
  function ring() {
    var R = shelterR || waveDef(0).s * mark.w;
    var g = ctx.createRadialGradient(cur.x, cur.y, R * 0.7, cur.x, cur.y, R);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cur.x, cur.y, R, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = dpr;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cur.x, cur.y, 2.5 * dpr, 0, 6.2832); ctx.fill();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - lastT) / 1000) || 0;
    lastT = now;
    var t = now / 1000;
    /* not on cv.width: a fresh canvas is 300x150 before anyone sizes it */
    if (!sprite) { if (!layout()) return; home(); }
    if (state === 'playing') {
      elapsed += dt;
      var w = Math.floor(elapsed / WAVE_LEN);
      if (w !== wave) { wave = w; announce(); }
      step(dt, elapsed);
      if (integrity < FAIL_AT) fail();
      if (now - hudAt > 100) { hudAt = now; hudTick(); }
    } else if (state === 'dying') {
      dyingT += dt;
      step(dt * 0.45, elapsed + dyingT);
      if (dyingT >= DYING_LEN) over();
    }
    draw(t);
  }

  /* ── HUD ─────────────────────────────────────────────────────────────── */
  function fmt(s) {
    var m = Math.floor(s / 60), r = s - m * 60;
    return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
  }
  function hudTick() {
    hud.time.textContent = fmt(elapsed);
    hud.int.textContent = Math.round(integrity * 100) + '%';
  }
  function announce() {
    var wd = waveDef(wave);
    hud.wave.textContent = 'WAVE ' + (wave < 9 ? '0' : '') + (wave + 1) + ' · ' + NAMES[wd.m];
    hud.wave.classList.add('is-on');
    clearTimeout(waveTimer);
    waveTimer = setTimeout(function () { hud.wave.classList.remove('is-on'); }, 2200);
  }

  function showMsg(h2, lines) {
    msg.innerHTML = '';
    var t = document.createElement('h2'); t.textContent = h2; msg.appendChild(t);
    var l = document.createElement('div'); l.className = 'nm-hold-lbl'; l.innerHTML = lines; msg.appendChild(l);
    msg.classList.add('is-on');
  }
  function hideMsg() { msg.classList.remove('is-on'); }

  /* ── run ─────────────────────────────────────────────────────────────── */
  function intro() {
    state = 'intro';
    home();
    hud.time.textContent = '0:00.0'; hud.int.textContent = '100%';
    hud.wave.classList.remove('is-on');
    if (card) { card.classList.remove('is-on'); setTimeout(function () { if (card && state !== 'over') { card.remove(); card = null; } }, 360); }
    showMsg('Hold the mark.',
      coarse() ? 'The wind is coming. <b>Your finger is shelter.</b><br>Tap to begin.'
               : 'The wind is coming. <b>Your cursor is shelter.</b><br>Click to begin.');
  }
  function start() {
    home();
    elapsed = 0; wave = -1; dirA = 0; chaosT = 0; hudAt = 0; newBest = false;
    frozen = null; result = null;
    hideMsg();
    state = 'playing';
    lastT = performance.now();
    if (!raf) raf = requestAnimationFrame(frame);        /* Again, after over() parked the loop */
  }
  function fail() {
    state = 'dying'; dyingT = 0;
    /* the moment it broke, before the blowout -- this is the share card */
    frozen = pts.map(function (p) { return { x: p.x, y: p.y, alive: p.alive, a: p.a, d: p.d, sz: p.sz }; });
    frozenMark = { x: mark.x, y: mark.y, w: mark.w, h: mark.h };
    result = { time: elapsed, held: integrity, wave: wave + 1 };
    hud.wave.classList.remove('is-on');
    if (elapsed > best) { best = elapsed; newBest = true; try { localStorage.setItem('nm-hold-best', String(best)); } catch (e) {} }
  }
  function over() {
    state = 'over';
    /* the picture under the card is static now: draw it once and stop the
       loop rather than redrawing 6,000 sprites a frame behind a dialog */
    draw(performance.now() / 1000);
    cancelAnimationFrame(raf); raf = 0;
    buildCard();
  }
  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    showMsg('Paused.', coarse() ? 'Tap to resume · <b>Leave</b> is top right' : 'Click to resume · <b>Esc</b> to leave');
  }
  function resume() { if (state !== 'paused') return; hideMsg(); state = 'playing'; lastT = performance.now(); }

  /* ── the card ────────────────────────────────────────────────────────── */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function buildCard() {
    if (card) card.remove();
    card = el('div', 'nm-hold-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Your run');
    var pct = Math.round(result.held * 100);

    card.appendChild(el('span', 'nm-hold-lbl', 'Hold the mark'));
    card.appendChild(el('h2', null, fmt(result.time)));
    var sub = el('p', 'nm-hold-sub');
    sub.innerHTML = 'You held <b>' + pct + '%</b> of the mark into <b>wave ' + result.wave + '</b>.';
    card.appendChild(sub);
    var b = el('span', 'nm-hold-lbl nm-hold-best' + (newBest ? ' is-new' : ''),
      newBest ? 'New best' : 'Best ' + fmt(best));
    card.appendChild(b);

    var row = el('div', 'nm-hold-row');
    var again = el('button', 'nm-hold-btn pri', 'Again'); again.type = 'button';
    var share = el('button', 'nm-hold-btn', 'Share'); share.type = 'button';
    var leave = el('button', 'nm-hold-btn', 'Close'); leave.type = 'button';
    again.addEventListener('click', function () { intro(); start(); });
    share.addEventListener('click', function () { doShare(share); });
    leave.addEventListener('click', close);
    row.appendChild(again); row.appendChild(share); row.appendChild(leave);
    card.appendChild(row);

    var fb = el('div', 'nm-hold-share'); fb.id = 'nm-hold-share';
    card.appendChild(fb);

    card.appendChild(buildAsk());
    root.appendChild(card);
    requestAnimationFrame(function () { card.classList.add('is-on'); again.focus(); });
  }

  /* The ask sits under the result, not in front of it. Gating the share on an
     email would kill the share, and the share is what brings the next person
     here. So: the run first, the offer second, and the offer is the thing the
     game was quietly about the whole time. */
  function buildAsk() {
    var ask = el('div', 'nm-hold-ask');
    ask.appendChild(el('span', 'nm-hold-lbl', 'From the sketch, to the shelf'));
    ask.appendChild(el('h3', null, 'Brands erode. Yours doesn’t have to.'));
    ask.appendChild(el('p', null, 'I build identities and products that hold. If you’ve got one in mind, leave an email and I’ll tell you what I’d do with it.'));

    var form = el('form', 'nm-hold-form'); form.noValidate = true;
    var email = el('input'); email.type = 'email'; email.name = 'email'; email.required = true;
    email.placeholder = 'you@…'; email.autocomplete = 'email'; email.setAttribute('aria-label', 'Email');
    var tel = el('input'); tel.type = 'tel'; tel.name = 'phone';
    tel.placeholder = 'Or a number, and I’ll text'; tel.autocomplete = 'tel'; tel.setAttribute('aria-label', 'Phone, optional');
    var send = el('button', 'nm-hold-btn', 'Send'); send.type = 'submit';
    var ok = el('div', 'nm-hold-ok'), err = el('div', 'nm-hold-err');
    ok.setAttribute('role', 'status'); ok.tabIndex = -1;
    err.setAttribute('role', 'alert');
    form.appendChild(email); form.appendChild(tel); form.appendChild(send);
    form.appendChild(ok); form.appendChild(err);
    ask.appendChild(form);
    ask.appendChild(el('p', 'nm-hold-fine', 'No list. No tracking. One reply, from me.'));

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      err.classList.remove('is-on');
      var e = email.value.trim(), t = tel.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { err.textContent = 'That email doesn’t look right.'; err.classList.add('is-on'); email.focus(); return; }
      var pct = Math.round(result.held * 100);
      var summary = 'Held ' + pct + '% for ' + fmt(result.time) + ', wave ' + result.wave;
      if (!CAPTURE_ENDPOINT) {
        /* no endpoint yet: the mail app, pre-filled -- the lead still arrives */
        var body = 'Email: ' + e + (t ? '\nPhone: ' + t : '') + '\n\n' + summary + '.\n\nI have something in mind:\n\n';
        location.href = 'mailto:' + MAIL + '?subject=' + encodeURIComponent('Hold the mark · ' + fmt(result.time)) + '&body=' + encodeURIComponent(body);
        ok.textContent = 'Your mail app should be open with a note ready. Hit send and it’s done.';
        ok.classList.add('is-on');
        return;
      }
      send.disabled = true; send.textContent = 'Sending…';
      fetch(CAPTURE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email: e, phone: t, run: summary, page: location.href, _subject: 'Hold the mark · ' + e })
      }).then(function (r) {
        if (!r.ok) throw new Error('bad status');
        ok.textContent = 'Got it. I’ll reply once, from me.';
        ok.classList.add('is-on');
        ok.focus();                                  /* before the control that had focus goes */
        form.querySelectorAll('input,button').forEach(function (n) { n.hidden = true; });
      }).catch(function () {
        send.disabled = false; send.textContent = 'Send';
        err.innerHTML = 'Didn’t send. Email me directly: <a href="mailto:' + MAIL + '" style="color:#fff">' + MAIL + '</a>';
        err.classList.add('is-on');
      });
    });
    return ask;
  }

  /* ── share ───────────────────────────────────────────────────────────── */
  /* The frozen mark, drawn at card size. Every run breaks differently, so
     every card is a different picture -- that is the reason to send it. */
  function cardBlob() {
    var c = document.createElement('canvas');
    c.width = 1200; c.height = 630;
    var x = c.getContext('2d');
    x.fillStyle = '#0a0a0a'; x.fillRect(0, 0, 1200, 630);

    var bw = 720, bh = bw / ASPECT, ox = (1200 - bw) / 2, oy = 92 + ((440 - 92) - bh) / 2;
    var sp = makeSprite(Math.round((bw / 406) * 9)), sr = sp.width / 2;
    var fm = frozenMark;
    x.globalCompositeOperation = 'lighter';
    for (var i = 0; i < frozen.length; i++) {
      var p = frozen[i];
      if (!p.alive && p.a <= 0) continue;
      var px = ox + (p.x - fm.x) / fm.w * bw, py = oy + (p.y - fm.y) / fm.h * bh;
      var r = sr * p.sz * (0.62 + p.d * 0.72);
      x.globalAlpha = (0.022 + p.d * 0.030) * GAIN * (p.alive ? 1 : p.a);
      x.drawImage(sp, px - r, py - r, r * 2, r * 2);
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';

    var mono = '500 17px "Geist Mono", ui-monospace, monospace';
    try { x.letterSpacing = '0.14em'; } catch (e) {}
    x.fillStyle = '#FF7820'; x.beginPath(); x.arc(64, 62, 6, 0, 6.2832); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.62)'; x.font = mono; x.textBaseline = 'middle';
    x.fillText('HOLD THE MARK', 84, 62);
    x.textAlign = 'right';
    x.fillText('NICOMAGGIOLI.COM/#HOLD', 1140, 62);

    x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    try { x.letterSpacing = '-0.02em'; } catch (e) {}
    x.fillStyle = '#fff'; x.font = '700 92px Geist, system-ui, sans-serif';
    x.fillText(fmt(result.time), 58, 560);
    try { x.letterSpacing = '0.14em'; } catch (e) {}
    x.fillStyle = 'rgba(255,255,255,0.62)'; x.font = mono;
    x.fillText('HELD ' + Math.round(result.held * 100) + '% · WAVE ' + result.wave, 64, 592);
    x.textAlign = 'right';
    x.fillText('YOUR TURN', 1140, 592);

    return new Promise(function (res, rej) {
      c.toBlob(function (b) { b ? res(b) : rej(new Error('toBlob')); }, 'image/png');
    });
  }

  function doShare(btn) {
    btn.disabled = true;
    var ready = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('700 92px Geist'), document.fonts.load('500 17px "Geist Mono"')]).catch(function () {})
      : Promise.resolve();
    ready.then(cardBlob).then(function (blob) {
      var text = 'I held the mark for ' + fmt(result.time) + '. Your turn.';
      var file = null;
      try { file = new File([blob], 'hold-the-mark.png', { type: 'image/png' }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: 'Hold the mark', text: text, url: SHARE_URL })
          .catch(function (e) { if (e && e.name !== 'AbortError') fallback(blob, text); });
      }
      fallback(blob, text);
    }).catch(function () {
      fallback(null, 'I held the mark for ' + fmt(result.time) + '. Your turn.');
    }).then(function () { btn.disabled = false; });
  }

  /* No share sheet (desktop, mostly): the image itself, save-able, and the
     link on the clipboard. Real downloads, because this is the site and not a
     sandbox. */
  function fallback(blob, text) {
    var box = document.getElementById('nm-hold-share');
    if (!box) return;
    box.innerHTML = '';
    if (objURL) { URL.revokeObjectURL(objURL); objURL = null; }
    if (blob) {
      objURL = URL.createObjectURL(blob);
      var im = el('img'); im.src = objURL; im.alt = 'Your eroded mark, ' + fmt(result.time);
      box.appendChild(im);
    }
    var row = el('div', 'nm-hold-row'); row.style.marginTop = '10px';
    if (blob) {
      var save = el('a', 'nm-hold-btn', 'Save image'); save.href = objURL; save.download = 'hold-the-mark.png';
      row.appendChild(save);
    }
    var copy = el('button', 'nm-hold-btn', 'Copy link'); copy.type = 'button';
    copy.addEventListener('click', function () {
      var s = text + ' ' + SHARE_URL;
      var done = function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy link'; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(done, done);
      else done();
    });
    row.appendChild(copy);
    box.appendChild(row);
    box.classList.add('is-on');
  }

  /* ── open / close ────────────────────────────────────────────────────── */
  function build() {
    root = el('div', 'nm-hold');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Hold the mark');
    root.tabIndex = -1;
    cv = el('canvas'); root.appendChild(cv);
    ctx = cv.getContext('2d');
    var h = el('div', 'nm-hold-hud');
    hud.time = el('span', 'nm-hold-lbl nm-hold-time', '0:00.0');
    hud.int = el('span', 'nm-hold-lbl nm-hold-int', '100%');
    hud.wave = el('span', 'nm-hold-lbl nm-hold-wave', '');
    /* a real control, not a hint: on a phone there is no Escape key, and
       until now there was no way out of the game before losing it */
    hud.leave = el('button', 'nm-hold-btn nm-hold-leave', 'Leave');
    hud.leave.type = 'button'; hud.leave.title = 'Esc';
    hud.leave.addEventListener('click', close);
    h.appendChild(hud.time); h.appendChild(hud.int); h.appendChild(hud.wave); h.appendChild(hud.leave);
    root.appendChild(h);
    msg = el('div', 'nm-hold-msg'); root.appendChild(msg);

    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('wheel', block, { passive: false });
    root.addEventListener('touchmove', block, { passive: false });
  }
  /* Wheel and touch are sealed so Lenis never sees them -- except from
     inside the card, which is the one thing here that scrolls (the form is
     below its fold on small and landscape phones). Stopping propagation is
     enough to keep the page still; cancelling would kill the card's own
     scroll and put the lead form out of reach. */
  function block(e) {
    e.stopPropagation();
    if (e.target.closest && e.target.closest('.nm-hold-card')) return;
    e.preventDefault();
  }
  function onMove(e) {
    if (e.target.closest && e.target.closest('.nm-hold-card, .nm-hold-leave')) { cur.has = false; return; }
    var r = root.getBoundingClientRect();
    cur.x = (e.clientX - r.left) * dpr; cur.y = (e.clientY - r.top) * dpr; cur.has = true;
  }
  function onDown(e) {
    if (e.target.closest && e.target.closest('.nm-hold-card, .nm-hold-leave')) return;
    onMove(e);
    if (state === 'intro') start();
    else if (state === 'paused') resume();
  }
  function onKey(e) {
    if (!root) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    var inCard = e.target && e.target.closest && e.target.closest('.nm-hold-card');
    /* the keys that scroll a document: the page under the overlay is not to move */
    if (!inCard && /^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End)$/.test(e.key)) { e.preventDefault(); return; }
    var tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|BUTTON|A/.test(tag)) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (state === 'intro') start();
      else if (state === 'paused') resume();
      else if (state === 'over') { intro(); start(); }
    }
  }
  function onHide() { if (document.hidden) pause(); }
  function onResize() {
    if (!root) return;
    /* layout() resets cv.width, which blanks the canvas; with the loop parked
       under the card nothing else would paint it again */
    if (layout() && !raf) draw(performance.now() / 1000);
  }

  function open() {
    if (root) return;
    if (!imgOK) { img.onload = function () { imgOK = true; open(); }; return; }
    build();
    document.body.appendChild(root);
    lastFocus = document.activeElement;
    inerted = [].slice.call(document.body.children).filter(function (n) { return n !== root && !n.inert; });
    inerted.forEach(function (n) { n.inert = true; });
    root.focus({ preventScroll: true });
    document.documentElement.classList.add('nm-hold-open');

    N = phone() ? 3000 : 6000;
    GAIN = BASE / N;
    if (!pts || pts.length !== N) pts = sample(N);
    if (!pts) { close(); return; }
    layout();
    intro();
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
    requestAnimationFrame(function () { if (root) root.classList.add('is-in'); });

    document.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('blur', pause);
    window.addEventListener('resize', onResize);
  }

  function close() {
    if (!root) return;
    cancelAnimationFrame(raf); raf = 0;
    clearTimeout(waveTimer);
    state = 'idle';
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('blur', pause);
    window.removeEventListener('resize', onResize);
    inerted.forEach(function (n) { n.inert = false; }); inerted = [];
    document.documentElement.classList.remove('nm-hold-open');
    if (objURL) { URL.revokeObjectURL(objURL); objURL = null; }
    var r = root, c = cv; root = null; card = null;
    r.classList.remove('is-in');
    setTimeout(function () {
      if (r.parentNode) r.parentNode.removeChild(r);
      /* release the full-viewport backing store; open() rebuilds all of it */
      c.width = c.height = 0;
      if (cv === c) { cv = null; ctx = null; sprite = null; }
      frozen = null; frozenMark = null;
    }, 380);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
    lastFocus = null;
    if (location.hash === '#hold') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
  }

  /* ── doors ───────────────────────────────────────────────────────────── */
  function footer() { return document.querySelector('section.h-lvh.relative'); }

  /* The cloud is WebGL: there is no element to click. A click "on the cloud"
     is a press and release, without travel, in the middle of the footer
     section while it is on screen -- and not on any of its links. Listened
     for at document level in the capture phase, so it works whichever of the
     canvas or the section the browser hands the event to, and the footer's
     own horizontal drag is left alone (a drag travels; this does not). */
  var down = null;
  document.addEventListener('pointerdown', function (e) {
    down = null;
    if (root || e.button !== 0 || phone()) return;
    if (e.target.closest && e.target.closest('a,button,input,textarea,select,[role="button"],.text-footer-tagline,footer')) return;
    var s = footer(); if (!s) return;
    var r = s.getBoundingClientRect();
    if (r.top > innerHeight * 0.5 || r.bottom < innerHeight * 0.5) return;
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (Math.abs(e.clientX - cx) > r.width * 0.36 || Math.abs(e.clientY - cy) > r.height * 0.32) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  }, true);
  document.addEventListener('pointerup', function (e) {
    if (!down) return;
    var d = down; down = null;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && performance.now() - d.t < 450) open();
  }, true);

  /* The copyright line: a long press, anywhere. Delegated, so a React
     re-render of the footer cannot lose the binding. */
  var press = 0;
  function isDoor(t) {
    var p = t && t.closest && t.closest('footer p');
    return p && /©/.test(p.textContent) ? p : null;
  }
  document.addEventListener('pointerdown', function (e) {
    var p = isDoor(e.target);
    if (!p || root) return;
    p.classList.add('nm-hold-door');
    clearTimeout(press);
    press = setTimeout(function () { press = 0; open(); }, 650);
  }, true);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    document.addEventListener(ev, function () { if (press) { clearTimeout(press); press = 0; } }, true);
  });
  document.addEventListener('contextmenu', function (e) { if (press && isDoor(e.target)) e.preventDefault(); }, true);

  /* #hold: what the share card links to. Waits for the site's own reveal
     (the wordmark landing, the same signal nm-coord waits on) so the game
     does not open over the preloader, and parks the page on the footer so
     closing lands on the cloud. */
  function revealed() {
    var h = document.querySelector('header');
    var wm = h && h.querySelector('a[href="/"], .wordmark');
    return !wm || parseFloat(getComputedStyle(wm).opacity) >= 1;
  }
  /* The export ships the wordmark at opacity:1 and React then hides it and
     reveals it again at ~1.5s, so "opacity is 1" at load means nothing --
     it has to have been seen at 0 first. And the footer is only somewhere to
     park once the page has laid out below the fold. Ten seconds is the
     ceiling; past it, open anyway. */
  function viaHash() {
    if (location.hash !== '#hold' || root) return;
    var tries = 0, seenHidden = false;
    (function wait() {
      var r = revealed();
      if (!r) seenHidden = true;
      var s = footer();
      var laidOut = !!s && s.getBoundingClientRect().top + window.scrollY > window.innerHeight;
      if ((seenHidden && r && laidOut) || tries++ > 100) {
        if (s) {
          try {
            if (window.lenis && window.lenis.scrollTo) window.lenis.scrollTo(s.offsetTop, { immediate: true });
            else window.scrollTo(0, s.offsetTop);
          } catch (e) {}
        }
        setTimeout(open, 250);
      } else setTimeout(wait, 100);
    })();
  }
  if (document.readyState === 'complete') viaHash();
  else window.addEventListener('load', viaHash);
  window.addEventListener('hashchange', viaHash);

  window.__nmHold = {
    open: open, close: close,
    /* read-only, for tuning runs and for anyone curious in the console */
    state: function () {
      return { state: state, elapsed: elapsed, wave: wave + 1, integrity: integrity, dir: dirA,
               focus: { x: focusPt.x / dpr, y: focusPt.y / dpr },
               mark: root ? { x: mark.x / dpr, y: mark.y / dpr, w: mark.w / dpr, h: mark.h / dpr } : null };
    }
  };
})();
