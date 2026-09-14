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
  var shots = new Map(), pointerInside = false;

  function screenshot(src) {
    if (shots.has(src)) return shots.get(src);
    var image = new Image();
    image.alt = '';
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.src = src;
    // Retain the decoded element itself, rather than only warming the HTTP
    // cache and asking a fresh <img> to decode on the first pointerover.
    if (image.decode) image.decode().catch(function () {});
    shots.set(src, image);
    return image;
  }

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

  function rowAt(target) {
    return target && target.closest ? target.closest('#nm-sites .nm-site') : null;
  }

  function hide() { if (peek) peek.classList.remove('is-on'); }

  function show(row) {
    var shot = row && row.getAttribute('data-shot');
    if (!enabled.matches || !shot) { hide(); return; }
    var p = panel();
    if (shot !== active) {
      var ready = screenshot(shot);
      img.replaceWith(ready);
      img = ready;
      host.textContent = (row.href || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      active = shot;
    }
    place();
    p.classList.add('is-on');
  }

  function update() {
    raf = 0;
    if (!pointerInside || !enabled.matches) { hide(); return; }
    // Recheck the painted row, including when it moves under a stationary
    // cursor during smooth scrolling. The preview never captures pointer hits.
    show(rowAt(document.elementFromPoint(px, py)));
  }

  function schedule() {
    if (enabled.matches && pointerInside && !raf) raf = requestAnimationFrame(update);
  }

  function pointer(e) {
    if (e.pointerType === 'touch') { leave(); return; }
    pointerInside = true;
    px = e.clientX; py = e.clientY;
    schedule();
  }

  function leave() {
    pointerInside = false;
    hide();
  }

  document.addEventListener('pointerover', pointer, { passive: true, capture: true });
  document.addEventListener('pointermove', pointer, { passive: true, capture: true });
  document.addEventListener('pointerout', function (e) {
    if (!e.relatedTarget) leave();
    else schedule();
  }, true);
  document.addEventListener('pointercancel', leave, true);
  window.addEventListener('blur', leave);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) leave();
  });

  /* Warm the eight display-sized previews before the section reaches the
     viewport. Keep their downloads and decoding out of the opening intro. */
  var nearby = false;
  function warm() {
    if (!enabled.matches || (navigator.connection && navigator.connection.saveData)) return false;
    var rows = document.querySelectorAll('#nm-sites .nm-site');
    if (!rows.length) return false;
    for (var i = 0; i < rows.length; i++) {
      var s = rows[i].getAttribute('data-shot');
      if (s) screenshot(s);
    }
    return true;
  }
  var section = document.getElementById('nm-sites') || document.getElementById('about');
  if (section && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      nearby = entries[0].isIntersecting;
      if (nearby && warm()) observer.disconnect();
    }, { rootMargin: '1000px' });
    observer.observe(section);
  } else warm();
  enabled.addEventListener('change', function () {
    if (nearby) warm();
    if (!enabled.matches) hide();
    schedule();
  });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
})();

});
