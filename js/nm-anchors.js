(window.__nmReady || function (fn) { fn(); })(function () {

/* Resolve navigation once the exported React page and custom grid are ready. */
(function () {
  function rendered(el) {
    for (var p = el; p; p = p.parentElement)
      if (p.nodeType === 1 && getComputedStyle(p).display === 'none') return false;
    return true;
  }
  function liveMain() {
    var m = document.querySelectorAll('main');
    for (var i = 0; i < m.length; i++) if (rendered(m[i])) return m[i];
    return null;
  }
  function go() {
    var main = liveMain();
    if (!main) return;
    /* #work -> the spacer, whose top is exactly where the pin hands over and the
       work grid is sitting at full size. The grid itself is position:fixed while
       pinned, so its own box is not a usable scroll target. */
    var work    = document.querySelector('[data-nm-made-spacer]');
    var about   = main.querySelector(':scope > #about');
    var contact = main.querySelector(':scope > section.h-lvh');
    if (work && work.id !== 'work' && !document.getElementById('work')) work.setAttribute('data-nm', '1');
    [[work, 'work'], [about, 'about'], [contact, 'contact']].forEach(function (pair) {
      var el = pair[0], id = pair[1];
      if (!el) return;
      var cur = document.getElementById(id);
      if (cur === el) return;
      if (cur && cur !== el) cur.removeAttribute('id');
      el.id = id;
    });
  }
  /* "index" is a page, not an anchor. The build's nav renders <button>s that
     smooth-scroll to a hash, so a real <a> is spliced in after "work" rather
     than added to the payload's navigation array. */
  function navIndex() {
    var main = liveMain();
    if (!main) return;
    var hdr = document.querySelector('header[class*="z-50"]');
    if (!hdr) return;
    var ul = hdr.querySelector('nav ul');
    if (!ul || ul.querySelector('[data-nm-index]')) return;
    var items = ul.querySelectorAll('li');
    if (!items.length) return;
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = '/index/';
    a.className = (items[0].querySelector('button') || {}).className || 'text-nav cursor-pointer';
    a.setAttribute('data-nm-index', '1');
    a.style.color = '#fff';   /* .text-nav is 62% white; the real nav items get
                                 #fff from the blanket span rule, a bare link does not */
    a.textContent = 'index';
    li.appendChild(a);
    items[0].parentNode.insertBefore(li, items[0].nextSibling);   /* work · index · about · contact */
  }
  /* The footer email is centred by Tailwind's `md:!absolute`, which lives in
     @layer utilities. Cascade layers REVERSE for !important declarations: a
     layered !important beats an unlayered one, whatever the specificity. So no
     rule in #nm-theme can ever win this -- three attempts failed on exactly
     that. The style attribute with !important is the one thing above it. */
  function footerEmail() {
    /* MUST scope to the rendered <main>. React leaves its streamed copy in a
       display:none container, and that copy comes FIRST in document order, so a
       bare document.querySelector styles the invisible one. */
    var m = liveMain(); if (!m) return;
    var b = m.querySelector('footer .text-label[class*="absolute"]');
    if (!b || b.dataset.nmPinned) return;
    b.parentElement.style.setProperty('flex-direction', window.innerWidth < 360 ? 'column' : 'row', 'important');
    if (window.innerWidth < 360) {
      ['position:relative','left:auto','right:auto','top:auto','transform:none',
       'margin:12px 0 0','text-align:left'].forEach(function (declaration) {
        var colon = declaration.indexOf(':');
        b.style.setProperty(declaration.slice(0, colon), declaration.slice(colon + 1), 'important');
      });
      b.dataset.nmPinned = '1';
      return;
    }
    /* Positioned by MEASUREMENT, not by declaration. Both `right:0` and a
       static two-up landed the button 80px short of its container's right edge,
       and the container reports the correct edge -- so rather than keep guessing
       at where the 80px comes from, measure both boxes and set `left` so the
       right edges coincide. This cannot be wrong about the result. */
    /* The 80px was md:-translate-x-1/2 -- exactly half the button's width.
       Tailwind v4 composes transforms from registered custom properties
       (--tw-translate-x etc), so overriding `transform` does not clear the
       variable the utility feeds in. Zero the variables as well. */
    ['--tw-translate-x:0','--tw-translate-y:0','--tw-translate-z:0',
     'position:absolute','right:auto','top:50%',
     'transform:translateY(-50%)','margin:0','text-align:right'].forEach(function (d) {
      var k = d.indexOf(':');
      b.style.setProperty(d.slice(0,k), d.slice(k+1), 'important');
    });
    var host = b.offsetParent || b.parentElement;
    if (host) {
      var hw = host.getBoundingClientRect().width, bw = b.getBoundingClientRect().width;
      b.style.setProperty('left', Math.max(0, hw - bw) + 'px', 'important');
    }
    var sp = b.querySelector('span');
    if (sp) sp.style.setProperty('text-align', 'right', 'important');
    b.dataset.nmPinned = '1';
  }
  window.addEventListener('resize', function () {
    var m = liveMain(); if (!m) return;
    var b = m.querySelector('footer .text-label[class*="absolute"]');
    if (b) { delete b.dataset.nmPinned; footerEmail(); }
  }, { passive: true });
  go(); navIndex(); footerEmail();
  document.addEventListener('DOMContentLoaded', function(){ go(); navIndex(); footerEmail(); });
  window.addEventListener('load', function(){ go(); navIndex(); footerEmail(); });
  /* One idempotent pass allows the other extensions to finish mounting. */
  if (window.__nmSync) window.__nmSync(function () { go(); navIndex(); footerEmail(); });
})();

});
