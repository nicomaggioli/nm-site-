/* Hero lava interaction. Swipe quickly through the NM (or click or tap it) and
   the round end you cut oozes away slowly; at most two are away at once. It pulls out on a strand of wax
   that stretches, thins, beads up and snaps; the piece drifts as its own
   lumpy blob, then oozes back, the strand finds it again and it melts into
   place. A small blob squeezes out where the cut leaves. An ordinary, slower
   pass never cuts: a small drop buds off after the pointer instead, and drops
   bud off the ends now and then on their own.

   This file only simulates. The hero shader in nm-home-* calls
   window.__nmLava.step(frame) every frame and copies the packed arrays into
   its uniforms (uBubbles, uCuts, uCutW, uBites, uNecks, uNeckW, uFxBox, uFxN). Everything lives
   in the shader's pre-lava shapeUv space (x right, y down; the 512px mark
   texture spans 0..1), so cuts land exactly under the pointer.

   Off entirely under prefers-reduced-motion and during the opening; effects
   fade with hero scroll like the lava drift. Listeners are passive and never
   block scrolling. The cursor is left alone. */
(function () {
  'use strict';
  if (window.__nmLava) return;

  var MAXB = 16, MAXC = 4, MAXI = 8, MAXN = 8;
  var blobs = [], cuts = [], bites = [];
  var outB = new Float32Array(MAXB * 4), outC = new Float32Array(MAXC * 4), outW = new Float32Array(MAXC), outI = new Float32Array(MAXI * 4);
  var outK = new Float32Array(MAXN * 4), outKW = new Float32Array(MAXN), outBox = new Float32Array(4), outN = new Float32Array(4);
  // How far each piece has drifted from home, in canvas uv (the shader shifts its slice of the
  // collage snapshot by this, so a piece carries its own picture instead of sliding over others).
  var outO = new Float32Array(MAXB * 4), outKO = new Float32Array(MAXN * 4);
  var snap = null, snapCtx = null, snapV = 0, snapOn = 0, snapKey = '', hadPieces = false;
  var still = matchMedia('(prefers-reduced-motion:reduce)');
  var frame = null;               // latest mapping parameters from the shader
  var sdf = null, SDFN = 512;     // green channel of the mark texture
  var now = 0;                    // shader clock (s)
  var nextAmbient = 5 + Math.random() * 3, slowFrames = 0;
  var demo = { pending: false, at: -1 };
  var ptr = { id: -1, has: false, x: 0, y: 0, t: 0, inside: false, entry: null, entryT: 0, type: 'mouse', downX: 0, downY: 0, downT: 0, moved: 0 };
  var crossings = [];             // recent stroke crossings [chord, speed, cut] (diagnostics)
  var rect = { left: 0, top: 0, width: 1, height: 1 }, rectAt = -1;

  /* ---------- the mark texture on the CPU (for hit tests) ---------- */
  (function load() {
    var img = new Image();
    img.onload = function () {
      try {
        var c = document.createElement('canvas'); c.width = c.height = SDFN;
        var x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, SDFN, SDFN);
        var d = x.getImageData(0, 0, SDFN, SDFN).data, g = new Float32Array(SDFN * SDFN);
        for (var i = 0; i < g.length; i++) g[i] = d[i * 4 + 1] / 255;
        sdf = g;
      } catch (e) { sdf = null; }
    };
    img.src = '/textures/nm-mark-sdf.png';
  })();
  function tex(u, v) {
    if (!sdf || u <= 0 || v <= 0 || u >= 1 || v >= 1) return 0;
    var fx = u * SDFN - .5, fy = v * SDFN - .5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    function at(x, y) { x = Math.max(0, Math.min(SDFN - 1, x)); y = Math.max(0, Math.min(SDFN - 1, y)); return sdf[y * SDFN + x]; }
    return (at(x0, y0) * (1 - ax) + at(x0 + 1, y0) * ax) * (1 - ay) + (at(x0, y0 + 1) * (1 - ax) + at(x0 + 1, y0 + 1) * ax) * ay;
  }

  /* ---------- the shader's lava drift, mirrored (same sin-free noise) ---------- */
  function fract(x) { return x - Math.floor(x); }
  function lhash(px, py) {
    var a = fract(px * .1031), b = fract(py * .1031), c = fract(px * .1031);
    var dd = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
    a += dd; b += dd; c += dd;
    return fract((a + b) * c);
  }
  function lnoise(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    var a = lhash(ix, iy), b = lhash(ix + 1, iy), c = lhash(ix, iy + 1), d = lhash(ix + 1, iy + 1);
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return a + (b - a) * ux + (c - a) * uy * (1 - ux) + (d - b) * ux * uy;
  }
  function near(u, v) { return u > .04 && u < .97 && v > .24 && v < .77; }
  // The mark's field at a pre-lava shapeUv point, as the shader computes it.
  function field(u, v) {
    var amt = frame ? frame.lava : 0, t = now * .13, su = u, sv = v;
    if (amt > 0 && near(u, v)) {
      var qx = u * 2.4, qy = v * 2.4;
      var wx = lnoise(qx + t, qy - .7 * t) - .5, wy = lnoise(qx - .8 * t + 4.7, qy + t + 4.7) - .5;
      var rx = lnoise(u * 6.5 - 1.3 * t + 2.3, v * 6.5 + .9 * t + 2.3) - .5, ry = lnoise(u * 6.5 + 1.1 * t + 7.9, v * 6.5 + 1.4 * t + 7.9) - .5;
      su += (wx * .07 + rx * .018) * amt; sv += (wy * .07 + ry * .018) * amt;
    }
    var s = .5 - tex(su, sv);
    if (amt > 0 && near(u, v)) s += (.04 - lnoise(su * 3.3 + .6 * t + 9.1, sv * 3.3 + .9 * t + 9.1) * .16) * amt;
    return s;
  }
  var VIS = .24;                  // the visible edge level of the soft hero mask
  function inside(u, v) { return field(u, v) < VIS; }

  /* ---------- screen -> shapeUv, mirroring the hero shader ---------- */
  function canvasRect() {
    if (rectAt === now) return rect;
    rectAt = now;
    var c = document.querySelector('#global-canvas canvas');
    if (c) { var r = c.getBoundingClientRect(); if (r.width > 0 && r.height > 0) rect = r; }
    else rect = { left: 0, top: 0, width: innerWidth, height: innerHeight };
    return rect;
  }
  function toShape(clientX, clientY) {
    if (!frame) return null;
    var r = canvasRect();
    // the hero mesh moves toward the camera as the page scrolls: undo that zoom
    var z = 1 - frame.scroll;
    var vx = .5 + ((clientX - r.left) / r.width - .5) * z, vy = .5 + ((1 - (clientY - r.top) / r.height) - .5) * z;
    var s = frame.uvScale - frame.pulse;
    var x = (vx - .5) * s + .5, y = (vy - .5) * s + .5;
    var bx = x - .5, by = y - .5, k = 1 + (-frame.zpos * frame.barrel) * (bx * bx + by * by);
    x = .5 + k * bx; y = .5 + k * by;
    var mr = frame.meshX / frame.meshY;
    if (mr > 1) x = (x - .5) * mr + .5; else y = (y - .5) / mr + .5;
    var u = x, v = 1 - y;
    var rr = frame.resX / frame.resY;
    if (rr < 1) v += (1 - frame.scroll) * (1 - rr) * .3;
    return [u, v];
  }

  /* ---------- the pieces ---------- */
  /* The eight round ends of the NM's four uprights (texture units, measured
     from nm-mark-sdf.png at the visible level). A cut across an upright lets
     the end on that side ooze away as its own blob. */
  var BULBS = [[.186, .387], [.186, .627], [.400, .387], [.398, .623], [.615, .385], [.615, .592], [.828, .387], [.828, .629]];
  var BULB_R = .062, BITE_R = .15, away = {};
  function remove(i) {
    var o = blobs.splice(i, 1)[0];
    if (o && o.kind === 'bulb' && away[o.bulb] === o) delete away[o.bulb];
    return o;
  }
  function blob(o) {
    if (blobs.length >= MAXB) {
      // make room: never a leaving end while it is away; drop the oldest small blob
      var k = -1; for (var i = 0; i < blobs.length; i++) if (blobs[i].kind !== 'bulb') { k = i; break; }
      if (k < 0) return null;
      remove(k);
    }
    o.age = 0; o.r0 = o.r; o.merging = -1; o.seed = Math.random() * 100; o.k = o.k || .15; o.dist = 0; o.nw = 0;
    blobs.push(o); return o;
  }
  function addCut(ax, ay, bx, by, w) {
    if (cuts.length >= MAXC) cuts.shift();
    cuts.push({ ax: ax, ay: ay, bx: bx, by: by, w0: w, age: 0 });
  }
  function visualBulb(i) {
    // where the lava drift currently shows this bulb: the deepest point nearby
    var b = BULBS[i], best = [b[0], b[1]], bv = 1e9;
    for (var dy = -.04; dy <= .0401; dy += .01) for (var dx = -.04; dx <= .0401; dx += .01) {
      var f = field(b[0] + dx, b[1] + dy); if (f < bv) { bv = f; best = [b[0] + dx, b[1] + dy]; }
    }
    return best;
  }
  var MAX_AWAY = 2;               // the mark always stays readable
  var strikeUntil = -1;           // a shooting star may send all four ends away at once
  function detach(i, dirx, diry) {
    var cap = now < strikeUntil ? 4 : MAX_AWAY;
    if (away[i] || !sdf || bites.length >= MAXI || Object.keys(away).length >= cap) return false;
    var c = visualBulb(i), top = (i % 2) === 0;
    // mostly away from the stroke (up for a top end, down for a bottom end), a little with the cut
    var ox = dirx * .3, oy = (top ? -1 : 1) * .9 + diry * .2, ol = Math.hypot(ox, oy) || 1;
    var b = blob({ kind: 'bulb', bulb: i, top: top, x: c[0], y: c[1], hx: c[0], hy: c[1], r: BULB_R * .95, dx: ox / ol, dy: oy / ol, k: .3, joined: 1, broke: false, beaded: false });
    if (!b) return false;
    away[i] = b;
    bites.push({ link: b });
    return true;
  }
  // where a piece's strand is rooted: back inside what is left of its upright
  function root(b) { return [b.hx, b.hy + (b.top ? .082 : -.082)]; }
  function beads(p) {
    // the thinning strand gathers into droplets before it snaps
    var ra = root(p);
    for (var s = 0; s < 2; s++) {
      var h = s ? .64 : .34;
      blob({ kind: 'bead', parent: p, h: h, x: ra[0] + (p.x - ra[0]) * h, y: ra[1] + (p.y - ra[1]) * h, r: .013 + Math.random() * .004 + s * .003, k: .22 });
    }
  }
  function seep(b, dirx, diry, w) {
    // a small blob squeezes out where the cut leaves the stroke, dragged along by the swipe
    var nx = -diry, ny = dirx, side = Math.random() < .5 ? -1 : 1, off = w + .014;
    var hx = b[0] - dirx * .012 + nx * side * off, hy = b[1] - diry * .012 + ny * side * off;
    var mx = dirx + nx * side * .35, my = diry + ny * side * .35, ml = Math.hypot(mx, my) || 1;
    blob({ kind: 'seep', x: hx, y: hy, hx: hx, hy: hy, r: .023 + Math.random() * .008, dx: mx / ml, dy: my / ml });
  }
  var nudgeAt = -1;
  function nudge(e, dirx, diry) {
    // a slow pass does not cut: a small drop buds off where the pointer left and follows it a little
    if (now < nudgeAt) return;
    nudgeAt = now + .5;
    var hx = e[0] - dirx * .012, hy = e[1] - diry * .012;
    blob({ kind: 'seep', x: hx, y: hy, hx: hx, hy: hy, r: .021 + Math.random() * .007, dx: dirx, dy: diry });
  }
  // the upright (by where it is drawn now) nearest to u within tolerance
  function uprightAt(u, v, tol) {
    if (v < .31 || v > .71) return -1;
    var best = -1, bd = tol;
    for (var k = 0; k < 4; k++) { var cx = visualBulb(k * 2 + (v < .505 ? 0 : 1))[0], d = Math.abs(u - cx); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  function strokeCrossed(a, b) {
    var my = (a[1] + b[1]) / 2;
    if (my < .31 || my > .71) return -1;
    for (var k = 0; k < 4; k++) {
      var cx = visualBulb(k * 2 + (my < .505 ? 0 : 1))[0];
      if ((a[0] - cx) * (b[0] - cx) <= 0 && Math.abs((a[0] + b[0]) / 2 - cx) < .06) return k;
    }
    return -1;
  }
  function slice(a, b, dirx, diry) {
    var ext = .025, w = .013;
    addCut(a[0] - dirx * ext, a[1] - diry * ext, b[0] + dirx * ext, b[1] + diry * ext, w);
    seep(b, dirx, diry, w);
    var k = strokeCrossed(a, b), my = (a[1] + b[1]) / 2;
    if (k >= 0) detach(k * 2 + (my < .505 ? 0 : 1), dirx, diry);
  }
  /* A shooting star cuts clean through the mark (js/nm-starcut.js). It is called in pieces as
     the meteor's head reaches each upright: path a->b in shapeUv, acting on the stretch t0..t1.
     Each piece cuts along its stretch; every upright it crosses lets an end ooze away (alternating
     up and down, so the mark reads as split in two) and bubbles bud from both lips of the cut. */
  function strike(a, b, t0, t1) {
    if (!sdf || !live()) return 0;
    t0 = t0 == null ? 0 : t0; t1 = t1 == null ? 1 : t1;
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1e-4, ux = dx / len, uy = dy / len, w = .016;
    strikeUntil = now + 12;
    addCut(a[0] + dx * t0, a[1] + dy * t0, a[0] + dx * t1, a[1] + dy * t1, w);
    var n = Math.max(2, Math.ceil(len * (t1 - t0) / .003)), e = null, hits = 0;
    for (var i = 0; i <= n; i++) {
      var t = t0 + (t1 - t0) * i / n, u = a[0] + dx * t, v = a[1] + dy * t, ins = inside(u, v);
      if (ins && !e) e = [u, v];
      if (e && (!ins || i === n)) {
        var x = [u, v];
        if (Math.hypot(x[0] - e[0], x[1] - e[1]) > .006) {
          seep(x, ux, uy, w);
          seep(e, -ux, -uy, w);
          var k = strokeCrossed(e, x);
          if (k >= 0) detach(k * 2 + (k % 2), ux, uy);
          hits++;
        }
        e = null;
      }
    }
    return hits;
  }
  function demoSlice() {
    // across the second upright, above its waist: trim the line to the stroke it crosses
    var a = [.30, .455], b = [.50, .43], e = null, n = 120;
    for (var i = 0; i <= n; i++) {
      var u = a[0] + (b[0] - a[0]) * i / n, v = a[1] + (b[1] - a[1]) * i / n, ins = inside(u, v);
      if (ins && !e) e = [u, v];
      if (!ins && e) { var l = Math.hypot(u - e[0], v - e[1]) || 1; slice(e, [u, v], (u - e[0]) / l, (v - e[1]) / l); return; }
    }
  }
  function pop(u, v) {
    // a click or tap on an upright lets its nearer end ooze away
    if (!inside(u, v)) return false;
    var k = uprightAt(u, v, .075);
    if (k < 0) return false;
    var i = k * 2 + (v < .505 ? 0 : 1), c = BULBS[i], ax = c[0] - u, ay = c[1] - v, al = Math.hypot(ax, ay) || 1;
    return detach(i, ax / al, ay / al);
  }
  var ANCH = [[.186, .33], [.186, .685], [.40, .33], [.398, .68], [.615, .33], [.615, .66], [.828, .33], [.828, .685]];
  function ambient() {
    var i = Math.floor(Math.random() * ANCH.length), a = ANCH[i], up = (i % 2) === 0, hy = a[1] + (up ? .014 : -.014);
    blob({ kind: 'drop', x: a[0], y: hy, hx: a[0], hy: hy, r: .022 + Math.random() * .009, dx: (Math.random() - .5) * .4, dy: up ? -1 : 1 });
  }

  /* ---------- pointer ---------- */
  function live() { return frame && frame.lava > .5; }
  function trace(x0, y0, x1, y1, dt) {
    if (!live()) return;
    var a = toShape(x0, y0), b = toShape(x1, y1);
    if (!a || !b) return;
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    var n = Math.max(1, Math.ceil(len / .003));
    for (var i = 1; i <= n; i++) {
      var u = a[0] + dx * i / n, v = a[1] + dy * i / n, t = ptr.t + dt * i / n, ins = inside(u, v);
      if (ins && !ptr.inside) { ptr.entry = [u, v]; ptr.entryT = t; }
      if (!ins && ptr.inside && ptr.entry) {
        var ch = Math.hypot(u - ptr.entry[0], v - ptr.entry[1]), el = Math.max(.001, t - ptr.entryT), speed = ch / el;
        // a quick swipe cuts; an ordinary pass only makes the wax bud after the pointer
        var ok = ch > .008 && ch < .16, hit = ok && speed > .8, dirx = (u - ptr.entry[0]) / ch, diry = (v - ptr.entry[1]) / ch;
        crossings.push([+ch.toFixed(4), +speed.toFixed(3), hit]); if (crossings.length > 20) crossings.shift();
        if (hit) slice(ptr.entry, [u, v], dirx, diry);
        else if (ok && speed > .2) nudge([u, v], dirx, diry);
        ptr.entry = null;
      }
      ptr.inside = ins;
    }
  }
  function onMove(e) {
    if (still.matches || !e.isPrimary) return;
    var t = performance.now() / 1000;
    if (demo.pending) demo.pending = false; // any pointer activity replaces the demonstration
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      if (ptr.has && ptr.type === e.pointerType) trace(ptr.x, ptr.y, e.clientX, e.clientY, t - ptr.t);
      ptr.has = true; ptr.type = e.pointerType;
    } else if (ptr.id === e.pointerId) {
      // touch: only sideways swipes cut; vertical drags belong to scrolling
      var dx = e.clientX - ptr.downX, dy = e.clientY - ptr.downY;
      ptr.moved = Math.max(ptr.moved, Math.hypot(dx, dy));
      if (Math.abs(dx) > Math.abs(dy) * 1.4) trace(ptr.x, ptr.y, e.clientX, e.clientY, t - ptr.t);
    }
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.t = t;
  }
  function onDown(e) {
    if (still.matches || !e.isPrimary) return;
    var t = performance.now() / 1000;
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.t = t; ptr.has = true; ptr.type = e.pointerType;
    if (e.pointerType === 'touch') {
      ptr.id = e.pointerId; ptr.downX = e.clientX; ptr.downY = e.clientY; ptr.downT = t; ptr.moved = 0; ptr.entry = null;
      var s0 = live() && toShape(e.clientX, e.clientY); ptr.inside = !!(s0 && inside(s0[0], s0[1]));
    }
  }
  function onUp(e) {
    var mine = ptr.id === e.pointerId;
    if (e.pointerType === 'touch' && mine) ptr.id = -1;
    if (still.matches || !e.isPrimary || !live()) return;
    var t = performance.now() / 1000, s = toShape(e.clientX, e.clientY);
    if (!s) return;
    if (e.pointerType === 'touch') { if (mine && ptr.moved < 12 && t - ptr.downT < .35) pop(s[0], s[1]); }
    else pop(s[0], s[1]);
  }
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerdown', onDown, { passive: true });
  addEventListener('pointerup', onUp, { passive: true });
  addEventListener('pointercancel', function (e) { if (ptr.id === e.pointerId) ptr.id = -1; }, { passive: true });
  addEventListener('scroll', function () { if (demo.pending && scrollY > 4) demo.pending = false; }, { passive: true });

  // Sideways touch swipes need to reach script; vertical panning and pinch stay native.
  var css = document.createElement('style');
  css.textContent = '#global-canvas canvas{touch-action:pan-y pinch-zoom}';
  document.head.appendChild(css);

  /* one demonstration cut after the first-visit entrance */
  addEventListener('nm:opening-done', function () {
    var o = window.__nmOpening;
    if (o && o.reason === 'complete' && !still.matches) { demo.pending = true; demo.at = -1; }
  });

  /* ---------- the collage under the mark, captured for the pieces ---------- */
  // The work collage is DOM (#nm-made) under the transparent mark, so a moving piece would
  // only reveal whatever tile is behind it. Capture what the visitor sees there at the moment
  // pieces appear (posters at the top of the page, same crops as object-fit: cover).
  function takeSnap() {
    var made = document.getElementById('nm-made'), r = canvasRect();
    if (!made || !r || r.width < 2) return false;
    var W = r.width, H = r.height, d = Math.min(1.5, window.devicePixelRatio || 1);
    if (!snap) { snap = document.createElement('canvas'); snapCtx = snap.getContext('2d'); }
    var cw = Math.round(W * d), ch = Math.round(H * d);
    if (snap.width !== cw || snap.height !== ch) { snap.width = cw; snap.height = ch; }
    var c = snapCtx;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, W, H);
    var bg = getComputedStyle(made).backgroundColor;
    if (bg && !/rgba\(.*,\s*0\)$|^transparent$/.test(bg)) { c.fillStyle = bg; c.fillRect(0, 0, W, H); }
    var els = made.querySelectorAll('img, video, canvas');
    for (var i = 0; i < els.length; i++) {
      var el = els[i], b = el.getBoundingClientRect();
      if (b.width <= 0 || b.right <= r.left || b.bottom <= r.top || b.left >= r.right || b.top >= r.bottom) continue;
      var cs = getComputedStyle(el), op = +cs.opacity;
      if (!op || cs.visibility === 'hidden' || cs.display === 'none') continue;
      var tag = el.tagName, sw = el.naturalWidth || el.videoWidth || el.width, sh = el.naturalHeight || el.videoHeight || el.height;
      if (!sw || !sh || (tag === 'IMG' && !el.complete) || (tag === 'VIDEO' && el.readyState < 2)) continue;
      var sx = 0, sy = 0, sW = sw, sH = sh;
      if (cs.objectFit === 'cover') {
        var k = Math.max(b.width / sw, b.height / sh);
        sW = b.width / k; sH = b.height / k; sx = (sw - sW) / 2; sy = (sh - sH) / 2;
      }
      c.globalAlpha = op;
      try { c.drawImage(el, sx, sy, sW, sH, b.left - r.left, b.top - r.top, b.width, b.height); } catch (e) { /* tainted or not ready: that tile stays see-through */ }
    }
    c.globalAlpha = 1;
    snapV++;
    return true;
  }

  /* ---------- per-frame step, called by the hero shader ---------- */
  function ease(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function step(f) {
    frame = f; now = f.t;
    var dt = Math.min(.05, Math.max(0, f.dt || .016));
    if (still.matches || !f.lava) {
      blobs.length = cuts.length = bites.length = 0; away = {}; demo.pending = false;
      return write(0);
    }
    // slow or software-rendered devices skip the idle decoration
    slowFrames = dt > .024 ? Math.min(120, slowFrames + 1) : Math.max(0, slowFrames - 2);
    if (demo.pending) {
      if (f.lava < .9) demo.pending = false;
      else if (demo.at < 0) demo.at = now + 1.0;
      else if (now >= demo.at) { demo.pending = false; demoSlice(); }
    }
    if (f.lava > .9 && now > nextAmbient) { if (slowFrames < 30 && blobs.length < MAXB - 4) ambient(); nextAmbient = now + 6 + Math.random() * 5; }

    for (var i = blobs.length - 1; i >= 0; i--) {
      var b = blobs[i]; b.age += dt;
      var wobx = (lnoise(b.seed + now * .35, 1.7) - .5) * .012, woby = (lnoise(b.seed + 3.1, now * .35) - .5) * .012;
      if (b.kind === 'bulb') {
        // home follows the drifting stroke so the piece melts back where the end is drawn now
        var vb = visualBulb(b.bulb), fl = Math.min(1, dt * 1.5);
        b.hx += (vb[0] - b.hx) * fl; b.hy += (vb[1] - b.hy) * fl;
        // ooze out slowly (0-3.2 s), hang and drift (to 6.8 s), then ooze home (6.8-10.2 s)
        var go = ease(b.age / 3.2), back = b.age > 6.8 ? ease((b.age - 6.8) / 3.4) : 0;
        b.dist = (.13 * go + .01 * Math.sin(b.age * .8 + b.seed) * go) * (1 - back);
        b.x = b.hx + b.dx * b.dist + wobx * go * (1 - back); b.y = b.hy + b.dy * b.dist + woby * go * (1 - back);
        // the strand: thins as the piece pulls away, beads up, snaps; finds the piece again on the way home
        if (!b.beaded && b.dist > .088) { b.beaded = true; beads(b); }
        if (!b.broke && b.dist > .118) b.broke = true;
        if (b.broke && back > 0 && b.dist < .075) b.broke = false;
        b.joined = b.broke ? 0 : Math.min(1, b.joined + dt * 2.5);
        b.nw = .04 * (1 - ease((b.dist - .02) / .105)) * b.joined;
        if (b.merging < 0 && b.age > 7 && back >= .98) b.merging = 0;
        if (b.merging >= 0) { b.merging += dt; b.r = b.r0 * Math.max(0, 1 - b.merging / .9); b.nw *= b.r / b.r0; }
        if (b.age > 15 || (b.merging >= 0 && b.r <= .002)) remove(i);
      } else if (b.kind === 'bead') {
        // rides the strand while it holds, then slides into the nearer end and is absorbed
        var p = b.parent;
        if (!p || blobs.indexOf(p) < 0) { remove(i); continue; }
        var ra = root(p);
        if (!p.broke && b.free == null) {
          b.x = ra[0] + (p.x - ra[0]) * b.h + wobx * .3; b.y = ra[1] + (p.y - ra[1]) * b.h + woby * .3;
          b.r = b.r0 * ease(b.age / .8);
        } else {
          if (b.free == null) { b.free = b.age; b.sx = b.x; b.sy = b.y; }
          var ft = b.age - b.free, tx = b.h < .5 ? ra[0] : p.x, ty = b.h < .5 ? ra[1] : p.y, e = ease(ft / 1.8);
          b.x = b.sx + (tx - b.sx) * e; b.y = b.sy + (ty - b.sy) * e;
          b.r = b.r0 * (1 - ease((ft - 1.1) / .7));
          if (ft > 1.8) remove(i);
        }
      } else {
        // seep (from a cut) and drop (budding off an end): ooze out on a thin strand that
        // stretches to a thread, hang, then ooze back in
        var reach = b.kind === 'seep' ? .05 : .065, dur = b.kind === 'seep' ? 4.6 : 6;
        var out = ease(b.age / (dur * .4)) * (1 - ease((b.age - dur * .6) / (dur * .4)));
        b.dist = reach * out;
        b.x = b.hx + b.dx * b.dist + wobx * out; b.y = b.hy + b.dy * b.dist + woby * out;
        b.k = .2;
        b.r = b.r0 * (.35 + .65 * ease(b.age / 1.2)) * (b.age > dur * .85 ? Math.max(0, 1 - (b.age - dur * .85) / (dur * .15)) : 1);
        b.nw = Math.min(.022, b.r * .7) * (1 - ease((b.dist - .005) / (reach * .95)));
        if (b.age > dur) remove(i);
      }
    }
    var pieces = blobs.length > 0, top = (f.scroll || 0) < .01, key = innerWidth + 'x' + innerHeight;
    if (pieces && top && (!hadPieces || key !== snapKey)) { try { if (takeSnap()) snapKey = key; } catch (e) { /* plain window behaviour */ } }
    hadPieces = pieces;
    snapOn = snap && snapKey ? Math.max(0, 1 - (f.scroll || 0) / .02) : 0;
    for (var q2 = blobs.length - 1; q2 >= 0; q2--) {
      var z = blobs[q2];
      if (!isFinite(z.x) || !isFinite(z.y) || !isFinite(z.r)) remove(q2);
    }
    for (var c = cuts.length - 1; c >= 0; c--) { cuts[c].age += dt; if (cuts[c].age > 3.6) cuts.splice(c, 1); }
    for (var j = bites.length - 1; j >= 0; j--) { var q = bites[j]; if (blobs.indexOf(q.link) < 0 || q.link.merging >= 0) bites.splice(j, 1); }
    return write(f.lava);
  }
  function drift(b) {
    if (b.kind === 'bead') {
      var p = b.parent; if (!p) return [0, 0];
      var po = drift(p); return [po[0] * (b.h || .5), po[1] * (b.h || .5)];
    }
    if (b.hx == null) return [0, 0];
    return [b.x - b.hx, b.y - b.hy];
  }
  function write(amt) {
    outB.fill(0); outC.fill(0); outW.fill(0); outI.fill(0); outK.fill(0); outKW.fill(0); outN.fill(0); outO.fill(0); outKO.fill(0);
    outBox[0] = outBox[1] = 1e3; outBox[2] = outBox[3] = -1e3;
    if (!amt) return 0;
    function grow(x0, y0, x1, y1) { if (!(isFinite(x0) && isFinite(y0) && isFinite(x1) && isFinite(y1))) return; outBox[0] = Math.min(outBox[0], x0); outBox[1] = Math.min(outBox[1], y0); outBox[2] = Math.max(outBox[2], x1); outBox[3] = Math.max(outBox[3], y1); }
    var n = 0, strands = [];
    // shapeUv -> canvas uv scale at the top of the page (the mapping is affine there)
    var r0 = canvasRect(), A = toShape(r0.left, r0.top), B = toShape(r0.right, r0.bottom);
    var su = A && B && B[0] !== A[0] ? 1 / (B[0] - A[0]) : 0, sv = A && B && B[1] !== A[1] ? 1 / (B[1] - A[1]) : 0;
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i]; if (b.r <= 1e-4) continue;
      var off = drift(b);
      b.ou = off[0] * su; b.ov = off[1] * sv;
      outO[n * 4] = b.ou; outO[n * 4 + 1] = b.ov;
      outB[n * 4] = b.x; outB[n * 4 + 1] = b.y; outB[n * 4 + 2] = b.r * amt; outB[n * 4 + 3] = Math.min(.45, b.k) * amt;
      var m = b.r * 1.5 + .06; grow(b.x - m, b.y - m, b.x + m, b.y + m); n++;
      if (b.nw > 2e-4) strands.push(b);
    }
    outN[0] = n;
    for (var c = 0; c < cuts.length; c++) {
      // opens slowly, holds, then the wax flows back together
      var k = cuts[c], a = k.age, open = ease(a / .6), heal = a < 1.4 ? 1 : Math.max(0, 1 - (a - 1.4) / 2.2);
      outC[c * 4] = k.ax; outC[c * 4 + 1] = k.ay; outC[c * 4 + 2] = k.bx; outC[c * 4 + 3] = k.by;
      outW[c] = k.w0 * open * heal * amt;
      grow(Math.min(k.ax, k.bx) - .04, Math.min(k.ay, k.by) - .04, Math.max(k.ax, k.bx) + .04, Math.max(k.ay, k.by) + .04);
    }
    outN[1] = cuts.length;
    for (var j = 0; j < bites.length; j++) {
      // the end is taken from the outside in as its piece pulls away (never a hole
      // inside the stroke), and given back the same way as the piece returns. A wide
      // circle coming down the stroke's axis leaves a shallow, rounded stub.
      var p = bites[j].link, off = .215 - .127 * ease(p.dist / .09);
      var bx = p.hx, by = p.hy + (p.top ? -off : off);
      outI[j * 4] = bx; outI[j * 4 + 1] = by; outI[j * 4 + 2] = BITE_R * amt; outI[j * 4 + 3] = 1;
      var mb = BITE_R + .05; grow(bx - mb, by - mb, bx + mb, by + mb);
    }
    outN[2] = bites.length;
    // strands: leaving ends first, then the thickest
    strands.sort(function (x, y) { return (y.kind === 'bulb') - (x.kind === 'bulb') || y.nw - x.nw; });
    var sn = Math.min(MAXN, strands.length);
    for (var s = 0; s < sn; s++) {
      var o = strands[s], ra = o.kind === 'bulb' ? root(o) : [o.hx, o.hy];
      outK[s * 4] = ra[0]; outK[s * 4 + 1] = ra[1]; outK[s * 4 + 2] = o.x; outK[s * 4 + 3] = o.y; outKW[s] = o.nw * amt;
      outKO[s * 4] = o.ou || 0; outKO[s * 4 + 1] = o.ov || 0;
      grow(Math.min(ra[0], o.x) - .05, Math.min(ra[1], o.y) - .05, Math.max(ra[0], o.x) + .05, Math.max(ra[1], o.y) + .05);
    }
    outN[3] = sn;
    return n + cuts.length + bites.length + sn > 0 ? 1 : 0;
  }

  window.__nmLava = { step: step, bubbles: outB, cuts: outC, cutW: outW, bites: outI, necks: outK, neckW: outKW, box: outBox, counts: outN,
    offs: outO, neckOffs: outKO, get snap() { return snap; }, get snapV() { return snapV; }, get snapOn() { return snapOn; },
    // diagnostics and tests
    _state: function () { return { bubbles: blobs.length, cuts: cuts.length, bites: bites.length, necks: outN[3], away: Object.keys(away).length, sdf: !!sdf, frame: frame, crossings: crossings.slice() }; },
    _toShape: toShape, _inside: inside, _slice: slice, _strike: strike, _pop: pop, _ambient: ambient };
})();
