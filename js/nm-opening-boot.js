/* Inlined before the app scripts so the existing header cannot flash first.
   Its independent deadline also releases the UI if the controller fails. */
(function () {
  'use strict';
  var root = document.documentElement;
  var navigation = performance.getEntriesByType('navigation')[0];
  if (location.protocol === 'file:' || location.hash || window.scrollY > 4 ||
      document.hidden || (navigation && navigation.type === 'back_forward') ||
      matchMedia('(prefers-reduced-motion:reduce)').matches ||
      (navigator.connection && navigator.connection.saveData)) return;
  try {
    if (sessionStorage.getItem('nm-opening-seen-v1')) return;
    sessionStorage.setItem('nm-opening-seen-v1', '1');
  } catch (_) { /* Storage restrictions must not prevent access to the page. */ }
  var state = window.__nmOpening = {active:true, phase:'waiting', morph:0, radius:.12};
  var inputs = ['wheel','touchstart','pointerdown','keydown'];
  function interact() { state.finish('interaction', false); }
  state.finish = function (reason, reveal) {
    if (!state.active) return;
    state.active = false; state.morph = 1; state.radius = 1;
    state.phase = 'done'; state.reason = reason;
    clearTimeout(state.deadline);
    inputs.forEach(function (type) { window.removeEventListener(type, interact, true); });
    root.classList.remove('nm-opening');
    if (reveal) {
      root.classList.add('nm-opening-reveal');
      setTimeout(function () { root.classList.remove('nm-opening-reveal'); }, 600);
    }
    window.dispatchEvent(new Event('nm:opening-done'));
  };
  root.classList.add('nm-opening');
  inputs.forEach(function (type) { window.addEventListener(type, interact, {passive:true, capture:true}); });
  state.deadline = setTimeout(function () { state.finish('timeout', false); }, 5000);
})();
