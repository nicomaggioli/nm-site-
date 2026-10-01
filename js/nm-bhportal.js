/* Night Sky: the black hole seen through the hero NM (homepage, ?theme=stars only).

   Nico's idea: make the logo a window. Through the NM you look into a black hole
   in a deeper space than the sky around it; scrolling falls into it, and on the
   other side is his work.

   How it sits: one fixed, full-viewport canvas appended to <body> at z-index -1.
   It comes after .nm-made-track (also z -1) in DOM order, so it paints above the
   work collage and below #global-canvas (z 0). The hero canvas covers everything
   outside the mark with the sky (NMThemeConfig.heroClear) and is transparent
   inside it, so this layer is only ever seen through the letters, the lava blobs
   and the shooting-star cut (js/nm-lava.js, js/nm-starcut.js).

   The picture is ray traced per pixel through a Schwarzschild field (the physics
   of js/nm-blackhole.js, horizon radius 1): rays are marched with the
   -1.5 h^2 x / r^5 bending term inside r = 12.5 and get the matching weak-field
   bend analytically outside it, so the background has no seam. A thin accretion
   disk in the hoodie ramp (Keplerian-sheared swirl, Doppler beaming, one violet
   fleck), the photon ring, a faint corona, and a lensed deep field behind it:
   airbrushed clouds and a dust band in the hoodie colours over a blue-violet
   black (a touch brighter than the sky outside, so the letters read as windows),
   and stars that do not twinkle (there is no air in there). The stars are point
   sources placed through the local screen-to-sky Jacobian, so near the Einstein
   ring they stay sharp and brighten with the magnification instead of smearing
   into streaks; the clouds, being extended, do stretch into arcs. Finished with
   the same spray grain as the footer black hole.

   It is centred on the NM (the mark centre is mapped to the screen through
   __nmLava._toShape, so phones and the scroll zoom stay aligned) and sized from
   the mark, so the shadow sits between the middle strokes, the photon ring runs
   through them and the lensed far side arcs through the round ends.

   Scroll (window.__nmHeroProgress, p):
     0    - .03   at rest; pointer parallax (offset, tilt, roll, sky swing), slow swirl
     .03  - .65   falling in: the camera drops from 36 to 2.2 horizon radii and rises
                  from 8 to 26 degrees above the disk; the lensing stretches, the disk
                  sweeps past and the shadow swallows the view
     .55  - .68   a beat of darkness: the letters are pure black
     .66  - .90   the collage emerges: the dark opens from the centre like an iris
                  with a faint warm rim, over the collage's own zoom
     >= .95       hidden and paused (also when scrolled past the hero)
   Everything is a function of p, so scrolling back up climbs back out.

   First visit (window.__nmOpening): the opening's circle window lands on the
   shadow, so it first shows a black dot in the sky; the photon ring and disk
   ignite as the circle opens, then the window becomes the NM.

   Budget: one WebGL context, about half resolution (DPR capped at 1.5), scissored
   to the mark's padded box while the window is small, <= 30 fps, a governor that
   lowers resolution on slow GPUs. Paused in hidden tabs, while Cloud Run is open,
   after falling through and when scrolled away; nothing until the hero scene is
   ready. Reduced motion: a still black hole (redrawn only when the mark moves), no
   fall, a plain crossfade to the collage between p .2 and .7. Without WebGL
   nothing is added and the hero is as before.

   Debug: window.NMBHPortal = { el, canvas, state(), debug(over), timeline(p) };
   debug({ p, time, px, py }) pins those inputs (debug() releases them). */
(function () {
  'use strict';
  if (window.NMBHPortal) return;
  if (!/^\/(index\.html)?$/.test(location.pathname)) return;

  var VIOLET = '#6E6BD6';
  var PALETTE = ['#CA5855', '#E3837A', '#E9B4A3', '#EDE1CC', '#F4F8F0', '#BCD3E0'];
  var BCRIT = 2.598;                 // critical impact parameter (3 sqrt 3 / 2) for r_s = 1
  var D0 = 36, DMIN = 2.2;           // camera distance at rest / at the end of the fall
  var EL0 = 8, EL1 = 26;             // camera height above the disk plane, degrees
  var SHADOW = 0.13;                 // shadow radius at rest, in mark-texture units
  var STILL_TIME = 47;
  var NM_C = 0.5078125;              // mark centre in its texture (260/512)

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
    'uniform float uF,uD,uEl,uRoll,uTime,uSpin,uInt,uGrain,uDark,uIgnite,uN,uNeb;',
    'uniform vec3 uRev;',
    'uniform mat3 uSky;',
    'uniform vec3 uPal[8];',
    'uniform vec3 uVio;',
    'const float RIN=3.,ROUT=9.6,R0=12.5,TAU=6.2831853;',
    'float h12(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}',
    'float h13(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}',
    // azimuth-periodic value noise and fbm for the disk (as in nm-blackhole.js)
    'float pn(vec2 x,float per){vec2 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);',
    ' float j0=mod(i.y,per),j1=mod(i.y+1.,per);',
    ' return mix(mix(h12(vec2(i.x,j0)),h12(vec2(i.x+1.,j0)),f.x),mix(h12(vec2(i.x,j1)),h12(vec2(i.x+1.,j1)),f.x),f.y);}',
    'float fbm(vec2 x,float per){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*pn(x,per);x=x*2.+vec2(17.13,0.);per*=2.;a*=.5;}return s*1.0667;}',
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
    ' vec3 vd=vec3(-p.z,0.,p.x)/r*sign(uSpin);',
    ' float b=min(.6,sqrt(.5/r));',
    ' float g=sqrt(1.-b*b)/(1.-b*dot(vd,-normalize(v)));',
    ' float beam=mix(1.,g*g*g,.72)*sqrt(max(0.,1.-1./r));',
    ' float heat=clamp(temp*(.74+.34*g)+(n-.5)*.3,0.,1.);',
    ' vec3 col=ramp(heat)*(.62+1.1*temp)*beam*edge*(.28+1.6*n*n);',
    ' float a=clamp(edge*(.22+.9*n*n),0.,.85);',
    ' float va=1.7+uTime*uSpin*.95*pow(6.3,-1.5);',
    ' vec2 vq=p.xz-6.3*vec2(cos(va),sin(va));',
    ' float vf=exp(-dot(vq,vq)*5.)*smoothstep(.35,.7,n);',
    ' col=mix(col,uVio*1.4,vf*.85);a=max(a,vf*.6);',
    ' return vec4(col*uIgnite,a);}',
    // 3D value noise for the dust band
    'float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);',
    ' return mix(mix(mix(h13(i),h13(i+vec3(1.,0.,0.)),f.x),mix(h13(i+vec3(0.,1.,0.)),h13(i+vec3(1.,1.,0.)),f.x),f.y),',
    '  mix(mix(h13(i+vec3(0.,0.,1.)),h13(i+vec3(1.,0.,1.)),f.x),mix(h13(i+vec3(0.,1.,1.)),h13(i+vec3(1.,1.,1.)),f.x),f.y),f.z);}',
    // octaves fade to their mean once they are finer than the pixel (lensing squeezes the sky)
    'float fbm3(vec3 x,float oct){float s=0.,a=.5,w=0.;for(int i=0;i<5;i++){float k=clamp(oct-float(i),0.,1.);s+=a*mix(.5,vn(x),k);w+=a;x=x*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s/w;}',
    'vec2 cube(vec3 d,out float face){vec3 a=abs(d);',
    ' if(a.x>=a.y&&a.x>=a.z){face=d.x>0.?1.:2.;return d.zy/a.x;}',
    ' if(a.y>=a.z){face=d.y>0.?3.:4.;return d.xz/a.y;}',
    ' face=d.z>0.?5.:6.;return d.xy/a.z;}',
    // one star per occupied cell. Stars are points: the offset to the star (in face uv) is
    // taken back to screen pixels through the local inverse Jacobian Ji, so a lensed star
    // stays a sharp dot whose brightness follows the magnification mu
    'vec3 starP(vec2 uv,mat2 Ji,float face,float n,float dens,float seed,float gain){',
    ' vec2 g=uv*n,c=floor(g),f=fract(g)-.5;',
    ' float h=h12(c+face*97.13+seed);',
    ' if(h>dens)return vec3(0.);',
    ' vec2 o=(vec2(h12(c+face*3.1+seed+1.7),h12(c+face*7.7+seed+4.3))-.5)*.7;',
    ' vec2 q=Ji*((f-o)/n);',
    ' float m=h12(c+face*5.3+seed+9.1);',
    ' float br=(.02+1.5*pow(m,9.))*gain;',
    ' float t=h12(c+face*9.9+seed+2.2);',
    ' vec3 tint=t<.55?mix(vec3(.6,.72,1.),vec3(1.),t/.55):mix(vec3(1.),vec3(1.,.74,.56),(t-.55)/.45);',
    ' return tint*br*exp(-dot(q,q)*1.1);}',
    // the deep field behind the hole: airbrushed clouds in the hoodie colours over a
    // blue-violet black, a brighter dust band, and stars that do not twinkle
    'vec3 deep(vec3 d,float pxa,vec2 uv,float face,mat2 Ji,float mu){',
    ' float oct=clamp(log2(.5/(pxa*7.)),0.,5.);',
    ' float n1=fbm3(d*2.1+3.1,oct);',
    ' float n2=fbm3(d*5.3+11.7,oct-1.3);',
    ' float n3=fbm3(d*11.+5.3,oct-2.4);',
    ' vec3 bn=normalize(vec3(.5,.84,-.2));',
    ' float lat=dot(d,bn);',
    ' float band=exp(-lat*lat/(.05+.06*n1));',
    ' float cloud=smoothstep(.34,.8,n1)*.75+band*(.3+.9*n2*n2);',
    ' float lanes=smoothstep(.46,.74,n3)*smoothstep(.15,.7,cloud);',
    ' vec3 c1=mix(uPal[0],uVio,smoothstep(.38,.72,n2));',
    ' c1=mix(c1,uPal[2],smoothstep(.62,.9,n1)*.55);',
    ' c1=mix(c1,uPal[5],smoothstep(.6,.85,n2)*smoothstep(.3,.8,band)*.6);',
    ' vec3 col=c1*cloud*(1.-.72*lanes)*.024*uNeb;',
    ' col+=vec3(.0013,.001,.0026)*(.6+n1);',
    ' if(mu>0.){',
    '  float rich=clamp(.5+band*.7+cloud*.3,0.,1.5);',
    '  col+=starP(uv,Ji,face,170.,.3*rich,0.,mu*.3);',
    '  col+=starP(uv,Ji,face,46.,.3,31.7,mu*1.1);',
    '  col+=starP(uv,Ji,face,13.,.3,77.3,mu*3.);',
    ' }',
    ' return col;}',
    'vec3 tonemap(vec3 c){float m=max(c.r,max(c.g,c.b));if(m<1e-5)return c;',
    ' vec3 t=c*(1.-exp(-m*1.2))/m;float o=clamp((m-1.1)*.22,0.,.55);',
    ' return mix(t,vec3(max(t.r,max(t.g,t.b))),o);}',
    // weak-field bend gathered along a straight line from closest approach to s (signed), r_s = 1
    'float wf(float b,float s){float q=b*b+s*s;return s*(2.*s*s+3.*b*b)/(2.*q*sqrt(q)*b);}',
    'void main(){',
    ' vec2 fc=gl_FragCoord.xy;',
    ' vec2 p=fc-uCenter;',
    ' float cr=cos(uRoll),sr=sin(uRoll);p=vec2(cr*p.x-sr*p.y,sr*p.x+cr*p.y);',
    ' float se=sin(uEl),ce=cos(uEl);',
    ' vec3 cam=uD*vec3(0.,se,-ce),fw=vec3(0.,-se,ce),up=vec3(0.,ce,se);',
    ' vec3 dir=normalize(fw*uF+vec3(p.x,0.,0.)+up*p.y);',
    ' vec3 col=vec3(0.);float T=1.,corI=0.,corH=0.,ring=0.,cap=0.,esc=0.,bend=0.;',
    ' vec3 pos=cam,vel=dir;',
    ' float tc=-dot(cam,dir);vec3 cl=cam+dir*tc;float b=max(length(cl),1e-4),h2=b*b;',
    ' bool march=true;',
    ' if(uD>R0){',
    '  if(b>=R0||tc<0.){march=false;esc=1.;bend=1./b+wf(b,tc);}',
    '  else{float s0=sqrt(R0*R0-h2);pos=cam+dir*(tc-s0);bend=wf(b,tc)-wf(b,s0);}',
    ' }',
    ' if(march){',
    '  for(int i=0;i<STEPS;i++){',
    '   float r2=dot(pos,pos),r=sqrt(r2),vl=length(vel);',
    '   float dt=max(.02,.085*r)/vl;',
    '   vel-=1.5*h2*pos/(r2*r2*r)*dt;',
    '   vec3 np=pos+vel*dt;',
    '   if(pos.y*np.y<0.){vec4 d=disk(mix(pos,np,pos.y/(pos.y-np.y)),vel);col+=T*d.rgb;T*=1.-d.a;}',
    '   float dr=(r-1.5)*6.;ring+=exp(-dr*dr)*vl*dt*T;',
    '   float rc=length(np.xz),z=np.y/(.22+.08*rc);',
    '   float cd=exp(-z*z)*smoothstep(RIN,RIN*1.6,rc)*(1.-smoothstep(ROUT*.3,ROUT,rc))*vl*dt*T;',
    '   corI+=cd;corH+=cd*pow(clamp(1.-(rc-RIN)/(ROUT-RIN),0.,1.),1.7);',
    '   pos=np;float n2=dot(pos,pos);',
    '   if(n2<2.1&&dot(pos,vel)<0.){cap=1.;break;}',
    '   if(n2>R0*R0&&dot(pos,vel)>0.){esc=1.;break;}',
    '   if(T<.01)break;',
    '  }',
    '  if(cap+esc<.5){if(dot(pos,pos)<16.)cap=1.;else esc=1.;}',
    ' }',
    ' vec3 od=normalize(vel);',
    ' if(march&&esc>.5){',
    '  float s1=dot(pos,od);vec3 pc=pos-od*s1;float b1=max(length(pc),1e-3);',
    '  bend+=1./b1-wf(b1,s1);',
    ' }',
    // bend the outgoing direction toward the hole by what the straight legs left out
    ' vec3 cp=(march?pos:cl);vec3 nh=-(cp-od*dot(cp,od));float nl=length(nh);',
    ' if(nl>1e-5)od=normalize(od*cos(bend)+nh/nl*sin(bend));',
    ' od=uSky*od;',
    ' col+=ramp(corI>0.?corH/corI:0.)*corI*.05*(1.-cap)*uIgnite;',
    ' col+=ramp(.86)*(smoothstep(1.1,2.8,ring)*.9+smoothstep(.6,2.2,ring)*.12)*uIgnite;',
    ' col*=uInt;',
    ' float px0=1./uF,pxa=px0,mu=0.,face;',
    ' vec2 uv=cube(od,face);mat2 Ji=mat2(uF,0.,0.,uF);',
    '#ifdef GL_OES_standard_derivatives',
    ' vec3 ox=dFdx(od),oy=dFdy(od);vec2 ux=dFdx(uv),uy=dFdy(uv);',
    ' pxa=max(px0,max(length(ox),length(oy)));',
    ' float det=ux.x*uy.y-uy.x*ux.y;',
    // magnification: unlensed solid angle per pixel over the lensed one (capped against fireflies);
    // no stars on the one-pixel seams between cube faces or at the edge of the shadow
    ' if(abs(det)>1e-12&&abs(dFdx(face))+abs(dFdy(face))<.5&&abs(dFdx(esc))+abs(dFdy(esc))<.5){',
    '  Ji=mat2(uy.y,-ux.y,-uy.x,ux.x)/det;',
    '  mu=min(7.,px0*px0/max(length(cross(ox,oy)),1e-14));',
    ' }',
    '#else',
    ' mu=1.;',
    '#endif',
    ' if(esc>.5)col+=T*deep(od,pxa,uv,face,Ji,mu);',
    ' col=tonemap(col);',
    ' float g0=h12(fc),g1=h12(fc*1.37+19.1);',
    ' col*=1.+uGrain*.26*(g0-.5);',
    ' float m=max(col.r,max(col.g,col.b));',
    ' float cov=clamp(m/.7,0.,1.);',
    ' vec3 hue=col/max(m,1e-4)*.7;',
    ' col=mix(col,hue*step(g1,cov),min(uGrain,1.)*.3*smoothstep(.02,.12,cov)*(1.-smoothstep(.5,.95,cov)));',
    ' col=pow(max(col,0.),vec3(.4545));',
    ' col*=1.-uDark;',
    // the far side: the dark opens from the centre like an iris, with a faint warm rim
    ' float a=1.;vec3 rim=vec3(0.);',
    ' if(uRev.x>0.){',
    '  vec2 q=fc-uCenter;float rr=length(q),an=atan(q.y,q.x);',
    '  float R=uRev.x*(1.+.07*(vn(vec3(cos(an)*2.2,sin(an)*2.2,uTime*.15))-.5));',
    '  float e=(rr-R)/uRev.y+(g1-.5)*.9;',
    '  a=smoothstep(-1.,1.,e);',
    '  rim=pow(mix(uPal[2],uPal[3],.4),vec3(.4545))*exp(-e*e*1.3)*uRev.z;',
    ' }',
    ' vec3 o=col*a+rim;',
    ' gl_FragColor=vec4(o,max(a,max(o.r,max(o.g,o.b))));',
    '}'
  ].join('\n');

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function sm(a, b, x) { x = clamp01((x - a) / (b - a)); return x * x * (3 - 2 * x); }
  function hexRgb(h) {
    var n = parseInt(String(h).replace('#', ''), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function lin(c) { return c.map(function (v) { return Math.pow(v, 2.2); }); }
  function phone() { return Math.min(innerWidth, innerHeight) < 700 || (matchMedia('(pointer:coarse)').matches && innerWidth < 900); }
  var motionQ = matchMedia('(prefers-reduced-motion: reduce)');
  var fineQ = matchMedia('(hover:hover) and (pointer:fine)');
  function reduced() { return motionQ.matches; }
  var root = document.documentElement;
  function gameOpen() { return root.classList.contains('nm-run-open'); }
  function sceneReady() { return root.classList.contains('nm-scene-ready') || !root.hasAttribute('data-nm-mask-gate'); }
  function heroP() {
    var p = window.__nmHeroProgress;
    if (typeof p !== 'number' || !isFinite(p)) p = (window.scrollY || 0) / Math.max(1, innerHeight);
    return clamp01(p);
  }

  /* ---------- the fall, as a pure function of hero progress ---------- */
  function timeline(p) {
    var a = clamp01((p - .03) / .62);
    var e = Math.pow(a, 1.6);
    return {
      D: D0 * Math.pow(DMIN / D0, e),
      el: EL0 + (EL1 - EL0) * sm(.08, .55, p),
      fall: e,
      dark: sm(.58, .66, p),
      rev: sm(.66, .9, p),
      fade: 1 - sm(.88, .95, p)
    };
  }
  function shadowAngle(D) {
    var s = BCRIT / D * Math.sqrt(Math.max(0, 1 - 1 / D));
    return Math.asin(Math.min(.9999, s));
  }

  var S = {
    el: null, canvas: null, gl: null, u: null, prog: null, lost: false,
    running: false, raf: 0, last: 0, time: STILL_TIME, mounted: false, hidden: true,
    ptr: { tx: 0, ty: 0, x: 0, y: 0 }, q: 1, qScale: 1, w: 0, h: 0,
    map: null, mapAt: -1, centre: null, box: null, stats: { frames: 0, since: 0, dts: [] },
    over: null, stillRaf: 0, gov: { n: 0, sum: 0 }, drift: 0, lastP: -1
  };

  function css() {
    var s = document.createElement('style');
    s.id = 'nm-bhportal-css';
    s.textContent =
      '.nm-bhportal{position:fixed;left:0;top:0;width:100%;height:100vh;height:100lvh;z-index:-1;pointer-events:none;contain:strict;visibility:hidden}' +
      '.nm-bhportal.is-on{visibility:visible}' +
      '.nm-bhportal>canvas{position:absolute;inset:0;width:100%;height:100%;display:block;max-width:none}';
    document.head.appendChild(s);
  }

  function initGl() {
    var c = S.canvas, gl;
    var attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'default', failIfMajorPerformanceCaveat: true };
    try { gl = c.getContext('webgl', attrs) || c.getContext('experimental-webgl', attrs); } catch (e) { gl = null; }
    if (!gl) return null;
    gl.getExtension('OES_standard_derivatives');
    var steps = phone() ? 84 : 112;
    function sh(type, src) {
      var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { if (window.console) console.warn('nm-bhportal: ' + gl.getShaderInfoLog(o)); gl.deleteShader(o); return null; }
      return o;
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
    var u = S.u = {};
    ['uRes', 'uCenter', 'uF', 'uD', 'uEl', 'uRoll', 'uTime', 'uSpin', 'uInt', 'uGrain', 'uDark', 'uIgnite', 'uN', 'uNeb', 'uRev', 'uSky', 'uPal', 'uVio']
      .forEach(function (n) { u[n] = gl.getUniformLocation(prog, n === 'uPal' ? 'uPal[0]' : n); });
    var flat = new Float32Array(24);
    for (var i = 0; i < 8; i++) {
      var col = lin(hexRgb(PALETTE[Math.min(i, PALETTE.length - 1)]));
      flat[i * 3] = col[0]; flat[i * 3 + 1] = col[1]; flat[i * 3 + 2] = col[2];
    }
    gl.uniform3fv(u.uPal, flat);
    gl.uniform1f(u.uN, PALETTE.length);
    gl.uniform3fv(u.uVio, lin(hexRgb(VIOLET)));
    return gl;
  }

  /* ---------- where the mark is on screen ---------- */
  // The hero's own screen -> mark mapping (js/nm-lava.js), inverted with a few Newton steps.
  function toScreen(u, v, gx, gy) {
    var L = window.__nmLava;
    if (!L || !L._toShape) return null;
    var x = gx, y = gy;
    for (var i = 0; i < 6; i++) {
      var s = L._toShape(x, y);
      if (!s) return null;
      var ex = s[0] - u, ey = s[1] - v;
      if (Math.abs(ex) + Math.abs(ey) < 2e-5) break;
      var sx = L._toShape(x + 2, y), sy = L._toShape(x, y + 2);
      var a = (sx[0] - s[0]) / 2, b = (sy[0] - s[0]) / 2, c = (sx[1] - s[1]) / 2, d = (sy[1] - s[1]) / 2;
      var det = a * d - b * c;
      if (!det || !isFinite(det)) return null;
      x -= (d * ex - b * ey) / det; y -= (a * ey - c * ex) / det;
    }
    return isFinite(x) && isFinite(y) ? [x, y] : null;
  }
  // CSS px per mark-texture unit at rest (no scroll zoom), from the hero's frame parameters.
  function restScale() {
    var L = window.__nmLava, st = L && L._state && L._state(), f = st && st.frame;
    var W = innerWidth;
    if (!f || !f.meshX || !f.meshY) return Math.min(W, innerHeight) / 1.2;
    var s = (f.uvScale - f.pulse) || 1.2, mr = f.meshX / f.meshY;
    return mr > 1 ? W / (s * mr) : W / s;
  }
  function locate(p) {
    var W = innerWidth, H = innerHeight, gx = W / 2, gy = H / 2;
    var prev = S.centre;
    var c = toScreen(NM_C, NM_C, prev ? prev[0] : gx, prev ? prev[1] : gy) || [gx, gy * .96];
    S.centre = c;
    // padded box around the mark and anything the lava pulls out of it (near rest only)
    S.box = null;
    if (p >= .04) return;
    var a = toScreen(-.06, .12, c[0] - W * .3, c[1] - H * .3), b = toScreen(1.08, .9, c[0] + W * .3, c[1] + H * .3);
    S.box = a && b ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] : null;
  }

  function layout() {
    if (!S.gl) return;
    var r = S.el.getBoundingClientRect(), w = r.width || innerWidth, h = r.height || innerHeight;
    var q = (phone() ? .5 : .6) * Math.min(window.devicePixelRatio || 1, 1.5) * S.qScale;
    var cw = Math.max(2, Math.round(w * q)), ch = Math.max(2, Math.round(h * q));
    if (S.canvas.width !== cw || S.canvas.height !== ch) { S.canvas.width = cw; S.canvas.height = ch; }
    S.q = cw / w; S.w = w; S.h = h; S.top = r.top;
    S.unit = restScale();
  }

  /* ---------- drawing ---------- */
  var skyM = new Float32Array(9);
  function skyMatrix(yaw, pitch) {
    // R = Rx(pitch) * Ry(yaw), column-major for uniformMatrix3fv
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
    skyM[0] = cy; skyM[1] = sx * sy; skyM[2] = -cx * sy;
    skyM[3] = 0; skyM[4] = cx; skyM[5] = sx;
    skyM[6] = sy; skyM[7] = -sx * cy; skyM[8] = cx * cy;
    return skyM;
  }

  function draw(p) {
    var gl = S.gl, u = S.u;
    if (!gl || S.lost) return;
    var still = reduced(), o = S.over || {};
    var t = timeline(still ? 0 : p);
    var q = S.q, W = S.canvas.width, H = S.canvas.height;
    if (!(S.stats.frames % 15)) S.unit = restScale();
    locate(p);
    var c = S.centre, px = S.ptr.x, py = S.ptr.y;
    // the window's depth: the far hole follows the eye a little, the sky at infinity a little more
    var calm = 1 - t.fall;
    var cx = (c[0] + px * 11 * calm) * q, cy = (S.h - (c[1] - S.top + py * 7 * calm)) * q;
    var rest = SHADOW * S.unit;                             // css px
    var F = rest / Math.tan(shadowAngle(D0)) * q;           // focal length, canvas px
    var el = (t.el - py * 2.2 * calm) * Math.PI / 180;
    var roll = px * 1.4 * calm * Math.PI / 180;
    var Fc = F / q;
    var yaw = S.drift + px * 19 / Fc, pitch = -py * 13 / Fc;
    // opening: the circle lands on the shadow; the ring and disk ignite as it opens
    var op = window.__nmOpening, ignite = 1;
    if (op && op.active && op.morph < 1) ignite = sm(.42, .95, op.phase === 'playing' ? op.radius : 0) * (1 - op.morph) + op.morph;
    gl.viewport(0, 0, W, H);
    // while the window is small only its padded box is drawn; outside it the hero cover is opaque
    var box = S.box, sc = false;
    // (only near rest: once the zoom pushes the padded box off screen the barrel mapping folds)
    if (box && p < .04 && box[0] > -W / q && box[1] > -H / q && box[2] < 2 * W / q && box[3] < 2 * H / q) {
      var x0 = Math.max(0, Math.floor(box[0] * q) - 4), x1 = Math.min(W, Math.ceil(box[2] * q) + 4);
      var y0 = Math.max(0, Math.floor((S.h - (box[3] - S.top)) * q) - 4), y1 = Math.min(H, Math.ceil((S.h - (box[1] - S.top)) * q) + 4);
      if ((x1 - x0) * (y1 - y0) < W * H * .7 && x1 > x0 && y1 > y0) { sc = true; gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, y0, x1 - x0, y1 - y0); }
    }
    if (!sc) gl.disable(gl.SCISSOR_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.uRes, W, H);
    gl.uniform2f(u.uCenter, cx, cy);
    gl.uniform1f(u.uF, F);
    gl.uniform1f(u.uD, t.D);
    gl.uniform1f(u.uEl, el);
    gl.uniform1f(u.uRoll, roll);
    gl.uniform1f(u.uTime, S.time);
    gl.uniform1f(u.uSpin, 1);
    gl.uniform1f(u.uInt, 1 + .12 * t.fall);
    gl.uniform1f(u.uGrain, 1);
    gl.uniform1f(u.uDark, t.dark);
    gl.uniform1f(u.uIgnite, ignite);
    gl.uniform1f(u.uNeb, 1);
    var diag = Math.hypot(W, H) * .5;
    gl.uniform3f(u.uRev, t.rev > 0 ? t.rev * diag * 1.12 : 0, Math.max(3, diag * .05), .34 * (1 - sm(.8, 1, t.rev)));
    gl.uniformMatrix3fv(u.uSky, false, skyMatrix(yaw, pitch));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    S.stats.frames++;
    var fade = still ? 1 - sm(.2, .7, p) : t.fade, op = fade < 1 ? fade.toFixed(3) : '';
    if (op !== S.op) { S.op = op; S.el.style.opacity = op; }
  }

  /* ---------- the loop ---------- */
  // the layer is in play until the visitor has fallen through (or, under reduced motion, crossfaded)
  function inPlay(p) { return sceneReady() && p < (reduced() ? .7 : .95) && (window.scrollY || 0) < innerHeight * 1.05; }
  function wanted(p) { return S.gl && !S.lost && !document.hidden && !gameOpen() && inPlay(p); }
  function show(on) {
    if (on === !S.hidden) return;
    S.hidden = !on;
    S.el.classList.toggle('is-on', on);
  }
  function stop() {
    S.running = false;
    if (S.raf) cancelAnimationFrame(S.raf);
    S.raf = 0;
  }
  function update() {
    if (!S.gl || S.lost) return;
    var p = S.over && S.over.p != null ? S.over.p : heroP();
    // visible whenever the hero still shows the window; frozen (not hidden) in a hidden tab or under the game
    show(inPlay(p));
    if (!wanted(p)) { stop(); return; }
    if (reduced()) {
      stop();
      S.time = STILL_TIME; S.ptr.x = S.ptr.y = 0;
      if (!S.stillRaf) S.stillRaf = requestAnimationFrame(function () { S.stillRaf = 0; if (wanted(heroP())) draw(heroP()); });
      return;
    }
    if (S.running) return;
    S.running = true; S.last = 0;
    S.stats.since = performance.now(); S.stats.frames = 0;
    tick(performance.now());   // first frame now, so the layer never shows a stale picture
  }
  function tick(now) {
    if (!S.running) return;
    S.raf = requestAnimationFrame(tick);
    var cap = 1000 / 30;
    if (S.last && now - S.last < cap - 3) return;
    var dt = S.last ? Math.min(.1, (now - S.last) / 1000) : 0;
    S.last = now;
    var p = S.over && S.over.p != null ? S.over.p : heroP();
    if (!wanted(p)) { update(); return; }
    govern(dt, cap);
    var o = S.over || {};
    S.time = o.time != null ? o.time : S.time + dt;
    S.drift = o.time != null ? o.time * .004 : S.drift + dt * .004;
    var k = 1 - Math.exp(-dt * 2.4);
    var tx = o.px != null ? o.px : S.ptr.tx, ty = o.py != null ? o.py : S.ptr.ty;
    if (o.px != null) { S.ptr.x = tx; S.ptr.y = ty; }
    else { S.ptr.x += (tx - S.ptr.x) * k; S.ptr.y += (ty - S.ptr.y) * k; }
    if (dt) { S.stats.dts.push(dt); if (S.stats.dts.length > 120) S.stats.dts.shift(); }
    draw(p);
  }
  // a slow GPU gets a smaller buffer (never below ~55% of the default) instead of dropped frames
  function govern(dt, cap) {
    if (!dt || S.qScale <= .56) return;
    var g = S.gov; g.n++; g.sum += dt;
    if (g.n < 45) return;
    var slow = g.sum / g.n > cap / 1000 * 1.5;
    S.gov = { n: 0, sum: 0 };
    if (slow) { S.qScale *= .8; layout(); }
  }

  function mount() {
    if (S.mounted) return;
    var hero = document.querySelector('main > section.h-svh') || document.getElementById('nm-made');
    if (!hero) return;
    S.mounted = true;
    css();
    var el = S.el = document.createElement('div');
    el.className = 'nm-bhportal';
    el.setAttribute('aria-hidden', 'true');
    var canvas = S.canvas = document.createElement('canvas');
    el.appendChild(canvas);
    document.body.appendChild(el);
    S.gl = initGl();
    if (!S.gl) { el.remove(); S.el = null; return; }
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); S.lost = true; stop(); });
    canvas.addEventListener('webglcontextrestored', function () {
      S.lost = false; S.gl = initGl();
      if (!S.gl) { show(false); return; }
      layout(); update();
    });
    layout();

    var rt = 0;
    function onResize() { clearTimeout(rt); rt = setTimeout(function () { layout(); S.centre = null; update(); if (reduced()) update(); }, 120); }
    addEventListener('resize', onResize, { passive: true });
    addEventListener('scroll', function () { if (!S.running) update(); }, { passive: true });
    addEventListener('pointermove', function (e) {
      if (!fineQ.matches || e.pointerType !== 'mouse') return;
      S.ptr.tx = Math.max(-1, Math.min(1, (e.clientX / innerWidth - .5) * 2));
      S.ptr.ty = Math.max(-1, Math.min(1, (e.clientY / innerHeight - .5) * 2));
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () { S.ptr.tx = S.ptr.ty = 0; });
    document.addEventListener('visibilitychange', update);
    addEventListener('nm:gamechange', update);
    addEventListener('nm:opening-done', update);
    addEventListener('pageshow', function () { S.centre = null; layout(); update(); });
    if (motionQ.addEventListener) motionQ.addEventListener('change', function () { stop(); update(); });
    // the hero marks itself ready a frame after its first mask render: check every frame so the
    // first-visit opening's circle never shows the collage before the black hole is drawn
    if (!sceneReady()) {
      var n = 0, poll = function () {
        if (sceneReady()) { layout(); update(); return; }
        if (++n < 1800) requestAnimationFrame(poll); else if (n < 2040) setTimeout(poll, 250);
      };
      requestAnimationFrame(poll);
    }
    update();
  }

  window.NMBHPortal = {
    get el() { return S.el; },
    get canvas() { return S.canvas; },
    state: function () {
      var d = S.stats.dts, avg = d.length ? d.reduce(function (a, b) { return a + b; }, 0) / d.length : 0;
      return { mounted: S.mounted, gl: !!S.gl, running: S.running, visible: !S.hidden, p: heroP(), t: timeline(heroP()),
        centre: S.centre, box: S.box, unit: S.unit, canvas: S.canvas ? [S.canvas.width, S.canvas.height] : null,
        q: S.q, qScale: S.qScale, fps: avg ? 1 / avg : 0, frames: S.stats.frames, opacity: S.el ? S.el.style.opacity : null };
    },
    debug: function (over) { S.over = over || null; stop(); update(); return this.state(); },
    timeline: timeline
  };

  var ready = window.__nmReady || function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };
  ready(mount);
})();
