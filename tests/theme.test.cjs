const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file.replace(/^\//, '')));
const version = file => crypto.createHash('sha256').update(read(file)).digest('hex').slice(0, 10);
const FIX = 'run python3 tools/build-theme-versions.py';

test('Night Sky scripts load at their current content versions, in order', () => {
  const loader = read('js/nm-theme.js').toString();
  const entries = [...loader.matchAll(/'(\/js\/[\w.-]+\.js)': '([0-9a-f]{10})'/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(entries.map(e => e[0]),
    ['/js/theme-stars.js', '/js/nm-starcut.js', '/js/nm-warp.js', '/js/nm-space.js', '/js/nm-sky.js'],
    'the theme config first, the space before the sky that reads its camera');
  for (const [file, v] of entries) assert.equal(v, version(file), `${file} is stale in js/nm-theme.js; ${FIX}`);
});

// Runs the loader against a stub page: which scripts it inserts while <head> parses, and which
// once window.__nmReady (js/nm-sync.js) flushes after React commits.
function load(pathname, { nmReady = true } = {}) {
  const inserted = [], queue = [];
  const document = {
    documentElement: { setAttribute() {} },
    createElement: () => ({}),
    head: { appendChild: js => inserted.push(js) },
  };
  const window = nmReady ? { __nmReady: fn => queue.push(fn) } : {};
  vm.runInNewContext(read('js/nm-theme.js').toString(), { window, document, location: { pathname } });
  const now = inserted.splice(0);
  queue.splice(0).forEach(fn => fn());
  const names = list => list.map(js => {
    assert.equal(js.async, false, `${js.src} must keep insertion order (async = false)`);
    return js.src.split('?')[0];
  });
  return { now: names(now), afterCommit: names(inserted), versions: [...now, ...inserted].map(js => js.src) };
}

test('homepage: the space and the sky are requested after React commits, the rest right away', () => {
  for (const pathname of ['/', '/index.html']) {
    const r = load(pathname);
    assert.deepEqual(r.now, ['/js/theme-stars.js', '/js/nm-starcut.js', '/js/nm-warp.js'],
      `${pathname}: the theme config (the hero reads NMThemeConfig), the starcut and the warp load from <head>`);
    assert.deepEqual(r.afterCommit, ['/js/nm-space.js', '/js/nm-sky.js'],
      `${pathname}: the space, then the sky that reads its camera, inside window.__nmReady`);
  }
  // nm-sync.js bails out before defining __nmReady while it redirects /#about: load everything now
  assert.deepEqual(load('/', { nmReady: false }).now,
    ['/js/theme-stars.js', '/js/nm-starcut.js', '/js/nm-warp.js', '/js/nm-space.js', '/js/nm-sky.js']);
  const html = read('index.html').toString();
  assert.ok(html.indexOf('/js/nm-sync.js') >= 0 && html.indexOf('/js/nm-sync.js') < html.indexOf('/js/nm-theme.js'),
    'index.html: nm-sync.js (window.__nmReady) must run before the loader');
});

test('About and Index load the layers from <head> and skip the homepage-only starcut', () => {
  for (const pathname of ['/about/', '/index/']) {
    const r = load(pathname);
    assert.deepEqual(r.now, ['/js/theme-stars.js', '/js/nm-warp.js', '/js/nm-space.js', '/js/nm-sky.js'], pathname);
    assert.deepEqual(r.afterCommit, [], `${pathname}: nothing waits for React`);
  }
});

test('every inserted script carries its VERSIONS content version', () => {
  const loader = read('js/nm-theme.js').toString();
  const VERSIONS = Object.fromEntries([...loader.matchAll(/'(\/js\/[\w.-]+\.js)': '([0-9a-f]{10})'/g)].map(m => [m[1], m[2]]));
  for (const pathname of ['/', '/about/', '/index/']) {
    for (const src of load(pathname).versions) {
      const [file, query] = src.split('?');
      assert.equal(query, `v=${VERSIONS[file]}`, `${pathname}: ${file}`);
    }
  }
});

test('every page marks Night Sky before first paint and links its stylesheet right after', () => {
  for (const page of ['index.html', 'about/index.html', 'index/index.html']) {
    const html = read(page).toString();
    const script = `<script src="/js/nm-theme.js?v=${version('js/nm-theme.js')}"></script>`;
    const sheet = `<link rel="stylesheet" href="/css/theme-stars.css?v=${version('css/theme-stars.css')}">`;
    assert.ok(html.includes(script + sheet), `${page}: loader or stylesheet version is stale or apart; ${FIX}`);
    assert.ok(html.indexOf(script) < html.indexOf('</head>'), `${page}: the loader must run in <head>`);
  }
});

test('no design-preview leftovers ship', () => {
  for (const file of ['js/nm-theme.js', 'js/theme-stars.js', 'index.html', 'about/index.html', 'index/index.html']) {
    const text = read(file).toString();
    assert.ok(!/nm-theme-pill|v=dev|nm-theme-preview/.test(text), `${file} still has preview-switcher code`);
  }
});
