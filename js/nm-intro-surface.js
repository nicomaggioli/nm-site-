/* Rasterize the unchanged collage once on phones. During the zoom, paint two
   cached layers into a viewport-sized surface instead of scaling 119 media
   elements. The original links and videos take over at the end of the zoom. */
(window.__nmReady || function (fn) { fn(); })(function () {
  'use strict';
  var section = document.getElementById('nm-made');
  if (!section || window.__nmIntroSurface) return;
  var grid = section.querySelector('.index-feature');
  var ring = section.querySelector('.idx-ring');
  if (!grid || !ring) return;
  var phone = matchMedia('(max-width:767px), (pointer:coarse) and (max-width:1024px)');
  var reduce = matchMedia('(prefers-reduced-motion:reduce)');
  var canvas = document.createElement('canvas');
  var context = canvas.getContext('2d', {alpha:false});
  if (!context) return;
  canvas.className = 'nm-intro-surface';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.hidden = true;
  section.prepend(canvas);
  var images = new Map(), layers = null, revision = 0, frame = 0;
  var geometryKey = '', lastDraw = '', active = false;

  function show(value) {
    if (active === value) return;
    active = value;
    canvas.hidden = !value;
    section.classList.toggle('nm-intro-cached', value);
  }
  function release(value) {
    if (!value) return;
    value.core.width = value.core.height = 1;
    value.ring.width = value.ring.height = 1;
  }
  function load(src) {
    if (!images.has(src)) {
      var image = new Image();
      image.src = src;
      images.set(src, image.decode().then(function () { return image; }));
    }
    return images.get(src);
  }
  function layer(width, height, density) {
    var surface = document.createElement('canvas');
    // No unbounded 5-screen-wide compositor layers, even on a 3x display.
    var ratio = Math.min(density, 2048 / width, 2048 / height);
    surface.width = Math.max(1, Math.ceil(width * ratio));
    surface.height = Math.max(1, Math.ceil(height * ratio));
    var ctx = surface.getContext('2d');
    if (!ctx) throw new Error('Collage surface unavailable');
    ctx.setTransform(surface.width / width, 0, 0, surface.height / height, 0, 0);
    return {canvas:surface, context:ctx};
  }
  function cover(ctx, image, box) {
    var scale = Math.max(box.width / image.naturalWidth, box.height / image.naturalHeight);
    var sw = box.width / scale, sh = box.height / scale;
    ctx.drawImage(image, (image.naturalWidth-sw)/2, (image.naturalHeight-sh)/2,
      sw, sh, box.x, box.y, box.width, box.height);
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(prepare);
  }
  async function paint(ctx, boxes, sources, offset, current) {
    var started = performance.now();
    for (var i = 0; i < boxes.length; i++) {
      if (current !== revision) return false;
      cover(ctx, sources[offset+i], boxes[i]);
      // Preparing a cold cache must not monopolize a phone's first scroll.
      if (performance.now()-started > 4) {
        await new Promise(requestAnimationFrame);
        started = performance.now();
      }
    }
    return current === revision;
  }
  async function prepare() {
    frame = 0;
    var enabled = phone.matches && !reduce.matches;
    var width = grid.offsetWidth, height = grid.offsetHeight;
    var key = enabled ? width + ':' + height : '';
    if (key === geometryKey) return;
    geometryKey = key;
    var current = ++revision;
    show(false); lastDraw = '';
    release(layers); layers = null;
    if (!enabled || !width || !height) return;
    // All measurements happen before loading/drawing, never inside scroll.
    var bounds = grid.getBoundingClientRect(), scale = bounds.width / width;
    var cells = Array.from(grid.querySelectorAll('.idx-cell')).map(function (cell) {
      var media = cell.querySelector('img,video'), box = cell.getBoundingClientRect();
      return {src:media.poster || media.currentSrc || media.src,
        x:(box.left-bounds.left)/scale, y:(box.top-bounds.top)/scale,
        width:box.width/scale, height:box.height/scale};
    });
    var rw = width * 5, rh = height * 11 / 3;
    var tiles = Array.from(ring.querySelectorAll('.rc')).map(function (cell) {
      var area = cell.style.gridArea.split('/').map(Number), image = cell.querySelector('img');
      return {src:image.currentSrc || image.src,
        x:(area[1]-1)*rw/15-.5, y:(area[0]-1)*rh/11-.5,
        width:(area[3]-area[1])*rw/15+1, height:(area[2]-area[0])*rh/11+1};
    });
    var core, surround;
    try {
      var sources = await Promise.all(cells.concat(tiles).map(function (box) { return load(box.src); }));
      if (current !== revision) return;
      core = layer(width, height, 1.5);
      surround = layer(rw, rh, 1);
      if (!await paint(core.context,cells,sources,0,current) ||
          !await paint(surround.context,tiles,sources,cells.length,current)) {
        core.canvas.width = core.canvas.height = 1;
        surround.canvas.width = surround.canvas.height = 1;
        return;
      }
      layers = {core:core.canvas, ring:surround.canvas, width:width, height:height,
        ringWidth:rw, ringHeight:rh, ringX:(width-rw)/2, ringY:(height-rh)/2};
      if (window.__nmMade) window.__nmMade();
    } catch (_) {
      // A failed asset or unavailable canvas keeps the original DOM zoom.
      if (core) core.canvas.width = core.canvas.height = 1;
      if (surround) surround.canvas.width = surround.canvas.height = 1;
    }
  }
  window.__nmIntroSurface = function (progress, hold) {
    if (!layers || !phone.matches || reduce.matches || progress >= 1) {
      show(false); lastDraw = ''; return false;
    }
    var key = progress + ':' + hold;
    if (key !== lastDraw) {
      lastDraw = key;
      var density = Math.min(window.devicePixelRatio || 1, 1.5);
      var w = Math.round(layers.width*density), h = Math.round(hold*density);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        canvas.style.height = hold + 'px';
      }
      context.setTransform(1,0,0,1,0,0);
      context.fillStyle = '#0a0a0a'; context.fillRect(0,0,w,h);
      var zoom = .12 + .88*progress;
      context.setTransform(density*zoom,0,0,density*zoom,
        density*layers.width/2*(1-zoom),density*hold/2*(1-zoom));
      context.drawImage(layers.core,0,0,layers.width,layers.height);
      context.globalAlpha = Math.max(0,Math.min(1,(.98-progress)/.16));
      if (context.globalAlpha > 0) context.drawImage(layers.ring,layers.ringX,layers.ringY,layers.ringWidth,layers.ringHeight);
      context.globalAlpha = 1;
    }
    show(true);
    return true;
  };
  phone.addEventListener('change', schedule);
  reduce.addEventListener('change', schedule);
  window.addEventListener('resize', schedule, {passive:true});
  window.addEventListener('pageshow', schedule);
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(grid);
  schedule();
});
