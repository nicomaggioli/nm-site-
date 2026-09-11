(window.__nmReady || function (fn) { fn(); })(function () {

/* The build renders "about" and "contact" as <button>s wired to its own
   hash-scroll helper, which never found a target -- the ids it looks for are
   applied by nm-anchors-js to sections React owns, and the timing never lined
   up. Rather than keep chasing that, the click is handled here directly.

   Capture phase, so this runs before the build's own listener and can stop it;
   delegated off document, so it survives every React re-render of the header. */
(function () {
  function rendered(el) {
    for (var p = el; p; p = p.parentElement)
      if (p.nodeType === 1 && getComputedStyle(p).display === 'none') return false;
    return true;
  }
  function target(name) {
    var el = document.getElementById(name);
    if (el && rendered(el)) return el;
    /* fall back to the structural selector nm-anchors-js uses, in case the id
       has not been applied yet on a very early click */
    var mains = document.querySelectorAll('main'), main = null;
    for (var i = 0; i < mains.length; i++) if (rendered(mains[i])) { main = mains[i]; break; }
    if (!main) return null;
    if (name === 'about')   return main.querySelector(':scope > #about');
    if (name === 'contact') return main.querySelector(':scope > section.h-lvh');
    return null;
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('header[class*="z-50"] nav ul li button');
    if (!btn) return;
    var label = (btn.textContent || '').trim().toLowerCase();
    if (label === 'contact') {
      e.preventDefault(); e.stopPropagation();
      window.location.href = 'mailto:nicomaggioli@gmail.com';
      return;
    }
    if (label === 'about') {
      var el = target('about');
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      var y = el.getBoundingClientRect().top + (window.scrollY || 0);
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (window.__nmLenis) window.__nmLenis.scrollTo(y, { immediate: reduce });
      else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    }
  }, true);
})();

});
