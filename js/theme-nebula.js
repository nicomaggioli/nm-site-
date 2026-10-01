/* Nebula: the same site under a night sky painted with an airbrush.
   Brief: docs/cosmic-directions.md, "1. Nebula". Styles: css/theme-nebula.css.

   Loaded by js/nm-theme.js before nm-cosmos.js and nm-blackhole.js, so the
   NMThemeConfig block below runs synchronously; DOM work waits for __nmReady.

   What this file adds
   - Sky: a deep-space ground (CSS), a twinkling starfield, slow airbrushed nebula
     blooms in the hoodie palette and a spray-speckle overlay, all via NMCosmos. A few
     luminous peach/coral blooms frame the hero mark and the footer black hole from the
     edges (low coverage keeps dark space between them); behind the reading sections
     they settle to a faint haze that cools toward dusky rose. Phones get their own
     composition. The homepage hero paints them outside the NM mark (heroClear).
   - Footer black hole (NMBlackHole), tuned slower and grainier.
   - Heat-map type on the big display lines (homepage statement, About's
     "Hey, I'm Nico!", every footer "Where visions come true"): the pointer heats
     the letters through the hoodie ramp (warm white -> ice -> peach -> coral ->
     deep coral, violet only at the very hottest), hotter at the glyph rims than
     in the cores, with sprayed overspray around hot letters. Heat spreads a little
     and decays back. The real DOM text stays in place and is the cold state: the
     canvas is an overlay that paints only where there is heat, so selection,
     accessibility and SEO are untouched. Glyphs are rasterised from the DOM text's
     own line boxes and fonts, re-laid out on resize and font load. One WebGL
     context per page, shared by the lines (only one is ever on screen); it runs
     only while a line is visible and heat remains. Touch drags heat it on phones,
     and phones get a slow ambient warm spot; desktop gets one slow sweep the first
     time a line comes into view. No WebGL or reduced motion: plain text.
   - Orbit arcs: faint elliptical orbits with a small planet, in the page margins
     (a decorative layer behind content; static, the planet only breathes).

   Tuning: window.NMNebula.heat({ heat, area, softness }) live-updates the brush. */
(function () {
  'use strict';
  var root = document.documentElement;
  var C = window.NMThemeConfig = window.NMThemeConfig || {};
  var SPACE = '#07070E';
  var path = location.pathname;
  var PAGE = /^\/about/.test(path) ? 'about' : /^\/index/.test(path) ? 'index' : 'home';
  var COARSE = false, PHONE = false;
  try {
    COARSE = matchMedia('(hover: none), (pointer: coarse)').matches;
    PHONE = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 600;
  } catch (e) { /* old engines */ }
  var reduceMQ = null;
  try { reduceMQ = matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { /* old engines */ }
  function reduced() { return !!(reduceMQ && reduceMQ.matches); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  /* ------------------------------------------------------------ the sky */
  C.heroClear = true;
  C.heroBase = SPACE;
  C.stars = {
    density: PHONE ? 0.95 : 1.05, brightness: 1.05, twinkle: 0.22, twinkleDepth: 0.9,
    spikes: 0.9, band: 0.32, parallax: 0.035, shootingStars: PHONE ? 0 : 42, seed: 19
  };
  // A few luminous blooms in a mostly dark sky, not an even veil of dust: at low
  // coverage the gas keeps bright cream/peach cores and coral edges, where an even
  // low-alpha veil of the same colours reads as brown sand. Seed 29 frames the hero
  // mark from the corners and leaves it in clear dark space, with the ice haze low left.
  C.airbrush = {
    mode: 'nebula', amount: 0.27, scale: 1.25, speed: 0.55, warp: 1.1, grain: 0.85, speck: 1,
    intensity: 1, centerDim: 0.6, parallax: 0.06, seed: 29, hueShift: 2, fps: PHONE ? 20 : 30,
    // the swatches a step lighter so faint gas stays peach/coral instead of browning
    // (cream held below white so the hottest cores glow instead of clipping flat)
    palette: { peach: '#F4C6AE', cream: '#F3DCC4', coral: '#EA8E80', deepCoral: '#CA5855', sky: '#A9CBE6' },
    // Blooms are strongest at the top of the page (the hero) and around the footer,
    // and settle to a quiet haze behind the reading sections.
    progress: function (p, info) {
      var vh = info.vh || 800, y = info.scrollY || 0, rest = (info.maxScroll || 1) - y;
      var top = 1 - smooth(0.1 * vh, 1.5 * vh, y);
      // (a narrow screen shows the end of the sites list right above the footer, so the
      // footer bloom waits until the footer itself fills most of the view)
      var foot = NARROW ? 1 - smooth(0.05 * vh, 0.8 * vh, rest) : 1 - smooth(0.1 * vh, 1.35 * vh, rest);
      // About opens on type, not on the hero mark: keep its top bloom softer
      var k = Math.max(top * (PAGE === 'about' ? 0.45 : 1), foot), lo = PHONE ? 0.24 : 0.34;
      // the quiet haze between them cools toward dusky rose: faint coral on near-black
      // reads as brown smoke, faint rose reads as night gas
      return { intensity: Math.round((lo + (1.02 - lo) * k) * 50) / 50, hueShift: Math.round(2 + 14 * (1 - k)) };
    }
  };
  C.grain = { opacity: 0.2, light: 0.14, density: 0.5, scale: 1 };
  C.blackHole = { scale: 1, tilt: 6, spin: 0.8, intensity: 1.06, grain: 1.25, stars: 1, violet: true, arrive: 9 };

  // A portrait phone sees only a narrow slice of the field, which with the desktop
  // composition is the dark centre: finer features and another seed put a bloom
  // under the hero mark and beside the black hole there.
  var NARROW = PHONE || (window.innerWidth || 1024) < 600;
  if (NARROW) { C.airbrush.scale = 0.72; C.airbrush.amount = 0.33; C.airbrush.seed = 7; }

  // The index wall is all image, so the sky only shows in its header and footer:
  // let a little more of the bloom reach the middle there.
  if (PAGE === 'index') C.airbrush.centerDim = 0.3;

  var ready = window.__nmReady || function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };

  /* ===================================================== heat-map display type */
  // Hoodie heat ramp: cold is the text's own colour (the DOM text shows there).
  var RAMP = ['#F4F8F0', '#BCD3E0', '#E9B4A3', '#E3837A', '#CA5855', '#6E6BD6'];
  var BRUSH = { heat: 1, area: 1, softness: 0.5 };
  var LINES = {
    home: [
      { sel: '#about .text-heading-xl p', name: 'statement' },
      { sel: 'main > section.h-lvh div[class*="text-footer-tagline"] p', name: 'footer' }
    ],
    about: [
      { sel: '#about-title', name: 'hello' },
      { sel: '.nm-footer .nm-footer-cta', name: 'footer' }
    ],
    index: [
      { sel: 'footer .foot-cta p', name: 'footer' }
    ]
  };

  var VS = 'attribute vec2 aP;varying vec2 vUv;void main(){vUv=vec2(aP.x*.5+.5,.5-aP.y*.5);gl_Position=vec4(aP,0.,1.);}';
  var FS = [
    'precision mediump float;',
    'uniform sampler2D uGlyph,uRim,uGlow,uHeat,uAcc;',
    'uniform vec3 uRamp[6];',
    'uniform float uDpr,uSoft;',
    'varying vec2 vUv;',
    'float h12(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}',
    // warm white .. ice .. peach .. coral .. deep coral; violet only past .93
    'vec3 ramp(float t){t=clamp(t,0.,1.);',
    ' vec3 c=mix(uRamp[0],uRamp[1],smoothstep(0.,.2,t));',
    ' c=mix(c,uRamp[2],smoothstep(.2,.42,t));c=mix(c,uRamp[3],smoothstep(.42,.64,t));',
    ' c=mix(c,uRamp[4],smoothstep(.64,.86,t));c=mix(c,uRamp[5],smoothstep(.93,1.,t)*.9);return c;}',
    'void main(){',
    ' float h=texture2D(uHeat,vUv).a;',
    ' if(h<.004){gl_FragColor=vec4(0.);return;}',
    ' float g=texture2D(uGlyph,vUv).a;',
    ' float rb=texture2D(uRim,vUv).a;',
    ' float wb=texture2D(uGlow,vUv).a;',
    // droplets: fixed to the paper (two scales, like an airbrush spitting)
    ' vec2 fc=floor(gl_FragCoord.xy/max(1.,uDpr*.75));',
    ' float n=h12(fc),n2=h12(floor(fc*.5)+17.3);',
    ' float rim=clamp((1.-rb)*2.4,0.,1.);',
    // hotter at the rims, cooler in the cores; sprayed band edges
    ' float t=h*(.64+.44*rim)+(n-.5)*.07;',
    // sprayed accent words (already coral when cold) start the ramp at peach
    ' float acc=texture2D(uAcc,vUv).a;',
    ' t=mix(t,.38+t*.56,acc);',
    ' float f=t*5.,i=floor(f),fr=f-i;',
    ' float e=smoothstep(.28,.72,fr+(mix(n,n2,.35)-.5)*.62);',
    ' float tb=mix(t,(i+e)/5.,.55);',
    ' vec3 c=ramp(tb);',
    ' float vis=mix(smoothstep(.015,.17,h),smoothstep(.1,.32,h),acc);',
    ' float a=g*vis;',
    // overspray: soft glow around hot letters that breaks into droplets as it thins
    ' float cov=wb*smoothstep(.12,.85,h)*uSoft*(1.-g);',
    ' float drop=step(n,cov*1.25)*step(.2,cov+n2*.2);',
    ' float ga=clamp(cov*.3+drop*.5*smoothstep(.03,.3,cov),0.,.85);',
    ' vec3 gc=ramp(clamp(h*.95+.08,0.,1.));',
    ' gl_FragColor=vec4(c*a+gc*ga*(1.-a),a+ga*(1.-a));',
    '}'
  ].join('\n');

  var H = {
    gl: null, canvas: null, prog: null, u: null, failed: false, inst: [], owner: null,
    raf: 0, last: 0, ptr: { x: -1e4, y: -1e4, on: false, touch: false },
    filter: null
  };
  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  function canFilter() {
    if (H.filter !== null) return H.filter;
    try {
      var c = document.createElement('canvas'); c.width = c.height = 9;
      var x = c.getContext('2d'); x.filter = 'blur(2px)'; x.fillRect(4, 4, 1, 1);
      H.filter = x.getImageData(1, 4, 1, 1).data[3] > 0;
    } catch (e) { H.filter = false; }
    return H.filter;
  }
  function heatLayer() {
    var l = document.getElementById('neb-heat-layer');
    if (!l) {
      l = document.createElement('div');
      l.id = 'neb-heat-layer';
      l.setAttribute('aria-hidden', 'true');
      document.body.appendChild(l);
    }
    return l;
  }
  function initGl() {
    if (H.gl || H.failed) return !!H.gl;
    var c = H.canvas = document.createElement('canvas');
    c.className = 'neb-heat';
    heatLayer().appendChild(c);
    var gl = null;
    try {
      gl = c.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
        failIfMajorPerformanceCaveat: true, powerPreference: 'low-power' });
    } catch (e) { gl = null; }
    if (!gl) { H.failed = true; c.remove(); return false; }
    function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; }
    var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) { H.failed = true; c.remove(); return false; }
    var p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { H.failed = true; c.remove(); return false; }
    gl.useProgram(p);
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(p, 'aP');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    H.u = {};
    ['uGlyph', 'uRim', 'uGlow', 'uHeat', 'uAcc', 'uDpr', 'uSoft'].forEach(function (n) { H.u[n] = gl.getUniformLocation(p, n); });
    var flat = [];
    RAMP.forEach(function (h) { flat = flat.concat(hexRgb(h)); });
    gl.uniform3fv(gl.getUniformLocation(p, 'uRamp[0]'), new Float32Array(flat));
    gl.uniform1i(H.u.uGlyph, 0); gl.uniform1i(H.u.uRim, 1); gl.uniform1i(H.u.uGlow, 2); gl.uniform1i(H.u.uHeat, 3); gl.uniform1i(H.u.uAcc, 4);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.clearColor(0, 0, 0, 0);
    H.gl = gl; H.prog = p;
    c.addEventListener('webglcontextlost', function (e) { e.preventDefault(); H.lost = true; stopLoop(); hideCanvas(); });
    c.addEventListener('webglcontextrestored', function () {
      H.gl = null; H.failed = false; H.lost = false; H.owner = null; H.shown = false; c.remove();
      H.inst.forEach(function (I) { I.tex = null; I.sig = ''; });
      kick();
    });
    return true;
  }
  function tex(gl, src, w, h, data) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, gl.ALPHA, gl.UNSIGNED_BYTE, src);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, w, h, 0, gl.ALPHA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function HeatLine(el, name, sel) {
    this.el = el; this.name = name; this.sel = sel;
    this.box = null; this.sig = ''; this.grid = null; this.bytes = null;
    this.visible = false; this.ratio = 0; this.maxH = 0; this.tex = null;
    this.sweep = null; this.swept = false;
    var self = this;
    if ('IntersectionObserver' in window) {
      this.io = new IntersectionObserver(function (es) {
        var e = es[es.length - 1];
        self.visible = e.isIntersecting; self.ratio = e.intersectionRatio;
        if (self.visible) { self.ensure(); maybeSweep(self); kick(); }
      }, { threshold: [0, 0.35, 0.6] });
      this.io.observe(el);
    }
  }
  // React can replace the line's element after hydration: follow it.
  HeatLine.prototype.resolve = function () {
    if (this.el.isConnected) return;
    var e = document.querySelector(this.sel);
    if (!e || e === this.el) return;
    if (this.io) { this.io.unobserve(this.el); this.io.observe(e); }
    if (H.ro) { try { H.ro.unobserve(this.el); } catch (x) { /* gone */ } H.ro.observe(e); }
    this.el = e; this.sig = '';
  };
  function resolveAll() { for (var i = 0; i < H.inst.length; i++) H.inst[i].resolve(); }
  HeatLine.prototype.signature = function () {
    var r = this.el.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height), innerWidth, devicePixelRatio].join(',');
  };
  // Lay out only when the line's geometry changed (cheap check per session start).
  HeatLine.prototype.ensure = function () {
    if (!initGl()) return; // no WebGL: the DOM text stays as it is
    var s = this.signature();
    if (s !== this.sig || !this.tex) { this.sig = s; this.layout(); }
  };
  HeatLine.prototype.layout = function () {
    var el = this.el, r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var cs = getComputedStyle(el), fs = parseFloat(cs.fontSize) || 40;
    var pad = Math.round(fs * 0.42), vw = document.documentElement.clientWidth || innerWidth;
    var x0 = Math.max(0, Math.floor(r.left - pad)), x1 = Math.min(vw, Math.ceil(r.right + pad));
    var y0 = Math.floor(r.top - pad), y1 = Math.ceil(r.bottom + pad);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var bw = x1 - x0, bh = y1 - y0, W = Math.max(2, Math.round(bw * dpr)), Hh = Math.max(2, Math.round(bh * dpr));
    this.box = { x: x0 + scrollX, y: y0 + scrollY, w: bw, h: bh, W: W, H: Hh, dpr: dpr, fs: fs };
    // glyphs, rasterised from the DOM's own line boxes
    var g = document.createElement('canvas'); g.width = W; g.height = Hh;
    var ctx = g.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
    ctx.fillStyle = ctx.strokeStyle = '#fff';
    ctx.lineJoin = 'round';
    var ac = document.createElement('canvas'); ac.width = W; ac.height = Hh;
    var actx = ac.getContext('2d');
    actx.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
    actx.fillStyle = actx.strokeStyle = '#fff';
    drawText(ctx, el, dpr, actx);
    // rim (small blur) and glow (wide blur) maps at reduced resolution
    var rim = blurred(g, 0.5, fs * 0.05 * dpr), glow = blurred(g, 1 / 6, fs * 0.2 * dpr);
    // heat grid
    var cell = clamp(fs * 0.11, 5, 12);
    var gw = Math.max(4, Math.round(bw / cell)), gh = Math.max(4, Math.round(bh / cell));
    var old = this.grid, ogw = this.gw, ogh = this.gh;
    this.gw = gw; this.gh = gh; this.cw = bw / gw; this.ch = bh / gh;
    this.grid = new Float32Array(gw * gh); this.tmp = new Float32Array(gw * gh); this.bytes = new Uint8Array(gw * gh);
    if (old && ogw === gw && ogh === gh) this.grid.set(old);
    this.radius = clamp(fs * 0.95, 36, 140) * BRUSH.area;
    if (initGl()) {
      var gl = H.gl;
      if (this.tex) this.tex.forEach(function (t) { gl.deleteTexture(t); });
      this.tex = [tex(gl, g), tex(gl, rim), tex(gl, glow), tex(gl, null, gw, gh, this.bytes), tex(gl, blurred(ac, 0.5, 1))];
      if (H.owner === this) H.owner = null; // re-bind the canvas to the new size
    }
  };
  function blurred(src, scale, radius) {
    var c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(src.width * scale)); c.height = Math.max(2, Math.round(src.height * scale));
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    try { x.imageSmoothingQuality = 'high'; } catch (e) { /* old engines */ }
    if (canFilter()) x.filter = 'blur(' + Math.max(0.5, radius * scale).toFixed(2) + 'px)';
    x.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  // Draw every visible text run where the browser laid it out. Words are drawn
  // whole (kerning intact) when the canvas measures them to the DOM width;
  // otherwise per character at the DOM's own character positions.
  function drawText(ctx, el, dpr, actx) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), node;
    var range = document.createRange(), hasLS = 'letterSpacing' in ctx;
    var dil = 0.9 / dpr;
    ctx.lineWidth = dil;
    while ((node = walker.nextNode())) {
      var par = node.parentElement;
      if (!par || !node.data.trim()) continue;
      var cs = getComputedStyle(par);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      // accent runs (sprayed, text-fill transparent) also go to the accent mask
      var fill = cs.webkitTextFillColor || '', accent = /^(transparent|rgba\(0, 0, 0, 0\))$/.test(fill);
      var C2 = accent ? [ctx, actx] : [ctx];
      ctx.font = actx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      actx.lineWidth = dil;
      var ls = parseFloat(cs.letterSpacing) || 0;
      if (hasLS) ctx.letterSpacing = actx.letterSpacing = ls + 'px';
      var up = cs.textTransform === 'uppercase', low = cs.textTransform === 'lowercase';
      var m0 = ctx.measureText('Hxg'), asc = m0.fontBoundingBoxAscent, desc = m0.fontBoundingBoxDescent;
      if (!(asc > 0)) { asc = parseFloat(cs.fontSize) * 0.93; desc = parseFloat(cs.fontSize) * 0.22; }
      var re = /\S+/g, m;
      while ((m = re.exec(node.data))) {
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        var rs = range.getClientRects();
        var word = up ? m[0].toUpperCase() : low ? m[0].toLowerCase() : m[0];
        var ok = rs.length === 1 && (ls === 0 || hasLS) && word.length === m[0].length;
        if (ok) {
          var rc = rs[0], w = ctx.measureText(word).width - (hasLS ? ls : 0);
          ok = Math.abs(w - rc.width) <= Math.max(1.5, rc.width * 0.02);
          if (ok) {
            var by = rc.top + rc.height * asc / (asc + desc);
            for (var q = 0; q < C2.length; q++) { C2[q].fillText(word, rc.left, by); C2[q].strokeText(word, rc.left, by); }
            continue;
          }
        }
        if (hasLS) ctx.letterSpacing = actx.letterSpacing = '0px';
        for (var i = 0; i < m[0].length; i++) {
          range.setStart(node, m.index + i); range.setEnd(node, m.index + i + 1);
          var cr = range.getClientRects();
          if (!cr.length) continue;
          var ch = up ? m[0][i].toUpperCase() : low ? m[0][i].toLowerCase() : m[0][i];
          var y = cr[0].top + cr[0].height * asc / (asc + desc);
          for (var q2 = 0; q2 < C2.length; q2++) { C2[q2].fillText(ch, cr[0].left, y); C2[q2].strokeText(ch, cr[0].left, y); }
        }
        if (hasLS) ctx.letterSpacing = actx.letterSpacing = ls + 'px';
      }
    }
  }

  // Brush: saturating gaussian splats along the pointer path.
  HeatLine.prototype.splat = function (px, py, amt, radius) {
    var b = this.box, gw = this.gw, gh = this.gh, G = this.grid;
    var gx = (px - b.x) / this.cw - 0.5, gy = (py - b.y) / this.ch - 0.5;
    var sx = radius / this.cw, sy = radius / this.ch;
    var x0 = Math.max(0, Math.floor(gx - sx * 1.6)), x1 = Math.min(gw - 1, Math.ceil(gx + sx * 1.6));
    var y0 = Math.max(0, Math.floor(gy - sy * 1.6)), y1 = Math.min(gh - 1, Math.ceil(gy + sy * 1.6));
    for (var y = y0; y <= y1; y++) {
      var dy = (y - gy) / sy;
      for (var x = x0; x <= x1; x++) {
        var dx = (x - gx) / sx, d2 = dx * dx + dy * dy;
        if (d2 > 2.6) continue;
        var k = y * gw + x, s = amt * Math.exp(-d2 * 1.6);
        G[k] = 1 - (1 - G[k]) * Math.exp(-s);
      }
    }
  };
  HeatLine.prototype.contains = function (px, py, m) {
    var b = this.box;
    return !!b && px > b.x - m && px < b.x + b.w + m && py > b.y - m && py < b.y + b.h + m;
  };
  HeatLine.prototype.step = function (dt) {
    var gw = this.gw, gh = this.gh, G = this.grid, T = this.tmp, max = 0;
    // heat lingers: the warm trail cools back through peach and ice over ~4s
    var kd = clamp(BRUSH.softness * dt * 7, 0, 0.45), decay = Math.exp(-dt / 2.3), lin = dt * 0.016;
    for (var y = 0; y < gh; y++) {
      for (var x = 0; x < gw; x++) {
        var k = y * gw + x, c = G[k];
        var l = x > 0 ? G[k - 1] : c, r = x < gw - 1 ? G[k + 1] : c, u = y > 0 ? G[k - gw] : c, d = y < gh - 1 ? G[k + gw] : c;
        var v = (c + kd * ((l + r + u + d) * 0.25 - c)) * decay - lin;
        T[k] = v > 0 ? v : 0;
        if (v > max) max = v;
      }
    }
    this.grid = T; this.tmp = G; this.maxH = max;
    var B = this.bytes, N = gw * gh;
    for (var i = 0; i < N; i++) B[i] = Math.min(255, this.grid[i] * 255 + 0.5) | 0;
  };

  function sources(I, dt, now) {
    var p = H.ptr, b = I.box, active = false, R = I.radius, heat = BRUSH.heat;
    if (!b) return false;
    if (p.on) {
      var px = p.x + scrollX, py = p.y + scrollY;
      if (I.contains(px, py, R * 0.6)) {
        var lx = I.lx == null ? px : I.lx, ly = I.ly == null ? py : I.ly;
        var dist = Math.hypot(px - lx, py - ly), n = Math.max(1, Math.ceil(dist / (R * 0.3)));
        var amt = heat * (dt * 3.2 + Math.min(1.4, dist / R) * 0.9) / n;
        for (var i = 1; i <= n; i++) I.splat(lx + (px - lx) * i / n, ly + (py - ly) * i / n, amt, R);
        I.lx = px; I.ly = py;
        active = true;
      } else I.lx = I.ly = null;
    } else I.lx = I.ly = null;
    // first-reveal sweep (desktop) and the ambient warm spot (phones)
    var sw = I.sweep;
    if (sw) {
      var u = (now - sw.t0) / sw.dur;
      if (u >= 1) I.sweep = null;
      else {
        var e = u * u * (3 - 2 * u);
        var sx = b.x + b.w * (0.06 + 0.88 * e), sy = b.y + b.h * (0.5 + 0.22 * Math.sin(u * 6.283 * 1.3));
        I.splat(sx, sy, heat * dt * 4.2 * Math.sin(Math.PI * u), R * 0.9);
        active = true;
      }
    }
    if (COARSE && I.visible) {
      var t = now / 1000;
      var ax = b.x + b.w * (0.5 + 0.4 * Math.sin(t * 0.23 + 1.3) * Math.cos(t * 0.11));
      var ay = b.y + b.h * (0.5 + 0.34 * Math.sin(t * 0.31 + 0.4));
      I.splat(ax, ay, heat * dt * 1.25, R * 1.1);
      active = true;
    }
    return active;
  }
  function maybeSweep(I) {
    if (I.swept || COARSE || reduced() || I.ratio < 0.34) return;
    I.swept = true;
    I.sweep = { t0: performance.now() + 250, dur: 3400 };
  }

  function bind(I) {
    var c = H.canvas, b = I.box;
    if (H.owner === I) return;
    H.owner = I;
    c.width = b.W; c.height = b.H;
    c.style.left = b.x + 'px'; c.style.top = b.y + 'px';
    c.style.width = b.w + 'px'; c.style.height = b.h + 'px';
  }
  function hideCanvas() { if (H.canvas) H.canvas.style.visibility = 'hidden'; H.shown = false; }
  function draw(I) {
    var gl = H.gl;
    if (!gl || H.lost) return;
    if (!I.tex) { I.ensure(); if (!I.tex) return; }
    bind(I);
    if (!H.shown) { H.canvas.style.visibility = 'visible'; H.shown = true; }
    gl.viewport(0, 0, I.box.W, I.box.H);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (var i = 0; i < 5; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, I.tex[i]); }
    gl.activeTexture(gl.TEXTURE3);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, I.gw, I.gh, gl.ALPHA, gl.UNSIGNED_BYTE, I.bytes);
    gl.uniform1f(H.u.uDpr, I.box.dpr);
    gl.uniform1f(H.u.uSoft, clamp(0.55 + BRUSH.softness * 0.9, 0, 1.5));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function kick() { if (!H.raf) H.raf = requestAnimationFrame(frame); }
  function stopLoop() { if (H.raf) cancelAnimationFrame(H.raf); H.raf = 0; H.last = 0; }
  function frame(now) {
    H.raf = 0;
    if (reduced() || document.hidden || root.classList.contains('nm-run-open')) { H.last = 0; return; }
    // frame pacing: display rate while a mouse drives it, 30fps for touch / ambient
    var pointerDriven = H.ptr.on && !H.ptr.touch;
    if (!pointerDriven && H.last && now - H.last < 30) { H.raf = requestAnimationFrame(frame); return; }
    if (!H.last) H.inst.forEach(function (I) { I.lx = I.ly = null; });
    var dt = H.last ? Math.min(0.05, (now - H.last) / 1000) : 1 / 60;
    H.last = now;
    var best = null, again = false;
    for (var i = 0; i < H.inst.length; i++) {
      var I = H.inst[i];
      if (!I.box || !I.grid) continue;
      var src = I.visible && sources(I, dt, now);
      if (src || I.maxH > 0.003) {
        I.step(dt);
        again = again || src || I.maxH > 0.003;
        if (I.visible && (I.maxH > 0.003) && (!best || I.lastHot > best.lastHot || src)) best = I;
        if (src) I.lastHot = now;
      }
    }
    if (best && initGl()) draw(best);
    else if (H.shown) { if (H.gl) H.gl.clear(H.gl.COLOR_BUFFER_BIT); hideCanvas(); }
    if (again) H.raf = requestAnimationFrame(frame);
  }
  function anyHit() {
    var p = H.ptr, px = p.x + scrollX, py = p.y + scrollY;
    for (var i = 0; i < H.inst.length; i++) {
      var I = H.inst[i];
      if (I.visible && I.box && I.contains(px, py, I.radius * 0.6)) return I;
    }
    return null;
  }
  function onPointer(e) {
    if (e.pointerType === 'touch') return; // touch is read from touch events (they keep coming while scrolling)
    H.ptr.x = e.clientX; H.ptr.y = e.clientY; H.ptr.on = true; H.ptr.touch = false;
    var I = anyHit();
    if (I) { if (!H.raf) I.ensure(); kick(); }
  }
  function onTouch(e) {
    var t = e.touches && e.touches[0];
    if (!t) { H.ptr.on = false; return; }
    if (e.type === 'touchstart') H.inst.forEach(function (I) { I.lx = I.ly = null; });
    H.ptr.x = t.clientX; H.ptr.y = t.clientY; H.ptr.on = true; H.ptr.touch = true;
    if (anyHit()) kick();
  }
  function onScroll() {
    resolveAll();
    if (H.ptr.on && anyHit()) kick();
  }
  function setupHeat() {
    if (reduced()) return;
    var list = LINES[PAGE] || [];
    list.forEach(function (d) {
      var el = document.querySelector(d.sel);
      if (el) H.inst.push(new HeatLine(el, d.name, d.sel));
    });
    if (!H.inst.length) return;
    addEventListener('pointermove', onPointer, { passive: true });
    addEventListener('pointerdown', onPointer, { passive: true });
    document.addEventListener('pointerleave', function () { H.ptr.on = false; });
    addEventListener('blur', function () { H.ptr.on = false; });
    addEventListener('touchstart', onTouch, { passive: true });
    addEventListener('touchmove', onTouch, { passive: true });
    addEventListener('touchend', onTouch, { passive: true });
    addEventListener('touchcancel', onTouch, { passive: true });
    addEventListener('scroll', onScroll, { passive: true });
    var relayout = function () {
      clearTimeout(H.rt);
      H.rt = setTimeout(function () { resolveAll(); H.inst.forEach(function (I) { if (I.box) I.ensure(); }); }, 160);
    };
    // hydration may swap the elements shortly after ready
    var tries = 0, poll = setInterval(function () { resolveAll(); if (++tries > 12) clearInterval(poll); }, 800);
    addEventListener('resize', relayout, { passive: true });
    if ('ResizeObserver' in window) {
      var ro = H.ro = new ResizeObserver(relayout);
      H.inst.forEach(function (I) { ro.observe(I.el); });
      ro.observe(document.body);
    }
    if (document.fonts) {
      if (document.fonts.ready) document.fonts.ready.then(function () { H.inst.forEach(function (I) { if (I.box) I.layout(); }); });
      if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', relayout);
    }
    document.addEventListener('visibilitychange', function () { H.last = 0; if (!document.hidden) kick(); });
    addEventListener('nm:gamechange', function () { H.last = 0; kick(); });
    if (reduceMQ) {
      var onReduce = function () { if (reduced()) { stopLoop(); hideCanvas(); } else kick(); };
      if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onReduce);
      else if (reduceMQ.addListener) reduceMQ.addListener(onReduce);
    }
  }

  /* ========================================================= orbit arcs */
  // Each arc: the visible apex of a flat ellipse whose centre sits off the page, so only
  // a shallow curve enters the margin at `at` (fraction of the anchor's height) + dy px.
  var ORBITS = {
    home: [
      { sel: 'main > #about', side: 'right', at: 0.5, tilt: -14, r: 0.36, planet: 0.35, phone: true },
      // in the gap under the logo marquee, clear of the moving logos
      { sel: '#nm-brands', side: 'right', at: 1, dy: -24, tilt: 10, r: 0.3, planet: 0.7 },
      { sel: '#nm-sites', side: 'right', at: 0, dy: 70, tilt: -8, r: 0.34, planet: 0.3 },
      { sel: 'main > section.h-lvh', side: 'left', at: 0.38, tilt: 14, r: 0.32, planet: 0.6, phone: true }
    ],
    about: [
      { sel: '#about-title', side: 'left', at: 1, dy: 70, tilt: 8, r: 0.34, planet: 0.62 },
      { sel: '.about-resume', side: 'left', at: 0.55, tilt: -10, r: 0.3, planet: 0.4 },
      { sel: '.nm-footer', side: 'right', at: 0.3, tilt: -14, r: 0.3, planet: 0.45, phone: true }
    ],
    index: [
      { sel: 'body > footer', side: 'left', at: 0.3, tilt: 14, r: 0.3, planet: 0.55, phone: true }
    ]
  };
  function orbits() {
    var defs = ORBITS[PAGE] || [];
    if (!defs.length) return;
    var frame = document.getElementById('neb-frame');
    if (!frame) {
      frame = document.createElement('div');
      frame.id = 'neb-frame';
      frame.setAttribute('aria-hidden', 'true');
      document.body.appendChild(frame);
    }
    var vw = document.documentElement.clientWidth || innerWidth;
    // measure the page without the frame (it clips its arcs, so it adds no overflow at 0)
    frame.style.height = '0px';
    var doc = document.documentElement.scrollHeight;
    frame.style.height = doc + 'px';
    var html = '';
    defs.forEach(function (d, i) {
      var narrow = vw < 768;
      if (narrow && !d.phone) return;
      var el = document.querySelector(d.sel);
      if (!el) return;
      var r = el.getBoundingClientRect();
      if (!r.height) return;
      var rx = clamp(vw * d.r * (narrow ? 1.6 : 1), 220, 820), ry = rx * 0.24;
      var reach = clamp(vw * 0.055, 30, 110), th = d.tilt * Math.PI / 180, left = d.side === 'left';
      var apexY = r.top + scrollY + r.height * d.at + (d.dy || 0);
      // rotate(tilt) moves the apex by rx*sin(tilt): put the apex where it was asked for
      var cx = left ? reach - rx * Math.cos(th) : vw - reach + rx * Math.cos(th);
      var cy = apexY - (left ? 1 : -1) * rx * Math.sin(th);
      var w = rx * 2 + 40, h = ry * 2 + 40;
      var tv = Math.acos(clamp(1 - reach / rx, -1, 1));
      var t = (left ? 0 : Math.PI) + (d.planet - 0.5) * 1.5 * tv;
      var px = w / 2 + rx * Math.cos(t), py = h / 2 + ry * Math.sin(t);
      var gid = 'neb-o' + i;
      html += '<svg class="neb-orbit" width="' + w.toFixed(0) + '" height="' + h.toFixed(0) + '" viewBox="0 0 ' + w.toFixed(0) + ' ' + h.toFixed(0) +
        '" style="left:' + (cx - w / 2).toFixed(0) + 'px;top:' + (cy - h / 2).toFixed(0) + 'px;transform:rotate(' + d.tilt + 'deg)">' +
        '<defs><linearGradient id="' + gid + '" x1="' + (left ? '1' : '0') + '" y1="0" x2="' + (left ? '0' : '1') + '" y2="0">' +
        '<stop offset="0" stop-color="#E3837A" stop-opacity=".6"/><stop offset=".08" stop-color="#E9B4A3" stop-opacity=".38"/>' +
        '<stop offset=".2" stop-color="#BCD3E0" stop-opacity=".16"/><stop offset=".4" stop-color="#BCD3E0" stop-opacity="0"/></linearGradient></defs>' +
        '<ellipse cx="' + (w / 2) + '" cy="' + (h / 2) + '" rx="' + rx.toFixed(1) + '" ry="' + ry.toFixed(1) + '" fill="none" stroke="url(#' + gid + ')" stroke-width="1"/>' +
        '<ellipse cx="' + (w / 2) + '" cy="' + (h / 2) + '" rx="' + (rx * 1.06).toFixed(1) + '" ry="' + (ry * 1.18).toFixed(1) + '" fill="none" stroke="url(#' + gid + ')" stroke-width=".75" stroke-dasharray="1 7" opacity=".75"/>' +
        '</svg>';
      // the planet is its own HTML element so its breathing runs on the compositor
      // (an opacity animation inside SVG repaints on the main thread every frame)
      var dx = px - w / 2, dy = py - h / 2, c = Math.cos(th), sn = Math.sin(th);
      html += '<i class="neb-planet" style="left:' + (cx + dx * c - dy * sn).toFixed(1) + 'px;top:' + (cy + dx * sn + dy * c).toFixed(1) +
        'px;animation-delay:-' + (i * 2.7).toFixed(1) + 's"></i>';
    });
    frame.innerHTML = html;
  }
  function setupOrbits() {
    orbits();
    var t = 0, lastW = innerWidth, lastH = 0;
    var again = function () { clearTimeout(t); t = setTimeout(orbits, 220); };
    addEventListener('resize', function () {
      if (COARSE && innerWidth === lastW) return; // phone toolbars: keep the frame
      lastW = innerWidth; again();
    }, { passive: true });
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () {
        var h = document.body.scrollHeight;
        if (Math.abs(h - lastH) > 40) { lastH = h; again(); }
      }).observe(document.body);
    }
  }

  ready(function () {
    root.setAttribute('data-neb-page', PAGE);
    try { setupOrbits(); } catch (e) { /* decoration only */ }
    try { setupHeat(); } catch (e) { /* plain text stays */ }
  });

  window.NMNebula = {
    heat: function (o) {
      if (o) for (var k in o) if (k in BRUSH && isFinite(+o[k])) BRUSH[k] = +o[k];
      H.inst.forEach(function (I) { if (I.box) I.radius = clamp(I.box.fs * 0.95, 36, 140) * BRUSH.area; });
      return BRUSH;
    },
    _h: H
  };
})();
