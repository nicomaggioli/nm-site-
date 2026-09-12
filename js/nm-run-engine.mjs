// Deterministic physics, independent of rendering and browser timing.
export const GROUND = 212;
export const VIEW_HEIGHT = 340;
export const PLAYER_X = 72;
export const DUCK_HEIGHT = 36;
export const KINDS = {
  bird_low:{w:46,h:28,clearance:34,action:'jump'},
  bird_high:{w:46,h:28,clearance:58,action:'duck'},
  plane:{w:64,h:44,clearance:42,action:'duck'},
  balloon:{w:38,h:58,clearance:12,action:'jump'}
};
const STAGES = [
  {at:0,name:'Clear skies',notice:'Jump low birds',pool:['bird_low'],intro:'bird_low'},
  {at:12,name:'Bird crossing',notice:'High birds ahead. Duck!',pool:['bird_low','bird_high'],intro:'bird_high'},
  {at:25,name:'Air traffic',notice:'Paper planes ahead. Duck!',pool:['bird_low','bird_high','plane'],intro:'plane'},
  {at:45,name:'Balloon drift',notice:'Balloons ahead. Jump!',pool:['bird_low','bird_high','plane','balloon'],intro:'balloon'},
  {at:70,name:'Shooting stars',notice:'Shooting stars are worth 3!',pool:['bird_low','bird_high','plane','balloon','shooting_star'],intro:'shooting_star'},
  {at:105,name:'Rush hour',notice:'Rush hour. Keep up!',pool:['bird_low','bird_high','plane','balloon','shooting_star']}
];
export function difficultyAt(seconds) {
  const t=Math.max(0,seconds);
  let stage=0;
  while(stage+1<STAGES.length&&t>=STAGES[stage+1].at)stage++;
  return {...STAGES[stage],stage,level:stage+1+(stage===5?Math.floor((t-105)/30):0),
    // Smooth ramps with fair limits: no sudden velocity jump at an unlock.
    speed:210+150*(1-Math.exp(-t/75)),
    recovery:1.35-.5*(1-Math.exp(-t/90))};
}
export function overlaps(a,b) {
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}
export class Runner {
  constructor({width=800,random=Math.random}={}) { this.width=width;this.random=random;this.reset(); }
  reset() {
    this.state='ready';this.time=0;this.distance=0;this.stars=0;this.difficulty=difficultyAt(0);this.speed=this.difficulty.speed;
    this.y=0;this.vy=0;this.duck=false;this.jumpHeld=false;this.landed=0;
    this.obstacles=[];this.tokens=[];this.next=1.8;this.deadTime=0;this.introduced=-1;this.bonusTime=-1;
  }
  get score() { return Math.floor(this.distance/12)+this.stars*25; }
  get level() { return this.difficulty.level; }
  start() { if(this.state==='over')this.reset();if(this.state==='ready')this.state='running'; }
  jump() {
    if(this.state==='ready'||this.state==='over')this.start();
    if(this.state==='running'&&this.y===0&&!this.duck) {this.vy=-450;this.jumpHeld=true;}
  }
  releaseJump() {this.jumpHeld=false;}
  setDuck(value) {this.duck=value;}
  pause() {if(this.state==='running'){this.state='paused';this.jumpHeld=false;this.duck=false;}}
  resume() {if(this.state==='paused')this.state='running';}
  playerBox() {const h=this.duck&&this.y===0?DUCK_HEIGHT:58;return {x:PLAYER_X+9,y:GROUND+this.y-h,w:26,h:h-3};}
  obstacleBounds(o) {
    const bob=o.kind==='balloon'?Math.sin(o.age*2)*3:0;
    return {x:o.x,y:GROUND-o.clearance-o.h+bob,w:o.w,h:o.h};
  }
  obstacleBox(o) {
    const r=this.obstacleBounds(o);
    if(o.kind==='plane')return {x:r.x+8,y:r.y+20,w:46,h:19};
    if(o.kind==='balloon')return {x:r.x+5,y:r.y+3,w:28,h:49};
    // Long wing tips remain forgiving during a flap.
    return {x:o.x+9,y:GROUND-o.clearance-16,w:29,h:18};
  }
  spawn(kind) {
    const d=KINDS[kind];
    if(!d)throw new Error('Unknown Cloud Run obstacle: '+kind);
    const o={kind,x:this.width+24,age:0,...d};this.obstacles.push(o);return o;
  }
  encounter(kind) {
    if(kind==='shooting_star') {
      // A bonus occupies its own encounter slot. It never shares a hazard's
      // jump/duck decision, and travels with the track so it cannot catch one.
      const x=this.width+24,target=PLAYER_X+22;
      this.tokens.push({kind,x,y:60,startX:x,startY:60,slope:(GROUND-90-60)/(x-target),value:3,collected:false});
      return 24;
    }
    const o=this.spawn(kind),duckStar=o.action==='duck';
    if(duckStar||this.random()<.7)this.tokens.push({x:o.x+o.w/2,y:GROUND-(duckStar?24:96),duck:duckStar,collected:false});
    return o.w;
  }
  update(dt) {
    if(this.state==='hit') {this.deadTime+=dt;if(this.deadTime>=.55)this.state='over';return;}
    if(this.state!=='running')return;
    // The renderer steps at 120 Hz. Bound external callers to avoid tunneling.
    dt=Math.min(Math.max(0,dt),1/30);this.time+=dt;this.difficulty=difficultyAt(this.time);this.speed=this.difficulty.speed;
    const dx=this.speed*dt;this.distance+=dx;this.landed=Math.max(0,this.landed-dt);
    if(this.y<0||this.vy<0) {
      this.vy+=(this.vy<0&&this.jumpHeld?1100:1550)*(this.duck?1.65:1)*dt;
      this.y+=this.vy*dt;
      if(this.y>=0){this.y=0;this.vy=0;this.landed=.075;}
    }
    this.next-=dt;
    if(this.next<=0) {
      const d=this.difficulty;
      const kind=d.stage>this.introduced&&d.intro?d.intro:d.pool[Math.min(d.pool.length-1,Math.floor(this.random()*d.pool.length))];
      this.introduced=d.stage;
      const width=this.encounter(kind);
      // All threats share a scroll speed. Keep a full landing/reaction window
      // after each body passes, even for balloon -> plane at maximum speed.
      this.next=(width+42)/this.speed+d.recovery+this.random()*.3;
    }
    const p=this.playerBox();
    for(const o of this.obstacles){o.x-=dx;o.age+=dt;if(overlaps(p,this.obstacleBox(o))){this.state='hit';this.deadTime=0;}}
    for(const star of this.tokens){
      star.x-=dx;
      if(star.kind==='shooting_star')star.y=star.startY+(star.startX-star.x)*star.slope;
      if(this.state==='running'&&!star.collected&&(!star.duck||(this.duck&&this.y===0))&&overlaps(p,{x:star.x-9,y:star.y-10,w:18,h:20})){
        star.collected=true;this.stars+=star.value||1;
        if(star.kind==='shooting_star')this.bonusTime=this.time;
      }
    }
    this.obstacles=this.obstacles.filter(o=>o.x+o.w>-10);
    this.tokens=this.tokens.filter(c=>c.x>-80&&!c.collected);
  }
}
