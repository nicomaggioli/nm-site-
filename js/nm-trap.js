/* Focus stays in the active dialog; closing restores its trigger without
   changing elements that were already inert before the dialog opened. */
(window.__nmReady || function (fn) { fn(); })(function () {
  'use strict';
  var selector = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
  var open = null, previous = null, inerted = [];
  function focusables(root) {
    return Array.from(root.querySelectorAll(selector)).filter(function (el) {
      var style = getComputedStyle(el);
      return !el.closest('[inert]') && el.getClientRects().length &&
        style.visibility !== 'hidden' && style.display !== 'none';
    });
  }
  function release(root) {
    if (!open || (root && root !== open)) return;
    var restore = open.contains(document.activeElement) || document.activeElement === document.body;
    inerted.forEach(function (el) { el.inert = false; });
    inerted = [];
    open = null;
    if (restore && previous && previous.isConnected && !previous.closest('[inert]')) {
      previous.focus({ preventScroll: true });
    }
    previous = null;
  }
  function capture(root) {
    if (root === open) return;
    release();
    previous = document.activeElement;
    open = root;
    inerted = Array.from(document.body.children).filter(function (el) {
      return el !== root && !el.contains(root) && !el.inert &&
        !/^(SCRIPT|STYLE|LINK)$/.test(el.tagName);
    });
    inerted.forEach(function (el) { el.inert = true; });
    (focusables(root)[0] || root).focus({ preventScroll: true });
  }
  window.__nmDialog = { capture: capture, release: release };
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || !open) return;
    var items = focusables(open), first = items[0], last = items[items.length - 1];
    if (!first) { e.preventDefault(); open.focus({ preventScroll: true }); return; }
    if (!open.contains(document.activeElement) || (e.shiftKey && document.activeElement === first)) {
      e.preventDefault(); (e.shiftKey ? last : first).focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }, true);
  function sync() {
    var next = document.querySelector('.nm-burger-panel.is-open,.nm-lb.is-open,.pa-modal:not(.pp-hidden)');
    if (next) capture(next); else release();
  }
  new MutationObserver(function (records) {
    if (records.some(function (r) {
      return r.target.matches('.nm-burger-panel,.nm-lb,.pa-modal');
    })) sync();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'], subtree: true });
  sync();
});
