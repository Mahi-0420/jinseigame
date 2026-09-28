import { randomInt, randomUUID } from 'node:crypto';
import { events } from './events.js';
export const jobs = {
  company: { name: '会社員', salary: 32, cost: 0 },
  designer: { name: 'デザイナー', salary: 42, cost: 50 },
  engineer: { name: 'エンジニア', salary: 48, cost: 80 },
  chef: { name: '料理人', salary: 52, cost: 110 },
  business: { name: '起業家', salary: 65, cost: 180 },
  doctor: { name: '医師', salary: 80, cost: 280 },
};
export function shuffle(items, rng = randomInt) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = rng(0, i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function makeBoard(rng = randomInt) {
  const types = ['start'];
  // Each chapter offers all major choices, but in a different order.
  for (let chapter = 0; chapter < 7; chapter++) types.push(...shuffle(['event','career','family','invest','learn','health','leisure','event',chapter===2 || chapter===5?'divorce':'event','salary'],rng));
  types.push('goal'); return types.map((type, position) => ({ type, position }));
}
export function player(name, bot = false) {
  return { id: randomUUID(), name: String(name || 'ゲスト').trim().slice(0,16) || 'ゲスト', bot, position:0, cash:300, debt:0, shares:0, bonds:0, home:false, married:false, children:0, job:'company', salaryBonus:0, happiness:0, insured:false, sideJob:false, finished:false };
}
export function createGame(code, host, rng = randomInt) {
  return { code, hostId:host.id, players:[host], board:makeBoard(rng), eventDeck:[], lastEventId:null, status:'waiting', turn:0, phase:'roll', price:40, round:1, log:[], history:[], lastRoll:null, pending:null, updatedAt:Date.now() };
}
export const age = position => 18 + Math.floor(position * 47 / 71);
export const salary = p => jobs[p.job].salary + p.salaryBonus + (p.sideJob ? 12 : 0);
export const worth = (p,g) => p.cash + p.shares*g.price + p.bonds*120 + (p.home ? 260 : 0) - p.debt;
function record(g, message) { g.log.unshift(message); g.log = g.log.slice(0,80); }
function pay(p, amount) { p.cash -= amount; if (p.cash < 0) { p.debt -= p.cash; p.cash = 0; } }
const state = p => ({ cash:p.cash, debt:p.debt, happiness:p.happiness, salary:salary(p), shares:p.shares, bonds:p.bonds });
function result(g,p,title,selection,detail,before) {
  const after = state(p); const changes = Object.fromEntries(Object.keys(before).map(k=>[k,after[k]-before[k]]));
  const entry = { id:randomUUID(), player:g.players.indexOf(p), name:p.name, title, selection, detail, changes, round:g.round };
  g.history.unshift(entry); g.history = g.history.slice(0,80);
  record(g,`${p.name}：${title} → ${selection}。${detail}`);
}
function draw(g,rng) {
  if (!g.eventDeck.length) {
    g.eventDeck = shuffle(events.map(e=>e.id),rng);
    if (g.eventDeck.at(-1) === g.lastEventId) [g.eventDeck[0],g.eventDeck[g.eventDeck.length-1]] = [g.eventDeck.at(-1),g.eventDeck[0]];
  }
  g.lastEventId = g.eventDeck.pop(); return events.find(e=>e.id === g.lastEventId);
}
const option = (id,name,desc,effect={},disabled=false) => ({id,name,desc,effect,disabled});
export function availableChoices(g) {
  if (g.phase !== 'choice') return [];
  const p = g.players[g.turn], type = g.pending.type;
  if (type === 'event') return events.find(e=>e.id === g.pending.eventId).options;
  let list=[];
  if (type === 'career') list = [
    ...Object.entries(jobs).filter(([k])=>k!==p.job).map(([k,j])=>option(k,j.name,`費用${j.cost}万円 / 基本給${j.salary}万円`,{cash:-j.cost,job:k})),
    option('sidejob','副業を始める','準備100万円 / 給料ごとに+12万円',{cash:-100,sideJob:true},p.sideJob),
    option('raise','昇進試験に挑戦','受験20万円 / 50%で給料に永久+15万円',{cash:-20,promotion:15}),
  ];
  if (type === 'family') list = [
    option('marry','結婚する','60万円 / 最後にお祝い100万円',{cash:-60,married:true},p.married),
    option('child','子どもを迎える','40万円 / 最後にお祝い70万円',{cash:-40,children:1},!p.married || p.children>=3),
    option('home','住宅を購入','220万円 / 評価額260万円',{cash:-220,home:true},p.home),
    option('sellhome','住宅を売却','現金+240万円 / 賃貸に戻る',{cash:240,home:false},!p.home),
    option('familytrip','大切な人と旅行','35万円 / 幸福+10',{cash:-35,happiness:10}),
  ];
  if (type === 'invest') list = [
    option('buyone','投資信託を1口購入',`${g.price}万円`,{cash:-g.price,shares:1},p.cash<g.price),
    option('buy','投資信託を2口購入',`${g.price*2}万円`,{cash:-g.price*2,shares:2},p.cash<g.price*2),
    option('sellone','1口だけ売却',`${g.price}万円を受け取る`,{cash:g.price,shares:-1},p.shares<1),
    option('sell','すべて売却',`${p.shares*g.price}万円を受け取る`,{cash:p.shares*g.price,shares:-p.shares},p.shares<1),
    option('bond','満期型の債券を購入','100万円 / 評価額120万円・途中売却不可',{cash:-100,bonds:1},p.cash<100),
    option('repay','借入を返済',`最大${Math.min(p.debt,p.cash)}万円`,{cash:-Math.min(p.debt,p.cash),debt:-Math.min(p.debt,p.cash)},!p.debt || !p.cash),
  ];
  if (type === 'learn') list = [
    option('qualification','資格を取得','40万円 / 給料に永久+8万円',{cash:-40,salaryBonus:8}),
    option('graduate','大学院で学ぶ','100万円 / 給料に永久+20万円',{cash:-100,salaryBonus:20}),
    option('read','読書を楽しむ','10万円 / 幸福+3',{cash:-10,happiness:3}),
  ];
  if (type === 'health') list = [
    option('insurance','トラブル保険に加入','50万円 / 保険対象イベントの費用を半額に',{cash:-50,insured:true},p.insured),
    option('fitness','運動習慣をつける','20万円 / 幸福+7',{cash:-20,happiness:7}),
    option('rest','ゆっくり休む','無料 / 幸福+3',{happiness:3}),
  ];
  if (type === 'leisure') list = [
    option('worldtrip','世界を旅する','70万円 / 幸福+20',{cash:-70,happiness:20}),
    option('hobby','趣味を深める','25万円 / 幸福+8',{cash:-25,happiness:8}),
    option('volunteer','地域活動に参加','無料 / 幸福+4',{happiness:4}),
    option('weekendjob','休日のアルバイト','現金+35万円 / 幸福−2',{cash:35,happiness:-2}),
  ];
  return [...list,option('skip','今回は見送る','今の生活を続ける')];
}
function applyEffect(p,e,rng) {
  const notes=[];
  if (e.cash) pay(p,-e.cash);
  if (e.loss) { const amount = p.insured ? Math.ceil(e.loss/2) : e.loss; pay(p,amount); notes.push(`トラブル費用${amount}万円${p.insured?'（保険で半額）':''}`); }
  if (e.gamble) { const amount=e.gamble[rng(0,2)]; pay(p,-amount); notes.push(amount>=0?`挑戦成功！ +${amount}万円`:`挑戦失敗。${-amount}万円の損失`); }
  if (e.promotion) { const success=rng(0,2)===0; if (success) p.salaryBonus+=e.promotion; notes.push(success?`昇給成功！ 給料+${e.promotion}万円`:'今回は昇給ならず'); }
  for (const k of ['salaryBonus','shares','bonds','debt','children']) if (e[k]) p[k]+=e[k];
  p.happiness=Math.max(0,p.happiness+(e.happiness || 0));
  for (const k of ['job','home','married','insured','sideJob']) if (Object.hasOwn(e,k)) p[k]=e[k];
  return notes.join(' / ');
}
export function botChoice(g,rng=randomInt) {
  const p=g.players[g.turn]; const choices=availableChoices(g).filter(c=>!c.disabled);
  const affordable=choices.filter(c=> -(c.effect.cash || 0)<=p.cash);
  const pool=affordable.length?affordable:choices;
  if (p.debt && pool.some(c=>c.id==='repay')) return 'repay';
  return pool[rng(0,pool.length)].id;
}
export function start(g,id) {
  if (g.hostId!==id || g.status!=='waiting') throw Error('ホストだけが開始できます。');
  if (g.players.length<2) throw Error('2人以上で開始してください。AIを追加することもできます。');
  g.status='playing'; record(g,'72マスの人生の旅が始まりました。初期資金は300万円です。');
}
export function act(g,id,action,choice,rng=randomInt) {
  if (g.status!=='playing') throw Error('ゲームは進行していません。');
  const p=g.players[g.turn]; if (p.id!==id) throw Error('あなたの手番ではありません。');
  if (action==='roll') {
    if (g.phase!=='roll') throw Error('先にイベントを選択してください。');
    const before=state(p), dice=rng(1,7); g.lastRoll={name:p.name,dice}; const old=p.position;
    p.position=Math.min(g.board.length-1,old+dice);
    let earned=0;
    const paydays=[];
    for (let pos=old+1;pos<=p.position;pos++) if(g.board[pos].type==='salary') {
      const base=salary(p), rate=rng(8,15), amount=Math.round(base*rate/10);
      p.cash+=amount; earned+=amount;
      const detail=`給料${base}万円 × ${(rate/10).toFixed(1)}倍 = ${amount}万円（四捨五入）`;
      paydays.push(detail); record(g,`${p.name}：${detail}`);
    }
    if (earned) record(g,`${p.name}：給料 +${earned}万円`);
    record(g,`${p.name}：${dice}マス進み、${age(p.position)}歳へ。`);
    const type=g.board[p.position].type;
    if(type==='goal') { p.finished=true; p.cash+=150; result(g,p,'人生のゴール','退職金を受け取った','退職金150万円。家族と幸福のボーナスは全員ゴール後に加算。',before); next(g,rng); }
    else if(type==='divorce') {
      const wasMarried=p.married; p.married=false; if (wasMarried) p.children=0;
      result(g,p,'離婚',wasMarried?'別々の道を歩むことになりました':'独身のため変化なし',wasMarried?'費用はかかりません。配偶者がいなくなり、子どもは0人になります。住宅はそのままです。最後の家族のお祝いは、終了時の結婚状態と子どもの人数で決まります。':'家族や資産に変化はありません。',before);
      next(g,rng);
    }
    else if(type==='salary') { result(g,p,'給料日','お給料を受け取った',`${paydays.join(" / ")}。通過分を含め${earned}万円を受け取りました。`,before); next(g,rng); }
    else {
      g.phase='choice';
      const card=type==='event'?draw(g,rng):null;
      const titles={career:'仕事の分かれ道',family:'大切な人との暮らし',invest:'資産をどう育てる？',learn:'新しい学びのチャンス',health:'心と体を整えよう',leisure:'休日の過ごし方'};
      g.pending={type,title:card?.title || titles[type],text:card?.text || '費用と将来の効果を比べて、あなたらしい選択を。',eventId:card?.id,earned};
      record(g,`${p.name}に「${g.pending.title}」が発生。選択中です。`);
    }
  } else if(action==='choose') {
    if(g.phase!=='choice') throw Error('現在は選択できません。');
    const selected=availableChoices(g).find(c=>c.id===choice);
    if(!selected || selected.disabled) throw Error('この選択はできません。条件や所持金を確認してください。');
    const before=state(p); const detail=applyEffect(p,selected.effect,rng);
    result(g,p,g.pending.title,selected.name,detail || selected.desc,before); next(g,rng);
  } else throw Error('不明な操作です。');
  g.updatedAt=Date.now();
}
function next(g,rng) {
  g.pending=null; g.phase='roll';
  if(g.players.every(p=>p.finished)) {
    for(const p of g.players) { const before=state(p); const bonus=(p.married?100:0)+p.children*70+p.happiness*5; p.cash+=bonus; result(g,p,'人生のボーナス','家族と幸福を精算',`家族のお祝い＋幸福${p.happiness}×5万円 = ${bonus}万円`,before); }
    g.status='finished'; record(g,'全員がゴール！ 最終資産を集計しました。'); return;
  }
  do {
    g.turn=(g.turn+1)%g.players.length;
    if(g.turn===0) {
      g.round++; g.price=Math.max(10,Math.min(100,g.price+rng(-12,16)));
      for(const p of g.players.filter(p=>!p.finished)) p.debt+=Math.ceil(p.debt*.05);
      record(g,`第${g.round}ラウンド：投資信託は1口${g.price}万円。借入利息5%を加算。`);
    }
  } while(g.players[g.turn].finished);
}
