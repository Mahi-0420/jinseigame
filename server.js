import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { act, availableChoices, botChoice, createGame, jobs, player, start } from './game.js';

const rooms = new Map(), clients = new Map(), timers = new Map();
const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
function snapshot(g) {
  const { eventDeck, lastEventId, ...visible } = g;
  return { ...visible, players:g.players.map(({id,...p},i)=>({...p,id:String(i),host:id===g.hostId})), hostId:undefined, jobs,
    options:availableChoices(g).map(({effect,...option})=>option) };
}
function publish(g) {
  g.updatedAt = Date.now();
  for (const c of clients.get(g.code) || []) c.res.write(`data: ${JSON.stringify({ game: snapshot(g), me: String(g.players.findIndex(p => p.id === c.token)) })}\n\n`);
  if (g.status === 'playing' && g.players[g.turn].bot && !timers.has(g.code)) {
    timers.set(g.code, setTimeout(() => {
      timers.delete(g.code); const p = g.players[g.turn];
      try {
        if (g.phase === 'roll') act(g, p.id, 'roll');
        else {
          act(g, p.id, 'choose', botChoice(g));
        }
        publish(g);
      } catch (e) { console.error('AI turn failed:', e); }
    }, 1300));
  }
}
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
async function body(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 4096) throw Error('リクエストが大きすぎます。'); }
  return JSON.parse(raw || '{}');
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/events') {
      const g = rooms.get(url.searchParams.get('code')), token = url.searchParams.get('token');
      if (!g || !g.players.some(p => p.id === token)) return json(res, 401, { error: 'ルームが見つかりません。もう一度参加してください。' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      const client = { res, token }; if (!clients.has(g.code)) clients.set(g.code, new Set()); clients.get(g.code).add(client);
      res.write(`data: ${JSON.stringify({ game: snapshot(g), me: String(g.players.findIndex(p => p.id === token)) })}\n\n`);
      const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
      req.on('close', () => { clearInterval(heartbeat); clients.get(g.code)?.delete(client); }); return;
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: '接続元を確認してください。' });
      const data = await body(req);
      if (url.pathname === '/api/create') {
        if (rooms.size >= 1000) throw Error('ルームが満員です。しばらくしてお試しください。');
        let code; do { code = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
        const p = player(data.name), g = createGame(code, p); rooms.set(code, g);
        return json(res, 200, { code, token: p.id });
      }
      const g = rooms.get(String(data.code || '').toUpperCase()); if (!g) throw Error('ルームが見つかりません。コードを確認してください。');
      if (url.pathname === '/api/join') {
        if (g.status !== 'waiting') throw Error('このルームはすでにゲームを開始しています。');
        if (g.players.length >= 6) throw Error('このルームは満員です。');
        const p = player(data.name); g.players.push(p); publish(g); return json(res, 200, { code: g.code, token: p.id });
      }
      if (!g.players.some(p => p.id === data.token)) return json(res, 401, { error: '参加情報が無効です。' });
      if (url.pathname === '/api/leave') {
        if (g.status !== 'waiting') throw Error('ゲーム開始後は退出できません。');
        g.players = g.players.filter(p => p.id !== data.token);
        if (!g.players.some(p => !p.bot)) { rooms.delete(g.code); return json(res, 200, { ok: true }); }
        if (g.hostId === data.token) g.hostId = g.players.find(p => !p.bot).id;
      } else if (url.pathname === '/api/bot') {
        if (g.hostId !== data.token || g.status !== 'waiting' || g.players.length >= 6) throw Error('AIを追加できません。');
        g.players.push(player(`AI ${['アオイ','ハル','ソラ','リン','ユウ'][g.players.length - 1]}`, true));
      } else if (url.pathname === '/api/start') start(g, data.token);
      else if (url.pathname === '/api/action') act(g, data.token, data.action, data.choice);
      else return json(res, 404, { error: '見つかりません。' });
      publish(g); return json(res, 200, { ok: true });
    }
    const files = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/theme.css': 'theme.css' };
    const file = files[url.pathname]; if (!file) return json(res, 404, { error: 'Not found' });
    const bytes = await readFile(publicDir + file);
    res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }); res.end(bytes);
  } catch (e) { json(res, 400, { error: e.message || '操作に失敗しました。' }); }
});
setInterval(() => { for (const [code, g] of rooms) if (Date.now() - g.updatedAt > 86400000 && !clients.get(code)?.size) { rooms.delete(code); clients.delete(code); } }, 60000).unref();
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`Life Journey listening on port ${process.env.PORT || 3000}`));
