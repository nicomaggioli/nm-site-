(window.__nmReady || function (fn) { fn(); })(function () {

/* Cursor-tracked screenshot preview for the live-websites list.
   Everything is DELEGATED off <document>, not bound to the rows: the section is
   injected markup, so React reconciles it away and nm-brands-js re-mounts it.
   Per-row listeners would die on the first remount; a document-level handler
   never notices. */
(function () {
  var enabled = matchMedia('(min-width:768px) and (hover:hover) and (pointer:fine)');

  var PW = 380, PH = Math.round(PW * 10 / 16), PAD = 24;
  var peek = null, img = null, host = null, active = '', raf = 0, px = 0, py = 0;

  function panel() {
    /* re-created if anything ever detaches it from <body> */
    if (peek && peek.isConnected) return peek;
    peek = document.createElement('div');
    peek.className = 'nm-site-peek';
    peek.innerHTML = '<img alt="" decoding="async">' +
      '<div class="lbl"><span><span class="dot"></span>Live</span>' +
      '<span class="host"></span></div>';
    document.body.appendChild(peek);
    img  = peek.querySelector('img');
    host = peek.querySelector('.host');
    active = '';
    return peek;
  }

  function place() {
    raf = 0;
    if (!peek) return;
    var vw = innerWidth, vh = innerHeight;
    /* the panel scales with the page above 1920, so its metrics must too */
    PW = Math.max(380, vw * 380 / 1920); PH = PW * 10 / 16; PAD = Math.max(24, vw * 24 / 1920);
    var x = px + PAD;
    if (x + PW > vw - 16) x = px - PAD - PW;        // flip to the left of the cursor
    x = Math.max(12, Math.min(x, vw - PW - 12));
    var y = Math.max(12, Math.min(py - PH / 2, vh - PH - 12));
    peek.style.left = x + 'px';
    peek.style.top  = y + 'px';
  }

  document.addEventListener('pointerover', function (e) {
    if (!enabled.matches) return;
    var row = e.target.closest && e.target.closest('#nm-sites .nm-site');
    if (!row) return;
    var p = panel(), shot = row.getAttribute('data-shot') || '';
    if (shot !== active) {
      img.src = shot;
      host.textContent = (row.href || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      active = shot;
    }
    /* seed the position from this event: arriving by scroll or keyboard means no
       pointermove has fired yet, and the panel would flash at wherever it sat last */
    px = e.clientX; py = e.clientY;
    place();
    p.classList.add('is-on');
  }, true);

  document.addEventListener('pointermove', function (e) {
    if (!peek || !peek.classList.contains('is-on')) return;
    px = e.clientX; py = e.clientY;
    if (!raf) raf = requestAnimationFrame(place);
  }, true);

  document.addEventListener('pointerout', function (e) {
    if (!peek) return;
    var row = e.target.closest && e.target.closest('#nm-sites .nm-site');
    if (!row) return;
    if (e.relatedTarget && row.contains(e.relatedTarget)) return;   // still inside the row
    peek.classList.remove('is-on');
  }, true);

  /* Warm the screenshots once the page is idle. Hovering a row then costs
     nothing, and a visitor who never scrolls this far never pays for them. */
  function warm() {
    var rows = document.querySelectorAll('#nm-sites .nm-site'), seen = {};
    if (!rows.length) return false;
    for (var i = 0; i < rows.length; i++) {
      var s = rows[i].getAttribute('data-shot');
      if (s && !seen[s]) { seen[s] = 1; (new Image()).src = s; }
    }
    return true;
  }
  var section = document.getElementById('nm-sites');
  if (section && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && enabled.matches && !(navigator.connection && navigator.connection.saveData)) {
        (window.requestIdleCallback || function (fn) { setTimeout(fn, 0); })(warm);
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(section);
  }
  function hide() { if (peek) peek.classList.remove('is-on'); }
  window.addEventListener('scroll', hide, { passive: true });
  window.addEventListener('resize', hide, { passive: true });
})();

});
