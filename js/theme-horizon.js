/* Horizon direction (docs/cosmic-directions.md, "2. Horizon").

   A scroll journey from day to night. The top of each page is the hoodie fabric
   itself (NMCosmos airbrush 'bands' at darken 0); scrolling deepens it through
   golden hour and dusk into night, the stars come out, and the footer is deep
   space with the black hole. The ground is one fixed sky whose time of day
   follows the reader's position in the page: each page lists anchor elements
   with the darkness the sky should have when that element sits in the middle of
   the viewport, and the sky eases between them. Ink flips with the ground
   (html.hz-night) at the point where both inks have AA contrast, so text never
   sits on a ground it cannot be read on.

   Format device: altitude. Small mono altitude lines sit on section edges
   ("12 km · Sky", "100 km · Kármán line" ...) and a readout under the
   coordinates in the header climbs with the scroll, so the site's daily wonder
   of the world (lat, long) gains its third coordinate on the way to the event
   horizon.

   Loaded by js/nm-theme.js before nm-cosmos.js and nm-blackhole.js: the config is
   written synchronously here, DOM work waits for window.__nmReady. Nothing here
   rewrites React-owned text; markers and the readout are our own elements. */
(function () {
  'use strict';
  var C = window.NMThemeConfig = window.NMThemeConfig || {};
  var root = document.documentElement;
  var PHONE = (function () {
    try { return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 600; }
    catch (e) { return false; }
  })();

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smooth(a, b, x) { var t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function r3(x) { return Math.round(x * 1000) / 1000; }

  /* ------------------------------------------------------------ the journey */
  // Per page: [selector, where in the element (0 top .. 1 bottom), darken, viewport offset]
  // in page order. The sky takes `darken` when that point (moved by offset x the viewport
  // height) crosses the middle of the viewport.
  var PAGES = {
    home: {
      test: '#nm-made',
      sky: [
        ['#nm-made', 0, 0], ['#about', 0, 0.1], ['#about', 0.55, 0.3], ['#nm-brands', 0.5, 0.36],
        // dusk is in place before the first service enters from below, on any screen
        ['#nm-services', 0, 0.63, -0.2], ['#nm-services', 0.85, 0.72], ['#nm-sites', 0.3, 0.86], ['#contact', 0.5, 1]
      ],
      marks: [
        ['#about', '12 km', 'Sky'], ['#nm-services', '100 km', 'Kármán line'],
        ['#nm-sites', '408 km', 'Orbit'], ['#contact', '∞', 'Event horizon']
      ]
    },
    about: {
      test: '.nm-about-page',
      pigment: 0.72, // a reading page: the cloth stays, the bands step back from the copy
      pigmentNight: 0.5, // and the embers stay low behind the long résumé
      sky: [
        // golden hour holds through the footwear story, then dusk falls across its end
        ['.about-intro', 0, 0], ['.about-intro', 0.8, 0.08], ['.about-focus', 0.5, 0.3], ['.about-focus', 0.82, 0.33],
        ['.about-process', 0, 0.63, -0.12],
        ['.about-process', 0.9, 0.7], ['.about-resume', 0.25, 0.82], ['.about-resume', 0.9, 0.9], ['.nm-footer', 0.5, 1]
      ],
      marks: [
        ['.about-focus', '12 km', 'Sky'], ['.about-process', '100 km', 'Kármán line'],
        ['.about-resume', '408 km', 'Orbit'], ['.nm-footer', '∞', 'Event horizon']
      ]
    },
    index: {
      test: 'main.grid',
      // the wall covers the sky; night falls behind it, ready for the footer
      sky: [['main.grid', 0, 0], ['main.grid', 0.82, 0.12], ['main.grid', 0.97, 0.7], ['body > footer', 0.5, 1]],
      marks: [['body > footer', '∞', 'Event horizon']],
      // altitude climbs along the wall itself
      alt: [['main.grid', 0, 0], ['main.grid', 0.3, 12], ['main.grid', 0.6, 100], ['main.grid', 0.88, 408], ['body > footer', 0, Infinity]]
    }
  };
  var page = null;
  var H = {
    d: 0, y: -1, vh: 0, max: 1, night: false, scrolled: false, sky: [], alt: [],
    stars: null, air: null, grain: null, readout: null, readNum: null, readName: null, lastAlt: ''
  };

  function pickPage() {
    for (var k in PAGES) if (document.querySelector(PAGES[k].test)) return PAGES[k];
    return null;
  }
  function docY(sel, f) {
    var el = document.querySelector(sel);
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return r.top + window.scrollY + r.height * f;
  }
  // Anchor positions in document px; refreshed on resize and when the page height changes.
  function measure() {
    H.vh = window.innerHeight;
    H.max = Math.max(1, document.documentElement.scrollHeight - H.vh);
    if (!page) return;
    var sky = [], last = -Infinity;
    page.sky.forEach(function (a) {
      var y = docY(a[0], a[1]);
      if (y == null) return;
      y = Math.max(y + (a[3] || 0) * H.vh, last + 1);
      sky.push([y, a[2]]); last = y;
    });
    H.sky = sky;
    // altitude stations: by default each mark's section top crossing 40% of the viewport
    var alt = [[0, 0]];
    if (page.alt) {
      alt = [];
      page.alt.forEach(function (a) { var y = docY(a[0], a[1]); if (y != null) alt.push([Math.max(alt.length ? alt[alt.length - 1][0] + 1 : 0, y - H.vh * 0.4), a[2]]); });
    } else {
      page.marks.forEach(function (m) {
        var y = docY(m[0], 0);
        if (y != null) alt.push([y - H.vh * 0.4, m[1] === '∞' ? Infinity : parseFloat(m[1])]);
      });
    }
    H.alt = alt;
    H.y = -1;
  }

  // Darkness of the sky for a scroll position (0 day .. 1 night).
  function darkenAt(y) {
    var s = H.sky;
    if (!s.length) return 0;
    var c = Math.min(y, H.max) + H.vh * 0.5;
    // the last anchor is reached at the very bottom even if the page cannot scroll that far
    var end = H.max + H.vh * 0.5;
    if (c <= s[0][0]) return s[0][1];
    for (var i = 1; i < s.length; i++) {
      var y1 = Math.min(s[i][0], end), y0 = Math.min(s[i - 1][0], y1 - 1);
      if (c <= y1 || i === s.length - 1) return s[i - 1][1] + (s[i][1] - s[i - 1][1]) * smooth(y0, y1, c);
    }
    return s[s.length - 1][1];
  }
  // Altitude in km for a scroll position: eased in the first stretch, log between stations.
  function altAt(y) {
    var a = H.alt;
    if (a.length < 2) return 0;
    if (y <= a[0][0]) return a[0][1];
    for (var i = 1; i < a.length; i++) {
      if (y < a[i][0]) {
        var t = clamp01((y - a[i - 1][0]) / Math.max(1, a[i][0] - a[i - 1][0]));
        var v0 = a[i - 1][1], v1 = a[i][1];
        if (v1 === Infinity) return v0 * Math.pow(942, t * t); // on past the Moon (384,400 km), then off the scale
        if (v0 <= 0) return v1 * t * t;
        return v0 * Math.pow(v1 / v0, t);
      }
    }
    return a[a.length - 1][1];
  }
  function fmtAlt(km) {
    if (km === Infinity) return '∞';
    if (km < 1) return Math.round(km * 1000 / 10) * 10 + ' m';
    if (km < 10) return km.toFixed(1) + ' km';
    return Math.round(km).toLocaleString('en-US') + ' km';
  }
  var ZONES = [[0, 'Earth'], [12, 'Sky'], [100, 'Kármán line'], [408, 'Orbit'], [Infinity, 'Event horizon']];
  function zoneAt(km) {
    var name = ZONES[0][1];
    for (var i = 0; i < ZONES.length; i++) if (km >= ZONES[i][0]) name = ZONES[i][1];
    return name;
  }

  function update(y) {
    if (y === H.y) return;
    H.y = y;
    H.d = darkenAt(y);
    // flip the ink where both inks clear AA on the ground (with a little hysteresis)
    var night = H.night ? H.d > 0.43 : H.d > 0.47;
    if (night !== H.night) {
      H.night = night;
      root.classList.toggle('hz-night', night);
    }
    var scrolled = y > 40;
    if (scrolled !== H.scrolled) {
      H.scrolled = scrolled;
      root.classList.toggle('hz-scrolled', scrolled);
    }
    if (markEls.length) fadeMarks(y);
    if (H.readNum) {
      var km = altAt(y), s = fmtAlt(km);
      if (s !== H.lastAlt) {
        H.lastAlt = s;
        H.readNum.textContent = s;
        var z = zoneAt(km);
        if (z !== H.readName.textContent) H.readName.textContent = z;
      }
    }
  }

  /* ---------------------------------------------------------- cosmos config */
  C.heroClear = true;
  // Before the sky is up the hero shows the cream of the cloth, not black.
  C.heroBase = '#EDE1CC';
  // Feed the hero only layers that are actually showing (the stars are off by day),
  // so it does not upload invisible canvases while the hero runs.
  C.heroBackdrop = function () {
    var out = [];
    if (H.air && H.air.el) { var a = H.air.el.querySelector('canvas'); if (a) out.push(a); }
    if (H.stars && H.stars.el && H.d > 0.5) { var s = H.stars.el.querySelector('canvas'); if (s) out.push(s); }
    return out;
  };

  // Pigment strength along the journey: full cloth by day, calmer where light ink sits
  // on the dusk ground, and only faint glowing threads left in deep space.
  H.tune = { dusk: 0.5, night: 0.55 };
  function pigment(d) {
    var k = 1 - H.tune.dusk * smooth(0.36, 0.66, d) - (1 - H.tune.dusk) * H.tune.night * smooth(0.7, 1, d);
    // the blue hour: the bands hold their breath while the ink turns over
    var f = (d - 0.47) / 0.1;
    k *= 1 - 0.42 * Math.exp(-f * f);
    if (page && page.pigment) k *= page.pigment + ((page.pigmentNight || page.pigment) - page.pigment) * smooth(0.4, 0.62, d);
    return k;
  }
  C.airbrush = {
    mode: 'bands',
    scale: PHONE ? 1.7 : 2.2,
    speed: 0.5,
    warp: 0.95,
    lines: 0.5,
    width: 1.1,
    grain: 1.25,
    speck: 1.1,
    parallax: 0.05,
    seed: 19,
    // the cloth's large warm fields lead; the sleeve blues stay as cool passages
    palette: { sky: '#C8D7DE', ice: '#E2E0D5', warmWhite: '#F6F1E6' },
    // a warmer golden hour, and a wine-violet dusk so the sunset passes through lilac, not grey
    palettes: {
      golden: { sky: '#E8C6B0', ice: '#F0D0B0', warmWhite: '#F9E2C0', cream: '#F6CC8C', peach: '#EFA07C', coral: '#DC6957', deepCoral: '#B4434A' },
      dusk: { sky: '#2B2142', ice: '#3E2A4D', warmWhite: '#552F4E', cream: '#733956', peach: '#94505A', coral: '#B5584F', deepCoral: '#C97862' }
    },
    progress: function (p, info) {
      update(info.scrollY);
      var d = H.d;
      return { darken: r3(d), intensity: r3(pigment(d)) };
    }
  };
  C.stars = {
    density: PHONE ? 0.95 : 1.15,
    brightness: 1.25,
    twinkle: 0.22,
    parallax: 0.025,
    shootingStars: 38,
    seed: 23,
    visible: function () { return smooth(0.56, 0.9, H.d); }
  };
  C.grain = {
    opacity: 0.22,
    blend: 'overlay',
    light: 0.3,
    density: 0.5,
    visible: function () { return 1 - 0.55 * smooth(0.5, 0.9, H.d); }
  };
  C.blackHole = {
    scale: PHONE ? 1 : 1.06,
    tilt: 4.5,
    spin: 0.85,
    intensity: 1.05,
    stars: 1.1,
    grain: 1.15,
    violet: true,
    arrive: 9
  };
  C.onCosmos = function (api, handles) {
    handles.forEach(function (h) {
      if (h.kind === 'airbrush') H.air = h;
      else if (h.kind === 'stars') H.stars = h;
      else if (h.kind === 'grain') H.grain = h;
    });
  };

  /* -------------------------------------------------------------------- DOM */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  // Altitude lines: our own absolutely positioned layer in document coordinates,
  // so React-owned sections are never touched.
  var marksBox = null, markEls = [];
  function buildMarks() {
    marksBox = el('div', 'hz-marks');
    marksBox.setAttribute('aria-hidden', 'true');
    page.marks.forEach(function (m) {
      var mk = el('div', 'hz-mark' + (m[2] === 'Kármán line' ? ' hz-mark--karman' : m[1] === '∞' ? ' hz-mark--eh' : ''));
      var lab = el('span', 'hz-mark-l');
      lab.appendChild(el('b', null, m[1]));
      lab.appendChild(document.createTextNode(' · ' + m[2]));
      mk.appendChild(lab);
      mk.__sel = m[0];
      mk.__eh = m[1] === '∞';
      marksBox.appendChild(mk);
      markEls.push(mk);
    });
    document.body.appendChild(marksBox);
  }
  // Text and media boxes in document px, to keep altitude labels clear of content.
  function obstacles() {
    var out = [], sy = window.scrollY, sx = window.scrollX;
    var roots = document.querySelectorAll('main, body > footer, .nm-footer');
    var rg = document.createRange();
    for (var k = 0; k < roots.length; k++) {
      var w = document.createTreeWalker(roots[k], NodeFilter.SHOW_TEXT), n;
      while ((n = w.nextNode())) {
        if (!n.nodeValue.trim()) continue;
        rg.selectNodeContents(n);
        var rs = rg.getClientRects();
        for (var i = 0; i < rs.length; i++) if (rs[i].width > 1) out.push([rs[i].top + sy, rs[i].bottom + sy, rs[i].left + sx, rs[i].right + sx]);
      }
      var media = roots[k].querySelectorAll('img, video, figure, .nm-svc-visual, .nm-brand');
      for (var j = 0; j < media.length; j++) {
        var r = media[j].getBoundingClientRect();
        if (r.width > 1 && r.height > 1) out.push([r.top + sy, r.bottom + sy, r.left + sx, r.right + sx]);
      }
    }
    return out;
  }
  function placeMarks() {
    var vw = document.documentElement.clientWidth, obs = null;
    var m = Math.max(22, vw * 0.016);
    markEls.forEach(function (mk) {
      var y = docY(mk.__sel, 0), bh = null;
      // the event horizon is labelled on the black hole itself, like a callout
      if (mk.__eh) {
        var host = document.querySelector(mk.__sel), b = host && host.querySelector('.nm-bh');
        if (b) {
          var r = b.getBoundingClientRect();
          if (r.width > 0) bh = r;
        }
        // phones: the disk spans the width and the header readout already says it
        if (vw < 700) { bh = null; y = null; }
      }
      mk.classList.toggle('is-callout', !!bh);
      if (bh) {
        y = bh.top + window.scrollY + bh.height * 0.5;
        // leader from just outside the disk's glow to the label at the margin
        mk.style.setProperty('--hz-lead', Math.max(24, vw - (bh.left + bh.width * 0.84)) + 'px');
      } else if (y != null) {
        // a section edge: the first spot near it where the label clears text and images
        var lab = mk.firstChild, lw = lab.offsetWidth + 8, lh = lab.offsetHeight + 6;
        var pad = parseFloat(getComputedStyle(mk).paddingRight) || 0;
        var x1 = vw - pad + 4, x0 = x1 - lw - 6;
        if (!obs) obs = obstacles();
        var karman = mk.classList.contains('hz-mark--karman');
        var cands = [m, -lh - m * 0.5, m + 34, -lh - m * 0.5 - 34, m + 70, -lh - m * 0.5 - 70, 6], pick = cands[0];
        for (var c = 0; c < cands.length; c++) {
          var t = y + cands[c] - 4, bt = t + lh, hit = false;
          for (var o = 0; o < obs.length && !hit; o++) {
            var q = obs[o];
            if (q[1] > t && q[0] < bt && q[3] > x0 && q[2] < x1) hit = true;
            // the airglow runs the full width just under its label
            else if (karman && q[1] > t + 14 && q[0] < t + 24) hit = true;
          }
          if (!hit) { pick = cands[c]; break; }
        }
        y += pick;
      }
      mk.style.display = y == null ? 'none' : '';
      mk.__y = y;
      mk.__op = -1;
      if (y != null) mk.style.transform = 'translate3d(0,' + Math.round(y) + 'px,0)';
    });
  }
  // A line fades as it reaches the header, where the readout takes over its name.
  function fadeMarks(y) {
    var top = H.hdr || 100;
    for (var i = 0; i < markEls.length; i++) {
      var mk = markEls[i];
      if (mk.__y == null) continue;
      var op = Math.round(smooth(top, top + 36, mk.__y - y) * 20) / 20;
      if (op !== mk.__op) { mk.__op = op; mk.style.opacity = op; }
    }
  }
  // The readout sits under the coordinates (a third coordinate), right-aligned with
  // their text on desktop and under the globe and menu on phones.
  function placeReadout() {
    var r = H.readout, c = document.getElementById('nm-coord');
    if (!r) return;
    var vw = document.documentElement.clientWidth, cr = c && c.getBoundingClientRect();
    if (!cr || !cr.width) { r.style.top = ''; r.style.right = ''; return; }
    var wide = cr.width > 80;
    r.classList.toggle('is-compact', !wide);
    r.style.top = Math.round(cr.bottom + (wide ? 7 : 9)) + 'px';
    H.hdr = cr.bottom + 32;
    r.style.right = Math.round(wide ? vw - cr.right + Math.min(18, cr.height * 0.5) : parseFloat(getComputedStyle(r).right) || 12) + 'px';
  }
  function buildReadout() {
    var r = H.readout = el('div', 'hz-alt');
    r.setAttribute('aria-hidden', 'true');
    r.appendChild(el('span', 'hz-alt-k', 'Alt'));
    H.readNum = r.appendChild(el('span', 'hz-alt-n', '0 m'));
    r.appendChild(el('span', 'hz-alt-s', '·'));
    H.readName = r.appendChild(el('span', 'hz-alt-z', 'Earth'));
    document.body.appendChild(r);
  }

  var raf = 0, dirty = true;
  function frame() {
    raf = 0;
    if (dirty) { dirty = false; measure(); if (markEls.length) placeMarks(); placeReadout(); }
    update(window.scrollY || 0);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  function relayout() { dirty = true; kick(); }

  window.__hz = H; // preview builds: inspect the journey state from the console

  function start() {
    page = pickPage();
    root.classList.add('hz-on');
    if (!page) return;
    buildMarks();
    buildReadout();
    measure();
    placeMarks();
    placeReadout();
    update(window.scrollY || 0);
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', relayout, { passive: true });
    if (typeof ResizeObserver === 'function') {
      var lastH = 0;
      new ResizeObserver(function () {
        var h = document.documentElement.scrollHeight;
        if (h !== lastH) { lastH = h; relayout(); }
      }).observe(document.body);
    }
    // fonts and late sections shift anchors
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    window.addEventListener('load', relayout);
    setTimeout(relayout, 1500);
  }

  var ready = window.__nmReady || function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };
  ready(start);
})();
