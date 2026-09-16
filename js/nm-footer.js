/* Static-page footer: the homepage's point data, soft sprite and projection.
   No React/Three/hero download. Rendering runs only while visible; the final pass preserves the homepage’s color space. */
(function () {
  'use strict';
  var host = document.querySelector('[data-nm-footer]');
  if (!host) return;
  var email = host.querySelector('.nm-footer-email'), copyTimer;
  email.addEventListener('click', async function () {
    try {
      await navigator.clipboard.writeText('nicomaggioli@gmail.com');
      email.classList.add('is-copied');
      clearTimeout(copyTimer);
      copyTimer = setTimeout(function () { email.classList.remove('is-copied'); }, 1800);
    } catch (_) { location.href = 'mailto:nicomaggioli@gmail.com'; }
  });

  var canvas = host.querySelector('canvas'), gl = canvas.getContext('webgl', {alpha:false,antialias:false,depth:false,powerPreference:'low-power'});
  if (!gl) return; // The static mark and contact links remain available.
  var motion = matchMedia('(prefers-reduced-motion:reduce)');
  var visible = false, loaded = false, loading = false, lost = false, frame = 0;
  var data, program, composite, target, targetTexture, spriteTexture, quad, attributes = [], count, total, uniforms = {}, width = 0, height = 0, dpr = 1, top = 0, rotation = 0;
  var vertex = `
    attribute vec3 position; attribute float aSize; attribute float aSeed;
    uniform float uTime, uScale, uRotation, uAspect, uDpr, uPtScale;
    varying float vP;
    void main(){
      vec3 p=position;float s=aSeed*6.2831853;
      p.x+=sin(uTime*0.55+s)*0.05;
      p.y+=cos(uTime*0.47+s*1.7)*0.05;
      p.z+=sin(uTime*0.38+s*2.3)*0.05;
      p*=uScale;
      // Same Euler XYZ rotation as the homepage: z=PI, x follows the reveal.
      p.xy=-p.xy;
      p.yz=mat2(cos(uRotation),sin(uRotation),-sin(uRotation),cos(uRotation))*p.yz;
      p.y+=0.3;p.z-=5.0;
      float f=2.14450692; // 50-degree perspective camera, near .1, far 1000.
      gl_Position=vec4(p.x*f/uAspect,p.y*f,-1.00020002*p.z-0.20002,-p.z);
      gl_PointSize=aSize*uDpr*(9.0/max(0.5,-p.z))*uPtScale;
      vP=0.55+0.45*sin(uTime*0.9+s);
    }`;
  var fragment = `precision mediump float;
    uniform sampler2D uMap;uniform float uAlphaScale;varying float vP;
    void main(){float a=texture2D(uMap,gl_PointCoord).a;if(a<0.004)discard;
      gl_FragColor=vec4(1.0,1.0,1.0,a*0.155*vP*uAlphaScale);}`;
  function shader(type, source) {
    var s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if (!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error('Cloud shader unavailable');
    return s;
  }
  function setup() {
    attributes=[];
    program=gl.createProgram();
    var vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment);
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    gl.deleteShader(vs);gl.deleteShader(fs);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error('Cloud renderer unavailable');
    gl.useProgram(program);
    total=data.byteLength/20;
    [['position',3,0],['aSize',1,total*12],['aSeed',1,total*16]].forEach(function (a) {
      var b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data,a[2],total*a[1]),gl.STATIC_DRAW);
      var loc=gl.getAttribLocation(program,a[0]);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,a[1],gl.FLOAT,false,0,0);attributes.push([loc,b,a[1]]);
    });
    ['uTime','uScale','uRotation','uAspect','uDpr','uPtScale','uAlphaScale','uMap'].forEach(function (name) {uniforms[name]=gl.getUniformLocation(program,name);});
    var sprite=document.createElement('canvas');sprite.width=sprite.height=64;
    var ctx=sprite.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(255,255,255,0.85)');g.addColorStop(.28,'rgba(255,255,255,0.42)');
    g.addColorStop(.62,'rgba(255,255,255,0.13)');g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
    spriteTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,spriteTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,sprite);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.uniform1i(uniforms.uMap,0);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    // The homepage renders its particles to a linear texture, then converts
    // that image to sRGB. Preserve this so the cloud has the same soft glow.
    composite=gl.createProgram();
    var qv=shader(gl.VERTEX_SHADER,'attribute vec2 point;varying vec2 uv;void main(){uv=point*.5+.5;gl_Position=vec4(point,0.,1.);}');
    var qf=shader(gl.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D map;varying vec2 uv;void main(){vec3 c=max(vec3(0.),texture2D(map,uv).rgb-vec3(.00088630));vec3 outColor=mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));gl_FragColor=vec4(outColor,1.);}');
    gl.attachShader(composite,qv);gl.attachShader(composite,qf);gl.linkProgram(composite);
    gl.deleteShader(qv);gl.deleteShader(qf);
    if(!gl.getProgramParameter(composite,gl.LINK_STATUS))throw new Error('Cloud color pass unavailable');
    quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    target=gl.createFramebuffer();targetTexture=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,targetTexture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER,target);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,targetTexture,0);
    gl.clearColor(.00303527,.00303527,.00303527,1);
    loaded=true;resize();update();
  }
  function resize() {
    var rect=host.getBoundingClientRect();
    width=rect.width;height=rect.height;top=rect.top+scrollY;
    dpr=Math.min(devicePixelRatio||1,width<=767?1.25:1.4);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    gl.bindTexture(gl.TEXTURE_2D,targetTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,canvas.width,canvas.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.viewport(0,0,canvas.width,canvas.height);
    count=width<=767?Math.min(total,7500):total;
  }
  function progress() {return Math.max(0,Math.min(1,(scrollY-top+innerHeight*.5)/(height-innerHeight*.4)));}
  function draw(now, still) {
    var aspect=width/height, ref=Math.min(1,4.66307658/5.5), scale=1.15*Math.min(1,aspect,ref);
    var targetAngle=-progress()*Math.PI*1.15;
    rotation=still?targetAngle:rotation+(targetAngle-rotation)*.26;
    gl.bindFramebuffer(gl.FRAMEBUFFER,target);gl.useProgram(program);gl.enable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D,spriteTexture);
    attributes.forEach(function(a){gl.bindBuffer(gl.ARRAY_BUFFER,a[1]);gl.enableVertexAttribArray(a[0]);gl.vertexAttribPointer(a[0],a[2],gl.FLOAT,false,0,0);});
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uniforms.uTime,motion.matches?0:now/1000);
    gl.uniform1f(uniforms.uScale,scale);gl.uniform1f(uniforms.uRotation,rotation);
    gl.uniform1f(uniforms.uAspect,aspect);gl.uniform1f(uniforms.uDpr,dpr);
    gl.uniform1f(uniforms.uPtScale,scale/(1.15*ref)*height/1080);
    gl.uniform1f(uniforms.uAlphaScale,total/count);
    gl.drawArrays(gl.POINTS,0,count);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.useProgram(composite);gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D,targetTexture);gl.bindBuffer(gl.ARRAY_BUFFER,quad);
    var point=gl.getAttribLocation(composite,'point');gl.enableVertexAttribArray(point);gl.vertexAttribPointer(point,2,gl.FLOAT,false,0,0);
    gl.drawArrays(gl.TRIANGLES,0,6);
    host.classList.add('is-ready');
  }
  function stop() {cancelAnimationFrame(frame);frame=0;}
  function tick(now) {frame=0;draw(now,false);frame=requestAnimationFrame(tick);}
  function update() {
    stop();
    if (!loaded||lost||!visible||document.hidden||document.documentElement.classList.contains('nm-run-open')) return;
    draw(performance.now(),true);
    if (!motion.matches) frame=requestAnimationFrame(tick);
  }
  function load() {
    if (loading||loaded) return;
    loading=true;
    fetch('/models/nm-cloud.bin').then(function (r) {if(!r.ok)throw new Error('Cloud unavailable');return r.arrayBuffer();})
      .then(function (b) {data=b;setup();})
      .catch(function () {host.classList.remove('is-ready');loaded=false;})
      .finally(function () {loading=false;});
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {visible=entries[0].isIntersecting;if(visible)load();update();},{rootMargin:'200px'}).observe(host);
  } else {visible=true;load();}
  new ResizeObserver(function () {if(loaded&&!lost){resize();update();}}).observe(host);
  addEventListener('resize',function () {if(loaded&&!lost){resize();update();}},{passive:true});
  addEventListener('scroll',function () {if(loaded&&!lost&&visible&&motion.matches&&!frame)frame=requestAnimationFrame(function(now){frame=0;draw(now,true);});},{passive:true});
  document.addEventListener('visibilitychange',update);
  addEventListener('nm:gamechange',update);motion.addEventListener('change',update);
  addEventListener('pagehide',stop);addEventListener('pageshow',function(){if(loaded&&!lost){resize();update();}});
  canvas.addEventListener('webglcontextlost',function(e){e.preventDefault();lost=true;stop();host.classList.remove('is-ready');});
  canvas.addEventListener('webglcontextrestored',function(){lost=false;loaded=false;try{setup();}catch(_){host.classList.remove('is-ready');}});
})();
