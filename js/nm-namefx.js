/* Header wordmark hover: the letters of NICO MAGGIOLI flip top-to-bottom in a quick
   left-to-right ripple, landing on the name mirrored vertically (the same as turning it
   upside down and then flipping it horizontally), and flip back on leave.

   The wordmark is one SVG <text> stretched with textLength. Rather than rewrite it (the
   homepage header is React-owned), this lays an identical aria-hidden SVG over it with one
   <text> per letter at the exact positions the browser computed for the original, then hides
   the original glyphs. Fine pointers only; reduced motion swaps without the ripple. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)');
  if (!fine || !fine.matches) return;

  var css = document.createElement('style');
  css.textContent =
    'a:has(> .nm-namefx) > svg:not(.nm-namefx) text{visibility:hidden}' +
    'a:has(> .nm-namefx){position:relative}' +
    '.nm-namefx{position:absolute;pointer-events:none;overflow:visible}' +
    '.nm-namefx text{transform-box:view-box;transform:scaleY(1);' +
      'transition:transform .52s cubic-bezier(.62,0,.32,1) calc(var(--i) * 26ms)}' +
    'a:hover > .nm-namefx text,a:focus-visible > .nm-namefx text{transform:scaleY(-1)}' +
    '@media (prefers-reduced-motion: reduce){.nm-namefx text{transition:none}}';
  document.head.appendChild(css);

  function place(a, svg, fx) {
    // SVG elements have no offset* box; position from the rendered rects (inside the border)
    var ar = a.getBoundingClientRect(), sr = svg.getBoundingClientRect();
    fx.style.left = (sr.left - ar.left - a.clientLeft) + 'px';
    fx.style.top = (sr.top - ar.top - a.clientTop) + 'px';
    fx.style.width = sr.width + 'px';
    fx.style.height = sr.height + 'px';
  }

  function mount() {
    var svg = document.querySelector('header a[href="/"] > svg[viewBox="0 0 220 33"]');
    var text = svg && svg.querySelector('text');
    var a = svg && svg.parentNode;
    if (!text || a.querySelector(':scope > .nm-namefx')) return;
    var str = text.textContent;
    var n = text.getNumberOfChars();
    if (!n || n !== str.length) return;

    var fx = document.createElementNS(NS, 'svg');
    fx.setAttribute('viewBox', '0 0 220 33');
    fx.setAttribute('class', 'nm-namefx');
    fx.setAttribute('aria-hidden', 'true');
    fx.setAttribute('focusable', 'false');
    var style = text.getAttribute('style') || '';
    var letters = [], mid = 0, k = 0;
    for (var i = 0; i < n; i++) {
      if (!str[i].trim()) continue;
      var p = text.getStartPositionOfChar(i);
      var t = document.createElementNS(NS, 'text');
      t.setAttribute('x', p.x);
      t.setAttribute('y', p.y);
      t.setAttribute('fill', 'currentColor');
      t.setAttribute('style', style);
      t.style.setProperty('--i', k++);
      t.textContent = str[i];
      fx.appendChild(t);
      letters.push([t, text.getExtentOfChar(i)]);
    }
    a.appendChild(fx);
    // flip every letter about the shared cap-height midline so the word stays on one line
    var caps = letters.map(function (l) { var b = l[0].getBBox(); return b.y + b.height / 2; });
    mid = caps.reduce(function (s, v) { return s + v; }, 0) / caps.length;
    letters.forEach(function (l) {
      var b = l[0].getBBox();
      l[0].style.transformOrigin = (b.x + b.width / 2) + 'px ' + mid + 'px';
    });
    place(a, svg, fx);
    addEventListener('resize', function () { place(a, svg, fx); }, { passive: true });
  }

  function start() {
    var go = function () { try { mount(); } catch (e) { /* leave the plain wordmark */ } };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
  }
  if (window.__nmReady) window.__nmReady(start);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
