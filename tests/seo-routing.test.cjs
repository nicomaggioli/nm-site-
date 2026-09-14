const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const root = path.resolve(__dirname, '..');
const notFound = fs.readFileSync(path.join(root, '404.html'), 'utf8');
const redirectScript = notFound.match(/<script>([\s\S]*?)<\/script>/)[1];

function destination(pathname, hash = '') {
  let result = null;
  vm.runInNewContext(redirectScript, {
    location: {pathname, hash, replace: value => { result = value; }},
  });
  return result;
}

test('missing public pages stay on a useful noindex page with crawlable recovery links', () => {
  for (const pathname of ['/missing-page', '/about/missing/', '/index/missing', '/clients/admin.html']) {
    assert.equal(destination(pathname), null, `${pathname} must not redirect to the homepage`);
  }
  assert.match(notFound, /<meta name="robots" content="noindex">/);
  assert.match(notFound, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(notFound, /<h1>[^<]+/);
  const navigation = notFound.match(/<nav[\s\S]*?<\/nav>/)[0];
  assert.deepEqual([...navigation.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ['/', '/index/', '/about/']);
});

test('legacy private proposal URLs keep their existing slug forwarding and key fragment', () => {
  assert.equal(destination('/clients/example'), '/clients/?c=example');
  assert.equal(destination('/clients/example/', '#key=private-key'), '/clients/?c=example#key=private-key');
  assert.equal(destination('/clients/A&B', '#key'), '/clients/?c=A%26B#key');
  assert.equal(destination('/clients/a%20b'), '/clients/?c=a%2520b');
  assert.equal(destination('/clients/Admin.HTML'), null);
  assert.equal(destination('/clients/example/nested'), null);
});

test('one robots prefix excludes all private aliases while public pages and assets remain crawlable', () => {
  const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
  const rules = robots.split(/\r?\n/).map(line => line.replace(/#.*/, '').trim()).filter(Boolean);
  assert.equal(rules.filter(line => /^User-agent:/i.test(line)).length, 1);
  assert.ok(rules.includes('User-agent: *'));
  assert.deepEqual(rules.filter(line => /^(?:Disallow|Allow):/i.test(line)), ['Disallow: /clients']);
  const excluded = url => new URL(url, 'https://nicomaggioli.com').pathname.startsWith('/clients');
  for (const url of ['/clients', '/clients?c=example', '/clients/', '/clients/example', '/clients/admin.html', '/clients.html?c=example', '/clients.json']) {
    assert.equal(excluded(url), true, url);
  }
  for (const url of ['/', '/index/', '/about/', '/_next/static/chunks/app.js', '/media/nm-work/image.webp', '/css/nm-home.css']) {
    assert.equal(excluded(url), false, url);
  }
  assert.ok(rules.includes('Sitemap: https://nicomaggioli.com/sitemap.xml'));
});
