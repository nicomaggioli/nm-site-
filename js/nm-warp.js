/* Night Sky: scroll fast and the page bends with the speed. Sections slant and stretch in the
   direction of travel, then spring back as the scroll slows. Ordinary scrolling never triggers
   it: the warp only starts above a speed threshold and is capped.

   Transforms go on whole sections that are in normal flow (never on sticky/fixed elements such
   as the work collage track, the header or the canvases), only while moving; at rest the inline
   transform is removed again. Off under prefers-reduced-motion. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  var PAGES = {
    home: ['#about', '#nm-brands', '#nm-services', '#nm-sites'],
    about: ['main#main > section:not(#contact)', 'main#main > div'],
    index: ['main#main', '.nm-wall', 'main > .grid']
  };
  var page = document.querySelector('footer .foot-mark') ? 'index' : document.body.classList.contains('nm-about-page') ? 'about' : 'home';
  var START = 1000, FULL = 4500;      // px/s: no warp below START, full warp at FULL
  var SKEW = 6, STRETCH = .09;        // degrees, fraction at full warp
  var els = [], tops = [], last = 0, lastY = 0, vel = 0, warp = 0, raf = 0, moving = false;

  function collect() {
    els = []; tops = [];
    PAGES[page].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        var pos = getComputedStyle(el).position;
        if (pos === 'sticky' || pos === 'fixed' || els.indexOf(el) >= 0) return;
        els.push(el);
        tops.push(el.getBoundingClientRect().top + window.scrollY);   // untransformed: collected at rest
      });
    });
  }
  function apply(w) {
    var s = (w * SKEW).toFixed(3), k = (1 + Math.abs(w) * STRETCH).toFixed(4);
    var mid = window.scrollY + window.innerHeight / 2;   // bend around the middle of the screen
    for (var i = 0; i < els.length; i++) {
      var st = els[i].style;
      if (w === 0) { st.transform = ''; st.transformOrigin = ''; st.willChange = ''; continue; }
      st.transformOrigin = '50% ' + Math.round(mid - tops[i]) + 'px';
      st.willChange = 'transform';
      st.transform = 'skewY(' + s + 'deg) scaleY(' + k + ')';
    }
  }
  // the speed the page is actually moving on screen (Lenis on the homepage animates scrollY too)
  function speed() { return vel; }
  function frame(t) {
    raf = 0;
    var dt = last ? Math.min(.05, (t - last) / 1000) : 1 / 60;
    last = t;
    var y = window.scrollY;
    if (dt > 0) vel = vel * .6 + ((y - lastY) / dt) * .4;
    lastY = y;
    var v = speed(), a = Math.abs(v);
    var target = a <= START ? 0 : Math.min(1, (a - START) / (FULL - START)) * (v > 0 ? 1 : -1);
    // quick to bend, slower to settle, like something elastic catching up
    warp += (target - warp) * (Math.abs(target) > Math.abs(warp) ? .22 : .1);
    if (Math.abs(warp) < .004 && target === 0) { warp = 0; apply(0); moving = false; last = 0; vel = 0; collect(); return; }
    apply(-warp);   // content trails the direction of travel
    raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (reduce && reduce.matches) return;
    if (!els.length) collect();
    if (!moving) { moving = true; lastY = window.scrollY; last = 0; }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function start() {
    collect();
    addEventListener('scroll', kick, { passive: true });
    addEventListener('resize', function () { apply(0); warp = 0; collect(); }, { passive: true });
  }
  if (window.__nmReady) window.__nmReady(start);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
