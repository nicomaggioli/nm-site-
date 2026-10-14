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

test('the star data is requested at its current content versions', () => {
  const loader = read('js/nm-theme.js').toString();
  const entries = [...loader.matchAll(/'(\/media\/sky\/[\w.-]+\.json)': '([0-9a-f]{10})'/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(entries.map(e => e[0]).sort(),
    ['/media/sky/about.json', '/media/sky/home.json', '/media/sky/index.json', '/media/sky/stars.json'],
    'the catalogue and every page\'s sky');
  for (const [file, v] of entries) assert.equal(v, version(file), `${file} is stale in js/nm-theme.js; ${FIX}`);
  assert.ok(!/no-cache/.test(read('js/nm-sky.js').toString()), 'versioned data needs no revalidation: no cache:\'no-cache\'');
});

test('the page sky files carry only what the engine reads', () => {
  for (const page of ['home', 'about', 'index']) {
    const data = JSON.parse(read(`media/sky/${page}.json`));
    assert.deepEqual(Object.keys(data), ['page', 'featured', 'source'], `media/sky/${page}.json`);
    assert.equal(data.page, page);
    assert.equal(data.featured.length, 4, `${page}: four featured stars`);
    for (const f of data.featured) for (const k of ['id', 'name', 'ra', 'dec', 'vmag', 'coords', 'fact']) assert.ok(f[k] != null, `${page}: ${f.id} has ${k}`);
  }
});

test('the Index footer door loads the Space Run script at its content version', () => {
  const sky = read('js/nm-sky.js').toString();
  const refs = [...sky.matchAll(/\/js\/nm-run\.js(\?v=([0-9a-f]{10}))?/g)];
  assert.equal(refs.length, 1, 'js/nm-sky.js names the door script once');
  assert.equal(refs[0][2], version('js/nm-run.js'), `js/nm-sky.js loads a stale /js/nm-run.js; ${FIX}`);
  // the same version as the pages that load it themselves
  for (const page of ['index.html', 'about/index.html']) {
    const m = read(page).toString().match(/\/js\/nm-run\.js\?v=([0-9a-f]{10})/);
    assert.ok(m, `${page} loads /js/nm-run.js`);
    assert.equal(m[1], refs[0][2], `${page} and js/nm-sky.js load different versions of /js/nm-run.js`);
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
  for (const file of ['js/nm-theme.js', 'js/theme-stars.js', 'js/nm-space.js', 'js/nm-sky.js', 'js/nm-starcut.js', 'js/nm-warp.js',
    'css/theme-stars.css', 'index.html', 'about/index.html', 'index/index.html']) {
    const text = read(file).toString();
    assert.ok(!/nm-theme-pill|v=dev|nm-theme-preview/.test(text), `${file} still has preview-switcher code`);
  }
});
