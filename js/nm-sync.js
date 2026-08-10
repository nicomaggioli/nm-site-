/* ── one observer for the whole page ──────────────────────────────────────
   Five separate scripts each ran their own

     new MutationObserver(debounce(remount, 40))
       .observe(document.documentElement, { childList: true, subtree: true })

   and four of those remount functions WRITE to the DOM — nm-coord appends a
   button to the header and swaps a panel on <body>, nm-burger appends a button
   and a panel, nm-anchors splices an <li> into the nav, nm-brands removes and
   re-inserts a block of markup.

   So every write woke all five observers, and their writes woke them again.
   On a fresh load that settles, because each function early-returns once its
   widget is in place — measured at rest on the homepage: zero mutations. But
   scrolling the page mounts and unmounts React sections continuously, which
   keeps knocking those guards over, and from then on the loop sustains itself
   at the 40ms debounce. That is the strobing header: nav, coordinate capsule
   and burger flickering ~25 times a second after a scroll round-trip, while a
   reload — which throws the whole cycle away — looks perfect.

   This replaces all five with a single observer that
     1. disconnects before running the callbacks, so their own writes are never
        recorded, and takeRecords() before reconnecting so nothing queued
        during the gap can re-arm it;
     2. runs every registered callback in ONE batch, so they cannot wake each
        other;
     3. refuses to run more than once per MIN_GAP, which bounds the damage if
        some future callback is not idempotent.

   Callbacks must still be individually idempotent. This makes a fight cheap;
   it does not make one correct. */
(function () {
  if (window.__nmSync) return;

  var fns = [], errs = [], pending = 0, running = false, last = 0, mo = null;

  /* 200ms: slow enough that a genuine fight reads as a settle rather than a
     strobe, fast enough that a React re-render is repaired before the next
     frame the user looks at. */
  var MIN_GAP = 200;

  function reconnect() {
    if (!mo) return;
    mo.takeRecords();
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  function run() {
    pending = 0;
    running = true;
    mo.disconnect();
    try {
      /* one bad callback must not strand the others, or the widget it owns
         never re-mounts for the life of the page. Swallowed silently, this
         also hides the reason a widget stopped appearing -- so keep the last
         few failures on the scheduler where they can be read back. */
      for (var i = 0; i < fns.length; i++) {
        try { fns[i](); }
        catch (e) {
          errs.push({ i: i, msg: String(e && e.message || e), stack: String(e && e.stack || '') });
          if (errs.length > 8) errs.shift();
        }
      }
    } finally {
      last = Date.now();
      running = false;
      /* setTimeout, not rAF: rAF is throttled to a crawl in a background tab,
         and the observer must not stay disconnected for minutes because the
         user switched away mid-scroll. */
      setTimeout(reconnect, 0);
    }
  }

  function schedule() {
    if (running || pending) return;
    pending = setTimeout(run, Math.max(40, MIN_GAP - (Date.now() - last)));
  }

  mo = new MutationObserver(schedule);
  mo.observe(document.documentElement, { childList: true, subtree: true });

  /* Registering also runs the callback at the two handover points, which is
     what every caller used to wire up by hand. Which <main>/<header> is the
     live one is not settled until React has hydrated. */
  window.__nmSync = function (fn) {
    if (typeof fn !== 'function') return;
    fns.push(fn);
    document.addEventListener('DOMContentLoaded', fn);
    window.addEventListener('load', fn);
  };
  window.__nmSync.errors = errs;
  window.__nmSync.count = function () { return fns.length; };
})();
