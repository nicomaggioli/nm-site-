/* ── hero labels: DESIGN & MANUFACTURING / SCROLL DOWN ────────────────────
   These two sit in a fixed full-viewport section at the top of the homepage
   and are faded by GSAP from a React flag, `show: L && U`. U is driven by a
   ScrollTrigger:

     ScrollTrigger.create({ id:"heroText", trigger:<the h-svh spacer>,
       start:..., onEnter:()=>G(false), onLeaveBack:()=>G(true),
       onUpdate:t=>G(t.scroll()<=40), onRefresh:t=>G(t.scroll()<=40) })

   onUpdate only fires while a trigger is ACTIVE, and this one's active range
   begins partway down the page -- so above its start, which is the whole top
   of the page, it never fires at all. Scrolling down sets U false; scrolling
   back up leaves the trigger inactive before scroll ever reaches 40, so
   nothing sets U true again. onLeaveBack does not save it either: that only
   fires when clamped progress is exactly 0, i.e. scroll <= 1px, which smooth
   scrolling routinely overshoots. The labels stay hidden until a reload.

   Fixing it inside the trigger was the obvious move and it is a trap: any
   callback that sets React state re-runs the useGSAP effect, which recreates
   the trigger, which refreshes, which sets state again. That locked the page
   up hard enough that the tab stopped responding.

   So this owns the two labels outright instead, from scroll position, which
   is what they were always a function of. It deliberately does NOT engage
   until you have scrolled well past the hero once -- the intro fade is
   GSAP's, and there is no reason to fight it on first load. */
(function () {
  var ENGAGE_AT = 200;   /* px of scroll that count as "you have left the top" */
  var AT_TOP = 40;       /* same threshold the build's own onUpdate uses */

  var engaged = false, labels = null, raf = 0;

  function find() {
    /* the fixed, full-viewport, bottom-aligned layer that holds both labels */
    var secs = document.querySelectorAll('section[class*="fixed"][class*="inset-0"]');
    for (var i = 0; i < secs.length; i++) {
      var s = secs[i];
      if (s.className.indexOf('z-10') < 0) continue;
      var kids = s.children;
      if (!kids.length) continue;
      var out = [];
      for (var k = 0; k < kids.length; k++) {
        if (kids[k].nodeType === 1) out.push(kids[k]);
      }
      if (out.length) return out;
    }
    return null;
  }

  function y() { return window.scrollY || document.documentElement.scrollTop || 0; }

  function apply() {
    raf = 0;
    var at = y();
    if (!engaged) {
      if (at < ENGAGE_AT) return;
      engaged = true;                 /* the intro is over; take ownership */
    }
    if (!labels || !labels.length || !labels[0].isConnected) labels = find();
    if (!labels) return;
    var show = at <= AT_TOP ? '1' : '0';
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].style.opacity !== show) labels[i].style.opacity = show;
    }
  }

  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(apply);
  }

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
})();
