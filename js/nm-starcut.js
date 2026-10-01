/* Night Sky: stay at the top of the homepage for 9 seconds and a shooting star streaks
   across in front of the NM, slicing it in two as it passes; the cut ends ooze away and
   bubbles bud along the cut (window.__nmLava._strike, js/nm-lava.js). Repeats at most every
   40 seconds while the visitor stays at the top; scrolling away re-arms the 9-second wait.

   The meteor draws on its own small overlay above the hero canvas (pointer-events none), so
   its head and the cut stay in step; between streaks the overlay is hidden at 0x0. Homepage
   only; nothing under reduced motion, in a hidden tab, during the opening, or while Cloud Run
   is open. ?sky=show fires one after 2 seconds. */
(function () {
  'use strict';
  if (!/^\/(index\.html)?$/.test(location.pathname)) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  var WAIT = /[?&]sky=show\b/.test(location.search) ? 2 : 9, AGAIN = 40;
  var idleSince = performance.now(), lastFire = -1e9, running = false;
  var cv = null, ctx = null;

  function atTop() {
    return window.scrollY < 2 && !(window.__nmHeroProgress > .002) && !document.hidden &&
      !document.documentElement.classList.contains('nm-run-open');
  }
  function lavaReady() {
    var L = window.__nmLava, s = L && L._state && L._state();
    return !!(s && s.sdf && s.frame && s.frame.lava > .9 && L._strike);
  }
  addEventListener('scroll', function () { if (!atTop()) idleSince = performance.now(); }, { passive: true });
  document.addEventListener('visibilitychange', function () { idleSince = performance.now(); });

  setInterval(function () {
    if (running || (reduce && reduce.matches)) return;
    var t = performance.now();
    if (!atTop()) { idleSince = t; return; }
    if (t - idleSince >= WAIT * 1000 && t - lastFire >= AGAIN * 1000 && lavaReady()) fire();
  }, 200);

  function overlay() {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.className = 'nm-starcut';
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:2;pointer-events:none';
    document.body.appendChild(cv);
    ctx = cv.getContext('2d');
  }
  // between streaks the overlay is blank: take it off the compositor and free its backing
  // store (a full-screen layer, ~20 MB at 2x), instead of keeping a transparent sheet on top
  function release() {
    cv.style.display = 'none';
    cv.width = cv.height = 0;
  }

  function fire() {
    var L = window.__nmLava, W = innerWidth, H = innerHeight;
    var A = L._toShape(0, 0), B = L._toShape(W, H);
    if (!A || !B || B[0] === A[0] || B[1] === A[1]) return;
    // shape (u, v) -> screen; the hero mapping is affine at the top of the page
    var sx = function (u) { return (u - A[0]) / (B[0] - A[0]) * W; };
    var sy = function (v) { return (v - A[1]) / (B[1] - A[1]) * H; };
    running = true; lastFire = performance.now();
    overlay();

    // a gently sloped line through the waists of all four uprights
    var mid = .5 + (Math.random() - .5) * .05, tilt = (Math.random() < .5 ? -1 : 1) * (.05 + Math.random() * .05);
    var a = [.04, mid - tilt / 2], b = [.96, mid + tilt / 2];
    // pieces: one per upright, split halfway between them, cut as the head arrives
    var cuts = [.04, .293, .507, .7215, .96].map(function (u) { return (u - a[0]) / (b[0] - a[0]); });
    var centres = [.186, .40, .615, .828].map(function (u) { return sx(u); });

    // the screen path: extend the logo line to well past both edges
    var x0 = sx(a[0]), y0 = sy(a[1]), x1 = sx(b[0]), y1 = sy(b[1]);
    var dx = x1 - x0, dy = y1 - y0, dl = Math.hypot(dx, dy), ux = dx / dl, uy = dy / dl;
    var reach = Math.max(W, H) * .9;
    var P0 = [x0 - ux * reach, y0 - uy * reach], P1 = [x1 + ux * reach, y1 + uy * reach];
    var total = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]);
    var speed = Math.max(1500, W * 1.25);              // px per second
    var dur = total / speed, fade = .55, tail = Math.min(420, W * .32);
    var fired = 0, sparks = [], t0 = performance.now();

    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.display = '';
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    function frame(now) {
      var t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      var d = Math.min(t, dur) * speed, hx = P0[0] + ux * d, hy = P0[1] + uy * d;
      // cut each piece as the head reaches its upright
      while (fired < 4 && hx >= centres[fired] - 2) {
        try { L._strike(a, b, cuts[fired], cuts[fired + 1]); } catch (e) { /* the logo just stays whole */ }
        for (var s = 0; s < 6; s++) {
          var an = Math.atan2(uy, ux) + (Math.random() - .5) * 1.6;
          sparks.push({ x: hx, y: hy, vx: Math.cos(an) * (120 + Math.random() * 260), vy: Math.sin(an) * (120 + Math.random() * 260) + 40, t: t, life: .35 + Math.random() * .35 });
        }
        fired++;
      }
      var gone = t > dur ? Math.min(1, (t - dur) / fade) : 0;
      var len = Math.min(tail, d), tx = hx - ux * len, ty = hy - uy * len;
      // the train: a thin tapered streak, warm white at the head fading to peach and nothing
      var g = ctx.createLinearGradient(tx, ty, hx, hy);
      g.addColorStop(0, 'rgba(233,180,163,0)');
      g.addColorStop(.55, 'rgba(240,200,170,' + (.22 * (1 - gone)) + ')');
      g.addColorStop(1, 'rgba(255,246,232,' + (.95 * (1 - gone)) + ')');
      ctx.lineCap = 'round';
      // a faint wide glow along the train, then the tapered core on top
      var gl = ctx.createLinearGradient(tx, ty, hx, hy);
      gl.addColorStop(0, 'rgba(232,140,90,0)');
      gl.addColorStop(1, 'rgba(255,214,160,' + (.16 * (1 - gone)) + ')');
      ctx.strokeStyle = gl; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(tx + ux * len * .45, ty + uy * len * .45); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = g;
      for (var k = 0; k < 3; k++) {
        var f = k / 3;
        ctx.lineWidth = 3 - k * .9;
        ctx.beginPath(); ctx.moveTo(tx + ux * len * f, ty + uy * len * f); ctx.lineTo(hx, hy); ctx.stroke();
      }
      if (t <= dur) {
        // the head: a small hot core with a soft golden glow
        var r = 20, hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, r);
        hg.addColorStop(0, 'rgba(255,252,245,1)');
        hg.addColorStop(.18, 'rgba(255,232,190,.6)');
        hg.addColorStop(1, 'rgba(232,140,90,0)');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.fill();
      }
      // sparks shed where it cuts
      sparks = sparks.filter(function (p) {
        var age = t - p.t; if (age > p.life) return false;
        var q = 1 - age / p.life;
        ctx.fillStyle = 'rgba(255,' + Math.round(200 + 40 * q) + ',' + Math.round(150 + 60 * q) + ',' + (.8 * q) + ')';
        ctx.beginPath(); ctx.arc(p.x + p.vx * age, p.y + p.vy * age + 60 * age * age, 1.1 * q + .3, 0, Math.PI * 2); ctx.fill();
        return true;
      });
      if (t < dur + fade || sparks.length) requestAnimationFrame(frame);
      else { release(); running = false; idleSince = performance.now(); }
    }
    requestAnimationFrame(frame);
  }
})();
