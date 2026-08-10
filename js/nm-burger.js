/* ── mobile menu ──────────────────────────────────────────────────────────
   One hamburger for both pages. The homepage shipped a text "Menu" button and
   the archive just wrapped its links onto a second row; the shared stylesheet
   hides both below 768px and this mounts the replacement.

   The button is appended to whichever header is live, and the panel goes on
   <body> so it can cover the viewport without fighting the header's stacking
   context. Everything is re-armed by a MutationObserver because the homepage
   header is React-rendered and gets replaced wholesale. */
(function () {
  var LINKS = [
    { label: 'index',   href: '/index/' },
    { label: 'about',   href: '/#about', anchor: 'about' },
    { label: 'contact', href: 'mailto:nicomaggioli@gmail.com' }
  ];
  var btn = null, panel = null;

  function rendered(el) {
    for (var p = el; p; p = p.parentElement)
      if (p.nodeType === 1 && getComputedStyle(p).display === 'none') return false;
    return true;
  }
  function header() {
    var h = document.querySelectorAll('header[class*="z-50"], header.nm-hdr');
    for (var i = 0; i < h.length; i++) if (rendered(h[i])) return h[i];
    return null;
  }
  function close() {
    if (panel) panel.classList.remove('is-open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('nm-menu-open');
  }
  function open() {
    if (!panel) return;
    panel.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('nm-menu-open');
  }
  function toggle() {
    if (!panel) return;
    panel.classList.contains('is-open') ? close() : open();
  }

  function build() {
    var h = header();
    if (!h) return;

    if (!panel || !panel.isConnected) {
      panel = document.createElement('div');
      panel.className = 'nm-burger-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Menu');
      var nav = document.createElement('nav');
      LINKS.forEach(function (l) {
        var a = document.createElement('a');
        a.href = l.href; a.textContent = l.label;
        if (l.anchor) a.setAttribute('data-anchor', l.anchor);
        nav.appendChild(a);
      });
      panel.appendChild(nav);
      document.body.appendChild(panel);
    }

    /* Document-wide, NOT h.querySelector — same trap as nm-coord. React swaps
       the homepage header wholesale, so scoping the "already built?" check to
       the header we happen to have picked this pass builds a SECOND burger
       every time that pick changes. Find the one we have and move it. */
    var cur = document.querySelector('.nm-burger');
    if (cur) {
      btn = cur;
      if (cur.parentNode !== h) h.appendChild(cur);
      var dupes = document.querySelectorAll('.nm-burger');
      for (var d = 0; d < dupes.length; d++) if (dupes[d] !== btn) dupes[d].remove();
      return;
    }
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nm-burger';
    btn.setAttribute('aria-label', 'Menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span></span><span></span><span></span>';
    h.appendChild(btn);
  }

  /* Delegated in the capture phase: the homepage's own header listeners sit on
     elements this replaces, and capture lets the toggle win without racing. */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.nm-burger');
    if (b) { e.preventDefault(); e.stopPropagation(); toggle(); return; }

    /* Tapping the empty part of the panel closes it. Without this the only
       exits were the three links (one of which is a mailto: that hands you to
       Mail) or a reload -- and page scroll is locked the whole time. The
       panel's only child is a full-size <nav>, so both count as backdrop. */
    if (panel && panel.classList.contains('is-open') &&
        (e.target === panel || e.target === panel.firstElementChild)) { close(); return; }

    var a = e.target.closest && e.target.closest('.nm-burger-panel a');
    if (!a) return;
    var anchor = a.getAttribute('data-anchor');
    /* On the homepage the about section is on this page, so scroll rather than
       reload. Anywhere else the href is a real navigation and is left alone. */
    if (anchor) {
      var el = document.getElementById(anchor);
      if (el && rendered(el)) {
        e.preventDefault();
        close();
        var y = el.getBoundingClientRect().top + (window.scrollY || 0);
        var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        /* Lenis owns the scroll on the homepage and swallows native smooth
           behaviour, so hand it the target when it is present. */
        if (window.lenis && window.lenis.scrollTo) window.lenis.scrollTo(y);
        else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
        return;
      }
    }
    close();          // real navigation: let it happen, but drop the overlay
  }, true);

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  /* a resize up into desktop must not leave the page scroll-locked */
  window.addEventListener('resize', function () {
    if (window.innerWidth >= 768) close();
  }, { passive: true });

  build();
  /* Shared observer — see js/nm-sync.js. build() appends a button to the
     header and a panel to <body>, so its own writes used to re-trigger it and
     the four other document-wide observers. __nmSync also re-runs it on
     DOMContentLoaded and load. */
  if (window.__nmSync) window.__nmSync(build);
  else { document.addEventListener('DOMContentLoaded', build); window.addEventListener('load', build); }
})();
