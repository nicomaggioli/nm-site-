const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = name => fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');

function videoEnvironment() {
  const window = new EventTarget(), document = new EventTarget(), frames = new Map();
  const mobile = new EventTarget(), coarse = new EventTarget(), reduced = new EventTarget();
  mobile.matches = coarse.matches = reduced.matches = false;
  window.scrollY = 0; document.hidden = false;
  let sequence = 0, reads = 0, pauses = 0, plays = 0, height = 800, intersect, resized;
  const attrs = {};
  const video = Object.assign(new EventTarget(), {
    dataset: {src: '/desktop.mp4', mobileSrc: '/phone.mp4'}, paused: true, isConnected: true,
    getAttribute: key => attrs[key], load() {},
    pause() { pauses++; this.paused = true; },
    play() { plays++; this.paused = false; return Promise.resolve(); }
  });
  Object.defineProperty(video, 'src', {set: value => { attrs.src = value; }});
  document.querySelectorAll = () => [video];
  document.querySelector = () => ({get offsetHeight() { reads++; return height; }});
  function IntersectionObserver(callback) { intersect = callback; this.observe = () => {}; }
  function ResizeObserver(callback) { resized = callback; this.observe = () => {}; }
  window.IntersectionObserver = IntersectionObserver; window.ResizeObserver = ResizeObserver;
  vm.runInNewContext(script('nm-video.js'), {
    window, document, navigator: {}, innerHeight: 800, IntersectionObserver, ResizeObserver,
    matchMedia: q => q.includes('reduced-motion') ? reduced : q.includes('pointer') ? coarse : mobile,
    requestAnimationFrame: fn => { frames.set(++sequence, fn); return sequence; },
    cancelAnimationFrame: id => frames.delete(id)
  });
  const flush = () => { const jobs = [...frames.values()]; frames.clear(); jobs.forEach(fn => fn()); };
  return {video, window, frames, flush, mobile, coarse,
    get reads() { return reads; }, get pauses() { return pauses; }, get plays() { return plays; },
    visible(value) { intersect([{target: video, isIntersecting: value}]); flush(); },
    scroll(y) { window.scrollY = y; window.dispatchEvent(new Event('scroll')); flush(); },
    resize(value) { height = value; resized(); flush(); }
  };
}

test('media work follows playback boundaries and intersections without per-scroll layout reads', async () => {
  const env = videoEnvironment(); env.visible(true);
  assert.equal(env.reads, 1); assert.equal(env.pauses, 0);
  for (let y = 1; y < 200; y++) env.scroll(y);
  assert.equal(env.reads, 1); assert.equal(env.plays, 0); assert.equal(env.pauses, 0);
  env.scroll(200); await Promise.resolve();
  assert.equal(env.plays, 1); assert.equal(env.video.paused, false);
  for (let y = 201; y < 2000; y++) env.scroll(y);
  assert.equal(env.reads, 1); assert.equal(env.plays, 1);
  env.visible(false); assert.equal(env.video.paused, true); assert.equal(env.pauses, 1);
  for (let y = 2000; y > 200; y--) env.scroll(y);
  assert.equal(env.reads, 1); assert.equal(env.pauses, 1);
  env.visible(true); await Promise.resolve(); assert.equal(env.plays, 2);
  env.scroll(100); assert.equal(env.video.paused, true);
  env.resize(200); await Promise.resolve();
  assert.equal(env.reads, 2); assert.equal(env.video.paused, false, 'hero geometry updates the playback boundary');
  env.coarse.matches = true; env.coarse.dispatchEvent(new Event('change')); env.flush();
  assert.equal(env.video.paused, true, 'coarse input restores the full-intro boundary');
});

test('desktop previews warm near their section and do no pointer work while inactive', () => {
  const window = new EventTarget(), document = new EventTarget(), enabled = new EventTarget();
  enabled.matches = true;
  let intersection, disconnected = 0, scheduled = 0, idle = 0;
  const images = [], section = {};
  class Image { constructor() { images.push(this); } decode() { return Promise.resolve(); } }
  document.getElementById = id => id === 'nm-sites' ? section : {};
  document.querySelectorAll = () => Array.from({length: 8}, (_, i) => ({getAttribute: () => '/shot-' + i + '.webp'}));
  function IntersectionObserver(callback, options) {
    intersection = callback; assert.equal(options.rootMargin, '1000px');
    this.observe = target => assert.equal(target, section); this.disconnect = () => { disconnected++; };
  }
  window.IntersectionObserver = IntersectionObserver;
  window.requestIdleCallback = () => { idle++; };
  vm.runInNewContext(script('nm-sites.js'), {
    window, document, navigator: {}, Image, IntersectionObserver, matchMedia: () => enabled,
    requestAnimationFrame: () => { scheduled++; return scheduled; }
  });
  assert.equal(idle, 0); assert.equal(images.length, 0, 'opening the homepage leaves all eight previews deferred');
  window.dispatchEvent(new Event('scroll'));
  assert.equal(scheduled, 0, 'scrolling without a pointer cannot display a cursor preview');
  intersection([{isIntersecting: false}]); assert.equal(images.length, 0);
  intersection([{isIntersecting: true}]); assert.equal(images.length, 8); assert.equal(disconnected, 1);
  intersection([{isIntersecting: true}]); assert.equal(images.length, 8, 'preloading reuses decoded image elements');
  enabled.matches = false; enabled.dispatchEvent(new Event('change'));
  const event = new Event('pointermove'); Object.assign(event, {pointerType: 'mouse', clientX: 10, clientY: 10});
  document.dispatchEvent(event); window.dispatchEvent(new Event('scroll'));
  assert.equal(scheduled, 0, 'disabled desktop previews schedule no frame work');
});
