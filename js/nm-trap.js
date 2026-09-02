/* ── focus containment for the two overlays ───────────────────────────────
   The burger panel and the lightbox both declare role="dialog" and
   aria-modal="true" but neither contained focus. Tab walked straight out of
   them and down the page behind an opaque panel, with the scroll lock still
   latched on <html> so the focus ring could not even be scrolled into view.
   Below 768px the burger is the ONLY navigation on the site, so for a
   keyboard or switch user that was the whole site becoming unreachable.

   inert on the siblings does the real work -- it removes everything outside
   the dialog from the tab order AND from the accessibility tree in one go,
   which a hand-rolled Tab handler cannot. The Tab cycle is the fallback for
   browsers without inert.

   Shared rather than written twice because the two overlays had the same
   hole, and a third would too. */
(function () {
  var SEL = 'a[href], button:not([disabled]), input, select, textarea, ' +
            '[tabindex]:not([tabindex="-1"])';
  var open = null, lastFocus = null, inerted = [];

  function focusables(root) {
    return [].slice.call(root.querySelectorAll(SEL)).filter(function (el) {
      /* offsetParent is null for display:none; a zero box catches
         visibility:hidden and collapsed panels */
      return el.offsetParent !== null || el.getClientRects().length;
    });
  }

  function setInert(on) {
    if (on) {
      inerted = [].slice.call(document.body.children).filter(function (el) {
        return el !== open && !el.contains(open);
      });
      inerted.forEach(function (el) { el.inert = true; });
    } else {
      inerted.forEach(function (el) { el.inert = false; });
      inerted = [];
    }
  }

  function trap(e) {
    if (e.key !== 'Tab' || !open) return;
    var f = focusables(open);
    if (!f.length) { e.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  function capture(el) {
    if (open === el) return;
    release();
    open = el;
    lastFocus = document.activeElement;
    setInert(true);
    var f = focusables(el);
    if (f.length) f[0].focus();
    document.addEventListener('keydown', trap, true);
  }

  function release() {
    if (!open) return;
    setInert(false);
    document.removeEventListener('keydown', trap, true);
    open = null;
    /* only restore if focus is still inside what we are closing, so this does
       not steal focus from wherever the user has since clicked */
    if (lastFocus && lastFocus.isConnected &&
        (!document.activeElement || document.activeElement === document.body)) {
      try { lastFocus.focus(); } catch (e) {}
    }
    lastFocus = null;
  }

  /* Every overlay on the site signals its state with a class, and each is
     re-created by its own script, so watch the state rather than hook their
     functions. .pa-modal is the proposals admin, whose token and editor
     dialogs have the same aria-modal claim and the same need. */
  function poll() {
    var want = document.querySelector('.nm-burger-panel.is-open') ||
               document.querySelector('.nm-lb.is-open') ||
               document.querySelector('.pa-modal:not(.pp-hidden)') || null;
    if (want && want !== open) capture(want);
    else if (!want && open) release();
  }

  new MutationObserver(poll).observe(document.documentElement, {
    attributes: true, attributeFilter: ['class'], subtree: true
  });
  poll();
})();
