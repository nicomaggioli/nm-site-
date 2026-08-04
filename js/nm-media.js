/* ── media budget ─────────────────────────────────────────────────────────
   The homepage was asking for 11.4MB of eager media before it was interactive:
   five autoplaying videos with preload="auto" (8.9MB, one of them 7.7MB) and
   154 eager <img>. Bytes were only half the problem — the decoded footprint is
   what matters. 84 unique images at 512x512 is roughly 84MB of bitmaps, and
   five simultaneous video decoders and a WebGL context sit on top of that.
   Desktop absorbs it; iOS Safari caps a tab at a few hundred MB and kills it,
   which is the "This page couldn't load" screen.

   Two measures here:
     VIDEO   the markup now carries data-nm-auto instead of autoplay, and
             preload="none". Nothing is fetched until the tile is near the
             viewport, and anything that leaves is paused so its decoder is
             released. On a phone only one plays at a time.
     IMAGES  the ring tiles behind the logo render at ~15-45 CSS px. Below
             768px they are switched to lazy so the browser decodes them as
             they approach rather than all at once. The seven core cells and
             everything above the fold stay eager. */
(function () {
  var mob = window.matchMedia && matchMedia('(max-width: 767.98px)').matches;

  /* ── video ──────────────────────────────────────────────────────────── */
  function armVideos() {
    var vids = document.querySelectorAll('video[data-nm-auto]');
    if (!vids.length || !window.IntersectionObserver) {
      /* no observer: fall back to starting them, better than a dead grid */
      for (var i = 0; i < vids.length; i++) play(vids[i]);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) play(e.target);
        else pause(e.target);
      });
    }, { rootMargin: mob ? '100px' : '300px' });
    for (var j = 0; j < vids.length; j++) {
      if (!vids[j].__nmArmed) { vids[j].__nmArmed = 1; io.observe(vids[j]); }
    }
  }
  function play(v) {
    if (v.preload === 'none') v.preload = 'auto';
    var p = v.play();
    if (p && p.catch) p.catch(function () {});   /* autoplay refused: first frame stays */
  }
  function pause(v) { try { v.pause(); } catch (e) {} }

  /* ── ring thumbnails ────────────────────────────────────────────────── */
  function easeImages() {
    if (!mob) return;
    var t = document.querySelectorAll('#nm-made .rc img[loading="eager"]');
    for (var i = 0; i < t.length; i++) t[i].loading = 'lazy';
  }

  function run() { armVideos(); easeImages(); }
  run();
  document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
  /* the grid is injected markup and gets re-mounted, so re-arm */
  new MutationObserver((function () {
    var p = 0;
    return function () { if (p) return; p = setTimeout(function () { p = 0; run(); }, 120); };
  })()).observe(document.documentElement, { childList: true, subtree: true });
})();
