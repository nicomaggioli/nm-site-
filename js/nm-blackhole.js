/* Footer black hole for the design previews (docs/cosmic-directions.md).

   While a preview theme is active (window.__nmTheme, set by nm-theme.js), this
   replaces the NM point cloud above "Where visions come true / Work with me" on
   /, /about/ and /index/. With no theme this file is never loaded, and the
   cloud scripts run exactly as before.

   The picture is ray traced per pixel: each ray is marched through a
   Schwarzschild field (acceleration -1.5 h^2 pos / r^5, horizon at r = 1),
   crossing a thin accretion disk seen a few degrees above edge-on. Its far side
   is lensed over the top and under the bottom of the pure-black shadow,
   higher-order images make the thin photon ring, the approaching side is
   Doppler-beamed, and slow Keplerian-sheared turbulence swirls the disk. It is
   coloured with the hoodie ramp and finished like airbrush: soft overspray
   falloff and fine spray grain. Faint lensed stars sit around it; outside its
   glow the canvas is transparent, so the theme's own sky shows through.

   It keeps the cloud's job: the existing Cloud Run door button (js/nm-run.js)
   is resized to cover it and gets an elliptical focus ring. The archive page
   had no door; one is added there that loads the same game.

   Budget: reduced internal resolution (upscaled), DPR capped at 1.5, fewer
   march steps on phones, 30fps cap; it renders only while on screen in a
   visible tab with Cloud Run closed, and draws one still frame under
   prefers-reduced-motion. Without WebGL (or on software rendering) a static
   CSS rendition stands in and the contact actions are untouched.

   Config: window.NMThemeConfig.blackHole = { ... } (false disables it)
     palette    [hex, ...]   disk ramp from the cool outer edge to the hot inner
                             edge (2-8 stops). Default: deep coral #CA5855 ->
                             coral #E3837A -> peach #E9B4A3 -> cream #EDE1CC ->
                             warm white #F4F8F0 -> ice #BCD3E0
     scale      number       size; 1 is a little larger than the cloud. Default 1
     tilt       degrees      camera height above the disk plane. Default 5
     roll       degrees      tilts the whole picture clockwise. Default 0
     spin       number       swirl speed; negative reverses the orbit and so the
                             Doppler-bright side (left by default). Default 1
     intensity  number       brightness. Default 1
     offsetY    number|'N%'  moves it down from the cloud's centre, in CSS px or
                             in % of the footer height. Default 0
     background 'transparent' | hex   fill behind it. Default 'transparent'
     annotate   bool         diagram-plate labels with leader lines. Default false
     stars      number       lensed background stars, 0 hides them. Default 1
     grain      number       airbrush spray grain, 0 is smooth. Default 1
     violet     bool         one small violet fleck riding the disk. Default true
     arrive     degrees      extra tilt while the footer scrolls in, settling to
                             `tilt` at the bottom; 0 turns it off. Default 8
     fps        number       render cap. Default 30
     quality    number       internal pixels per CSS px, times DPR capped at 1.5.
                             Default 0.6 (0.62 on phones); lowered automatically
                             if the GPU cannot hold the frame rate
     fallback   bool         force the static CSS rendition. Default false

   API (window.NMBlackHole):
     mount(host, opts)   mounts into any positioned element and returns the
                         instance ({ set(opts), destroy(), canvas, el }). The
                         footer mounts itself on __nmReady when a theme is on.
     unmount([target])   removes the instance for a host/instance, or all.
     set(opts)           live-updates every mounted instance (e.g. tilt, spin).
     defaults            the defaults above. */
(function () {
  'use strict';
  if (window.NMBlackHole) return;

  var DEFAULTS = {
    palette: ['#CA5855', '#E3837A', '#E9B4A3', '#EDE1CC', '#F4F8F0', '#BCD3E0'],
    scale: 1, tilt: 5, roll: 0, spin: 1, intensity: 1, offsetY: 0,
    background: 'transparent', annotate: false, stars: 1, grain: 1, violet: true,
    arrive: 8, fps: 30, quality: 0, fallback: false
  };
  // World units: horizon radius 1. The disk spans RIN..ROUT; BOX is the canvas
  // half-size around the hole, DOOR the half-size of the clickable ellipse.
  var ROUT = 9.6, BOX_X = 13.2, BOX_Y = 7.6, DOOR_X = 9.4, DOOR_Y = 5.2;
  var STILL_TIME = 41, VIOLET = '#6E6BD6';
  var instances = [], autoInst = null, cssDone = false;

  var VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  var FRAG = [
    '#extension GL_OES_standard_derivatives : enable',
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    '#define STEPS __STEPS__',
    'uniform vec2 uRes,uCenter;',
    'uniform float uPx,uTime,uTilt,uRoll,uSpin,uInt,uStars,uGrain,uViolet,uN,uBgA;',
    'uniform vec3 uPal[8];',
    'uniform vec3 uBg,uVio;',
    'const float RIN=3.,ROUT=9.6,R0=12.5,CAMD=36.,TAU=6.2831853;',
    // sin-free hash (Dave Hoskins) so the grain and lattice are stable on every GPU
    'float h12(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}',
    // value noise that wraps every `per` cells along y (the azimuth)
    'float pn(vec2 x,float per){vec2 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);',
    ' float j0=mod(i.y,per),j1=mod(i.y+1.,per);',
    ' return mix(mix(h12(vec2(i.x,j0)),h12(vec2(i.x+1.,j0)),f.x),mix(h12(vec2(i.x,j1)),h12(vec2(i.x+1.,j1)),f.x),f.y);}',
    'float fbm(vec2 x,float per){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*pn(x,per);x=x*2.+vec2(17.13,0.);per*=2.;a*=.5;}return s*1.0667;}',
    // Keplerian shear: angular speed ~ r^-1.5. Two phases cross-fade (flow-map
    // style) so the pattern never winds into ever-finer spirals.
    'float swirl(float r,float phi){',
    ' float w=uSpin*.95*pow(r,-1.5),P=22.,c=uTime/P;',
    ' float t1=fract(c),t2=fract(c+.5),k1=floor(c),k2=floor(c+.5),A=14.;',
    ' float lr=r*1.85;',
    ' float n1=fbm(vec2(lr+k1*7.31,(phi-w*t1*P)/TAU*A),A);',
    ' float n2=fbm(vec2(lr+k2*7.31+3.7,(phi-w*t2*P)/TAU*A+5.),A);',
    ' float wa=1.-abs(2.*t1-1.),wb=1.-wa;',
    ' return clamp((wa*(n1-.5)+wb*(n2-.5))*inversesqrt(wa*wa+wb*wb)+.5,0.,1.);}',
    'vec3 ramp(float h){float f=clamp(h,0.,1.)*(uN-1.);vec3 c=uPal[0];',
    ' for(int i=1;i<8;i++){if(float(i)>uN-.5)break;c=mix(c,uPal[i],clamp(f-float(i-1),0.,1.));}return c;}',
    'vec4 disk(vec3 p,vec3 v){',
    ' float r=length(p.xz);',
    ' float x=(r-RIN)/(ROUT-RIN);',
    ' float edge=smoothstep(RIN*.97,RIN*1.1,r)*(1.-smoothstep(.3,1.,x));',
    ' if(edge<.001)return vec4(0.);',
    ' float phi=atan(p.z,p.x);',
    ' float n=swirl(r,phi);',
    ' float temp=pow(clamp(1.-x,0.,1.),3.2);',
    // relativistic beaming: orbital speed sqrt(M/r) with M=0.5, softened
    ' vec3 vd=vec3(-p.z,0.,p.x)/r*sign(uSpin);',
    ' float b=min(.6,sqrt(.5/r));',
    ' float g=sqrt(1.-b*b)/(1.-b*dot(vd,-normalize(v)));',
    ' float beam=mix(1.,g*g*g,.72)*sqrt(max(0.,1.-1./r));',
    ' float heat=clamp(temp*(.74+.34*g)+(n-.5)*.3,0.,1.);',
    ' vec3 col=ramp(heat)*(.62+1.1*temp)*beam*edge*(.28+1.6*n*n);',
    ' float a=clamp(edge*(.22+.9*n*n),0.,.85);',
    // the one violet fleck: a small clump orbiting at r=6.3
    ' float va=1.7+uTime*uSpin*.95*pow(6.3,-1.5);',
    ' float vd2=dot(p.xz-6.3*vec2(cos(va),sin(va)),p.xz-6.3*vec2(cos(va),sin(va)));',
    ' float vf=uViolet*exp(-vd2*5.)*smoothstep(.35,.7,n);',
    ' col=mix(col,uVio*1.4,vf*.85);a=max(a,vf*.6);',
    ' return vec4(col,a);}',
    'vec3 stars(vec3 d){',
    ' vec2 uv=vec2(atan(d.x,d.z),asin(clamp(d.y,-1.,1.)))*70.;',
    ' vec2 c=floor(uv),f=fract(uv)-.5;',
    ' float h=h12(c+11.);',
    ' if(h>.06)return vec3(0.);',
    ' vec2 o=vec2(h12(c+3.1),h12(c+7.7))-.5;',
    ' float d2=dot(f-o*.6,f-o*.6);',
    ' float br=.08+.9*pow(h12(c+5.3),7.);',
    ' float tw=.7+.3*sin(uTime*(.5+h*18.)+h*90.);',
    ' vec3 tint=mix(vec3(.62,.76,.9),vec3(1.,.9,.78),h12(c+9.9));',
    ' return tint*br*tw*exp(-d2*90.);}',
    'vec3 tonemap(vec3 c){float m=max(c.r,max(c.g,c.b));if(m<1e-5)return c;',
    ' vec3 t=c*(1.-exp(-m*1.2))/m;float o=clamp((m-1.1)*.22,0.,.55);',
    ' return mix(t,vec3(max(t.r,max(t.g,t.b))),o);}',
    'void main(){',
    ' vec2 fc=gl_FragCoord.xy;',
    ' vec2 p=(fc-uCenter)/uPx;',
    ' float cr=cos(uRoll),sr=sin(uRoll);p=vec2(cr*p.x-sr*p.y,sr*p.x+cr*p.y);',
    ' float st=sin(uTilt),ct=cos(uTilt);',
    ' vec3 cam=CAMD*vec3(0.,st,-ct),fw=vec3(0.,-st,ct),up=vec3(0.,ct,st);',
    ' vec3 dir=normalize(fw*CAMD+vec3(p.x,0.,0.)+up*p.y);',
    ' vec3 col=vec3(0.);float T=1.,corI=0.,corH=0.,ring=0.;',
    ' vec3 od=dir;float cap=0.,esc=0.;',
    ' float tc=-dot(cam,dir);vec3 cl=cam+dir*tc;float b=length(cl);',
    ' if(b>=R0){esc=1.;od=normalize(dir-cl/b*(2./b));}',
    ' else{',
    '  vec3 pos=cam+dir*(tc-sqrt(R0*R0-b*b)),vel=dir;float h2=b*b;',
    '  for(int i=0;i<STEPS;i++){',
    '   float r2=dot(pos,pos),r=sqrt(r2),vl=length(vel);',
    '   float dt=max(.02,.085*r)/vl;',
    '   vel-=1.5*h2*pos/(r2*r2*r)*dt;',
    '   vec3 np=pos+vel*dt;',
    '   if(pos.y*np.y<0.){vec4 d=disk(mix(pos,np,pos.y/(pos.y-np.y)),vel);col+=T*d.rgb;T*=1.-d.a;}',
    // photon ring: rays that skim the photon sphere (r=1.5) for a long path
    '   float dr=(r-1.5)*6.;ring+=exp(-dr*dr)*vl*dt*T;',
    // thick, faint corona around the thin disk: the lensed overspray haze
    '   float rc=length(np.xz),z=np.y/(.22+.08*rc);',
    '   float cd=exp(-z*z)*smoothstep(RIN,RIN*1.6,rc)*(1.-smoothstep(ROUT*.3,ROUT,rc))*vl*dt*T;',
    '   corI+=cd;corH+=cd*pow(clamp(1.-(rc-RIN)/(ROUT-RIN),0.,1.),1.7);',
    '   pos=np;float n2=dot(pos,pos);',
    '   if(n2<2.1&&dot(pos,vel)<0.){cap=1.;break;}',
    '   if(n2>R0*R0&&dot(pos,vel)>0.){esc=1.;od=normalize(vel);break;}',
    '   if(T<.01)break;',
    '  }',
    '  if(cap+esc<.5){if(dot(pos,pos)<16.)cap=1.;else{esc=1.;od=normalize(vel);}}',
    ' }',
    ' col+=ramp(corI>0.?corH/corI:0.)*corI*.05*(1.-cap);',
    ' col+=ramp(.86)*(smoothstep(1.1,2.8,ring)*.9+smoothstep(.6,2.2,ring)*.12);',
    ' col*=uInt;',
    // soft overspray bloom around the whole figure (screen space)
    ' vec2 q=p/vec2(10.4,4.2);float bl=exp(-dot(q,q)*2.4);',
    ' col+=uPal[1]*bl*.035*uInt*(1.-cap);',
    ' float dark=0.;',
    ' if(esc>.5){',
    '  float sm=1.;',
    // lensing smears stars near the Einstein ring into long arcs; keep them as faint hints
    '#ifdef GL_OES_standard_derivatives',
    '  float pa=1./(uPx*CAMD),dx=length(dFdx(od)),dy=length(dFdy(od));',
    '  sm=clamp(min(dx,dy)/max(pa,1e-6),0.,1.);sm*=sm;',
    '#endif',
    '  col+=T*stars(od)*uStars*sm*smoothstep(1.,.45,length(p/vec2(BOX_X,BOX_Y)));',
    '  float defl=acos(clamp(dot(dir,od),-1.,1.));',
    '  dark=.5*smoothstep(.6,1.5,defl);',
    ' }',
    ' col=tonemap(col);',
    ' float a=cap>.5?1.:1.-T;',
    // airbrush: fine spray grain everywhere, and in the faint falloff the paint
    // breaks up into droplets instead of a smooth gradient
    ' float g0=h12(fc),g1=h12(fc*1.37+19.1);',
    ' col*=1.+uGrain*.26*(g0-.5);',
    ' float m=max(col.r,max(col.g,col.b));',
    // thin paint becomes droplets of full-strength colour (same average), so
    // faint coral reads as sprayed coral instead of a muddy dark brown
    ' float cov=clamp(m/.7,0.,1.);',
    ' vec3 hue=col/max(m,1e-4)*.7;',
    ' col=mix(col,hue*step(g1,cov),min(uGrain,1.)*.42*smoothstep(.02,.12,cov)*(1.-smoothstep(.5,.95,cov)));',
    ' col=pow(max(col,0.),vec3(.4545));',
    ' m=max(col.r,max(col.g,col.b));',
    ' a=max(max(a,m),dark*(1.-m));',
    // fade to nothing at the canvas edge so the box never shows
    ' float ef=1.-smoothstep(.74,.99,length(fc/uRes*2.-1.));',
    ' col*=ef;a*=ef;',
    ' if(uBgA>.5){col+=uBg*(1.-a);a=1.;}',
    ' gl_FragColor=vec4(col,a);',
    '}'
  ].join('\n').replace(/BOX_X/g, BOX_X.toFixed(1)).replace(/BOX_Y/g, BOX_Y.toFixed(1));

  function merge(base, extra) {
    var out = {}, k;
    for (k in base) out[k] = base[k];
    if (extra && typeof extra === 'object') for (k in extra) if (extra[k] !== undefined) out[k] = extra[k];
    return out;
  }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function hexRgb(h) {
    var s = String(h || '').replace('#', '').trim();
    if (s.length === 3) s = s.replace(/./g, '$&$&');
    if (!/^[0-9a-f]{6}$/i.test(s)) return null;
    var n = parseInt(s, 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function lin(rgb) { return rgb.map(function (c) { return Math.pow(c, 2.2); }); }
  function phone() { return Math.min(innerWidth, innerHeight) < 700 || matchMedia('(pointer:coarse)').matches && innerWidth < 900; }
  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function gameOpen() { return document.documentElement.classList.contains('nm-run-open'); }

  function injectCss() {
    if (cssDone) return;
    cssDone = true;
    var s = document.createElement('style');
    s.id = 'nm-blackhole-css';
    s.textContent = [
      '.nm-bh{position:absolute;left:50%;pointer-events:none;transform:translate(-50%,-50%);contain:layout paint size}',
      '.nm-bh>canvas.nm-bh-gl{position:absolute;inset:0;width:100%;height:100%;max-width:none;display:block;opacity:0;transition:opacity .9s ease}',
      '.nm-bh.is-ready>canvas.nm-bh-gl{opacity:1}',
      '.nm-bh-plate{position:absolute;inset:0;width:100%;height:100%;overflow:visible;font:500 10px/1 "Geist Mono",ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase}',
      '.nm-bh-plate text{fill:rgba(237,225,204,.82)}',
      '.nm-bh-plate .n{fill:rgba(233,180,163,.9)}',
      '.nm-bh-plate path{fill:none;stroke:rgba(237,225,204,.5);stroke-width:.75}',
      '.nm-bh-plate circle{fill:none;stroke:rgba(244,248,240,.85);stroke-width:1}',
      // the door: an ellipse over the black hole with the same dashed focus ring idea
      'html[data-nm-bh] main>section.h-lvh .nm-run-door,html[data-nm-bh] .nm-footer .nm-run-door,.nm-bh-door{position:absolute;left:50%;top:var(--nm-bh-cy,42%);width:var(--nm-bh-door-w,32%);height:var(--nm-bh-door-h,32%);transform:translate(-50%,-50%);border:0;border-radius:50%;padding:0;background:none;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
      'html[data-nm-bh] .nm-run-door img{visibility:hidden}',
      'html[data-nm-bh] .nm-run-door:focus-visible{outline:2px dashed #EDE1CC;outline-offset:6px}',
      '.nm-bh-door{z-index:2}',
      '.nm-bh-door[aria-busy="true"]{cursor:progress}',
      // archive footer: the mark box becomes the black hole's box (phones too)
      'html[data-nm-bh] .foot-mark{display:block;position:relative;min-height:0;padding:0;height:var(--nm-bh-mark-h,380px)}',
      // static rendition when WebGL is unavailable
      '.nm-bh-css{position:absolute;inset:0}',
      '.nm-bh-css i{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;display:block}',
      '.nm-bh-css .g{width:82%;height:62%;background:radial-gradient(closest-side,rgba(227,131,122,.2),rgba(202,88,85,.08) 55%,transparent)}',
      '.nm-bh-css .h{width:var(--h);height:var(--h);background:radial-gradient(circle closest-side,transparent 47%,#F4F8F0 49.5%,#EDE1CC 53%,#E9B4A3 60%,rgba(227,131,122,.55) 72%,rgba(202,88,85,.18) 86%,transparent)}',
      '.nm-bh-css .s{width:var(--s);height:var(--s);background:#000;box-shadow:0 0 0 1.5px rgba(244,248,240,.9),0 0 14px 2px rgba(233,180,163,.55)}',
      '.nm-bh-css .d{width:var(--d);height:calc(var(--d)*.07);background:radial-gradient(closest-side,#F4F8F0,#EDE1CC 24%,#E9B4A3 42%,#E3837A 62%,rgba(202,88,85,.5) 80%,transparent);-webkit-mask:linear-gradient(90deg,#000,rgba(0,0,0,.55));mask:linear-gradient(90deg,#000,rgba(0,0,0,.55));filter:blur(.6px);top:52%}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function Instance(host, opts, page) {
    this.host = host;
    this.page = page || null;
    this.o = merge(DEFAULTS, opts);
    this.time = STILL_TIME;
    this.hover = 0; this.hoverTo = 0;
    this.visible = false; this.running = false; this.raf = 0; this.last = 0; this.lost = false;
    this.stats = { frames: 0, since: 0 };
    this.build();
  }

  Instance.prototype.build = function () {
    var self = this, host = this.host, page = this.page;
    injectCss();
    var el = this.el = document.createElement('div');
    el.className = 'nm-bh';
    el.setAttribute('aria-hidden', 'true');
    var canvas = this.canvas = document.createElement('canvas');
    canvas.className = 'nm-bh-gl';
    el.appendChild(canvas);
    // Behind the heading and door on the footer pages (they are later positioned siblings).
    if (page === 'home' || page === 'about') host.insertBefore(el, host.firstChild);
    else host.appendChild(el);
    if (page === 'index') {
      host.removeAttribute('aria-hidden');
      var door = this.ownDoor = document.createElement('button');
      door.type = 'button';
      door.className = 'nm-run-door nm-bh-door';
      door.setAttribute('aria-label', 'Play Cloud Run');
      door.setAttribute('aria-haspopup', 'dialog');
      door.title = 'Feeling lucky?';
      door.addEventListener('click', function () { openRun(door); });
      host.appendChild(door);
    }
    if (page) document.documentElement.setAttribute('data-nm-bh', '');

    this.onHover = function (e) {
      var inDoor = !!(e.target && e.target.closest && e.target.closest('.nm-run-door'));
      var to = /over|focusin/.test(e.type) && inDoor ? 1 : 0;
      if (/out/.test(e.type) && e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.nm-run-door')) return;
      if (to !== self.hoverTo) { self.hoverTo = to; if (self.still) self.update(); }
    };
    ['pointerover', 'pointerout', 'focusin', 'focusout'].forEach(function (t) { host.addEventListener(t, self.onHover); });

    this.gl = this.o.fallback ? null : this.initGl();
    if (!this.gl) this.fallback();
    this.layout();

    this.onUpdate = function () { self.update(); };
    this.onResize = function () {
      clearTimeout(self.rt);
      self.rt = setTimeout(function () {
        if (self === autoInst && !self.host.isConnected) { remount(); return; }
        self.layout(); self.update();
      }, 120);
    };
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    if (this.motion.addEventListener) this.motion.addEventListener('change', this.onUpdate);
    document.addEventListener('visibilitychange', this.onUpdate);
    addEventListener('nm:gamechange', this.onUpdate);
    addEventListener('resize', this.onResize, { passive: true });
    addEventListener('pageshow', this.onUpdate);
    this.ro = 'ResizeObserver' in window ? new ResizeObserver(this.onResize) : null;
    if (this.ro) this.ro.observe(host);
    if ('IntersectionObserver' in window) {
      this.io = new IntersectionObserver(function (entries) {
        self.visible = entries[entries.length - 1].isIntersecting;
        self.update();
      }, { rootMargin: '120px 0px' });
      this.io.observe(el);
    } else { this.visible = true; this.update(); }
  };

  Instance.prototype.initGl = function () {
    var self = this, canvas = this.canvas, gl;
    var attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true };
    try { gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs); } catch (e) { gl = null; }
    if (!gl) return null;
    gl.getExtension('OES_standard_derivatives');
    var steps = phone() ? 84 : 118;
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG.replace('__STEPS__', String(steps)));
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    var u = this.u = {};
    ['uRes', 'uCenter', 'uPx', 'uTime', 'uTilt', 'uRoll', 'uSpin', 'uInt', 'uStars', 'uGrain', 'uViolet', 'uN', 'uBgA', 'uPal', 'uBg', 'uVio']
      .forEach(function (n) { u[n] = gl.getUniformLocation(prog, n === 'uPal' ? 'uPal[0]' : n); });
    this.applyColors(gl);
    if (!this.ctxBound) {
      this.ctxBound = true;
      canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); self.lost = true; self.stop(); });
      canvas.addEventListener('webglcontextrestored', function () {
        self.lost = false;
        self.gl = self.initGl();
        if (!self.gl) { self.fallback(); return; }
        self.layout(); self.update();
      });
    }
    return gl;
  };

  Instance.prototype.applyColors = function (gl) {
    gl = gl || this.gl;
    if (!gl) return;
    var pal = (Array.isArray(this.o.palette) ? this.o.palette : DEFAULTS.palette).map(hexRgb).filter(Boolean).slice(0, 8);
    if (pal.length < 2) pal = DEFAULTS.palette.map(hexRgb);
    var flat = new Float32Array(24);
    for (var i = 0; i < 8; i++) {
      var c = lin(pal[Math.min(i, pal.length - 1)]);
      flat[i * 3] = c[0]; flat[i * 3 + 1] = c[1]; flat[i * 3 + 2] = c[2];
    }
    gl.uniform3fv(this.u.uPal, flat);
    gl.uniform1f(this.u.uN, pal.length);
    gl.uniform3fv(this.u.uVio, lin(hexRgb(VIOLET)));
    var bg = this.o.background && this.o.background !== 'transparent' ? hexRgb(this.o.background) : null;
    gl.uniform1f(this.u.uBgA, bg ? 1 : 0);
    gl.uniform3fv(this.u.uBg, bg || [0, 0, 0]);
  };

  Instance.prototype.fallback = function () {
    if (this.css) return;
    this.gl = null;
    this.canvas.style.display = 'none';
    var css = this.css = document.createElement('div');
    css.className = 'nm-bh-css';
    css.innerHTML = '<i class="g"></i><i class="h"></i><i class="s"></i><i class="d"></i>';
    this.el.appendChild(css);
    this.el.classList.add('is-ready');
  };

  // Size and place everything from the viewport (footers) or the host (custom mounts).
  Instance.prototype.layout = function () {
    var o = this.o, host = this.host, page = this.page, root = document.documentElement.style;
    var hr = host.getBoundingClientRect(), hw = hr.width || innerWidth, hh = hr.height || innerHeight;
    var scale = Math.max(0.2, num(o.scale, 1)), dd;
    if (page === 'index') dd = Math.min(innerWidth * 0.86, innerHeight * 0.62);
    else if (page) dd = Math.min(hw * 0.86, hh * 0.62);
    else dd = Math.min(hw / (BOX_X / ROUT), hh / (BOX_Y / ROUT)) / 2;
    dd *= scale;
    var unit = dd / (2 * ROUT);
    var bw = Math.min(2 * BOX_X * unit, page ? hw : Infinity), bh = 2 * BOX_Y * unit;
    var off = o.offsetY, offPx = typeof off === 'string' && /%$/.test(off) ? parseFloat(off) / 100 * hh : num(off, 0);
    var cy;
    if (page === 'index') {
      var pad = Math.round(Math.min(64, Math.max(20, innerWidth * 0.035)));
      root.setProperty('--nm-bh-mark-h', Math.round(bh + pad) + 'px');
      cy = pad + bh / 2 + offPx;
    } else if (page) cy = hh * 0.42 + offPx;
    else cy = hh * num(o.anchorY, 0.5) + offPx;
    var s = this.el.style;
    s.width = Math.round(bw) + 'px'; s.height = Math.round(bh) + 'px'; s.top = Math.round(cy) + 'px';
    if (page) {
      root.setProperty('--nm-bh-cy', Math.round(cy) + 'px');
      root.setProperty('--nm-bh-door-w', Math.round(2 * DOOR_X * unit) + 'px');
      root.setProperty('--nm-bh-door-h', Math.round(2 * DOOR_Y * unit) + 'px');
    }
    this.unit = unit; this.bw = bw; this.bh = bh; this.arriveP = undefined;
    if (this.css) {
      s.setProperty('--s', Math.round(2 * 2.62 * unit) + 'px');
      s.setProperty('--h', Math.round(2 * 5.4 * unit) + 'px');
      s.setProperty('--d', Math.round(2 * ROUT * unit) + 'px');
    }
    if (o.annotate) this.plate(); else if (this.svg) { this.svg.remove(); this.svg = null; }
    if (!this.gl) return;
    var q = num(o.quality, 0) || (phone() ? 0.62 : 0.6);
    q *= Math.min(devicePixelRatio || 1, 1.5) * (this.qScale || 1);
    var w = Math.max(2, Math.round(bw * q)), h = Math.max(2, Math.round(bh * q));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.q = q;
  };

  // Diagram-plate labels (for the atlas direction): each label sits on a hairline
  // underline in a corner of the box, with a leader from its inner end to the feature.
  Instance.prototype.plate = function () {
    var u = this.unit, w = this.bw, h = this.bh, cx = w / 2, cy = h / 2;
    var ns = 'http://www.w3.org/2000/svg';
    if (!this.svg) {
      this.svg = document.createElementNS(ns, 'svg');
      this.svg.setAttribute('class', 'nm-bh-plate');
      this.el.appendChild(this.svg);
    }
    var narrow = w < 560, fs = narrow ? 8.5 : 10, reach = narrow ? 8.4 : 10.8;
    // [label, feature x, feature y (world units, y up), side, row]
    var items = [
      ['Lensed far side', -2.4, 3.35, -1, 'top'],
      ['Photon ring', 1.5, 2.15, 1, 'top'],
      ['Event horizon', -0.9, 1.05, -1, 'bottom'],
      ['Accretion disk', 7.3, -0.5, 1, 'bottom']
    ];
    var svg = this.svg;
    svg.setAttribute('viewBox', '0 0 ' + Math.round(w) + ' ' + Math.round(h));
    svg.innerHTML = items.map(function (it, i) {
      return '<text style="font-size:' + fs + 'px"><tspan class="n">0' + (i + 1) + '</tspan> ' + it[0] + '</text>';
    }).join('');
    var texts = svg.querySelectorAll('text'), lines = '';
    items.forEach(function (it, i) {
      var t = texts[i], left = it[3] < 0;
      var tw = (t.getComputedTextLength && t.getComputedTextLength()) || it[0].length * fs * 0.68 + fs * 2;
      var ly = it[4] === 'top' ? Math.max(fs + 10, cy - 6.3 * u) : Math.min(h - 10, cy + 5.6 * u);
      var lx = left ? Math.max(8, cx - reach * u) : Math.min(w - 8, cx + reach * u);
      var x0 = left ? lx : lx - tw, x1 = left ? lx + tw : lx, inner = left ? x1 : x0;
      var fx = cx + it[1] * u, fy = cy - it[2] * u;
      t.setAttribute('x', x0.toFixed(1));
      t.setAttribute('y', (ly - 6).toFixed(1));
      lines += '<path d="M' + fx.toFixed(1) + ' ' + fy.toFixed(1) + 'L' + inner.toFixed(1) + ' ' + ly.toFixed(1) +
        'L' + (left ? x0 : x1).toFixed(1) + ' ' + ly.toFixed(1) + '"/><circle cx="' + fx.toFixed(1) + '" cy="' + fy.toFixed(1) + '" r="2.2"/>';
    });
    svg.insertAdjacentHTML('afterbegin', lines);
  };

  Instance.prototype.params = function () {
    var o = this.o, tilt = num(o.tilt, 5), arrive = num(o.arrive, 8);
    if (arrive && !this.still) {
      // One rect read per frame, and only while the page is actually scrolling.
      if (this.arriveY !== scrollY || this.arriveH !== innerHeight || this.arriveP === undefined) {
        var r = this.el.getBoundingClientRect(), vh = innerHeight || 1;
        this.arriveY = scrollY; this.arriveH = innerHeight;
        this.arriveP = Math.max(0, Math.min(1, (vh - r.top - r.height / 2) / (vh * 0.56)));
      }
      tilt += arrive * (1 - this.arriveP) * (1 - this.arriveP);
    }
    return { tilt: tilt * Math.PI / 180 };
  };

  Instance.prototype.draw = function () {
    var gl = this.gl, u = this.u, o = this.o;
    if (!gl || this.lost) return;
    var w = this.canvas.width, h = this.canvas.height, pr = this.params();
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u.uRes, w, h);
    gl.uniform2f(u.uCenter, w / 2, h / 2);
    gl.uniform1f(u.uPx, this.unit * this.q);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uTilt, pr.tilt);
    gl.uniform1f(u.uRoll, -num(o.roll, 0) * Math.PI / 180);
    gl.uniform1f(u.uSpin, num(o.spin, 1));
    gl.uniform1f(u.uInt, num(o.intensity, 1) * (1 + 0.14 * this.hover));
    gl.uniform1f(u.uStars, Math.max(0, num(o.stars, 1)));
    gl.uniform1f(u.uGrain, Math.max(0, num(o.grain, 1)));
    gl.uniform1f(u.uViolet, o.violet ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.stats.frames++;
    if (!this.el.classList.contains('is-ready')) this.el.classList.add('is-ready');
  };

  Instance.prototype.stop = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  };

  Instance.prototype.update = function () {
    var self = this;
    if (!this.gl || this.lost) return;
    this.still = reduced();
    var active = this.visible && !document.hidden && !gameOpen() && this.el.isConnected;
    if (!active) { this.stop(); return; }
    if (this.still) {
      this.stop();
      this.hover = this.hoverTo;
      this.time = STILL_TIME;
      if (!this.stillRaf) this.stillRaf = requestAnimationFrame(function () { self.stillRaf = 0; self.draw(); });
      return;
    }
    if (this.running) return;
    this.running = true;
    this.last = 0;
    this.stats.since = performance.now(); this.stats.frames = 0;
    var tick = function (now) {
      if (!self.running) return;
      self.raf = requestAnimationFrame(tick);
      var cap = 1000 / Math.max(1, num(self.o.fps, 30));
      if (self.last && now - self.last < cap - 3) return;
      var dt = self.last ? Math.min(0.1, (now - self.last) / 1000) : 0;
      self.last = now;
      self.govern(dt, cap);
      self.time += dt;
      self.hover += (self.hoverTo - self.hover) * Math.min(1, dt * 5);
      self.draw();
    };
    this.raf = requestAnimationFrame(tick);
  };

  // A slow GPU gets a smaller buffer (never below ~55% of the default) instead of dropped frames.
  Instance.prototype.govern = function (dt, cap) {
    if (!dt || (this.qScale || 1) <= 0.56) return;
    this.gov = this.gov || { n: 0, sum: 0 };
    this.gov.n++; this.gov.sum += dt;
    if (this.gov.n < 45) return;
    var slow = this.gov.sum / this.gov.n > cap / 1000 * 1.5;
    this.gov = { n: 0, sum: 0 };
    if (slow) { this.qScale = (this.qScale || 1) * 0.8; this.layout(); }
  };

  Instance.prototype.set = function (opts) {
    this.o = merge(this.o, opts);
    if (this.gl) this.applyColors();
    this.layout();
    if (this.still || !this.running) { this.running = false; this.update(); }
  };

  Instance.prototype.destroy = function () {
    var self = this;
    this.stop();
    if (this.io) this.io.disconnect();
    if (this.ro) this.ro.disconnect();
    if (this.motion && this.motion.removeEventListener) this.motion.removeEventListener('change', this.onUpdate);
    document.removeEventListener('visibilitychange', this.onUpdate);
    removeEventListener('nm:gamechange', this.onUpdate);
    removeEventListener('resize', this.onResize);
    removeEventListener('pageshow', this.onUpdate);
    ['pointerover', 'pointerout', 'focusin', 'focusout'].forEach(function (t) { self.host.removeEventListener(t, self.onHover); });
    if (this.gl) { var ext = this.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
    this.el.remove();
    if (this.ownDoor) { this.ownDoor.remove(); this.host.setAttribute('aria-hidden', 'true'); }
    if (this.page) {
      document.documentElement.removeAttribute('data-nm-bh');
      ['--nm-bh-cy', '--nm-bh-door-w', '--nm-bh-door-h', '--nm-bh-mark-h'].forEach(function (p) { document.documentElement.style.removeProperty(p); });
    }
    instances = instances.filter(function (i) { return i !== self; });
    if (autoInst === this) autoInst = null;
  };

  // The archive has no Cloud Run door of its own: load the shared one on demand.
  var runLoading = null;
  function openRun(door) {
    if (window.__nmRun) { window.__nmRun.open(); return; }
    if (!runLoading) {
      door.setAttribute('aria-busy', 'true');
      runLoading = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = '/js/nm-run.js';
        s.onload = resolve;
        s.onerror = function () { s.remove(); runLoading = null; reject(new Error('Cloud Run could not load')); };
        document.head.appendChild(s);
      });
    }
    runLoading.then(function () {
      door.removeAttribute('aria-busy');
      if (window.__nmRun) window.__nmRun.open();
    }, function () { door.removeAttribute('aria-busy'); });
  }

  function mount(host, opts, page) {
    if (typeof host === 'string') host = document.querySelector(host);
    if (!host) return null;
    unmount(host);
    var inst = new Instance(host, opts, page);
    instances.push(inst);
    return inst;
  }
  function unmount(target) {
    instances.slice().forEach(function (i) {
      if (!target || i === target || i.host === target) i.destroy();
    });
  }
  function spot() {
    var door = document.querySelector('main > section.h-lvh > .nm-run-door');
    if (door) return { host: door.parentElement, page: 'home' };
    var about = document.querySelector('[data-nm-footer]');
    if (about) return { host: about, page: 'about' };
    var mark = document.querySelector('footer .foot-mark');
    if (mark) return { host: mark, page: 'index' };
    return null;
  }
  function config() {
    var c = window.NMThemeConfig && window.NMThemeConfig.blackHole;
    return c === false ? false : (c && typeof c === 'object' ? c : {});
  }
  function auto() {
    if (!window.__nmTheme || autoInst) return;
    var c = config(), s = spot();
    if (c === false || !s) return;
    autoInst = mount(s.host, c, s.page);
  }
  // The homepage footer is React-owned; if a re-render replaced it, follow it.
  function remount() {
    var keep = autoInst ? autoInst.o : config();
    if (autoInst) autoInst.destroy();
    var s = spot();
    if (s && keep !== false) autoInst = mount(s.host, keep, s.page);
  }

  window.NMBlackHole = {
    mount: function (host, opts) { return mount(host, opts, null); },
    unmount: unmount,
    set: function (opts) { instances.forEach(function (i) { i.set(opts); }); },
    get instances() { return instances.slice(); },
    defaults: merge(DEFAULTS, {})
  };

  var ready = window.__nmReady || function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };
  ready(auto);
})();
