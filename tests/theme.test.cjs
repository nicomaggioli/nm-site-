const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file.replace(/^\//, '')));
const version = file => crypto.createHash('sha256').update(read(file)).digest('hex').slice(0, 10);
const FIX = 'run python3 tools/build-theme-versions.py';

test('Night Sky scripts load at their current content versions, in order', () => {
  const loader = read('js/nm-theme.js').toString();
  const entries = [...loader.matchAll(/'(\/js\/[\w.-]+\.js)': '([0-9a-f]{10})'/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(entries.map(e => e[0]),
    ['/js/theme-stars.js', '/js/nm-starcut.js', '/js/nm-warp.js', '/js/nm-space.js', '/js/nm-sky.js', '/js/nm-aurora.js'],
    'the theme config first, the space before the sky that reads its camera');
  for (const [file, v] of entries) assert.equal(v, version(file), `${file} is stale in js/nm-theme.js; ${FIX}`);
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
