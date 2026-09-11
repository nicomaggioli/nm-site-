import test from 'node:test';
import assert from 'node:assert/strict';
import {Runner,PLAYER_X,GROUND} from '../js/nm-run-engine.mjs';
const advance=(g,seconds)=>{for(let n=0;n<seconds*120;n++)g.update(1/120);};
const fresh=()=>{const g=new Runner({random:()=>.5});g.start();g.next=100;return g;};
test('a low bird ends a run and freezes the score',()=>{const g=fresh();g.spawn('bird_low').x=PLAYER_X+4;g.update(1/120);assert.equal(g.state,'hit');const score=g.score;advance(g,2);assert.equal(g.state,'over');assert.equal(g.score,score);});
test('a held jump clears a low-flying bird and lands without clipping it',()=>{const g=fresh();g.spawn('bird_low').x=PLAYER_X+98;g.jump();advance(g,.9);assert.equal(g.state,'running');assert.equal(g.y,0);});
test('a high bird hits a standing runner but allows ducking underneath',()=>{const standing=fresh();standing.spawn('bird_high').x=PLAYER_X;standing.update(1/120);assert.equal(standing.state,'hit');const ducking=fresh();ducking.setDuck(true);ducking.spawn('bird_high').x=PLAYER_X;advance(ducking,1);assert.equal(ducking.state,'running');});
test('ducking cannot avoid a low bird',()=>{const g=fresh();g.setDuck(true);g.spawn('bird_low').x=PLAYER_X;g.update(1/120);assert.equal(g.state,'hit');});
test('stars award points once and are removed after collection',()=>{const g=fresh();g.tokens.push({x:PLAYER_X+22,y:GROUND-30,collected:false});g.update(1/120);assert.equal(g.stars,1);assert.equal(g.tokens.length,0);const score=g.score;advance(g,.01);assert.equal(g.stars,1);assert.ok(score>=25);});
test('pause stops distance and physics and clears held controls',()=>{const g=fresh();g.jump();advance(g,.1);g.setDuck(true);g.pause();const y=g.y,d=g.distance;advance(g,10);assert.equal(g.y,y);assert.equal(g.distance,d);assert.equal(g.duck,false);assert.equal(g.jumpHeld,false);g.resume();advance(g,.1);assert.ok(g.distance>d);});
test('restarting discards prior obstacles, stars and held input',()=>{const g=fresh();g.spawn('bird_low').x=PLAYER_X;g.update(1/120);advance(g,1);g.stars=3;g.setDuck(true);g.start();assert.equal(g.state,'running');assert.equal(g.stars,0);assert.equal(g.score,0);assert.equal(g.obstacles.length,0);assert.equal(g.duck,false);});
test('resizing preserves the active run and keeps physics independent of viewport',()=>{const a=fresh(),b=fresh();a.jump();b.jump();advance(a,.1);advance(b,.1);b.width=420;advance(a,.2);advance(b,.2);assert.equal(a.y,b.y);assert.equal(a.distance,b.distance);});

test('the encounter pool contains only birds and introduces high birds later',()=>{
  const low=new Runner({random:()=>.99});low.start();advance(low,2);assert.equal(low.obstacles[0].kind,'bird_low');
  const high=fresh();high.distance=700;high.random=()=>.99;high.next=0;high.update(1/120);assert.equal(high.obstacles[0].kind,'bird_high');
});

test('a high bird carries a star underneath that the ducking player collects safely',()=>{
  const g=fresh();g.distance=700;g.random=()=>.99;g.next=0;g.update(1/120);
  const bird=g.obstacles[0],star=g.tokens[0];
  assert.equal(bird.kind,'bird_high');assert.equal(star.duck,true);
  assert.ok(star.y-12>g.obstacleBox(bird).y+g.obstacleBox(bird).h);
  const shift=bird.x-(PLAYER_X+100);bird.x-=shift;star.x-=shift;
  g.next=100;g.setDuck(true);advance(g,.8);
  assert.equal(g.state,'running');assert.equal(g.stars,1);assert.equal(g.tokens.length,0);
});

test('duck stars reward crouching, and a bird hit cannot award a star',()=>{
  for(const collide of [false,true]){
    const g=fresh();g.tokens.push({x:PLAYER_X+22,y:GROUND-24,duck:true,collected:false});
    if(collide)g.spawn('bird_high').x=PLAYER_X;
    g.update(1/120);assert.equal(g.stars,0);assert.equal(g.state,collide?'hit':'running');
  }
});
