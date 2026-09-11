/* One reversible scroll calculation owns the gallery pin and zoom. Layout
   dimensions are cached; scrolling only changes compositor properties. */
(window.__nmReady || function (fn) { fn(); })(function () {
  'use strict';
  var section = document.getElementById('nm-made');
  var hero = document.querySelector('main > section.h-svh');
  if (!section || !hero) return;
  var grid = section.querySelector('.index-feature'), ring = section.querySelector('.idx-ring');
  var spacer = document.createElement('div');
  spacer.id = 'work'; spacer.dataset.nmMadeSpacer = '';
  spacer.setAttribute('aria-hidden', 'true');
  spacer.style.cssText = 'height:0;pointer-events:none;overflow-anchor:none';
  section.before(spacer);
  var height = 0, hold = 0, pinned = null, frame = 0, dirty = true;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  function apply() {
    frame = 0;
    if (dirty) {
      hold = hero.offsetHeight;
      height = section.offsetHeight;
      dirty = false;
    }
    var y = Math.max(0, window.scrollY);
    var next = y < hold;
    if (next !== pinned) {
      pinned = next;
      section.style.position = pinned ? 'fixed' : 'relative';
      section.style.top = '0';
      section.style.left = pinned ? '0' : '';
      section.style.right = pinned ? '0' : '';
      section.style.marginTop = '0';
      section.style.zIndex = pinned ? '-1' : '1';
      grid.style.willChange = pinned && !reduce.matches ? 'transform' : 'auto';
    }
    var spacerHeight = pinned ? height + 'px' : '0px';
    if (spacer.style.height !== spacerHeight) spacer.style.height = spacerHeight;
    var progress = hold ? Math.min(1, y / hold) : 1;
    if (!pinned) {
      grid.style.transform = '';
      if (ring) ring.style.display = 'none';
      return;
    }
    var scale = reduce.matches ? 1 : .12 + .88 * progress;
    grid.style.transform = 'translateZ(' + (900 * (1 - 1 / scale)).toFixed(1) + 'px)';
    section.style.perspectiveOrigin = '50% ' + (hold / 2) + 'px';
    if (ring) {
      ring.style.display = reduce.matches ? 'none' : '';
      ring.style.opacity = String(Math.max(0, Math.min(1, ( .98 - progress) / .16)));
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(apply); }
  function resize() { dirty = true; schedule(); }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pageshow', resize);
  reduce.addEventListener('change', resize);
  if ('ResizeObserver' in window) {
    var observer = new ResizeObserver(resize);
    observer.observe(hero); observer.observe(section);
  }
  window.__nmMade = resize;
  apply();
});
