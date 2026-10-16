const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'nm-warp.js'), 'utf8');

// Runs js/nm-warp.js against a stub page up to the point where it waits for the DOM: which dip mode
// it picks, what it keeps in sessionStorage, and whether it goes on to start at all.
function boot({ search = '', page = 'home', stored = null, storage = true } = {}) {
  const writes = [], listeners = [];
  const store = stored == null ? {} : { 'nm-dip-mode': stored };
  const sessionStorage = {
    getItem(k) { if (!storage) throw new Error('blocked'); return k in store ? store[k] : null; },
    setItem(k, v) { if (!storage) throw new Error('blocked'); writes.push([k, v]); store[k] = String(v); },
  };
  const document = {
    readyState: 'loading',
    querySelector: sel => (sel === 'footer .foot-mark' && page === 'index' ? {} : null),
    body: { classList: { contains: c => c === 'nm-about-page' && page === 'about' } },
    documentElement: { style: { translate: '' } },
    addEventListener: (type, fn) => listeners.push(type),
  };
  const window = {};
  vm.runInNewContext(source, {
    window, document, sessionStorage, location: { search },
    navigator: { userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' },
    matchMedia: () => ({ matches: false }), addEventListener() {}, performance: { now: () => 0 },
  });
  return { writes, started: listeners.includes('DOMContentLoaded'), debug: window.__nmDipDebug, store };
}

test('with no ?dip= switch and nothing kept, the dip starts as before and writes nothing', () => {
  for (const page of ['home', 'about', 'index']) {
    const r = boot({ page });
    assert.equal(r.started, true, page);
    assert.deepEqual(r.writes, [], `${page}: nothing is written to sessionStorage`);
    assert.equal(r.debug, undefined, `${page}: no capture hook without a switch`);
  }
  // blocked storage (some private modes) changes nothing either
  assert.equal(boot({ storage: false }).started, true);
  assert.equal(boot({ storage: false }).debug, undefined);
});

test('?dip= picks the mode, and the tab keeps it in sessionStorage nm-dip-mode', () => {
  for (const mode of ['blocks', 'filter']) {
    const r = boot({ search: '?dip=' + mode });
    assert.deepEqual(r.writes, [['nm-dip-mode', mode]]);
    assert.equal(r.debug.mode, mode);
    assert.equal(r.started, true);
  }
  // kept: the next page of the tab, with no switch in its URL
  const kept = boot({ page: 'about', stored: 'blocks' });
  assert.equal(kept.debug.mode, 'blocks');
  assert.deepEqual(kept.writes, []);
  // a later switch replaces it
  assert.equal(boot({ stored: 'blocks', search: '?x=1&dip=filter' }).debug.mode, 'filter');
  // Index is the same in every mode (its tiles)
  assert.equal(boot({ page: 'index', search: '?dip=blocks' }).debug.mode, 'tiles');
  // the URL still wins when storage is blocked
  assert.equal(boot({ storage: false, search: '?dip=blocks' }).debug.mode, 'blocks');
  // anything else is ignored
  assert.equal(boot({ search: '?dip=blockss' }).debug, undefined);
  assert.equal(boot({ stored: 'nonsense' }).debug, undefined);
});

test('?dip=off is ?warp=off: no dip at all, and the tab keeps it', () => {
  const off = boot({ search: '?dip=off' });
  assert.equal(off.started, false);
  assert.deepEqual(off.writes, [['nm-dip-mode', 'off']]);
  assert.equal(boot({ stored: 'off' }).started, false);
  assert.equal(boot({ search: '?warp=off' }).started, false);
  assert.equal(boot({ search: '?dip=blocks' }).started, true);
});
