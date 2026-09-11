// Deterministic physics, independent of rendering and browser timing.
export const GROUND = 212;
export const VIEW_HEIGHT = 340;
export const runFrame = distance => 1 + (Math.floor(distance / 14) % 8);
export const PLAYER_X = 72;
export const KINDS = {
  storm:{w:44,h:36}, bolt:{w:26,h:52}, gust:{w:38,h:40}, hail:{w:38,h:30},
  bird:{w:64,h:32,clearance:32}, plane:{w:58,h:24,clearance:35}
};
export function overlaps(a,b) {
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}
export class Runner {
  constructor({width=800,random=Math.random}={}) { this.width=width;this.random=random;this.reset(); }
  reset() {
    this.state='ready';this.time=0;this.distance=0;this.stars=0;this.speed=210;
    this.y=0;this.vy=0;this.duck=false;this.jumpHeld=false;this.landed=0;
    this.obstacles=[];this.tokens=[];this.next=1.8;this.deadTime=0;
  }
  get score() { return Math.floor(this.distance/12)+this.stars*25; }
  start() { if(this.state==='over')this.reset();if(this.state==='ready')this.state='running'; }
  jump() {
    if(this.state==='ready'||this.state==='over')this.start();
    if(this.state==='running'&&this.y===0&&!this.duck) {this.vy=-450;this.jumpHeld=true;}
  }
  releaseJump() {this.jumpHeld=false;}
  setDuck(value) {this.duck=value;}
  pause() {if(this.state==='running'){this.state='paused';this.jumpHeld=false;this.duck=false;}}
  resume() {if(this.state==='paused')this.state='running';}
  playerBox() {const h=this.duck&&this.y===0?30:58;return {x:PLAYER_X+9,y:GROUND+this.y-h,w:26,h:h-3};}
  obstacleBox(o) {
    return o.clearance?{x:o.x+7,y:GROUND-o.clearance-o.h+4,w:o.w-14,h:o.h-8}:
      {x:o.x+5,y:GROUND-o.h+5,w:o.w-10,h:o.h-6};
  }
  spawn(kind) {
    const d=KINDS[kind];const o={kind,x:this.width+24,...d};this.obstacles.push(o);return o;
  }
  update(dt) {
    if(this.state==='hit') {this.deadTime+=dt;if(this.deadTime>=.55)this.state='over';return;}
    if(this.state!=='running')return;
    // The renderer steps at 120 Hz. Bound external callers to avoid tunneling.
    dt=Math.min(dt,1/30);this.time+=dt;this.speed=Math.min(330,210+this.distance/130);
    const dx=this.speed*dt;this.distance+=dx;this.landed=Math.max(0,this.landed-dt);
    if(this.y<0||this.vy<0) {
      this.vy+=(this.vy<0&&this.jumpHeld?1100:1550)*(this.duck?1.65:1)*dt;
      this.y+=this.vy*dt;
      if(this.y>=0){this.y=0;this.vy=0;this.landed=.075;}
    }
    this.next-=dt;
    if(this.next<=0) {
      const pool=this.distance>650?Object.keys(KINDS):['storm','bolt','gust','hail'];
      const kind=pool[Math.floor(this.random()*pool.length)];const o=this.spawn(kind);
      if(!o.clearance&&this.random()<.7)this.tokens.push({x:o.x+o.w/2,y:GROUND-o.h-32,collected:false});
      this.next=(o.w+80)/this.speed+.95+this.random()*.45;
    }
    const p=this.playerBox();
    for(const o of this.obstacles){o.x-=dx;if(overlaps(p,this.obstacleBox(o))){this.state='hit';this.deadTime=0;}}
    for(const star of this.tokens){star.x-=dx;if(!star.collected&&overlaps(p,{x:star.x-9,y:star.y-10,w:18,h:20})){star.collected=true;this.stars++;}}
    this.obstacles=this.obstacles.filter(o=>o.x+o.w>-10);
    this.tokens=this.tokens.filter(c=>c.x>-20&&!c.collected);
  }
}
