/* Night Sky: the live design inside a particle space (js/nm-space.js) with the real night sky
   beyond it (js/nm-sky.js) and a faint aurora between them (js/nm-aurora.js). */
(function () {
  'use strict';
  var C = window.NMThemeConfig = window.NMThemeConfig || {};
  C.blackHole = false;   // the footer mark is the NM the particles gather into
  C.heroClear = true;    // the hero paints the space and the sky outside the NM mark
  // in paint order: the space (opaque), the aurora (screen), the stars (transparent), and
  // their overlay while a shooting star or the hover reticle is on it (the hero takes four)
  C.heroBackdrop = function () {
    var out = [], sp = window.NMSpace, k = window.NMSky, au = window.NMAurora;
    if (sp && sp.canvas) out.push(sp.canvas);
    if (au && au.canvas && au.canvas.isConnected) out.push(au.canvas);
    if (k && k.canvas) out.push(k.canvas);
    if (k && k.fx && k.fxBusy && k.fxBusy()) out.push(k.fx);
    return out;
  };
  var bust = '?v=dev' + Date.now().toString(36);
  // the space first: it owns the camera the sky reads
  ['/js/nm-space.js', '/js/nm-sky.js', '/js/nm-aurora.js'].forEach(function (src) {
    var s = document.createElement('script');
    s.src = src + bust;
    s.async = false;
    document.head.appendChild(s);
  });

  // Nav bar: a Work link, so the centred wordmark has two links on each side.
  function addWork() {
    var ul = document.querySelector('header[data-nm-header] > nav > ul, .nm-hdr .nm-nav');
    if (!ul || ul.querySelector('a[href="/#work"]')) return;
    var li = document.createElement('li'), a = document.createElement('a'), sp = document.createElement('span');
    li.className = 'nm-st-work';
    a.href = '/#work';
    a.className = 'text-nav';
    sp.textContent = 'work';
    a.appendChild(sp); li.appendChild(a);
    var index = ul.querySelector('a[href="/index/"]');
    ul.insertBefore(li, index ? index.parentNode : ul.firstChild);
    a.addEventListener('click', function (e) {
      var target = document.getElementById('work');
      if (!target) return;                       // other pages: go to the homepage's work section
      e.preventDefault();
      if (window.__nmLenis) window.__nmLenis.scrollTo(target);
      else target.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Nav bar spacing: the name stays dead centre and the four links sit at one equal spacing
  // (Work · Index · NAME · About · Contact). The spacing is the widest that still fits the wider
  // side inside the header padding; theme-stars.css lays the row out from these numbers and has
  // a close default for the first paint.
  function spaceNav() {
    var h = document.querySelector('header[data-nm-header], header.nm-hdr');
    var wm = h && h.querySelector(':scope > a[href="/"]');
    var ul = h && h.querySelector(':scope > nav > ul');
    if (!wm || !ul) return;
    var st = ul.style;
    if (!matchMedia('(min-width: 768px)').matches) { st.removeProperty('--nm-nav-gap'); st.removeProperty('--nm-nav-skew'); st.removeProperty('--nm-nav-name'); return; }
    // the visible links in display order: the first two sit left of the name, the rest right
    var lis = [].filter.call(ul.children, function (li) { return li.offsetWidth > 0; })
      .sort(function (a, b) { return (+getComputedStyle(a).order || 0) - (+getComputedStyle(b).order || 0); });
    var left = 0, right = 0;
    lis.forEach(function (li, i) { var x = li.getBoundingClientRect().width; if (i < 2) left += x; else right += x; });
    var name = wm.getBoundingClientRect().width;
    var gap = Math.max(16, (ul.clientWidth / 2 - name / 2 - Math.max(left, right)) / 2);
    st.setProperty('--nm-nav-gap', gap.toFixed(2) + 'px');
    st.setProperty('--nm-nav-skew', (right - left).toFixed(2) + 'px');   // + pads the left, - the right
    st.setProperty('--nm-nav-name', name.toFixed(2) + 'px');
  }

  function navReady() {
    addWork();
    spaceNav();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(spaceNav);
    addEventListener('resize', spaceNav, { passive: true });
    // the homepage header is React's: re-run if it re-renders the list
    var h = document.querySelector('header[data-nm-header]');
    var queued = 0;
    if (h && window.MutationObserver) new MutationObserver(function () {
      if (!queued) queued = requestAnimationFrame(function () { queued = 0; addWork(); spaceNav(); });
    }).observe(h, { childList: true, subtree: true });
  }
  if (window.__nmReady) window.__nmReady(navReady);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', navReady);
  else navReady();
})();
