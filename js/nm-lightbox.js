/* ── archive lightbox ─────────────────────────────────────────────────────
   The grid renders 512px thumbnails from /media/nm-thumb/. Every one has a
   full-size original at the SAME filename under /media/nm-work/ (verified:
   176 of 176). Clicking a tile opens that.

   Delegated off document rather than bound per tile: there are 176 of them,
   and delegation also survives if the grid is ever re-rendered.

   The full-size images are never preloaded on page load -- only the neighbours
   of whatever is open, so browsing is instant without adding 25MB to the
   initial load. */
(function () {
  var TH = '/media/nm-thumb/', FULL = '/media/nm-work/';
  var lb = null, imgEl = null, capEl = null;
  var tiles = [], idx = -1, lastFocus = null;

  function full(src) { return src.indexOf(TH) === 0 ? FULL + src.slice(TH.length) : src; }

  function collect() {
    tiles = [].slice.call(document.querySelectorAll('.grid .tile img'));
    return tiles;
  }

  function build() {
    if (lb && lb.isConnected) return lb;
    lb = document.createElement('div');
    lb.className = 'nm-lb';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Image viewer');
    lb.innerHTML =
      '<button class="nm-lb-close" type="button" aria-label="Close">✕</button>' +
      '<button class="nm-lb-prev"  type="button" aria-label="Previous image">←</button>' +
      '<button class="nm-lb-next"  type="button" aria-label="Next image">→</button>' +
      '<figure><img alt=""><figcaption></figcaption></figure>';
    document.body.appendChild(lb);
    imgEl = lb.querySelector('img');
    capEl = lb.querySelector('figcaption');
    return lb;
  }

  function preload(i) {
    if (i < 0 || i >= tiles.length) return;
    var im = new Image();
    im.src = full(tiles[i].getAttribute('src'));
  }

  function show(i) {
    if (!tiles.length || i < 0 || i >= tiles.length) return;
    idx = i;
    var t = tiles[i];
    imgEl.classList.remove('is-ready');
    imgEl.onload = function () { imgEl.classList.add('is-ready'); };
    imgEl.src = full(t.getAttribute('src'));
    imgEl.alt = t.getAttribute('alt') || '';
    capEl.textContent = (t.getAttribute('alt') || '') + '  ·  ' + (i + 1) + ' / ' + tiles.length;
    /* neighbours only, so paging is instant without a 25MB preload */
    preload(i - 1); preload(i + 1);
  }

  function open(i, origin) {
    build(); collect();
    /* remember the TILE explicitly rather than reading document.activeElement:
       a mouse click does not reliably leave focus on the element, so closing
       would drop the keyboard user back at the top of a 176-tile grid. */
    lastFocus = origin || document.activeElement;
    show(i);
    lb.classList.add('is-open');
    document.documentElement.classList.add('nm-lb-open');
    lb.querySelector('.nm-lb-close').focus();
  }
  function close() {
    if (!lb) return;
    lb.classList.remove('is-open');
    document.documentElement.classList.remove('nm-lb-open');
    /* drop the src so a 3MB image is not held in memory behind the overlay */
    setTimeout(function () { if (!lb.classList.contains('is-open')) imgEl.removeAttribute('src'); }, 260);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function step(d) {
    if (!tiles.length) return;
    show((idx + d + tiles.length) % tiles.length);
  }

  /* tiles are <figure>, not links -- give them a keyboard affordance */
  function arm() {
    var t = document.querySelectorAll('.grid .tile');
    for (var i = 0; i < t.length; i++) {
      if (t[i].hasAttribute('tabindex')) continue;
      t[i].setAttribute('tabindex', '0');
      t[i].setAttribute('role', 'button');
      var a = t[i].querySelector('img');
      t[i].setAttribute('aria-label', 'Open ' + ((a && a.getAttribute('alt')) || 'image'));
    }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.nm-lb button');
    if (btn) {
      if (btn.classList.contains('nm-lb-close')) close();
      else if (btn.classList.contains('nm-lb-prev')) step(-1);
      else step(1);
      return;
    }
    if (lb && lb.classList.contains('is-open')) {
      /* backdrop, or the figure's empty area, dismisses */
      if (e.target === lb || e.target.tagName === 'FIGURE') { close(); }
      return;
    }
    var tile = e.target.closest && e.target.closest('.grid .tile');
    if (!tile) return;
    collect();
    var im = tile.querySelector('img');
    var i = tiles.indexOf(im);
    if (i >= 0) { e.preventDefault(); open(i, tile); }
  });

  document.addEventListener('keydown', function (e) {
    if (lb && lb.classList.contains('is-open')) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var tile = document.activeElement && document.activeElement.closest
             ? document.activeElement.closest('.grid .tile') : null;
    if (!tile) return;
    e.preventDefault();
    collect();
    var i = tiles.indexOf(tile.querySelector('img'));
    if (i >= 0) open(i, tile);
  });

  arm();
  document.addEventListener('DOMContentLoaded', arm);
  window.addEventListener('load', arm);
})();
