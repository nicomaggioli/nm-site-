/* One opening per tab session. Animate the existing shader, never the layout.
   Scrolling/clicking always wins; no overflow changes or Lenis locks. */
(function () {
  'use strict';
  var state = window.__nmOpening;
  if (!state || !state.active || state.controller) return;
  state.controller = true;
  var root = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion:reduce)');
  var phone = matchMedia('(max-width:767px), (pointer:coarse) and (max-width:1024px)');
  var frame = 0, start = null, mediaReady = false, section = null;
  var width = window.innerWidth;
  var listeners = [];

  function listen(target, type, fn) {
    target.addEventListener(type, fn, {passive:true, capture:true});
    listeners.push([target, type, fn]);
  }
  function cleanup() {
    cancelAnimationFrame(frame); frame = 0;
    listeners.forEach(function (item) { item[0].removeEventListener(item[1], item[2], true); });
    listeners.length = 0;
  }
  function finish(reason) { state.finish(reason, false); }
  function scroll() { if (window.scrollY > 4) finish('scroll'); }
  function resize() { if (window.innerWidth !== width) finish('resize'); }
  function visibility() { if (document.hidden) finish('hidden'); }
  function motion() { if (reduce.matches) finish('reduced-motion'); }
  function pageshow(event) { if (event.persisted || window.scrollY > 4) finish('history'); }
  function ease(value) {
    var t = Math.max(0, Math.min(1, value));
    return t*t*t*(t*(t*6-15)+10);
  }
  listen(window, 'scroll', scroll);
  listen(window, 'resize', resize);
  listen(window, 'hashchange', function () { finish('hash'); });
  listen(window, 'pagehide', function () { finish('history'); });
  listen(window, 'pageshow', pageshow);
  listen(document, 'visibilitychange', visibility);
  listen(reduce, 'change', motion);
  listen(window, 'nm:opening-done', cleanup);

  function tick(now) {
    frame = 0;
    if (!state.active) return;
    if (reduce.matches) { finish('reduced-motion'); return; }
    if (document.hidden) { finish('hidden'); return; }
    if (window.scrollY > 4 || location.hash) { finish('scroll'); return; }
    if (start === null) {
      var cached = !phone.matches || (section && section.classList.contains('nm-intro-cached'));
      if (!mediaReady || !cached || !state.shaderReady || !root.classList.contains('nm-scene-ready')) {
        frame = requestAnimationFrame(tick); return;
      }
      start = now; state.phase = 'playing';
      clearTimeout(state.deadline);
      state.deadline = setTimeout(function () { finish('timeout'); }, 2300);
    }
    var elapsed = now - start;
    state.radius = .12 + .88 * ease(elapsed / 520);
    state.morph = ease((elapsed - 430) / 960);
    if (elapsed >= 1490) { state.finish('complete', true); return; }
    frame = requestAnimationFrame(tick);
  }

  (window.__nmReady || function (fn) { fn(); })(function () {
    // This controller registers in the head. Let the remaining ready callbacks
    // mount the collage and its stable scroll track before reading the images.
    requestAnimationFrame(function () {
      if (!state.active) return;
      section = document.getElementById('nm-made');
      if (!section) { finish('missing-content'); return; }
      var images = Array.from(section.querySelectorAll('img'));
      // Decode the mounted images so srcset selection and the phone's collage
      // cache reuse the same requests. No copies, new assets, or video starts.
      Promise.all(images.map(function (image) {
        return image.decode ? image.decode() : Promise.resolve();
      })).then(function () {
        mediaReady = true;
      }, function () { finish('image-error'); });
    });
  });
  frame = requestAnimationFrame(tick);
})();
