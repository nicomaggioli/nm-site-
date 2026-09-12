/* Posters render immediately. Download and decode loops only when their tiles
   are visible, after leaving the small hero aperture. */
(window.__nmReady || function (fn) { fn(); })(function () {
  'use strict';
  var videos = Array.from(document.querySelectorAll('#nm-made video[data-src]'));
  var visible = new Set(), pending = new WeakSet(), frame = 0;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var mobile = matchMedia('(max-width: 767px)');
  var coarse = matchMedia('(pointer:coarse)');
  var hero = document.querySelector('main > section.h-svh');
  var startAt = Infinity;
  var connection = navigator.connection;
  videos.forEach(function (video) {
    var frameRequest = 0;
    function resetPoster() {
      if (frameRequest && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameRequest);
      frameRequest = 0;
      video.removeAttribute('data-nm-frame-ready');
    }
    function revealFrame() {
      frameRequest = 0;
      if (video.readyState >= 2) video.setAttribute('data-nm-frame-ready', '');
    }
    function awaitFrame() {
      if (video.hasAttribute('data-nm-frame-ready') || frameRequest) return;
      // play() / loadedmetadata may precede the first painted frame on iOS.
      if (video.requestVideoFrameCallback) frameRequest = video.requestVideoFrameCallback(revealFrame);
      else if (video.readyState >= 2 && !video.paused) revealFrame();
    }
    video.addEventListener('playing', awaitFrame);
    video.addEventListener('loadeddata', awaitFrame);
    video.addEventListener('emptied', resetPoster);
    video.addEventListener('error', resetPoster);
  });
  function allowed(video) {
    return !document.hidden && !reduce.matches && !(connection && connection.saveData) &&
      visible.has(video) && window.scrollY >= startAt;
  }
  function update() {
    frame = 0;
    // Finish the touch-screen zoom before decoding and compositing video frames.
    // Read layout once, before any video writes, rather than for every tile.
    startAt = (hero ? hero.offsetHeight : innerHeight) * ((mobile.matches || coarse.matches) ? 1 : .25);
    videos.forEach(function (video) {
      if (!video.isConnected || !allowed(video)) { video.pause(); return; }
      if (!video.getAttribute('src')) {
        video.src = mobile.matches ? video.dataset.mobileSrc : video.dataset.src;
        video.load();
      }
      if (video.paused && !pending.has(video)) {
        pending.add(video);
        var result = video.play();
        if (result && result.then) result.then(function () {
          pending.delete(video);
          if (!allowed(video)) video.pause();
        }, function () { pending.delete(video); });
        else pending.delete(video);
      }
    });
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      });
      schedule();
    }, { rootMargin: '0px', threshold: .01 });
    videos.forEach(function (video) { observer.observe(video); });
  } else videos.forEach(function (video) { visible.add(video); });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) videos.forEach(function (video) { video.pause(); });
    else schedule();
  });
  window.addEventListener('pagehide', function () {
    cancelAnimationFrame(frame); frame = 0;
    videos.forEach(function (video) { video.pause(); });
  });
  window.addEventListener('pageshow', schedule);
  reduce.addEventListener('change', schedule);
  if (connection) connection.addEventListener('change', schedule);
  schedule();
});
