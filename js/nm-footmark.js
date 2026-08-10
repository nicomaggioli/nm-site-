/* ── archive footer mark ───────────────────────────────────────────────────
   The homepage ends on the NM point cloud; this page ended on bare text, so
   the two pages read as different sites at the moment you reach the bottom.

   The homepage cloud is three.js points inside the one full-viewport WebGL
   canvas that also draws the hero -- it cannot be lifted out, and this page
   loads no part of the React bundle (4 stylesheets, 3 scripts, no canvas).
   So this redraws it in 2D from the SAME source the homepage samples,
   /textures/nm-mark-sdf.png, which is why the silhouette matches rather than
   merely resembling it.

   Cost matters here: the archive already holds 176 images. So this is 7,500
   sprites (5,500 on phones) drawn at 30fps, paused by IntersectionObserver
   whenever the footer is off-screen -- which, on a 19,000px page, is nearly
   always. One static frame under prefers-reduced-motion.

   Count and alpha are a pair: many dim points, not few bright ones. The first
   pass ran 4,200 at alpha .16-.36 and blew out to white cores with visible
   clumping; the homepage mark is an even mid-grey. Raising the count while
   cutting alpha to .022-.052 holds roughly the same total ink and spends it
   on smoothness instead. */
(function () {
  var host = document.querySelector('.foot-mark');
  if (!host || !window.requestAnimationFrame) return;

  /* Not on phones. 5,500 sprites at 30fps on top of a 176-image grid is real
     work for no return, and the homepage drops its own footer cloud at the
     same breakpoint -- so the two pages still end the same way. The CSS
     collapses .foot-mark to nothing here, so there is no gap left behind. */
  try { if (window.matchMedia('(max-width:767px)').matches) return; } catch (e) {}

  var cv = document.createElement('canvas');
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', 'Nico Maggioli');
  host.appendChild(cv);
  var ctx = cv.getContext('2d');
  if (!ctx) { host.removeChild(cv); return; }

  /* Bounding box of the mark inside the 512x512 texture, measured at the
     threshold where the blur fades out (>10/255): x 57..462, y 159..360.
     Sampling the whole square would scatter most points into empty black. */
  var CROP = { x: 57, y: 159, w: 406, h: 202 };
  var ASPECT = CROP.w / CROP.h;                       /* 2.01 */

  var reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  /* Sprite radius scales with the canvas, so a phone's smaller mark does NOT
     need fewer points to look the same -- it needs the same count at a smaller
     size. Cutting the count purely for CPU therefore thins the cloud out, and
     3,000 read visibly wispier than the desktop pass. GAIN puts the ink back:
     fewer points, each carrying proportionally more, so the two match. */
  var BASE = 7500;                                    /* alpha was tuned here */
  var phone = Math.min(innerWidth, innerHeight) < 700;
  var COUNT = phone ? 5500 : BASE;
  var GAIN = BASE / COUNT;

  var pts = null, dpr = 1, W = 0, H = 0, sprite = null, sprR = 0;
  var running = false, raf = 0, last = 0, t0 = 0;

  /* One pre-rendered soft dot, redrawn per point. Building the gradient per
     point instead would be 7,500 gradient allocations every frame. */
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

  /* Rejection-sample the crop: a candidate survives with probability equal to
     its luminance, so density follows the blur instead of stopping at a hard
     edge -- the soft falloff is the whole look of the homepage mark. */
  function sample(img) {
    var off = document.createElement('canvas');
    off.width = CROP.w; off.height = CROP.h;
    var oc = off.getContext('2d', { willReadFrequently: true });
    oc.drawImage(img, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);
    var data;
    try { data = oc.getImageData(0, 0, CROP.w, CROP.h).data; }
    catch (e) { return null; }                       /* tainted canvas */

    var out = [], guard = COUNT * 260;
    while (out.length < COUNT && guard-- > 0) {
      var x = (Math.random() * CROP.w) | 0;
      var y = (Math.random() * CROP.h) | 0;
      var l = data[(y * CROP.w + x) * 4] / 255;
      if (l <= 0.04 || Math.random() > l) continue;
      out.push({
        u: x / CROP.w,
        v: y / CROP.h,
        d: Math.random(),                            /* stands in for depth */
        p: Math.random() * Math.PI * 2,              /* drift phase */
        s: 0.55 + Math.random() * 0.75               /* size jitter */
      });
    }
    return out.length ? out : null;
  }

  /* Layout size is CSS's job (width:100% under a max-width), so this reads the
     canvas back rather than measuring the host -- the host is the full footer
     width and the canvas is capped well below it. Setting the width/height
     ATTRIBUTES to the same aspect keeps height:auto honest, so the two never
     drift apart and nothing has to be written back as an inline style. */
  function resize() {
    var w = Math.round(cv.clientWidth);
    if (!w) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var h = Math.round(w / ASPECT);
    if (W === w && H === h && cv.width) return true;
    W = w; H = h;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    sprR = Math.max(3, Math.round((w / 406) * 9 * dpr));
    sprite = makeSprite(sprR);
    return true;
  }

  function draw(now) {
    var t = reduce ? 0 : (now - t0) / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    /* Additive, so overlapping points build the mid-grey mass the same way
       the homepage's do. Each point alone is barely visible. */
    ctx.globalCompositeOperation = 'lighter';

    var cw = cv.width, ch = cv.height;
    /* Points are laid out edge to edge, so half a sprite would hang off the
       canvas on all four sides; inset by that much and scale to fit. */
    var pad = sprR;
    var iw = cw - pad * 2, ih = ch - pad * 2;

    for (var i = 0; i < pts.length; i++) {
      var q = pts[i];
      var wob = Math.sin(t * 0.55 + q.p) * 0.010 + Math.sin(t * 0.31 + q.p * 1.7) * 0.006;
      var x = pad + (q.u + wob) * iw;
      var y = pad + (q.v + wob * 0.7) * ih;
      var r = sprR * q.s * (0.62 + q.d * 0.72);
      ctx.globalAlpha = (0.022 + q.d * 0.030) * GAIN;
      ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return;                     /* 30fps is plenty here */
    last = now;
    draw(now);
  }

  function start() {
    if (running || !pts) return;
    if (!resize()) return;
    if (reduce) { draw(performance.now()); return; }
    running = true;
    t0 = t0 || performance.now();
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  var rt = 0;
  addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var was = running;
      stop();
      if (resize()) { if (was && !reduce) start(); else draw(performance.now()); }
    }, 150);
  }, { passive: true });

  var img = new Image();
  img.decoding = 'async';
  img.onload = function () {
    pts = sample(img);
    if (!pts) { host.removeChild(cv); return; }
    /* Deliberately NOT gated on resize() succeeding. If the box happens not to
       be laid out yet, an early return here would leave the canvas at opacity 0
       with no observer attached -- the mark would be missing for the life of
       the page, silently. start() re-runs resize() on every call, so a first
       miss is recovered by the next scroll or resize instead. */
    resize();
    host.classList.add('is-ready');

    if (!('IntersectionObserver' in window)) { start(); return; }
    new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) start(); else stop();
    }, { rootMargin: '200px' }).observe(host);
  };
  img.onerror = function () { host.removeChild(cv); };
  img.src = '/textures/nm-mark-sdf.png';
})();
