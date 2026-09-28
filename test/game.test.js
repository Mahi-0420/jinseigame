import test from 'node:test';
import assert from 'node:assert/strict';
import { act, availableChoices, botChoice, createGame, makeBoard, player, salary, start, worth } from '../game.js';
import { events } from '../events.js';
function setup(count=2) { const host=player('ホスト'),g=createGame('ABCDEF',host); for(let i=1;i<count;i++)g.players.push(player(`参加者${i}`)); start(g,host.id); return g; }
function land(g,type,rng=(min)=>min) { const p=g.players[g.turn]; const pos=g.board.findIndex((c,i)=>i>0 && c.type===type); p.position=pos-1; act(g,p.id,'roll',undefined,rng); return p; }
function choose(g,id,rng) { act(g,g.players[g.turn].id,'choose',id,rng); }
test('host authorization and minimum players',()=>{const p=player('H'),g=createGame('X',p);assert.throws(()=>start(g,'other'),/ホスト/);assert.throws(()=>start(g,p.id),/2人以上/);});
test('72-cell randomized boards retain balanced chapters and endpoints',()=>{
  const a=makeBoard((min)=>min),b=makeBoard((min,max)=>max-1);
  assert.equal(a.length,72);assert.equal(a[0].type,'start');assert.equal(a.at(-1).type,'goal');assert.notDeepEqual(a,b);
  for(let i=0;i<7;i++){const chapter=a.slice(i*10+1,i*10+11);assert.equal(chapter.filter(c=>c.type==='event').length,[2,5].includes(i)?2:3);assert.equal(chapter.filter(c=>c.type==='divorce').length,[2,5].includes(i)?1:0); for(const type of ['career','family','invest','learn','health','leisure','salary'])assert.equal(chapter.filter(c=>c.type===type).length,1);}
});
test('server guards turns and reuses the choice phase until a valid action',()=>{
 const g=setup();assert.throws(()=>act(g,g.players[1].id,'roll'),/手番/);land(g,'career');
 assert.throws(()=>act(g,g.players[0].id,'roll'),/選択/);assert.throws(()=>choose(g,'not-real'),/選択/);assert.equal(g.turn,0);
 choose(g,'engineer');assert.equal(g.players[0].job,'engineer');assert.equal(g.players[0].cash,220);assert.equal(g.turn,1);
});
test('salary is awarded for each passed salary cell',()=>{
 const g=setup(),p=g.players[0];g.board[1].type='salary';g.board[2].type='salary';g.board[3].type='learn';
 p.salaryBonus=8;p.sideJob=true;let rates=[8,14];act(g,p.id,'roll',undefined,(min)=>min===1?3:rates.shift());assert.equal(p.cash,300+42+73);assert.equal(g.pending.earned,115);assert.equal(salary(p),52);assert.ok(g.log.some(l=>l.includes('0.8倍')));assert.ok(g.log.some(l=>l.includes('1.4倍')));
});
test('investments require cash and one-unit sale and bonds are valued correctly',()=>{
 const g=setup(),p=g.players[0];p.cash=10;land(g,'invest');assert.throws(()=>choose(g,'buy'),/所持金/);assert.equal(g.turn,0);
 p.cash=300;choose(g,'bond');assert.equal(p.bonds,1);assert.equal(worth(p,g),320);
 g.turn=0;land(g,'invest');choose(g,'buyone');assert.equal(p.shares,1);g.turn=0;land(g,'invest');choose(g,'sellone');assert.equal(p.shares,0);assert.equal(p.cash,200);
});
test('house purchase borrows missing money and rounds charge interest',()=>{
 const g=setup(),p=g.players[0];p.cash=10;land(g,'family');choose(g,'home');assert.equal(p.home,true);assert.equal(p.debt,210);
 land(g,'health');choose(g,'skip');assert.equal(p.debt,221);assert.equal(worth(p,g),39);
});
test('events do not repeat until all stories have been drawn and never repeat at refill boundary',()=>{
 const g=setup(),seen=[];
 for(let i=0;i<events.length*2;i++){land(g,'event');seen.push(g.pending.eventId);choose(g,'a',min=>min);}
 assert.equal(new Set(seen.slice(0,events.length)).size,events.length);assert.equal(new Set(seen.slice(events.length)).size,events.length);assert.notEqual(seen[events.length-1],seen[events.length]);
});
test('each event has two valid choices and all effects resolve for both random outcomes',()=>{
 for(const event of events)for(const option of event.options)for(const random of [0,1]){
  const g=setup(),p=g.players[0];g.phase='choice';g.pending={type:'event',eventId:event.id,title:event.title};
  choose(g,option.id,(min,max)=>max===2?random:min);assert.equal(g.turn,1);assert.ok(p.cash>=0);assert.ok(p.debt>=0);assert.ok(p.happiness>=0);assert.equal(g.history[0].selection,option.name);
 }
});
test('insurance halves covered loss, and shared history records exact deltas',()=>{
 const g=setup(),p=g.players[0];p.insured=true;g.phase='choice';g.pending={type:'event',eventId:'storm',title:'嵐のあと'};
 choose(g,'a');assert.equal(p.cash,270);assert.equal(g.history[0].changes.cash,-30);assert.match(g.history[0].detail,/半額/);assert.equal(g.history[0].name,p.name);
});
test('learning, side jobs, happiness floor and home sale are meaningful choices',()=>{
 const g=setup(),p=g.players[0];land(g,'learn');choose(g,'qualification');assert.equal(salary(p),40);
 g.turn=0;land(g,'career');choose(g,'sidejob');assert.equal(salary(p),52);
 g.turn=0;land(g,'leisure');choose(g,'weekendjob');assert.equal(p.happiness,0);
 p.home=true;g.turn=0;land(g,'family');const before=p.cash;choose(g,'sellhome');assert.equal(p.home,false);assert.equal(p.cash,before+240);
});
test('six AI players can resolve every choice and finish with one-time bonuses',()=>{
 const g=setup(6);let seed=9123;const rng=(min,max)=>{seed=(seed*1664525+1013904223)>>>0;return min+seed%(max-min);};
 let count=0;while(g.status==='playing' && count++<1000){const p=g.players[g.turn];act(g,p.id,g.phase==='roll'?'roll':'choose',g.phase==='choice'?botChoice(g,rng):undefined,rng);}
 assert.equal(g.status,'finished');assert.ok(g.players.every(p=>p.finished));assert.equal(g.history.filter(e=>e.title==='人生のボーナス').length,6);
 const before=g.players[0].cash;assert.throws(()=>act(g,g.players[0].id,'roll'),/進行/);assert.equal(g.players[0].cash,before);
});
test('all offered non-disabled choices have valid effects',()=>{
 for(const type of ['career','family','invest','learn','health','leisure']){
  const base=setup();land(base,type);for(const option of availableChoices(base).filter(c=>!c.disabled)){
   const g=structuredClone(base);choose(g,option.id,min=>min);assert.equal(g.turn,1);assert.equal(g.history[0].selection,option.name);
  }
 }
});

test('landing on payday pays once with rounded salary multiplier',()=>{
 for(const rate of [8,11,14]) {
  const g=setup(),p=g.players[0];g.board[1].type='salary';
  act(g,p.id,'roll',undefined,(min)=>min===8?rate:min);
  assert.equal(p.cash,300+Math.round(32*rate/10));assert.equal(g.turn,1);
  assert.equal(g.history[0].changes.cash,Math.round(32*rate/10));
  assert.match(g.history[0].detail,new RegExp((rate/10).toFixed(1)+'倍'));
 }
});

test('divorce removes spouse and children on landing without changing home or money',()=>{
 for(const married of [true,false]) {
  const g=setup(),p=g.players[0];p.married=married;p.children=2;p.home=true;
  g.board[1].type='divorce';act(g,p.id,'roll',undefined,min=>min);
  assert.equal(p.married,false);assert.equal(p.children,married?0:2);assert.equal(p.home,true);assert.equal(p.cash,300);assert.equal(g.turn,1);assert.equal(g.phase,'roll');
  assert.equal(g.history[0].title,'離婚');
  g.turn=0;land(g,'family');choose(g,'marry');assert.equal(p.married,true);assert.equal(p.children,married?0:2);
 }
 const g=setup(),p=g.players[0];p.married=true;p.children=2;g.board[1].type='divorce';g.board[2].type='learn';
 act(g,p.id,'roll',undefined,()=>2);assert.equal(p.married,true);assert.equal(p.children,2);
});
test('divorced players receive happiness bonus but no marriage or child bonuses',()=>{
 const g=setup(),p=g.players[0];p.married=true;p.children=2;p.happiness=3;
 g.board[1].type='divorce';act(g,p.id,'roll',undefined,min=>min);
 g.players[1].finished=true;g.turn=0;p.position=70;
 act(g,p.id,'roll',undefined,min=>min);
 assert.equal(g.status,'finished');assert.equal(p.cash,300+150+15);
});
