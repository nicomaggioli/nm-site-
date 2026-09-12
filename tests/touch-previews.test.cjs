const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/nm-sites-touch.js'), 'utf8');

test('tap previews load on demand, preserve direct links and close on desktop without duplicate controls', () => {
  const mode = new EventTarget(); mode.matches = true;
  const images = [], nodes = [];
  class Element extends EventTarget {
    constructor() { super(); this.children = []; this.attributes = {}; this.className = ''; }
    get classList() { return {contains: name => this.className.split(' ').includes(name)}; }
    appendChild(child) { child.parentElement = this; this.children.push(child); }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name]; }
    get firstChild() { return this.children[0]; }
    before(node) { nodes.push(node); }
  }
  const links = ['Pawsta', 'Alares'].map(name => {
    const link = new Element(); link.parentElement = new Element();
    link.href = 'https://' + name.toLowerCase() + '.co/';
    link.setAttribute('data-shot', '/' + name + '.webp');
    link.querySelector = () => ({textContent:name});
    return link;
  });
  class Image { constructor() { images.push(this); } }
  const context = {window:{},document:{querySelectorAll:()=>links,createElement:()=>new Element()},Image,matchMedia:()=>mode};
  vm.runInNewContext(source,context);
  assert.equal(images.length,0,'phone visitors should not download all previews upfront');
  const [first,second] = nodes;
  const a=first.children[1],b=second.children[1],panel=first.children[2];
  assert.equal(first.children[0],links[0]);
  assert.equal(links[0].href,'https://pawsta.co/','preview must not replace external navigation');
  a.dispatchEvent(new Event('click'));
  assert.equal(panel.hidden,false); assert.equal(a.getAttribute('aria-expanded'),'true');
  assert.equal(images[0].src,'/Pawsta.webp');
  b.dispatchEvent(new Event('click'));
  assert.equal(panel.hidden,false,'opening a lower preview must not collapse content above it');
  a.dispatchEvent(new Event('click')); assert.equal(panel.hidden,true);
  a.dispatchEvent(new Event('click')); assert.equal(images.length,2,'reuse images after closing');
  mode.matches=false; mode.dispatchEvent(new Event('change'));
  assert.equal(panel.hidden,true); assert.equal(second.children[2].hidden,true);
  assert.equal(a.getAttribute('aria-expanded'),'false');
  a.dispatchEvent(new Event('click')); assert.equal(panel.hidden,true,'hidden desktop controls cannot open a touch panel');
  vm.runInNewContext(source,context); assert.equal(nodes.length,2,'reinitialization must not wrap links again');
});
