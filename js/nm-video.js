/* ── only decode the video you can actually see ───────────────────────────
   The work grid carries five background loops, every one written

     <video autoplay loop muted playsinline preload="auto">

   so all five download in full and decode continuously for as long as the
   page is open, on screen or not. One of them (nmhome-0.mp4) is 7.7MB at
   1080x1444. Measured on a 375pt viewport: five videos in readyState 4 at
   once, ~4 megapixels of video being decoded every frame underneath the
   WebGL pass. Phones have a small number of hardware decoders and far less
   memory bandwidth than a laptop, which is what made scrolling through this
   section drag.

   Browsers do throttle offscreen video, but inconsistently and usually only
   after a delay, so this makes it explicit: a loop plays when it is within
   one screen of the viewport and is paused otherwise. Nothing visible
   changes -- by the time a tile is on screen it is already playing.

   The tags themselves also drop preload="auto" to "metadata", so landing on
   the page no longer pulls ~9MB of video before you have scrolled anywhere
   near the section it lives in. */
(function () {
  if (!('IntersectionObserver' in window)) return;

  /* preload="metadata" is set on the tags themselves rather than here: the
     work grid re-mounts from an HTML string, which replaces these elements
     and would put preload="auto" straight back. Only play/pause is applied
     at runtime, and arm() re-runs on every re-mount for the same reason. */

  function play(v) {
    var p = v.play();
    /* play() rejects if the browser declines (no gesture, power saving).
       Unhandled, that is an uncaught rejection on every scroll. */
    if (p && p.catch) p.catch(function () {});
  }

  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var v = entries[i].target;
      if (entries[i].isIntersecting) { if (v.paused) play(v); }
      else if (!v.paused) v.pause();
    }
  }, { rootMargin: '100% 0px' });   /* one screen of lead-in, so it is warm */

  /* Deliberately does NOT pause on arm. Pausing everything up front and
     relying on the observer to start the visible ones again means that if the
     observer never delivers -- throttled tab, some browser I have not tested
     -- every loop stays frozen and the grid becomes stills. Leaving autoplay
     alone makes the worst case identical to the old behaviour and the good
     case the win: the observer's first callback fires almost immediately and
     pauses whatever is off screen. */
  var seen = 'nmVidWatched';
  function arm() {
    var vids = document.querySelectorAll('video[loop]');
    for (var i = 0; i < vids.length; i++) {
      var v = vids[i];
      if (v.dataset[seen]) continue;
      v.dataset[seen] = '1';
      io.observe(v);
    }
  }
  arm();
  if (window.__nmSync) window.__nmSync(arm);
  else { document.addEventListener('DOMContentLoaded', arm); window.addEventListener('load', arm); }
})();
