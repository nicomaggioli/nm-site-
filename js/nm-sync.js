/* Custom extensions start after React commits. No document-wide mutation
   observer: text changes and scrolling must never remount the page. */
(function () {
  'use strict';
  var ready = false, starting = false, queue = [], errors = [];
  function invoke(fn) {
    try { fn(); }
    catch (error) {
      errors.push(String(error && error.message || error));
      console.error('Portfolio extension failed:', error);
    }
  }
  window.__nmReady = function (fn) {
    if (ready) invoke(fn);
    else queue.push(fn);
  };
  /* Existing extensions register a second, idempotent pass. This lets anchor
     setup see the grid created earlier in the same commit, without observing
     or reacting to any of its own DOM writes. */
  window.__nmSync = function (fn) {
    if (typeof fn === 'function') requestAnimationFrame(function () { invoke(fn); });
  };
  window.__nmSync.errors = errors;
  var hashCancelled = false;
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(function (type) {
    window.addEventListener(type, function () { hashCancelled = true; }, { once: true, passive: true });
  });
  function resolveHash() {
    if (hashCancelled || (location.hash !== '#about' && location.hash !== '#contact')) return;
    var target = document.querySelector(location.hash);
    if (!target) return;
    if (window.__nmLenis) {
      window.__nmLenis.resize();
      window.__nmLenis.scrollTo(target, { immediate: true });
    } else window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY, behavior: 'instant' });
  }
  window.addEventListener('load', function () {
    if (ready) requestAnimationFrame(resolveHash);
  }, { once: true });
  function start() {
    if (ready || starting) return;
    starting = true;
    setTimeout(function () {
      ready = true;
      history.scrollRestoration = "auto";
      queue.splice(0).forEach(invoke);
      requestAnimationFrame(function () {
        if (window.__nmRefresh) window.__nmRefresh();
        // The grid pin updates on its own frame. Resolve after that handoff.
        requestAnimationFrame(resolveHash);
      });
    }, 0);
  }
  window.addEventListener('nm:hydrated', start, { once: true });
  if (window.__nmHydrated) start();
  else if (!document.querySelector('script[src^="/_next/"]')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})();
