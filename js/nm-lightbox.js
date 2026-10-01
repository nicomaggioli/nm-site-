/* ── archive lightbox ─────────────────────────────────────────────────────
   The grid selects responsive thumbnail sizes. Every image has a
   full-size original at the SAME filename under /media/nm-work/ (verified:
   170 of 170). Clicking a tile opens that.

   Delegated off document rather than bound per tile: there are 170 of them,
   and delegation also survives if the grid is ever re-rendered.

   The full-size images are never preloaded on page load -- only the neighbours
   of whatever is open, so browsing is instant without adding 25MB to the
   initial load. */
(function () {
  var TH = '/media/nm-thumb/', FULL = '/media/nm-work/';
  var lb = null, imgEl = null, videoEl = null, messageEl = null;
  var tiles = [], idx = -1, lastFocus = null;
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  var small = window.matchMedia && matchMedia('(max-width: 700px)');

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
      '<figure><img alt=""><video muted loop playsinline hidden></video>' +
      '<p class="nm-lb-message" role="status" hidden></p></figure>';
    document.body.appendChild(lb);
    imgEl = lb.querySelector('img');
    videoEl = lb.querySelector('video');
    messageEl = lb.querySelector('.nm-lb-message');
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
    var source = t.getAttribute('src'), original = full(source), fallback = false;
    var thumbnail = t.currentSrc || source;
    if (thumbnail === new URL(original, document.baseURI).href) thumbnail = source;
    messageEl.hidden = true; messageEl.textContent = '';
    var tile = t.closest('.tile');
    if (tile && tile.hasAttribute('data-motion') && !(still && still.matches)) {
      // a motion tile: the viewer plays the loop in place of the still
      imgEl.hidden = true; imgEl.removeAttribute('src');
      videoEl.hidden = false;
      videoEl.setAttribute('aria-label', t.getAttribute('alt') || '');
      videoEl.src = motionSrc(tile);
      var playing = videoEl.play();
      if (playing && playing.catch) playing.catch(function () { /* stays on its first frame */ });
      preload(i - 1); preload(i + 1);
      return;
    }
    videoEl.pause(); videoEl.removeAttribute('src'); videoEl.hidden = true;
    imgEl.hidden = false;
    imgEl.classList.remove('is-ready');
    imgEl.onload = function () { imgEl.classList.add('is-ready'); };
    imgEl.onerror = function () {
      // A failed full-size request must not leave an empty, locked overlay.
      // Reuse the responsive photo actually displayed in the index, which
      // can already be cached even when the connection has dropped.
      if (!fallback && original !== thumbnail) {
        fallback = true; imgEl.src = thumbnail;
      } else {
        imgEl.hidden = true;
        messageEl.textContent = 'This image couldn’t load. Use the arrows to continue.';
        messageEl.hidden = false;
      }
    };
    imgEl.src = original;
    imgEl.alt = t.getAttribute('alt') || '';
    /* neighbours only, so paging is instant without a 25MB preload */
    preload(i - 1); preload(i + 1);
  }

  function open(i, origin) {
    build(); collect();
    /* remember the TILE explicitly rather than reading document.activeElement:
       a mouse click does not reliably leave focus on the element, so closing
       would drop the keyboard user back at the top of the gallery. */
    lastFocus = origin || document.activeElement;
    show(i);
    lb.classList.add('is-open');
    document.documentElement.classList.add('nm-lb-open');
    if (window.__nmDialog) window.__nmDialog.capture(lb);
    lb.querySelector('.nm-lb-close').focus();
  }
  function close() {
    if (!lb) return;
    lb.classList.remove('is-open');
    if (window.__nmDialog) window.__nmDialog.release(lb);
    document.documentElement.classList.remove('nm-lb-open');
    /* drop the src so a 3MB image is not held in memory behind the overlay */
    videoEl.pause();
    setTimeout(function () {
      if (lb.classList.contains('is-open')) return;
      imgEl.removeAttribute('src'); videoEl.removeAttribute('src');
    }, 260);
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

  /* Motion tiles (<figure class="tile" data-motion="loop.mp4">): the still stays the tile, its
     poster and everything the archive tooling reads; a muted loop is laid over it while the tile
     is on screen (phones get data-motion-mobile) and paused when it leaves. Never under reduced
     motion. */
  function motionSrc(tile) {
    return (small && small.matches && tile.getAttribute('data-motion-mobile')) || tile.getAttribute('data-motion');
  }
  var watched = [];
  function motion() {
    if (!('IntersectionObserver' in window)) return;
    var io = motion.io || (motion.io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var tile = e.target, v = tile.querySelector(':scope > video.tile-motion');
        if (e.isIntersecting && !(still && still.matches)) {
          if (!v) {
            v = document.createElement('video');
            v.className = 'tile-motion';
            v.muted = true; v.loop = true; v.playsInline = true;
            v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
            v.addEventListener('playing', function () { v.classList.add('is-playing'); });
            v.src = motionSrc(tile);
            tile.appendChild(v);
          }
          var playing = v.play();
          if (playing && playing.catch) playing.catch(function () { /* the still stays */ });
        } else if (v && !v.paused) {
          v.pause();
        }
      });
    }, { rootMargin: '200px 0px' }));
    [].forEach.call(document.querySelectorAll('.grid .tile[data-motion]'), function (t) {
      if (watched.indexOf(t) < 0) { watched.push(t); io.observe(t); }
    });
  }

  arm(); motion();
  document.addEventListener('DOMContentLoaded', function () { arm(); motion(); });
  window.addEventListener('load', function () { arm(); motion(); });
})();
