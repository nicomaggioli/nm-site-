// Deterministic physics, independent of rendering and browser timing.
export const GROUND = 238;
export const PLAYER_X = 72;
export const KINDS = {
  crate: {w:34,h:34}, barrel:{w:30,h:38}, rock:{w:38,h:25},
  bush:{w:44,h:28}, fence:{w:48,h:31}, cactus:{w:33,h:48},
  low:{w:118,h:84}
};
export function overlaps(a,b) {
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}
export class Runner {
  constructor({width=800,random=Math.random}={}) { this.width=width;this.random=random;this.reset(); }
  reset() {
    this.state='ready';this.time=0;this.distance=0;this.coins=0;this.speed=210;
    this.y=0;this.vy=0;this.duck=false;this.jumpHeld=false;this.landed=0;
    this.obstacles=[];this.tokens=[];this.next=1.8;this.deadTime=0;
  }
  get score() { return Math.floor(this.distance/12)+this.coins*25; }
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
    return o.kind==='low'?{x:o.x+6,y:GROUND-81,w:o.w-12,h:28}:
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
      const pool=this.distance>650?Object.keys(KINDS):['crate','barrel','rock','bush','fence'];
      const kind=pool[Math.floor(this.random()*pool.length)];const o=this.spawn(kind);
      if(kind!=='low'&&this.random()<.7)this.tokens.push({x:o.x+o.w/2,y:GROUND-o.h-32,collected:false});
      this.next=(o.w+80)/this.speed+.95+this.random()*.45;
    }
    const p=this.playerBox();
    for(const o of this.obstacles){o.x-=dx;if(overlaps(p,this.obstacleBox(o))){this.state='hit';this.deadTime=0;}}
    for(const coin of this.tokens){coin.x-=dx;if(!coin.collected&&overlaps(p,{x:coin.x-9,y:coin.y-10,w:18,h:20})){coin.collected=true;this.coins++;}}
    this.obstacles=this.obstacles.filter(o=>o.x+o.w>-10);
    this.tokens=this.tokens.filter(c=>c.x>-20&&!c.collected);
  }
}
