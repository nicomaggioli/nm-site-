(window.__nmReady || function (fn) { fn(); })(function () {
  'use strict';
  var section = document.getElementById('nm-made');
  var hero = document.querySelector('main > section.h-svh');
  if (!section || !hero) return;
  var grid = section.querySelector('.index-feature'), ring = section.querySelector('.idx-ring');
  var track = document.createElement('div');
  track.className = 'nm-made-track';
  section.before(track); track.appendChild(section);
  var anchor = document.createElement('div');
  anchor.id = 'work'; anchor.dataset.nmMadeSpacer = '';
  anchor.className = 'nm-made-anchor'; anchor.setAttribute('aria-hidden','true');
  track.prepend(anchor);
  var hold = 0, frame = 0, dirty = true, lastProgress = -1, lastPinned;
  var lastWidth = window.innerWidth;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var coarse = matchMedia('(pointer:coarse)');
  function apply() {
    frame = 0;
    if (dirty) {
      hold = hero.offsetHeight;
      var sectionHeight = section.offsetHeight;
      track.style.marginTop = -hold + 'px';
      track.style.height = sectionHeight + hold + 'px';
      anchor.style.top = hold + 'px';
      grid.style.transformOrigin = '50% ' + (hold / 2) + 'px';
      lastProgress = -1;
      dirty = false;
    }
    var progress = hold ? Math.min(1, Math.max(0,window.scrollY / hold)) : 1;
    var pinned = progress < 1;
    if (progress === lastProgress) return;
    lastProgress = progress;
    if (pinned !== lastPinned) {
      section.dataset.nmPinned = String(pinned);
      document.documentElement.classList.toggle('nm-past-hero', !pinned);
      lastPinned = pinned;
    }
    grid.style.transform = pinned && !reduce.matches ? 'scale(' + (.12 + .88 * progress).toFixed(5) + ')' : '';
    if (ring) {
      ring.style.display = pinned && !reduce.matches ? '' : 'none';
      ring.style.opacity = String(Math.max(0,Math.min(1,(.98-progress)/.16)));
    }
  }
  function schedule() { if (!frame) frame=requestAnimationFrame(apply); }
  function invalidate() { dirty=true;schedule(); }
  function resize() {
    var width = window.innerWidth;
    if (width !== lastWidth || !coarse.matches) invalidate();
    lastWidth = width;
  }
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('pageshow',invalidate);
  reduce.addEventListener('change',invalidate);
  if ('ResizeObserver' in window) { var observer=new ResizeObserver(invalidate);observer.observe(hero); observer.observe(section); }
  window.__nmMade=invalidate;
  apply();
});
