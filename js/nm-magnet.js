/* Magnetic words animate only while the pointer moves or a spring settles. */
(window.__nmReady || function (fn) { fn(); })(function () {
  'use strict';
  var enabled = matchMedia('(min-width:768px) and (hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)');
  var items = [], mx = -9999, my = -9999, raf = 0, dirty = true;
  function collect() {
    items = Array.from(document.querySelectorAll('.text-footer-side,#about .text-heading-xl > p > span,#about .text-body-sm'))
      .filter(function (el) { return el.textContent.trim() && el.getClientRects().length; })
      .map(function (el) {
        el.classList.add('nm-mag');
        if (getComputedStyle(el).display === 'inline') el.classList.add('nm-mag-on');
        return { el: el, values: [0,0,0,0,0], x:0, y:0 };
      });
    dirty = true;
  }
  function measure() {
    var old = items.map(function (item) { var value=item.el.style.transform; item.el.style.transform='none'; return value; });
    items.forEach(function (item) {
      var rect=item.el.getBoundingClientRect();
      item.x=rect.left+rect.width/2+scrollX; item.y=rect.top+rect.height/2+scrollY;
    });
    items.forEach(function (item,i) { item.el.style.transform=old[i]; });
    dirty=false;
  }
  function frame() {
    raf=0;
    if (!enabled.matches || document.hidden) return;
    if (dirty) measure();
    var settling=false;
    items.forEach(function (item) {
      var dx=mx-(item.x-scrollX), dy=my-(item.y-scrollY), distance=Math.hypot(dx,dy);
      var strength=Math.max(0,1-distance/130);
      strength=strength*strength*(3-2*strength);
      var target=[dx*.34*strength,dy*.34*strength,26*strength,-dy/130*15*strength,dx/130*15*strength];
      item.values=item.values.map(function (value,i) {
        var diff=target[i]-value;
        if (Math.abs(diff)>.02) { settling=true; return value+diff*.16; }
        return target[i];
      });
      var v=item.values;
      item.el.style.transform=v.every(function (n) { return Math.abs(n)<.01; }) ? '' :
        'perspective(520px) translate3d('+v[0].toFixed(2)+'px,'+v[1].toFixed(2)+'px,'+v[2].toFixed(2)+'px) rotateX('+v[3].toFixed(2)+'deg) rotateY('+v[4].toFixed(2)+'deg)';
    });
    if (settling) schedule();
  }
  function schedule() { if (enabled.matches && !document.hidden && !raf) raf=requestAnimationFrame(frame); }
  function reset() {
    cancelAnimationFrame(raf); raf=0; mx=my=-9999;
    items.forEach(function (item) { item.el.style.transform=''; item.values=[0,0,0,0,0]; });
  }
  window.addEventListener('pointermove',function (e) { if(e.pointerType==='touch')return; mx=e.clientX;my=e.clientY;schedule(); },{passive:true});
  document.documentElement.addEventListener('pointerleave',function () {mx=my=-9999;schedule();},{passive:true});
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',function () {reset();if(enabled.matches)collect();},{passive:true});
  document.addEventListener('visibilitychange',function () {reset();dirty=true;});
  enabled.addEventListener('change',function () {reset();if(enabled.matches)collect();});
  if (document.fonts) document.fonts.ready.then(function () {dirty=true;schedule();});
  if (enabled.matches) collect();
});
