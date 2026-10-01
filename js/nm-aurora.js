/* Night Sky: faint aurora and colour in the far sky (loaded by js/nm-theme.js).

   Nico: "boreal kind of lights in the background, but super subtle, like some magentas and
   greens and cyans". Three aurora curtains hang from soft, wandering lower edges (green at
   the edge, cyan above, magenta in the high fringes), striated by slow vertical rays and
   coming and going along their length, plus a few very faint magenta and cyan glows: the
   colour bursts of the far sky. All of it barely above the ground colour.

   One fixed WebGL canvas, drawn at a third of the screen resolution (it is soft by nature),
   screen-blended over the opaque particle space (z -22) at the stars' depth (z -21), so it
   only ever adds a little light. It rides with
   the shared camera (NMSpace.camera: roll, yaw, pitch) like the real sky, drifts slowly as
   the page scrolls, and moves on its own at about 20fps. Paused in hidden tabs and while
   Space Run is open; a single still frame under prefers-reduced-motion. The homepage hero
   samples it through NMThemeConfig.heroBackdrop.

   window.NMAurora
     .canvas      the canvas (preserveDrawingBuffer, so the hero can sample it)
     .set(opts)   { gain } live multiplier (1 = default); ?aurora=2 previews it twice as bright
*/
(function () {
  'use strict';
  if (window.NMAurora) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  var q = /[?&]aurora=([0-9.]+)/.exec(location.search);
  var GAIN = 0.1, RES = 3, FPS = 20;
  var opts = { gain: q ? +q[1] : 1 };
  var page = /^\/about\//.test(location.pathname) ? 1 : /^\/index\//.test(location.pathname) ? 2 : 0;

  var canvas = document.createElement('canvas');
  canvas.id = 'nm-aurora';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100vh;height:100lvh;z-index:-21;' +
    'pointer-events:none;display:block;mix-blend-mode:screen;opacity:0;transition:opacity 1.6s ease';
  var gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
  if (!gl) return;

  var VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  var FS = [
    'precision highp float;',
    'uniform vec2 uRes;uniform float uT,uRoll,uGain,uSeed;uniform vec2 uPan;varying vec2 v;',
    'float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);',
    '  return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}',
    'float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*n(p);p=p*2.03+vec2(17.1,9.2);a*=.5;}return s;}',
    // one curtain: a sinuous lower edge, sharp below and fading upward, brighter where it
    // folds, striated by drifting rays, switched on for long stretches with gaps
    'vec3 curtain(vec2 p,float s,vec3 lo,vec3 mid,vec3 hi){',
    '  float x=p.x,t=uT;',
    '  float a1=x*1.3+t*.05+s*2.1,a2=x*.55-t*.03+s*4.7;',
    '  float edge=.12*sin(a1)+.2*sin(a2)+.18*(fbm(vec2(x*.6+s,t*.02))-.5);',
    '  float fold=1.+2.4*abs(.156*cos(a1)+.11*cos(a2));',
    '  float d=p.y-edge;',
    '  if(d<-.06)return vec3(0.);',
    '  float ht=.15+.15*fbm(vec2(x*.9+s*3.,t*.01));',
    '  float up=d>0.?exp(-d/ht):exp(-d*d/.0016);',
    '  float rr=fbm(vec2(x*16.+t*.06+s,d*1.4-t*.02));',
    '  float r=.2+1.25*rr*rr;',
    '  float on=smoothstep(.3,.58,fbm(vec2(x*.26+s*5.+t*.005,s)));',
    '  float c=clamp(d/ht,0.,2.);',
    '  vec3 col=mix(lo,mid,smoothstep(.2,1.,c));',
    '  col=mix(col,hi*1.3,smoothstep(.65,1.5,c));',
    '  return col*up*r*on*fold;',
    '}',
    'void main(){',
    '  vec2 px=v*uRes;',
    '  vec2 q=(px-.5*uRes)/uRes.y;',
    '  float cr=cos(uRoll),sr=sin(uRoll);',
    '  q=vec2(cr*q.x-sr*q.y,sr*q.x+cr*q.y);',
    '  vec2 p=q+uPan;',
    '  vec3 G=vec3(.16,1.,.46),C=vec3(.1,.8,.92),M=vec3(.95,.22,.78);',
    // curtains repeat in bands across the sky, each its own; about a third of the bands are
    // empty. The band below reaches up into this one, so there are no seams.
    '  float B=1.25,k=floor(p.y/B+.5);',
    '  vec3 col=vec3(0.);',
    '  for(int j=0;j<2;j++){',
    '    float kk=k-float(j),sk=uSeed+kk*17.31;',
    '    vec2 cp=vec2(p.x+kk*2.7,p.y-kk*B);',
    '    float has=step(.34,h(vec2(kk,uSeed)));',
    '    float g=h(vec2(kk,uSeed+1.));',
    '    col+=has*(curtain(cp,sk,g>.35?G:C,g>.7?C:G,M)+.5*curtain(cp*vec2(1.35,1.)-vec2(0.,.2),sk+3.,M,M,C));',
    '  }',
    // the colour bursts: large, faint glows drifting in the far sky
    '  float b1=fbm(p*.75+vec2(uSeed,0.)+uT*.0025),b2=fbm(p*.6+vec2(0.,uSeed*2.)-uT*.002);',
    '  col+=M*.32*smoothstep(.5,.82,b1)+C*.24*smoothstep(.54,.86,b2)+G*.16*smoothstep(.6,.9,b1*b2*1.9);',
    '  col*=uGain;',
    '  col=max(col+(h(px+fract(uT))-.5)/255.,0.);',
    '  gl_FragColor=vec4(col,max(col.r,max(col.g,col.b)));',
    '}'
  ].join('\n');

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog = gl.createProgram();
  try {
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { return; }
  gl.useProgram(prog);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var U = {};
  ['uRes', 'uT', 'uRoll', 'uGain', 'uSeed', 'uPan'].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });
  gl.uniform1f(U.uSeed, 3.7 + page * 11.3);

  var W = 0, H = 0, raf = 0, last = 0, t0 = performance.now(), seen = false;
  function size() {
    var w = Math.max(1, Math.ceil(innerWidth / RES)), h = Math.max(1, Math.ceil(innerHeight / RES));
    if (w === W && h === H) return;
    W = canvas.width = w; H = canvas.height = h;
    gl.viewport(0, 0, W, H);
    gl.uniform2f(U.uRes, W, H);
  }

  function draw(now) {
    size();
    var sp = window.NMSpace, cam = sp && sp.camera, vh = innerHeight || 1;
    if (sp && sp.step) { try { sp.step(now); } catch (e) { /* the space keeps its own clock */ } }
    // the far sky: turns with the camera like the stars, and slides slowly as the page scrolls
    var roll = 0, px = 0, py = 0;
    if (cam && isFinite(cam.roll)) {
      roll = -cam.roll * Math.PI / 180;
      var f = (cam.F || vh) / vh;
      px = (cam.yaw || 0) * f;
      py = (cam.pitch || 0) * f;
    }
    py -= (window.scrollY || 0) / vh * 0.12;
    gl.uniform1f(U.uRoll, roll);
    gl.uniform2f(U.uPan, px, py);
    gl.uniform1f(U.uT, (now - t0) / 1000);
    gl.uniform1f(U.uGain, GAIN * opts.gain);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!seen) { seen = true; canvas.style.opacity = '1'; }
  }

  function paused() {
    return document.hidden || document.documentElement.classList.contains('nm-run-open');
  }
  function loop(now) {
    raf = 0;
    if (paused()) return;
    if (now - last >= 1000 / FPS - 2) { last = now; draw(now); }
    if (!(reduce && reduce.matches)) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && !paused()) raf = requestAnimationFrame(loop); }

  function start() {
    var sky = document.getElementById('nm-sky');
    if (sky && sky.parentNode) sky.parentNode.insertBefore(canvas, sky);   // under the stars
    else document.body.appendChild(canvas);
    kick();
    document.addEventListener('visibilitychange', kick);
    addEventListener('resize', kick, { passive: true });
    // a still frame still follows the page under reduced motion
    addEventListener('scroll', function () { if (reduce && reduce.matches) kick(); }, { passive: true });
    if (window.MutationObserver) new MutationObserver(kick).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  window.NMAurora = {
    canvas: canvas,
    set: function (o) { for (var k in o) if (k in opts && isFinite(o[k])) opts[k] = +o[k]; kick(); },
    // one frame at a given moment, for previews: seconds, pan [x, y] (screen heights), roll (deg)
    frame: function (t, pan, roll) {
      size();
      gl.uniform1f(U.uRoll, -(roll || 0) * Math.PI / 180);
      gl.uniform2f(U.uPan, pan ? pan[0] : 0, pan ? pan[1] : 0);
      gl.uniform1f(U.uT, t || 0);
      gl.uniform1f(U.uGain, GAIN * opts.gain);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
