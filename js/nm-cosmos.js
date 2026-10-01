/* Shared cosmos layers for the cosmic preview themes: stars, airbrush, grain.
   Brief: docs/cosmic-directions.md. Loaded only when a preview theme is active
   (js/nm-theme.js), after js/theme-NAME.js has filled window.NMThemeConfig.

   window.NMCosmos
     .stars(opts)     night sky: power-law magnitudes, colour temperature, sparse
                      scintillation, optional drift / scroll parallax / shooting stars
     .airbrush(opts)  sprayed colour field in the hoodie palette: 'bands' (the fabric,
                      a light ground that can darken to dusk and night) or 'nebula'
                      (low-alpha blooms for a dark ground)
     .grain(opts)     spray-speckle overlay from a generated noise tile
     .mount(cfg)      mounts cfg.airbrush / cfg.stars / cfg.grain (object, array or true)
     .layers          live handles;  .palette  hoodie tokens;  .destroyAll()
     .fade(a,b[,c,d]) visible() helper: fade in over page fractions a..b (out over c..d)
     .progressOf(el)  0 when el's top meets the viewport bottom .. 1 when its bottom
                      leaves the top (rects cached, refreshed on layout changes)
   Each call returns a handle { kind, el, options, set(patch), redraw(), destroy() }.

   Auto-mount: on window.__nmReady the module mounts NMThemeConfig.airbrush, .stars
   and .grain, then calls NMThemeConfig.onCosmos(NMCosmos, handles) and dispatches
   `nm:cosmos` on window. Themes normally only write config.

   Stacking: without `target`, a layer is a position:fixed full-viewport element
   appended to <body> at a negative z-index (airbrush -30, stars -20, grain -10), so
   it paints behind #global-canvas (z 0), behind #nm-made (z -1) and behind all
   content, and never takes pointer events. While a page layer exists, <body> gets
   `isolation:isolate` (html[data-nm-cosmos]) so the layers paint above the body's
   own background instead of under it. Any section that paints an opaque background
   (e.g. #nm-made, .nm-footer, the gallery) still hides the layers there: themes make
   those backgrounds transparent in their CSS. With `target` (element or selector)
   the layer fills that element instead (position:absolute, z -3/-2/-1); the host is
   given isolation:isolate (and position:relative if it was static).

   Budget: DPR <= 1.5, airbrush field at ~1/4 resolution, <= 30 fps ambient updates
   (stars follow scroll parallax at display rate; the shader is tiny), paused in
   hidden tabs, at opacity 0, off screen (targets) and while Cloud Run is open
   (html.nm-run-open / nm:gamechange); one still frame under prefers-reduced-motion
   (no twinkle, drift, parallax or shooting stars); lighter defaults on phones.
   WebGL failure falls back to a static 2D starfield / CSS-gradient airbrush.

   ---- stars(opts) ----------------------------------------------------- defaults
   density     1       ~1250 stars per CSS megapixel, 55% faint dust (phones x0.75)
   brightness  1       global intensity multiplier
   twinkle     0.2     fraction of stars that scintillate (0 = still sky)
   twinkleDepth 1      scintillation depth multiplier
   spikes      0.92    magnitude above which the brightest get a 4-point glint (>1 = none)
   spikeAngle  0       glint rotation in degrees
   band        0.3     fraction of faint stars gathered in a soft diagonal band
   drift       0       slow drift in CSS px/s: number (x) or [x, y]
   parallax    0.03    fraction of page scroll the stars travel (bright stars most)
   shootingStars 0     mean seconds between rare slow shooting stars (0 = off)
   palette     ice-blue / white / cream / peach / sky: [[hex, weight], ...] or [hex, ...]
   seed        7       layout seed
   ---- airbrush(opts) --------------------------------------------------
   mode        'bands' 'bands' (fabric, light ground) | 'nebula' (dark ground blooms)
   scale       1       feature size multiplier (2 = features twice as large)
   speed       1       flow speed multiplier (1 = slow drift; 0 = still)
   warp        1       domain-warp strength (how much the bands meander)
   lines       1       contour density multiplier (bands)
   width       1       coral stroke width multiplier (bands)
   amount      0.5     how much of the sky the blooms cover (nebula)
   intensity   1       pigment/emission multiplier
   grain       1       spray speckle strength (0 = smooth gradients)
   speck       1       speck size multiplier
   darken      0       day -> golden hour (0.3) -> dusk (0.62) -> night (1) for 'bands';
                       dims the blooms for 'nebula'
   hueShift    0       degrees
   centerDim   0 (bands) / 0.45 (nebula)  quieter pigment in the central text column
   ground      null    nebula ground colour (null = transparent over the page)
   palette     {}      overrides for day tokens: cream, warmWhite, ice, sky, peach,
                       coral, deepCoral, violet, space
   palettes    {}      overrides for {golden:{..}, dusk:{..}, night:{..}} stops (bands)
   parallax    0       fraction of scroll the field drifts
   resolution  0.25    field resolution as a fraction of CSS px (phones 0.3)
   progress    null    fn(pageFraction, info) -> { opacity, darken, hueShift, intensity,
                       speed, offset:[x,y] } applied every frame it changes
   seed        5
   ---- grain(opts) -----------------------------------------------------
   opacity     0.3     (grain's own default; the others default to 1)
   blend       'overlay'
   scale       1       speck size multiplier
   density     0.45    fraction of speckled pixels in the tile
   light       0.35    share of light specks (the rest dark); keep <= 0.2 on dark grounds
                       so specks never compete with the stars
   fps         0       jitter rate; 0 = static
   ---- shared (all three) ----------------------------------------------
   opacity 1, blend 'normal' (grain 'overlay'), zIndex (see Stacking), target null,
   fps 30 (phones 24), maxDpr 1.5, visible null: fn(pageFraction, info) -> 0..1,
   or [a, b] / [a, b, c, d] page fractions (see fade). info = { progress, scrollY,
   maxScroll, vw, vh, time, phone, reducedMotion, progressOf }. */
(function () {
  'use strict';
  if (window.NMCosmos) return;

  var root = document.documentElement;
  var PHONE = (function () {
    try { return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 600; }
    catch (e) { return false; }
  })();
  var PALETTE = {
    cream: '#EDE1CC', warmWhite: '#F4F8F0', ice: '#C6CDC6', sky: '#BCD3E0',
    peach: '#E9B4A3', coral: '#E3837A', deepCoral: '#CA5855', violet: '#6E6BD6', space: '#07070D'
  };
  // Airbrush 'bands' colour stops as the ground darkens: day (the hoodie itself),
  // golden hour, dusk (coral / wine / violet) and night (glowing threads on space).
  var STOPS = [
    { at: 0, p: {} },
    { at: 0.3, p: { sky: '#D9C9C4', ice: '#E6CDB8', warmWhite: '#F8E7C9', cream: '#F6D59C', peach: '#EFA784', coral: '#DE6F5E', deepCoral: '#B84A4C' } },
    { at: 0.62, p: { sky: '#2A2542', ice: '#3A3050', warmWhite: '#4A3552', cream: '#664259', peach: '#A65A5C', coral: '#C46258', deepCoral: '#DC8C72' } },
    { at: 1, p: { sky: '#06060C', ice: '#08070E', warmWhite: '#0B0911', cream: '#140D16', peach: '#2A141C', coral: '#552230', deepCoral: '#8A3A3F' } }
  ];
  var TOKENS = ['cream', 'warmWhite', 'ice', 'sky', 'peach', 'coral', 'deepCoral', 'violet', 'space'];
  var Z_PAGE = { airbrush: -30, stars: -20, grain: -10 };
  var Z_EL = { airbrush: -3, stars: -2, grain: -1 };

  /* ---------------------------------------------------------------- helpers */
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smooth(a, b, x) { var t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function assign(t) {
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i];
      if (s) for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k) && s[k] !== undefined) t[k] = s[k];
    }
    return t;
  }
  function rgb(c) {
    if (Array.isArray(c)) return [c[0] > 1 ? c[0] / 255 : c[0], c[1] > 1 ? c[1] / 255 : c[1], c[2] > 1 ? c[2] / 255 : c[2]];
    var h = String(c || '#000').trim().replace('#', '');
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    var n = parseInt(h.slice(0, 6), 16) || 0;
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rng(seed) {
    var a = (seed * 2654435761) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function resolveTarget(t) {
    if (!t || t === 'page') return null;
    if (typeof t === 'string') return document.querySelector(t);
    return t.nodeType === 1 ? t : null;
  }
  function fade(a, b, c, d) {
    return function (p) {
      var v = b > a ? smooth(a, b, p) : (p >= a ? 1 : 0);
      if (c != null && d != null) v *= 1 - (d > c ? smooth(c, d, p) : (p >= c ? 1 : 0));
      return v;
    };
  }
  function toVisible(v) {
    if (typeof v === 'function') return v;
    if (Array.isArray(v) && v.length >= 2) return fade(v[0], v[1], v[2], v[3]);
    return null;
  }

  /* ------------------------------------------------------ shared page state */
  var S = { y: 0, max: 1, vw: 0, vh: 0, hidden: document.hidden, run: false, reduced: false };
  var reduceMQ = null;
  try { reduceMQ = matchMedia('(prefers-reduced-motion: reduce)'); S.reduced = reduceMQ.matches; } catch (e) { /* old engines */ }
  var layers = [];
  var raf = 0, pageLayers = 0, rectGen = 0;
  var rects = typeof WeakMap === 'function' ? new WeakMap() : null;

  function measure() {
    S.y = window.scrollY || window.pageYOffset || 0;
    S.vw = window.innerWidth; S.vh = window.innerHeight;
    S.max = Math.max(1, (document.documentElement.scrollHeight || 0) - S.vh);
    rectGen++;
  }
  function progressOf(el) {
    el = resolveTarget(el);
    if (!el) return 0;
    var r = rects && rects.get(el);
    if (!r || r.gen !== rectGen) {
      var b = el.getBoundingClientRect();
      r = { gen: rectGen, top: b.top + S.y, h: b.height };
      if (rects) rects.set(el, r);
    }
    return clamp01((S.y + S.vh - r.top) / (S.vh + r.h));
  }
  var info = { progress: 0, scrollY: 0, maxScroll: 1, vw: 0, vh: 0, time: 0, phone: PHONE, reducedMotion: false, progressOf: progressOf };

  function kick() { if (!raf && layers.length) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    info.progress = clamp01(S.y / S.max); info.scrollY = S.y; info.maxScroll = S.max;
    info.vw = S.vw; info.vh = S.vh; info.time = now / 1000; info.reducedMotion = S.reduced;
    var again = false;
    for (var i = 0; i < layers.length; i++) {
      try { if (tick(layers[i], now)) again = true; }
      catch (e) { layers[i].failed = true; }
    }
    if (again) kick();
  }
  var FADE_MS = 900;
  function tick(L, now) {
    if (L.dead || L.failed) return false;
    var o = L.o, dt = L.last ? Math.min(now - L.last, 100) : 0;
    L.last = now;
    var vis = L.visible ? clamp01(+L.visible(info.progress, info) || 0) : 1;
    var prog = null;
    if (typeof o.progress === 'function') {
      prog = o.progress(info.progress, info) || null;
      var key = prog ? JSON.stringify(prog) : '';
      if (key !== L.progKey) { L.progKey = key; L.scrollDirty = true; }
    }
    L.progOut = prog;
    var want = clamp01((+o.opacity) * vis * (prog && prog.opacity != null ? +prog.opacity : 1));
    var shown = want > 0.002 && L.inView;
    if (L.fade < 0) L.fade = shown ? 0 : 1; // intro fade only if on screen when mounted
    if (shown && L.fade < 1) L.fade = Math.min(1, L.fade + dt / FADE_MS);
    var f = L.fade < 1 ? 1 - Math.pow(1 - L.fade, 2) : 1;
    var op = Math.round(want * f * 1000) / 1000;
    if (op !== L.op) {
      L.op = op;
      L.el.style.opacity = String(op);
      L.el.style.visibility = op > 0.002 ? 'visible' : 'hidden';
    }
    if (!shown || S.run || S.hidden) { L.last = 0; return false; }
    var motion = !S.reduced;
    var anim = motion && L.impl.animates(L);
    if (anim) L.t += dt / 1000 * (o.speed != null ? +o.speed : 1) * (prog && prog.speed != null ? +prog.speed : 1);
    if (motion && L.parallax && S.y !== L.lastY) { L.lastY = S.y; L.scrollDirty = true; }
    var need = L.dirty ||
      (L.scrollDirty && now - L.lastDraw >= L.scrollGap - 1.5) ||
      (anim && now - L.lastDraw >= 1000 / L.fps - 1.5);
    if (need && L.w > 0 && L.h > 0) {
      L.impl.draw(L, now);
      L.lastDraw = now; L.dirty = false; L.scrollDirty = false;
    }
    return anim || L.fade < 1 || L.scrollDirty || L.dirty;
  }

  function onScroll() {
    S.y = window.scrollY || window.pageYOffset || 0;
    for (var i = 0; i < layers.length; i++) if (layers[i].scrollDep) { kick(); return; }
  }
  function onResize() { measure(); dirtyAll(); }
  function dirtyAll() { for (var i = 0; i < layers.length; i++) layers[i].dirty = true; kick(); }
  var listening = false;
  function listen() {
    if (listening) return;
    listening = true;
    measure();
    S.run = root.classList.contains('nm-run-open');
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', function () {
      S.hidden = document.hidden;
      for (var i = 0; i < layers.length; i++) layers[i].last = 0;
      kick();
    });
    window.addEventListener('nm:gamechange', function () {
      S.run = root.classList.contains('nm-run-open');
      for (var i = 0; i < layers.length; i++) layers[i].last = 0;
      kick();
    });
    if (reduceMQ) {
      var onReduce = function () { S.reduced = reduceMQ.matches; dirtyAll(); };
      if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onReduce);
      else if (reduceMQ.addListener) reduceMQ.addListener(onReduce);
    }
    // Page height changes as sections mount: keep the scroll range and cached rects fresh.
    if (typeof ResizeObserver === 'function' && document.body) {
      new ResizeObserver(function () { measure(); kick(); }).observe(document.body);
    }
  }

  var css = false;
  function injectCss() {
    if (css) return;
    css = true;
    var s = document.createElement('style');
    s.id = 'nm-cosmos-css';
    s.textContent =
      '.nm-cosmos{position:fixed;left:0;top:0;width:100%;height:100vh;height:100lvh;pointer-events:none;' +
      'overflow:hidden;contain:strict;opacity:0;visibility:hidden;user-select:none;-webkit-user-select:none}' +
      '.nm-cosmos[data-nm-cosmos-in]{position:absolute;inset:0;width:auto;height:auto}' +
      '.nm-cosmos>canvas,.nm-cosmos>i{position:absolute;left:0;top:0;width:100%;height:100%;display:block}' +
      '.nm-cosmos--grain>i{left:-256px;top:-256px;width:calc(100% + 512px);height:calc(100% + 512px);will-change:transform}' +
      'html[data-nm-cosmos] body{isolation:isolate}';
    document.head.appendChild(s);
  }

  var ro = null;
  function observeSize(L) {
    if (typeof ResizeObserver !== 'function') {
      L.w = L.el.clientWidth; L.h = L.el.clientHeight;
      L.impl.resize(L);
      return;
    }
    if (!ro) {
      ro = new ResizeObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var L2 = entries[i].target.__nmCosmos;
          if (!L2 || L2.dead) continue;
          var r = entries[i].contentRect;
          var w = Math.round(r.width), h = Math.round(r.height);
          if (w === L2.w && h === L2.h) continue;
          L2.w = w; L2.h = h;
          L2.impl.resize(L2);
          // Resizing clears a canvas; repaint in this frame so it never flashes empty.
          if (L2.op > 0 && w > 0 && h > 0 && !L2.failed) {
            try { L2.impl.draw(L2, performance.now()); L2.dirty = false; } catch (e) { L2.dirty = true; }
          } else L2.dirty = true;
        }
        kick();
      });
    }
    ro.observe(L.el);
  }

  function createLayer(kind, o, impl) {
    injectCss();
    listen();
    var host = resolveTarget(o.target);
    if (o.target && !host) return null;
    var el = document.createElement('div');
    el.className = 'nm-cosmos nm-cosmos--' + kind;
    el.setAttribute('aria-hidden', 'true');
    var L = {
      kind: kind, o: o, impl: impl, el: el, host: host, t: 0, fade: -1, op: -1, inView: true,
      dirty: true, scrollDirty: false, last: 0, lastDraw: -1e9, lastY: -1, w: 0, h: 0, dpr: 1,
      fps: Math.max(1, Math.min(30, +o.fps || 30)), scrollGap: 33, visible: toVisible(o.visible)
    };
    el.__nmCosmos = L;
    el.style.zIndex = String(o.zIndex != null ? o.zIndex : (host ? Z_EL : Z_PAGE)[kind]);
    if (o.blend && o.blend !== 'normal') el.style.mixBlendMode = o.blend;
    if (host) {
      el.setAttribute('data-nm-cosmos-in', '');
      var cs = getComputedStyle(host);
      L.hostRestore = { position: host.style.position, isolation: host.style.isolation };
      if (cs.position === 'static') host.style.position = 'relative';
      if (cs.isolation !== 'isolate') host.style.isolation = 'isolate';
      host.appendChild(el);
      if (typeof IntersectionObserver === 'function') {
        L.io = new IntersectionObserver(function (e) {
          L.inView = e[e.length - 1].isIntersecting;
          L.last = 0;
          kick();
        }, { rootMargin: '15% 0px' });
        L.io.observe(host);
      }
    } else {
      document.body.appendChild(el);
      pageLayers++;
      root.setAttribute('data-nm-cosmos', '');
    }
    impl.init(L);
    refreshDeps(L);
    layers.push(L);
    observeSize(L);
    var handle = {
      kind: kind,
      el: el,
      options: o,
      set: function (patch) {
        assign(o, patch);
        if (patch && patch.blend !== undefined) el.style.mixBlendMode = o.blend && o.blend !== 'normal' ? o.blend : '';
        if (patch && patch.zIndex !== undefined) el.style.zIndex = String(o.zIndex);
        if (patch && patch.fps !== undefined) L.fps = Math.max(1, Math.min(30, +o.fps || 30));
        L.visible = toVisible(o.visible);
        if (impl.update) impl.update(L, patch || {});
        refreshDeps(L);
        L.dirty = true; kick();
        return handle;
      },
      redraw: function () { L.dirty = true; kick(); return handle; },
      destroy: function () { destroy(L); }
    };
    L.handle = handle;
    kick();
    return handle;
  }
  function refreshDeps(L) {
    L.parallax = !!(+L.o.parallax) && !L.still;
    L.scrollDep = !!(L.visible || typeof L.o.progress === 'function' || L.parallax);
  }
  function destroy(L) {
    if (L.dead) return;
    L.dead = true;
    if (ro) ro.unobserve(L.el);
    if (L.io) L.io.disconnect();
    if (L.impl.destroy) L.impl.destroy(L);
    if (L.el.parentNode) L.el.parentNode.removeChild(L.el);
    if (L.host && L.hostRestore) {
      L.host.style.position = L.hostRestore.position;
      L.host.style.isolation = L.hostRestore.isolation;
    } else if (!L.host && --pageLayers <= 0) {
      pageLayers = 0;
      root.removeAttribute('data-nm-cosmos');
    }
    var i = layers.indexOf(L);
    if (i >= 0) layers.splice(i, 1);
    var j = api.layers.indexOf(L.handle);
    if (j >= 0) api.layers.splice(j, 1);
  }

  /* ------------------------------------------------------------------ WebGL */
  function glContext(canvas) {
    // The homepage hero samples page layers as its backdrop when a theme sets heroClear;
    // a presented WebGL canvas only reads back if its buffer is preserved.
    var cfg = window.NMThemeConfig || {};
    var attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: !!cfg.heroClear, failIfMajorPerformanceCaveat: true };
    try { return canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs); }
    catch (e) { return null; }
  }
  function compile(gl, vs, fs) {
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('nm-cosmos shader: ' + gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('nm-cosmos link: ' + gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var a = gl.getActiveUniform(p, i);
      u[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, a.name);
    }
    return { p: p, u: u };
  }
  function highp(gl) {
    var f = gl.getShaderPrecisionFormat && gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    return f && f.precision > 0 ? 'highp' : 'mediump';
  }
  function watchContext(L, rebuild) {
    L.canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); L.lost = true; }, false);
    L.canvas.addEventListener('webglcontextrestored', function () {
      L.lost = false;
      try { rebuild(); L.impl.resize(L, true); L.dirty = true; kick(); } catch (e) { L.failed = true; }
    }, false);
  }
  function loseContext(gl) {
    try { var x = gl && gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* gone */ }
  }
  function capDpr(o, w, h, maxPx) {
    var d = Math.min(window.devicePixelRatio || 1, +o.maxDpr || 1.5);
    if (maxPx && w * h * d * d > maxPx) d = Math.max(0.75, Math.sqrt(maxPx / (w * h)));
    return d;
  }

  /* ------------------------------------------------------------------ stars */
  var STAR_DEFAULTS = {
    opacity: 1, blend: 'normal', zIndex: null, target: null, visible: null, fps: PHONE ? 24 : 30, maxDpr: 1.5,
    density: 1, brightness: 1, twinkle: 0.2, twinkleDepth: 1, spikes: 0.92, spikeAngle: 0, band: 0.3,
    drift: 0, parallax: 0.03, shootingStars: 0, palette: null, seed: 7
  };
  var STAR_PALETTE = [['#C4D6FF', 3], ['#F4F8F0', 3.6], ['#FFE6C2', 2.4], ['#FFC6A2', 1.1], ['#A9C9EE', 1.5]];

  var STAR_VS = [
    'attribute vec2 aPos;',   // tile position 0..1
    'attribute vec4 aStar;',  // brightness, twinkle amplitude, parallax depth, phase
    'attribute vec4 aCol;',   // rgb, twinkle rate (rad/s)
    'uniform vec2 uRes, uTile, uOff;',
    'uniform float uTime, uTwinkle, uBright, uPx, uSpike, uMaxPt;',
    'varying vec3 vCol; varying float vI, vSig, vHalo, vSpk, vSize;',
    'void main() {',
    '  float f = aStar.x;',
    '  vec2 p = mod(aPos * uTile - uOff * aStar.z, uTile) - (uTile - uRes) * 0.5;',
    '  p = floor(p) + 0.5;', // crisp cores: centre each star on a pixel
    '  float tw = 1.0;',
    '  if (aStar.y > 0.0) {',
    '    float w = aCol.a, ph = aStar.w;',
    // two incommensurate waves: mostly gentle breathing, with rare short glints at crests
    '    float n = 0.62 * sin(uTime * w + ph) + 0.38 * sin(uTime * w * 2.31 + ph * 3.7);',
    '    tw = 1.0 + aStar.y * uTwinkle * (0.5 * n + 1.3 * pow(max(n, 0.0), 7.0) - 0.12);',
    '    tw = max(tw, 0.06);',
    '  }',
    '  vI = uBright * (0.05 + 0.95 * pow(f, 0.62)) * tw;',
    '  vSig = uPx * max(0.42, 0.3 + 0.75 * f);',
    '  vHalo = smoothstep(0.15, 1.0, f) * 0.55 * min(tw, 1.6);',
    '  vSpk = uSpike < 1.0 ? smoothstep(uSpike, 1.0, f) * clamp(tw, 0.0, 1.8) : 0.0;',
    '  float r = vSig * 3.4 + (vHalo > 0.0 ? uPx * 12.0 : 0.0) + vSpk * uPx * 16.0;',
    '  vSize = min(2.0 * r + 2.0, uMaxPt);',
    '  gl_PointSize = vSize;',
    '  vec2 c = p / uRes * 2.0 - 1.0;',
    '  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);',
    '  vCol = aCol.rgb;',
    '}'
  ].join('\n');
  var STAR_FS = [
    'precision mediump float;',
    'uniform float uPxF; uniform vec2 uSpikeDir;',
    'varying vec3 vCol; varying float vI, vSig, vHalo, vSpk, vSize;',
    'void main() {',
    '  vec2 d = (gl_PointCoord - 0.5) * vSize;',
    '  float r2 = dot(d, d);',
    '  float core = exp(-r2 / (2.0 * vSig * vSig));',
    '  float rc = sqrt(r2) / uPxF;',   // CSS px from the centre
    '  float halo = vHalo * (exp(-rc * 1.1) * 0.6 + exp(-rc * 0.3) * 0.1);',
    '  float spk = 0.0;',
    '  if (vSpk > 0.001) {',
    '    vec2 a = abs(vec2(dot(d, uSpikeDir), dot(d, vec2(-uSpikeDir.y, uSpikeDir.x)))) / uPxF;',
    '    float len = 2.0 + 5.5 * vSpk;',
    '    spk = vSpk * 0.26 * (exp(-a.y * 2.6 - a.x / len) + exp(-a.x * 2.6 - a.y / len));',
    '  }',
    '  float edge = 1.0 - smoothstep(0.4, 0.5, length(gl_PointCoord - 0.5));',
    '  float I = vI * (core + halo + spk) * edge;',
    // near-white centres on the brightest, colour in the glow: how stars photograph
    '  vec3 c = mix(vCol, vec3(1.0), clamp(core * vI * 0.35, 0.0, 0.4));',
    '  gl_FragColor = vec4(c * I, min(I, 1.0));',
    '}'
  ].join('\n');
  var TRAIL_VS = [
    'attribute vec4 aV;', // px x, px y, along (0 tail .. 1 head), across (-1..1)
    'uniform vec2 uRes;',
    'varying vec2 vA;',
    'void main() { vA = aV.zw; vec2 c = aV.xy / uRes * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); }'
  ].join('\n');
  var TRAIL_FS = [
    'precision mediump float;',
    'uniform float uI, uLen, uW; uniform vec3 uHead, uTail;',
    'varying vec2 vA;',
    'void main() {',
    '  float u = clamp(vA.x, 0.0, 1.0);',
    '  float w = mix(0.9, 0.35, u);',
    '  float I = uI * pow(u, 2.2) * exp(-vA.y * vA.y / (w * w * 0.12)) * step(vA.x, 1.0);',
    // round head: a small glow measured in pixels from the head point
    '  vec2 h = vec2((vA.x - 1.0) * uLen, vA.y * uW);',
    '  I += uI * 0.85 * exp(-dot(h, h) / (uW * uW * 0.35));',
    '  gl_FragColor = vec4(mix(uTail, uHead, u) * I, min(I, 1.0));',
    '}'
  ].join('\n');

  function starPalette(p) {
    p = p || STAR_PALETTE;
    var list = [], total = 0;
    for (var i = 0; i < p.length; i++) {
      var e = Array.isArray(p[i]) ? p[i] : [p[i], 1];
      list.push({ c: rgb(e[0]), w: +e[1] || 1 });
      total += +e[1] || 1;
    }
    return { list: list, total: total };
  }
  // Power-law magnitudes: most stars near the floor, a handful bright.
  function starMag(u) {
    var a = 2.0, lo = 0.05, k = Math.pow(lo, 1 - a);
    return Math.min(1, Math.pow(k - u * (k - 1), 1 / (1 - a)));
  }
  function buildStars(L) {
    var o = L.o, r = rng((+o.seed || 7) * 7919 + 13);
    var tw = L.tileW / L.dpr, th = L.tileH / L.dpr;
    // main population plus an unresolved "dust" of very faint stars that gives the sky depth
    var n = Math.round(Math.max(0, +o.density) * 1250 * (PHONE ? 0.75 : 1) * tw * th / 1e6);
    n = Math.min(n, 9000);
    var pal = starPalette(o.palette);
    var data = new Float32Array(n * 10);
    var bandFrac = clamp01(+o.band || 0), twFrac = clamp01(+o.twinkle || 0);
    var bandPhase = r(), bandWave = r() * 6.283;
    for (var i = 0; i < n; i++) {
      var dust = r() < 0.55;
      var x, y, f = dust ? 0.004 * Math.pow(7.5, r()) : starMag(r()), inBand = r() < bandFrac;
      if (inBand) {
        // a soft diagonal lane (seamless when the tile wraps), clumped along its length
        do { x = r(); } while (r() > 0.55 + 0.45 * Math.sin(x * 6.283 * 3 + bandWave));
        var g = (r() + r() + r() - 1.5) * 0.11;
        y = ((bandPhase - x + g) % 1 + 1) % 1;
        f = Math.min(f, 0.02 + r() * 0.14);
      } else { x = r(); y = r(); }
      var pick = r() * pal.total, c = pal.list[0].c;
      for (var j = 0, acc = 0; j < pal.list.length; j++) { acc += pal.list[j].w; if (pick <= acc) { c = pal.list[j].c; break; } }
      // faint stars read nearly colourless; colour shows as they brighten
      var sat = 0.5 + 0.65 * smooth(0.03, 0.3, f), lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
      var amp = 0;
      if (!dust && r() < twFrac * (0.8 + 1.2 * Math.sqrt(f))) amp = 0.35 + 0.65 * r();
      var rate = r() < 0.18 ? 2.2 + 2.2 * r() : 0.45 + 1.5 * r() * r();
      var k = i * 10;
      data[k] = x; data[k + 1] = y;
      data[k + 2] = f; data[k + 3] = amp; data[k + 4] = 0.3 + 0.7 * (0.5 * r() + 0.5 * Math.sqrt(f)); data[k + 5] = r() * 6.283;
      data[k + 6] = lum + (c[0] - lum) * sat; data[k + 7] = lum + (c[1] - lum) * sat; data[k + 8] = lum + (c[2] - lum) * sat;
      data[k + 9] = rate;
    }
    L.count = n;
    L.data = data;
  }

  var starsImpl = {
    init: function (L) {
      var c = L.canvas = document.createElement('canvas');
      L.el.appendChild(c);
      L.scrollGap = 0; // parallax follows the scroll at display rate
      var gl = L.gl = glContext(c);
      if (gl) {
        var build = function () {
          L.prog = compile(gl, STAR_VS, STAR_FS);
          L.trail = compile(gl, TRAIL_VS, TRAIL_FS);
          L.loc = { pos: gl.getAttribLocation(L.prog.p, 'aPos'), star: gl.getAttribLocation(L.prog.p, 'aStar'),
            col: gl.getAttribLocation(L.prog.p, 'aCol'), trail: gl.getAttribLocation(L.trail.p, 'aV') };
          L.buf = gl.createBuffer();
          L.tbuf = gl.createBuffer();
          var pr = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
          L.maxPt = pr && pr[1] ? pr[1] : 64;
          L.uploaded = false;
        };
        try { build(); watchContext(L, build); }
        catch (e) { loseContext(gl); L.gl = null; }
      }
      if (!L.gl) {
        // A context that failed once cannot be swapped for 2D on the same canvas.
        L.el.removeChild(c);
        c = L.canvas = document.createElement('canvas');
        L.el.appendChild(c);
        L.ctx = c.getContext('2d');
        L.still = true; // the 2D fallback is a still sky: no twinkle, parallax or meteors
      }
      L.nextShot = -1;
      L.shot = null;
    },
    update: function (L, patch) {
      if (L.tileW && ('density' in patch || 'palette' in patch || 'seed' in patch || 'band' in patch || 'twinkle' in patch)) {
        buildStars(L); L.uploaded = false;
      }
    },
    resize: function (L, force) {
      var dpr = capDpr(L.o, L.w, L.h, 0);
      var cw = Math.max(1, Math.round(L.w * dpr)), ch = Math.max(1, Math.round(L.h * dpr));
      if (!force && cw === L.canvas.width && ch === L.canvas.height && dpr === L.dpr && L.data) return;
      L.dpr = dpr;
      L.canvas.width = cw; L.canvas.height = ch;
      var m = Math.round(48 * dpr);
      var oldW = L.tileW, oldH = L.tileH;
      L.tileW = cw + 2 * m; L.tileH = ch + 2 * m;
      // Mobile toolbars nudge the height; keep the sky unless the area really changed.
      if (!L.data || force || Math.abs(L.tileW * L.tileH - oldW * oldH) > 0.12 * oldW * oldH || Math.abs(L.tileW - oldW) > 2) {
        buildStars(L); L.uploaded = false;
      }
    },
    animates: function (L) {
      var o = L.o;
      if (L.still) return false;
      return (+o.twinkle > 0 && +o.twinkleDepth > 0) || !!driftOf(o)[0] || !!driftOf(o)[1] || +o.shootingStars > 0;
    },
    draw: function (L) {
      var o = L.o, dpr = L.dpr, motion = !S.reduced;
      var d = driftOf(o);
      var ox = motion ? d[0] * L.t * dpr : 0;
      var oy = motion ? (d[1] * L.t + S.y * (+o.parallax || 0)) * dpr : 0;
      if (!L.gl) { draw2dStars(L, 0, 0); return; }
      if (L.lost) return;
      var gl = L.gl, P = L.prog, u = P.u, cw = L.canvas.width, ch = L.canvas.height;
      gl.viewport(0, 0, cw, ch);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(P.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, L.buf);
      if (!L.uploaded) { gl.bufferData(gl.ARRAY_BUFFER, L.data, gl.STATIC_DRAW); L.uploaded = true; }
      var aPos = L.loc.pos, aStar = L.loc.star, aCol = L.loc.col;
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 40, 0);
      gl.enableVertexAttribArray(aStar); gl.vertexAttribPointer(aStar, 4, gl.FLOAT, false, 40, 8);
      gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 40, 24);
      var ang = (+o.spikeAngle || 0) * Math.PI / 180;
      gl.uniform2f(u.uRes, cw, ch);
      gl.uniform2f(u.uTile, L.tileW, L.tileH);
      gl.uniform2f(u.uOff, ox, oy);
      gl.uniform1f(u.uTime, motion ? L.t : 0);
      gl.uniform1f(u.uTwinkle, motion ? (+o.twinkleDepth || 0) : 0);
      gl.uniform1f(u.uBright, +o.brightness || 0);
      gl.uniform1f(u.uPx, dpr);
      gl.uniform1f(u.uPxF, dpr);
      gl.uniform1f(u.uSpike, +o.spikes > 0 ? +o.spikes : 2);
      gl.uniform1f(u.uMaxPt, L.maxPt);
      gl.uniform2f(u.uSpikeDir, Math.cos(ang), Math.sin(ang));
      gl.drawArrays(gl.POINTS, 0, L.count);
      gl.disableVertexAttribArray(aStar); gl.disableVertexAttribArray(aCol);
      if (motion && +o.shootingStars > 0) drawShot(L, gl, aPos);
      else gl.disableVertexAttribArray(aPos);
    },
    destroy: function (L) { loseContext(L.gl); L.gl = null; }
  };
  function driftOf(o) {
    var d = o.drift;
    if (Array.isArray(d)) return [+d[0] || 0, +d[1] || 0];
    return [+d || 0, 0];
  }
  function drawShot(L, gl, aPosLoc) {
    gl.disableVertexAttribArray(aPosLoc);
    var o = L.o, t = L.t, r = L.shotRng || (L.shotRng = rng((+o.seed || 7) * 31 + 5));
    var mean = Math.max(3, +o.shootingStars);
    if (L.nextShot < 0) L.nextShot = t + mean * (0.35 + r());
    if (!L.shot && t >= L.nextShot) {
      var ang = (18 + r() * 22) * Math.PI / 180, dir = r() < 0.5 ? -1 : 1;
      L.shot = {
        t0: t, life: 1.1 + r() * 0.7, speed: 240 + r() * 170, len: 110 + r() * 110,
        x: L.w * (dir > 0 ? 0.1 + r() * 0.5 : 0.4 + r() * 0.5), y: L.h * (0.06 + r() * 0.4),
        dx: Math.cos(ang) * dir, dy: Math.sin(ang), b: 0.55 + r() * 0.35
      };
    }
    var s = L.shot;
    if (!s) return;
    var age = t - s.t0, u = age / s.life;
    if (u >= 1 || u < 0) { L.shot = null; L.nextShot = t + mean * (0.4 + 1.2 * r()); return; }
    var dpr = L.dpr, hx = (s.x + s.dx * s.speed * age) * dpr, hy = (s.y + s.dy * s.speed * age) * dpr;
    var len = s.len * dpr * Math.min(1, age / 0.35), w = 2.6 * dpr;
    var tx = hx - s.dx * len, ty = hy - s.dy * len, nx = -s.dy * w, ny = s.dx * w;
    var ext = w * 1.5, ue = 1 + ext / Math.max(1, len);
    var hx2 = hx + s.dx * ext, hy2 = hy + s.dy * ext;
    var v = new Float32Array([
      tx + nx, ty + ny, 0, 1, tx - nx, ty - ny, 0, -1,
      hx2 + nx, hy2 + ny, ue, 1, hx2 - nx, hy2 - ny, ue, -1
    ]);
    var env = smooth(0, 0.12, u) * (1 - smooth(0.45, 1, u));
    var P = L.trail, loc = L.loc.trail;
    gl.useProgram(P.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, L.tbuf);
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 16, 0);
    gl.uniform2f(P.u.uRes, L.canvas.width, L.canvas.height);
    gl.uniform1f(P.u.uI, env * s.b * (+o.brightness || 1));
    gl.uniform1f(P.u.uLen, Math.max(1, len));
    gl.uniform1f(P.u.uW, w);
    var head = rgb(PALETTE.warmWhite), tail = rgb(PALETTE.peach);
    gl.uniform3f(P.u.uHead, head[0], head[1], head[2]);
    gl.uniform3f(P.u.uTail, tail[0], tail[1], tail[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(loc);
  }
  function draw2dStars(L, ox, oy) {
    var ctx = L.ctx, cw = L.canvas.width, ch = L.canvas.height, d = L.data, dpr = L.dpr;
    if (!ctx || !d) return;
    ctx.clearRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'lighter';
    var b = +L.o.brightness || 0;
    for (var i = 0; i < L.count; i++) {
      var k = i * 10, f = d[k + 2], dep = d[k + 4];
      var x = ((d[k] * L.tileW - ox * dep) % L.tileW + L.tileW) % L.tileW - (L.tileW - cw) / 2;
      var y = ((d[k + 1] * L.tileH - oy * dep) % L.tileH + L.tileH) % L.tileH - (L.tileH - ch) / 2;
      if (x < -20 || y < -20 || x > cw + 20 || y > ch + 20) continue;
      var I = Math.min(1, b * (0.05 + 0.95 * Math.pow(f, 0.62)));
      var col = 'rgba(' + (d[k + 6] * 255 | 0) + ',' + (d[k + 7] * 255 | 0) + ',' + (d[k + 8] * 255 | 0) + ',';
      var rad = dpr * (0.6 + 0.9 * f);
      if (f > 0.3) {
        var g = ctx.createRadialGradient(x, y, 0, x, y, rad * 6);
        g.addColorStop(0, col + (I * 0.35).toFixed(3) + ')');
        g.addColorStop(1, col + '0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - rad * 6, y - rad * 6, rad * 12, rad * 12);
      }
      ctx.fillStyle = col + I.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* --------------------------------------------------------------- airbrush */
  var AIR_DEFAULTS = {
    opacity: 1, blend: 'normal', zIndex: null, target: null, visible: null, fps: PHONE ? 24 : 30, maxDpr: 1.5,
    mode: 'bands', scale: 1, speed: 1, warp: 1, lines: 1, width: 1, amount: 0.5, intensity: 1,
    grain: 1, speck: 1, darken: 0, hueShift: 0, centerDim: null, ground: null, palette: null, palettes: null,
    parallax: 0, resolution: PHONE ? 0.3 : 0.25, progress: null, seed: 5
  };
  // Ashima / Gustavson 2D simplex noise (MIT), domain-warped fbm on top.
  var NOISE = [
    'vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
    'vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
    'vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }',
    'float snoise(vec2 v) {',
    '  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);',
    '  vec2 i = floor(v + dot(v, C.yy));',
    '  vec2 x0 = v - i + dot(i, C.xx);',
    '  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);',
    '  vec4 x12 = x0.xyxy + C.xxzz;',
    '  x12.xy -= i1;',
    '  i = mod289(i);',
    '  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));',
    '  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);',
    '  m = m * m; m = m * m;',
    '  vec3 x = 2.0 * fract(p * C.www) - 1.0;',
    '  vec3 h = abs(x) - 0.5;',
    '  vec3 ox = floor(x + 0.5);',
    '  vec3 a0 = x - ox;',
    '  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);',
    '  vec3 g;',
    '  g.x = a0.x * x0.x + h.x * x0.y;',
    '  g.yz = a0.yz * x12.xz + h.yz * x12.yw;',
    '  return 130.0 * dot(m, g);',
    '}',
    'const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);',
    'float fbm(vec2 p) {',
    '  float s = 0.0, a = 0.5;',
    '  for (int i = 0; i < OCT; i++) { s += a * snoise(p); p = ROT * p * 2.02 + 19.1; a *= 0.5; }',
    '  return s;',
    '}',
    'float fbm3(vec2 p) {',
    '  float s = 0.0, a = 0.55;',
    '  for (int i = 0; i < 3; i++) { s += a * snoise(p); p = ROT * p * 2.02 + 19.1; a *= 0.4; }',
    '  return s;',
    '}',
    'float hash1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }'
  ].join('\n');
  var QUAD_VS = 'attribute vec2 aP; varying vec2 vUv; void main() { vUv = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }';

  // Pass 1 (low resolution): pigment coverage fields, packed into RGBA.
  //   bands:  r coral stroke, g warm halo (cream/peach), b cool ground variation, a deep core
  //   nebula: r bloom density, g hot core, b cool haze, a dust lanes
  var FIELD_FS = [
    'precision PREC float;',
    'uniform vec2 uRes, uOff;',
    'uniform float uAspect, uTime, uScale, uWarp, uLevels, uWidth, uAmount, uSeed;',
    'varying vec2 vUv;',
    NOISE,
    'float bandField(vec2 p, float t, out vec2 q, out vec2 r) {',
    '  vec2 pp = p * 0.42;',
    '  q = vec2(fbm3(pp + t * vec2(0.021, 0.013)), fbm3(pp + vec2(5.2, 1.3) + t * vec2(-0.017, 0.019)));',
    '  r = vec2(fbm3(pp + 1.2 * q + vec2(1.7, 9.2) + t * 0.027), fbm3(pp + 1.2 * q + vec2(8.3, 2.8) - t * 0.023));',
    '  vec2 w = p * 0.4 + uWarp * 0.52 * r;',
    '  return snoise(w) * 0.8 + snoise(w * 1.9 + 4.7) * 0.06;',
    '}',
    'void main() {',
    '  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * uScale + uOff + uSeed;',
    '  float t = uTime;',
    '#if MODE == 0',
    // smooth, low-octave warps so the contours stay long sprayed strokes, not fractal coastlines
    '  vec2 q, r;',
    '  float v = bandField(p, t, q, r);',
    // true gradient by finite differences (fwidth is 2x2-coarse and anisotropic at this resolution)
    '  float e = uScale / uRes.y * 1.25;',
    '  vec2 q2, r2;',
    '  float gx = (bandField(p + vec2(e, 0.0), t, q2, r2) - v) / e;',
    '  float gy = (bandField(p + vec2(0.0, e), t, q2, r2) - v) / e;',
    '  float Lv = v * uLevels + 0.37;',
    // distance to each contour in field units, partly normalised by the local gradient so
    // strokes keep an airbrush width instead of ballooning where the field is flat
    '  float g = length(vec2(gx, gy)) * uLevels;',
    '  float gref = uLevels * 0.6;',
    '  float gn = mix(gref, clamp(g, gref * 0.5, gref * 2.6), 0.85);',
    '  float k = floor(Lv + 0.5);',
    '  vec4 acc = vec4(0.0);',
    // the nearest contour and both neighbours, so a stroke never ends at an index seam
    '  for (int j = -1; j <= 1; j++) {',
    '    float fl = k + float(j);',
    '    float dist = abs(Lv - fl) / gn;',
    '    float h1 = hash1(fl * 17.13 + uSeed), h2 = hash1(fl * 5.71 + 3.1 + uSeed);',
    '    float brk = smoothstep(-0.5, 0.1, snoise(p * 0.5 + vec2(fl * 3.7, fl * 1.9) + t * 0.011));',
    '    float wid = uWidth * (0.8 + 0.4 * h2);',
    '    float isLine = step(0.2, h1);',
    '    float core = exp(-(dist * dist) / (wid * wid));',
    '    float mist = exp(-dist / (wid * 2.2)) * 0.16;',
    '    float coral = min(1.0, core + mist) * isLine * brk;',
    '    float deep = exp(-(dist * dist) / (wid * wid * 0.28)) * isLine * brk * (0.55 + 0.45 * h2);',
    '    float halo = exp(-(dist * dist) / (wid * wid * 5.0)) * mix(0.5, 1.0, brk) * mix(0.8, 1.0, isLine);',
    '    acc = max(acc, vec4(coral, halo, 0.0, deep));',
    '  }',
    '  float cool = 0.5 + 0.9 * fbm3(p * 0.22 + q * 0.25 + 7.3);',
    '  gl_FragColor = vec4(clamp(acc.r, 0.0, 1.0), clamp(acc.g, 0.0, 1.0), clamp(cool, 0.0, 1.0), clamp(acc.a, 0.0, 1.0));',
    '#else',
    // painted nebula: a soft glow envelope (two or three blooms per screen), low-contrast
    // billows inside it, a few ridged wisps, and a separate ice-blue reflection haze
    '  vec2 q = vec2(fbm3(p * 0.35 + t * vec2(0.02, 0.012)), fbm3(p * 0.35 + vec2(5.2, 1.3) - t * vec2(0.015, 0.02)));',
    '  vec2 pw = p + q * 0.9 * uWarp;',
    '  float big = fbm3(pw * 0.38 + 2.7);',
    '  float glow = smoothstep(-0.2 - uAmount * 0.35, 0.62, big);',
    '  glow *= glow;',
    '  float cloud = fbm(pw * 1.05 + 1.3) * 0.5 + 0.5;',
    '  float dens = glow * mix(0.3, 1.0, smoothstep(0.25, 0.8, cloud));',
    '  float rid = 1.0 - abs(snoise(pw * 1.5 + q * 1.3 + 4.1));',
    '  float fil = pow(rid, 7.0) * smoothstep(0.03, 0.45, glow);',
    '  float hot = pow(clamp(dens * 1.2, 0.0, 1.0), 3.0);',
    '  float blueR = smoothstep(-0.05, 0.6, fbm3(pw * 0.3 + 8.1));',
    '  float coolv = blueR * (0.3 + 0.7 * smoothstep(0.2, 0.8, cloud)) * (1.0 - 0.75 * glow);',
    '  float dust = smoothstep(0.6, 0.82, fbm(pw * 1.9 + 11.0) * 0.5 + 0.5) * glow * 0.85;',
    '  gl_FragColor = vec4(clamp(dens * 0.92 + fil * 0.3, 0.0, 1.0), clamp(hot, 0.0, 1.0), clamp(coolv, 0.0, 1.0), clamp(dust, 0.0, 1.0));',
    '#endif',
    '}'
  ].join('\n');

  // Pass 2 (full resolution): colour the upscaled fields and spray them. The speck
  // pattern is fixed to the screen like fibres of the cloth, so pigment flows through it.
  var PAINT_FS = [
    'precision PREC float;',
    'uniform sampler2D uField, uNoise;',
    'uniform float uSpeck, uGrain, uHue, uIntensity, uCenter;',
    'uniform vec3 uCream, uWhite, uIce, uSky, uPeach, uCoral, uDeep, uViolet;',
    'uniform vec4 uGround;',
    'varying vec2 vUv;',
    'float spray(float c, float n, float g) {',
    '  float s = smoothstep(n - 0.28, n + 0.28, c);',
    '  return mix(c, s, g * 0.7 * clamp(c * (1.0 - c) * 4.0, 0.0, 1.0));',
    '}',
    'vec3 sat(vec3 c, float k) { return max(mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, k), 0.0); }',
    'vec3 hue(vec3 c, float a) {',
    '  vec3 y = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c;',
    '  float cs = cos(a), sn = sin(a);',
    '  y.yz = vec2(cs * y.y - sn * y.z, sn * y.y + cs * y.z);',
    '  return mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * y;',
    '}',
    'void main() {',
    '  vec4 f = texture2D(uField, vUv);',
    '  vec2 q = gl_FragCoord.xy / (256.0 * uSpeck);',
    '  vec4 n1 = texture2D(uNoise, q);',
    '  vec4 n2 = texture2D(uNoise, q * 0.41 + vec2(0.37, 0.71));',
    '  vec4 n = mix(n1, n2, 0.18);',
    '  float center = 1.0 - uCenter * (1.0 - smoothstep(0.16, 0.4, abs(vUv.x - 0.5)));',
    '#if MODE == 0',
    '  float cS = spray(f.r * uIntensity * center, n.r, uGrain);',
    '  float hS = spray(f.g * min(uIntensity, 1.0) * center, n.g, uGrain * 0.6);',
    '  float dS = spray(f.a * uIntensity * center, n.b, uGrain * 0.7);',
    '  vec3 col = mix(uSky, uIce, smoothstep(0.1, 0.5, f.b) * 0.4);',
    '  col = mix(col, uWhite, smoothstep(0.3, 0.8, f.b) * 0.9);',
    '  col = mix(col, uCream, smoothstep(0.0, 0.8, hS) * 0.95);',
    '  col = mix(col, uPeach, smoothstep(0.0, 0.42, cS) * 0.92);',
    '  col = mix(col, uCoral, smoothstep(0.18, 0.78, cS));',
    '  col = mix(col, uDeep, smoothstep(0.35, 1.0, dS) * 0.78);',
    '  col *= 1.0 + (n1.a - 0.5) * 0.05 * uGrain;',
    '  if (uHue != 0.0) col = hue(col, uHue);',
    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
    '#else',
    '  float dS = spray(f.r, n.r, uGrain);',
    '  float hS = spray(f.g, n.g, uGrain);',
    '  float cS = spray(f.b, n.b, uGrain * 0.6);',
    // emission ramp: rose-violet in the faint outskirts (never brown), coral, then peach in
    // the cores; luminance falls off softly like glowing gas
    '  vec3 rose = sat(mix(uDeep, uViolet, 0.38), 1.5);',
    '  vec3 coral = sat(uCoral, 1.35), peach = sat(uPeach, 1.2);',
    '  vec3 blue = sat(mix(uSky, uViolet, 0.18), 3.2);',
    '  vec3 ramp = dS < 0.5 ? mix(rose, coral, dS * 2.0) : mix(coral, peach, dS * 2.0 - 1.0);',
    '  float dm = mix(f.r, dS, 0.55);',  // glowing gas under the spray, not only specks
    '  vec3 e = blue * mix(f.b, cS, 0.5) * 0.17;',
    '  e += rose * smoothstep(0.0, 0.5, f.r) * 0.07;',
    '  e += ramp * pow(dm, 1.2) * 0.8;',
    '  e += mix(peach, uCream, hS) * mix(f.g, hS, 0.5) * 0.3;',
    '  e *= mix(vec3(1.0), vec3(0.62, 0.42, 0.5), f.a);',  // dust reddens and dims, never greys
    '  e *= uIntensity * center * (1.0 + (n1.a - 0.5) * 0.12 * uGrain);',
    '  if (uHue != 0.0) e = hue(e, uHue);',
    '  e = max(e, 0.0);',
    '  if (uGround.a > 0.0) {',
    '    gl_FragColor = vec4(clamp(uGround.rgb * (1.0 + (n1.a - 0.5) * 0.08 * uGrain) + e, 0.0, 1.0), 1.0);',
    '  } else {',
    '    float a = clamp(max(e.r, max(e.g, e.b)) * 1.1, 0.0, 1.0);',
    '    gl_FragColor = vec4(min(e, vec3(a)), a);',
    '  }',
    '#endif',
    '}'
  ].join('\n');

  function paletteFor(o, darken) {
    var day = {};
    for (var i = 0; i < TOKENS.length; i++) day[TOKENS[i]] = rgb((o.palette && o.palette[TOKENS[i]]) || PALETTE[TOKENS[i]]);
    if (o.mode === 'nebula' || !(darken > 0)) return day;
    var names = ['golden', 'dusk', 'night'], stops = [day];
    for (var s = 1; s < STOPS.length; s++) {
      var over = o.palettes && o.palettes[names[s - 1]], st = {};
      for (var k = 0; k < TOKENS.length; k++) {
        var key = TOKENS[k];
        st[key] = over && over[key] ? rgb(over[key]) : STOPS[s].p[key] ? rgb(STOPS[s].p[key]) : day[key];
      }
      stops.push(st);
    }
    var x = clamp01(darken), a = 0;
    while (a < STOPS.length - 2 && x > STOPS[a + 1].at) a++;
    var t = smooth(0, 1, (x - STOPS[a].at) / (STOPS[a + 1].at - STOPS[a].at)), out = {};
    for (var m = 0; m < TOKENS.length; m++) out[TOKENS[m]] = mix3(stops[a][TOKENS[m]], stops[a + 1][TOKENS[m]], t);
    return out;
  }

  var airImpl = {
    init: function (L) {
      var c = L.canvas = document.createElement('canvas');
      L.el.appendChild(c);
      L.scrollGap = 1000 / L.fps;
      L.t = 40 + (+L.o.seed || 0) * 13.7; // start mid-flow, not at the noise origin
      var gl = L.gl = glContext(c);
      var ok = false;
      if (gl) {
        var build = function () {
          var mode = L.o.mode === 'nebula' ? 1 : 0, oct = PHONE ? 4 : 5;
          var defs = '#define MODE ' + mode + '\n#define OCT ' + oct + '\n';
          L.field = compile(gl, QUAD_VS, FIELD_FS.replace('PREC', highp(gl)).replace('precision', defs + 'precision'));
          L.paint = compile(gl, QUAD_VS, defs + PAINT_FS.replace('PREC', highp(gl)));
          L.builtMode = L.o.mode;
          L.quad = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, L.quad);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
          L.noise = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, L.noise);
          var r = rng(911), px = new Uint8Array(256 * 256 * 4);
          for (var i = 0; i < px.length; i++) px[i] = r() * 256 | 0;
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
          L.tex = gl.createTexture();
          L.fbo = gl.createFramebuffer();
          L.fw = L.fh = 0;
        };
        try { build(); watchContext(L, build); ok = true; L.rebuild = build; }
        catch (e) { ok = false; }
      }
      if (!ok) {
        loseContext(gl);
        L.gl = null;
        L.el.removeChild(c);
        L.canvas = null;
        airFallback(L);
      }
    },
    update: function (L, patch) {
      if (L.gl && 'mode' in patch && patch.mode !== L.builtMode) {
        try { L.rebuild(); L.impl.resize(L, true); } catch (e) { L.failed = true; }
      }
      if (!L.gl) airFallback(L);
    },
    resize: function (L, force) {
      if (!L.gl) return;
      var o = L.o, gl = L.gl;
      var dpr = capDpr(o, L.w, L.h, PHONE ? 1.6e6 : 3.4e6);
      var cw = Math.max(1, Math.round(L.w * dpr)), ch = Math.max(1, Math.round(L.h * dpr));
      if (force || cw !== L.canvas.width || ch !== L.canvas.height) {
        L.canvas.width = cw; L.canvas.height = ch;
      }
      L.dpr = dpr;
      var res = Math.max(0.08, Math.min(0.6, +o.resolution || 0.25));
      var fw = Math.max(8, Math.round(L.w * res)), fh = Math.max(8, Math.round(L.h * res));
      var cap = PHONE ? 256 : 512, big = Math.max(fw, fh);
      if (big > cap) { fw = Math.round(fw * cap / big); fh = Math.round(fh * cap / big); }
      if (force || fw !== L.fw || fh !== L.fh) {
        L.fw = fw; L.fh = fh;
        gl.bindTexture(gl.TEXTURE_2D, L.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, L.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, L.tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
    },
    animates: function (L) { return +L.o.speed > 0 && !!L.gl; },
    draw: function (L) {
      var o = L.o, pr = L.progOut || {};
      if (!L.gl) { paintFallback(L, pr); return; }
      if (L.lost) return;
      var gl = L.gl, mode = o.mode === 'nebula' ? 1 : 0;
      var scale = (mode ? 2.6 : 1.75) / Math.max(0.1, +o.scale || 1);
      var darken = pr.darken != null ? +pr.darken : +o.darken || 0;
      var intensity = (pr.intensity != null ? +pr.intensity : +o.intensity) * (mode ? 1 - 0.85 * clamp01(darken) : 1);
      var off = pr.offset || [0, 0];
      var par = S.reduced ? 0 : (+o.parallax || 0) * S.y / Math.max(1, S.vh || L.h) * scale;
      // Pass 1: fields.
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, L.fbo);
      gl.viewport(0, 0, L.fw, L.fh);
      var F = L.field;
      gl.useProgram(F.p);
      quad(gl, F.p, L.quad);
      gl.uniform2f(F.u.uRes, L.fw, L.fh);
      gl.uniform2f(F.u.uOff, +off[0] || 0, (+off[1] || 0) - par);
      gl.uniform1f(F.u.uAspect, L.w / Math.max(1, L.h));
      gl.uniform1f(F.u.uTime, L.t * 0.22);
      gl.uniform1f(F.u.uScale, scale);
      gl.uniform1f(F.u.uWarp, +o.warp);
      gl.uniform1f(F.u.uLevels, (mode ? 2.6 : 1.7) * (+o.lines || 1));
      gl.uniform1f(F.u.uWidth, 0.1 * (+o.width || 1));
      gl.uniform1f(F.u.uAmount, clamp01(+o.amount));
      gl.uniform1f(F.u.uSeed, (+o.seed || 0) * 1.618);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Pass 2: paint and spray.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, L.canvas.width, L.canvas.height);
      var P = L.paint, u = P.u, pal = paletteFor(o, mode ? 0 : darken);
      gl.useProgram(P.p);
      quad(gl, P.p, L.quad);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, L.tex); gl.uniform1i(u.uField, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, L.noise); gl.uniform1i(u.uNoise, 1);
      gl.uniform1f(u.uSpeck, Math.max(0.5, L.dpr * 0.9 * (+o.speck || 1)));
      gl.uniform1f(u.uGrain, Math.max(0, +o.grain));
      gl.uniform1f(u.uHue, ((pr.hueShift != null ? +pr.hueShift : +o.hueShift) || 0) * Math.PI / 180);
      gl.uniform1f(u.uIntensity, Math.max(0, intensity));
      gl.uniform1f(u.uCenter, clamp01(o.centerDim != null ? +o.centerDim : mode ? 0.45 : 0));
      var map = { uCream: 'cream', uWhite: 'warmWhite', uIce: 'ice', uSky: 'sky', uPeach: 'peach', uCoral: 'coral', uDeep: 'deepCoral', uViolet: 'violet' };
      for (var k in map) gl.uniform3fv(u[k], pal[map[k]]);
      var g = o.ground ? rgb(o.ground) : null;
      gl.uniform4f(u.uGround, g ? g[0] : 0, g ? g[1] : 0, g ? g[2] : 0, g ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    },
    destroy: function (L) { loseContext(L.gl); L.gl = null; }
  };
  function quad(gl, p, buf) {
    var a = gl.getAttribLocation(p, 'aP');
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  }
  // No WebGL: a still, sprayed CSS-gradient field (same palette), grain tile on top.
  function airFallback(L) {
    var o = L.o, p = paletteFor(o, 0), hex = function (c, a) {
      return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + a + ')';
    };
    var el = L.fb || (L.fb = document.createElement('i'));
    if (!el.parentNode) L.el.appendChild(el);
    if (o.mode === 'nebula') {
      el.style.background =
        'radial-gradient(38% 30% at 18% 22%,' + hex(p.coral, 0.22) + ',' + hex(p.deepCoral, 0.1) + ' 45%,transparent 72%),' +
        'radial-gradient(30% 26% at 84% 70%,' + hex(p.peach, 0.18) + ',' + hex(p.coral, 0.08) + ' 50%,transparent 75%),' +
        'radial-gradient(45% 40% at 70% 18%,' + hex(p.sky, 0.1) + ',transparent 70%),' +
        'radial-gradient(40% 35% at 30% 85%,' + hex(p.violet, 0.1) + ',transparent 70%)';
    } else {
      el.style.background =
        'radial-gradient(22% 60% at 22% 40%,' + hex(p.deepCoral, 0.85) + ',' + hex(p.coral, 0.7) + ' 30%,' + hex(p.peach, 0.45) + ' 52%,transparent 74%),' +
        'radial-gradient(18% 50% at 72% 62%,' + hex(p.coral, 0.8) + ',' + hex(p.peach, 0.5) + ' 40%,transparent 72%),' +
        'radial-gradient(40% 45% at 48% 20%,' + hex(p.cream, 0.9) + ',transparent 70%),' +
        'radial-gradient(35% 40% at 88% 18%,' + hex(p.warmWhite, 1) + ',transparent 70%),' +
        'linear-gradient(160deg,' + hex(p.warmWhite, 1) + ',' + hex(p.ice, 1) + ' 50%,' + hex(p.sky, 1) + ')';
    }
    var gr = L.fbGrain || (L.fbGrain = document.createElement('i'));
    if (!gr.parentNode) L.el.appendChild(gr);
    var tile = grainTile({ density: 0.45, light: o.mode === 'nebula' ? 0.15 : 0.35, seed: 5 });
    gr.style.cssText = 'background-image:url(' + tile + ');background-size:' + (160 / Math.min(2, window.devicePixelRatio || 1)) + 'px;' +
      'mix-blend-mode:overlay;opacity:' + (0.35 * Math.min(1, +o.grain)).toFixed(2);
  }
  function paintFallback(L, pr) {
    var d = clamp01(pr.darken != null ? +pr.darken : +L.o.darken || 0), h = (pr.hueShift != null ? +pr.hueShift : +L.o.hueShift) || 0;
    var f = (d > 0 ? 'brightness(' + (1 - d * 0.85).toFixed(3) + ')' : '') + (h ? ' hue-rotate(' + h + 'deg)' : '');
    if (L.fb && L.fb.style.filter !== f) L.fb.style.filter = f;
  }

  /* ------------------------------------------------------------------ grain */
  var GRAIN_DEFAULTS = {
    opacity: 0.3, blend: 'overlay', zIndex: null, target: null, visible: null, fps: 0, maxDpr: 2,
    scale: 1, density: 0.45, light: 0.35, seed: 5
  };
  var tiles = {};
  function grainTile(o) {
    var key = [o.density, o.light, o.seed].join('|');
    if (tiles[key]) return tiles[key];
    var n = 160, c = document.createElement('canvas');
    c.width = c.height = n;
    var ctx = c.getContext('2d'), img = ctx.createImageData(n, n), d = img.data, r = rng(+o.seed || 5);
    var dens = clamp01(+o.density), light = clamp01(+o.light);
    for (var i = 0; i < n * n; i++) {
      if (r() >= dens) continue;
      var v = r() < light ? 255 : 0, w = r(), a = 22 + w * w * w * 200;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
    // a sprinkle of larger droplets, as a real airbrush spits now and then
    for (var j = 0; j < n * n * 0.0015 * (dens / 0.45); j++) {
      ctx.fillStyle = r() < light ? 'rgba(255,255,255,' + (0.12 + r() * 0.2).toFixed(2) + ')' : 'rgba(0,0,0,' + (0.15 + r() * 0.25).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(r() * n, r() * n, 0.7 + r() * 0.6, 0, 6.2832); ctx.fill();
    }
    var url = '';
    try { url = c.toDataURL('image/png'); } catch (e) { url = ''; }
    tiles[key] = url;
    return url;
  }
  var grainImpl = {
    init: function (L) {
      L.tex = document.createElement('i');
      L.el.appendChild(L.tex);
      grainImpl.update(L, {});
    },
    update: function (L) {
      var o = L.o, dpr = Math.min(window.devicePixelRatio || 1, +o.maxDpr || 2);
      var size = 160 / dpr * Math.max(0.25, +o.scale || 1);
      L.size = size;
      L.tex.style.backgroundImage = 'url(' + grainTile(o) + ')';
      L.tex.style.backgroundSize = size.toFixed(2) + 'px ' + size.toFixed(2) + 'px';
      L.tex.style.imageRendering = (+o.scale || 1) >= 1.5 ? 'pixelated' : '';
      L.fps = Math.max(1, Math.min(30, +o.fps || 1));
    },
    resize: function () {},
    animates: function (L) { return +L.o.fps > 0; },
    draw: function (L) {
      if (S.reduced || !(+L.o.fps > 0)) { L.tex.style.transform = ''; return; }
      var r = L.jr || (L.jr = rng(77));
      var s = L.size;
      L.tex.style.transform = 'translate3d(' + (r() * s).toFixed(1) + 'px,' + (r() * s).toFixed(1) + 'px,0)';
    }
  };

  /* -------------------------------------------------------------------- API */
  function stars(opts) {
    return createLayer('stars', assign({}, STAR_DEFAULTS, opts), starsImpl);
  }
  function airbrush(opts) {
    var o = assign({}, AIR_DEFAULTS, opts);
    if (o.mode !== 'nebula') o.mode = 'bands';
    return createLayer('airbrush', o, airImpl);
  }
  function grain(opts) {
    return createLayer('grain', assign({}, GRAIN_DEFAULTS, opts), grainImpl);
  }
  function list(v) {
    if (!v) return [];
    if (v === true) return [{}];
    return Array.isArray(v) ? v : [v];
  }
  function mount(cfg) {
    cfg = cfg || {};
    var out = [], kinds = [['airbrush', airbrush], ['stars', stars], ['grain', grain]];
    kinds.forEach(function (k) {
      list(cfg[k[0]]).forEach(function (o) {
        try {
          var h = k[1](o === true ? {} : o);
          if (h) { out.push(h); api.layers.push(h); }
        } catch (e) { /* a broken layer must not take the page down */ }
      });
    });
    return out;
  }
  var api = window.NMCosmos = {
    version: 1,
    palette: assign({}, PALETTE),
    stars: function (o) { var h = stars(o); if (h) api.layers.push(h); return h; },
    airbrush: function (o) { var h = airbrush(o); if (h) api.layers.push(h); return h; },
    grain: function (o) { var h = grain(o); if (h) api.layers.push(h); return h; },
    mount: mount,
    layers: [],
    fade: fade,
    progressOf: progressOf,
    destroyAll: function () { layers.slice().forEach(destroy); api.layers.length = 0; }
  };

  var autoMounted = false;
  function autoMount() {
    if (autoMounted) return;
    autoMounted = true;
    var cfg = window.NMThemeConfig || {};
    var handles = mount(cfg);
    // With heroClear and no explicit backdrop, the hero paints this module's page
    // layers (bottom first) outside the NM mark, so the sky continues behind it.
    if (cfg.heroClear && !cfg.heroBackdrop) {
      cfg.heroBackdrop = function () {
        return api.layers.filter(function (h) { return h.el && !h.options.target; })
          .sort(function (a, b) { return (parseInt(getComputedStyle(a.el).zIndex, 10) || 0) - (parseInt(getComputedStyle(b.el).zIndex, 10) || 0); })
          .map(function (h) { return h.el.querySelector('canvas'); })
          .filter(Boolean).slice(0, 4);
      };
    }
    if (typeof cfg.onCosmos === 'function') {
      try { cfg.onCosmos(api, handles); } catch (e) { /* theme hook */ }
    }
    try { window.dispatchEvent(new CustomEvent('nm:cosmos', { detail: { layers: handles } })); } catch (e) { /* old engines */ }
  }
  if (window.__nmReady) window.__nmReady(autoMount);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount);
  else autoMount();
})();
