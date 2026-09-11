import test from 'node:test';
import assert from 'node:assert/strict';
import {Runner,PLAYER_X,GROUND,runFrame} from '../js/nm-run-engine.mjs';
const advance=(g,seconds)=>{for(let n=0;n<seconds*120;n++)g.update(1/120);};
const fresh=()=>{const g=new Runner({random:()=>.5});g.start();g.next=100;return g;};
test('a ground obstacle ends a run and freezes the score',()=>{const g=fresh();g.spawn('storm').x=PLAYER_X+4;g.update(1/120);assert.equal(g.state,'hit');const score=g.score;advance(g,2);assert.equal(g.state,'over');assert.equal(g.score,score);});
test('a held jump clears a lightning bolt and lands without clipping it',()=>{const g=fresh();g.spawn('bolt').x=PLAYER_X+98;g.jump();advance(g,.9);assert.equal(g.state,'running');assert.equal(g.y,0);});
test('birds and paper planes hit a standing runner but allow ducking underneath',()=>{for(const kind of ['bird','plane']){const standing=fresh();standing.spawn(kind).x=PLAYER_X;standing.update(1/120);assert.equal(standing.state,'hit',kind);const ducking=fresh();ducking.setDuck(true);ducking.spawn(kind).x=PLAYER_X;advance(ducking,1);assert.equal(ducking.state,'running',kind);}});
test('stars award points once and are removed after collection',()=>{const g=fresh();g.tokens.push({x:PLAYER_X+22,y:GROUND-30,collected:false});g.update(1/120);assert.equal(g.stars,1);assert.equal(g.tokens.length,0);const score=g.score;advance(g,.01);assert.equal(g.stars,1);assert.ok(score>=25);});
test('pause stops distance and physics and clears held controls',()=>{const g=fresh();g.jump();advance(g,.1);g.setDuck(true);g.pause();const y=g.y,d=g.distance;advance(g,10);assert.equal(g.y,y);assert.equal(g.distance,d);assert.equal(g.duck,false);assert.equal(g.jumpHeld,false);g.resume();advance(g,.1);assert.ok(g.distance>d);});
test('restarting discards prior obstacles, stars and held input',()=>{const g=fresh();g.spawn('storm').x=PLAYER_X;g.update(1/120);advance(g,1);g.stars=3;g.setDuck(true);g.start();assert.equal(g.state,'running');assert.equal(g.stars,0);assert.equal(g.score,0);assert.equal(g.obstacles.length,0);assert.equal(g.duck,false);});
test('resizing preserves the active run and keeps physics independent of viewport',()=>{const a=fresh(),b=fresh();a.jump();b.jump();advance(a,.1);advance(b,.1);b.width=420;advance(a,.2);advance(b,.2);assert.equal(a.y,b.y);assert.equal(a.distance,b.distance);});

test('the run cycle shows eight distinct frames and loops with distance',()=>{
  assert.deepEqual(Array.from({length:8},(_,i)=>runFrame(i*14)),[1,2,3,4,5,6,7,8]);
  assert.equal(runFrame(112),1);assert.equal(runFrame(56),5);
});
