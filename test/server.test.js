import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
test('HTTP rooms support six players, authenticate actions and stream state', async () => {
  const proc = spawn(process.execPath,['server.js'], {env:{...process.env,PORT:'3199'},stdio:['ignore','pipe','pipe']});
  try {
    await Promise.race([once(proc.stdout,'data'), once(proc,'exit').then(([code]) => { throw Error(`Server exited before startup: ${code}`); })]);
    const post = async (path,data) => { const r = await fetch(`http://localhost:3199/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,data:await r.json()}; };
    const {data:host} = await post('create',{name:'ホスト'});
    const participants = [host];
    for (let i=1;i<6;i++) { const r = await post('join',{code:host.code,name:`参加者${i}`}); assert.equal(r.status,200); participants.push(r.data); }
    assert.equal((await post('join',{code:host.code,name:'7人目'})).status,400);
    assert.equal((await post('start',participants[1])).status,400);
    assert.equal((await post('action',{...host,token:'invalid',action:'roll'})).status,401);
    assert.equal((await post('start',host)).status,200);
    assert.equal((await post('action',{...participants[1],action:'roll'})).status,400);
    const controller = new AbortController();
    const stream = await fetch(`http://localhost:3199/api/events?code=${host.code}&token=${host.token}`,{signal:controller.signal});
    const reader=stream.body.getReader(); const chunk = await reader.read();
    let eventText = new TextDecoder().decode(chunk.value);
    while (!eventText.includes('\n\n')) eventText += new TextDecoder().decode((await reader.read()).value);
    const payload = JSON.parse(eventText.split('data: ')[1].split('\n\n')[0]);
    assert.equal(payload.game.players.length,6); assert.equal(payload.me,'0');
    assert.equal(payload.game.board.length,72); assert.equal(payload.game.eventDeck,undefined);
    assert.equal(payload.game.history.length,0); assert.ok(Array.isArray(payload.game.options));
    assert.ok(!JSON.stringify(payload).includes(host.token)); controller.abort();
    assert.equal((await post('action',{...host,action:'roll'})).status,200);
    assert.equal((await fetch('http://localhost:3199/')).status,200);
    assert.equal((await fetch('http://localhost:3199/theme.css')).status,200);
  } finally { if (proc.exitCode === null) { proc.kill(); await once(proc,'exit'); } }
});
