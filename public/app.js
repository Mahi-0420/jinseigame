const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = { start:'旅のはじまり', goal:'ゴール', event:'イベント', salary:'給料日', invest:'投資', career:'キャリア', family:'家族', divorce:'離婚', learn:'学び', health:'健康', leisure:'余暇' };
const icons = { start:'🚩', goal:'🏆', event:'🎁', salary:'💰', invest:'📈', career:'💼', family:'🏠', divorce:'💔', learn:'🎓', health:'🌿', leisure:'🎡' };
const colors = ['#dc775b','#3b8d89','#b89c46','#8877ac','#5281b3','#bd668c'];
let session, source, game, me, busy = false;
try { session = JSON.parse(sessionStorage.getItem('life-session')); } catch {}
const money = n => new Intl.NumberFormat('ja-JP').format(n);
const net = p => p.cash + p.shares * game.price + p.bonds * 120 + (p.home ? 260 : 0) - p.debt;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('show'), 4200); }
async function api(path, data = {}) {
  const res = await fetch('/api/' + path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...session,...data}) });
  const result = await res.json(); if (!res.ok) throw Error(result.error); return result;
}
function connect() {
  source?.close(); source = new EventSource(`/api/events?code=${session.code}&token=${session.token}`);
  source.onmessage = e => { ({game, me} = JSON.parse(e.data)); render(); };
  source.onerror = () => { toast('接続を確認しています。自動的に再接続します。'); if (!game) { document.body.classList.remove('in-game'); $('#app').innerHTML = '<section class="lobby"><h2>ルームへ接続しています…</h2><p>サーバー再起動後は新しいルームを作成してください。</p><button id="leave">トップへ戻る</button></section>'; } };
}
function landing() {
  document.body.classList.remove('in-game');
  $('#app').innerHTML = `<section class="hero"><div class="hero-copy"><span class="eyebrow">EVERY CHOICE, A NEW CHAPTER</span><div class="hero-sticker">🎲 最大6人でわいわい対戦！</div><h1>さあ、あなたの<br><em>人生の大冒険</em>へ！</h1><p>仕事も、家族も、ときには大きな冒険も。<br>サイコロとあなたの選択でつづる、<br>世界にひとつの人生すごろく。</p><div class="hero-tags"><span>♙ 2–6 PLAYERS</span><span>◷ 25–45 MIN</span><span>⌂ PLAY WITH FRIENDS</span></div></div><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="art-title">YOUR LIFE.<br>YOUR NEXT MOVE.</div><div class="art-tile tile-career">💼<small>CAREER</small></div><div class="art-tile tile-family">🏡<small>FAMILY</small></div><div class="art-tile tile-money">💰<small>INVESTMENT</small></div><div class="dice-art">⚄</div><div class="art-caption">🌳 🏡 🌷 🏢 🌲 🎡 🌳</div><span class="spark s1">✳</span><span class="spark s2">✦</span></div></section>
+<section class="entry-grid"><div class="entry-intro"><span class="eyebrow">LET'S GET STARTED</span><h2>さあ、旅の準備を。</h2><p>友達を招待して、人生の分かれ道を一緒に。<br>AIを追加すれば、1人でも遊べます。</p><label for="name">あなたの名前</label><input id="name" maxlength="16" placeholder="旅人の名前を入力" value="${esc(localStorage.getItem('life-name') || '')}"></div><div class="entry-card"><span class="step">01 / HOST</span><h3>新しい旅をはじめる</h3><p>ルームをつくって、友達を招待。<br>あなたがこの旅のホストです。</p><button id="create" class="primary">ルームをつくる <span>→</span></button></div><div class="entry-card"><span class="step">02 / JOIN</span><h3>友達の旅に参加する</h3><p>教えてもらった6桁のルームコードを入力。</p><div class="join-row"><input id="code" maxlength="6" placeholder="例：A1B2C3" aria-label="ルームコード"><button id="join" class="dark" aria-label="ルームに参加">→</button></div></div></section><footer><span>✳ LIFE JOURNEY</span><span>正解のない人生を、楽しもう。</span><span>AN ORIGINAL LIFE BOARD GAME</span></footer>`.replace(/^\+/gm,'');
}
function playerCard(p, i) {
  return `<article class="player-card ${game.turn === i && game.status === 'playing' ? 'active' : ''}"><div class="player-head"><span class="avatar" style="--player:${colors[i]}">${esc(p.name[0])}</span><div><strong>${esc(p.name)} ${String(i) === me ? '<small>YOU</small>' : ''}</strong><span class="muted">${p.bot ? 'AI · ' : ''}${game.jobs[p.job].name} · ${p.finished ? 'ゴール' : (18+Math.floor(p.position*47/71))+'歳'}</span></div>${game.turn === i && game.status === 'playing' ? '<i class="turn-dot"></i>' : ''}</div><div class="asset"><small>純資産</small><strong>${money(net(p))}<span> 万円</span></strong></div><div class="stats"><span>現金 <b>${money(p.cash)}</b></span><span>給料 <b>${game.jobs[p.job].salary+p.salaryBonus+(p.sideJob?12:0)}</b></span><span>投資 <b>${p.shares}口</b></span><span>借入 <b>${money(p.debt)}</b></span><span>幸福 <b>${p.happiness} pt</b></span><span>債券 <b>${p.bonds}口</b></span></div><div class="family-state">${p.married ? '♡ 既婚' : '♡ 独身'} · 子ども ${p.children}人 · ${p.home ? '⌂ 持ち家' : '⌂ 賃貸'}${p.insured ? ' · 保険加入' : ''}${p.sideJob ? ' · 副業あり' : ''}</div><div class="player-recent">${esc(game.history.find(e=>e.player===i)?.selection || 'これから始まる物語')}</div></article>`;
}
function finalScores() {
  const row = (label, value) => `<div><dt>${label}</dt><dd>${money(value)} 万円</dd></div>`;
  return [...game.players].sort((a,b)=>net(b)-net(a)).map((p,i) => {
    const marriage = p.married ? 100 : 0, children = p.children * 70, happiness = p.happiness * 5;
    return `<article class="score-card"><h3>${i+1}位 · ${esc(p.name)}</h3><dl class="score-breakdown">
      ${row('現金（ボーナス込み）',p.cash)}
      ${row(`投資信託（${p.shares}口 × 最終価格${money(game.price)}万円）`,p.shares*game.price)}
      ${row(`債券（${p.bonds}口 × 120万円）`,p.bonds*120)}
      ${row(`住宅評価額（${p.home?'持ち家':'住宅なし'}）`,p.home?260:0)}
      ${row('借入（差し引き）',-p.debt)}
      <div class="score-total"><dt>最終スコア（純資産）</dt><dd>${money(net(p))} 万円</dd></div>
    </dl><details class="score-bonuses" open><summary>現金に含まれるボーナスの詳細</summary><dl class="score-breakdown">
      ${row('退職金',150)}${row(`結婚祝い（${p.married?'既婚':'独身'}）`,marriage)}
      ${row(`子ども祝い（${p.children}人 × 70万円）`,children)}
      ${row(`幸福（${p.happiness}pt × 5万円）`,happiness)}
      ${row('ボーナス合計',150+marriage+children+happiness)}
    </dl><p>上記は現金に加算済みです。最終スコアに再加算しません。</p></details></article>`;
  }).join('');
}
function choices(canChoose) {
  return game.options.map(c => `<button class="choice" data-choice="${esc(c.id)}" ${c.disabled || !canChoose ? 'disabled' : ''}><strong>${esc(c.name)}</strong><small>${esc(c.desc)}${c.disabled ? '（条件未達成）' : ''}</small></button>`).join('');
}
function changes(entry) {
  const names = {cash:'現金',debt:'借入',happiness:'幸福',salary:'給料',shares:'投資信託',bonds:'債券'};
  return Object.entries(entry.changes).filter(([,v])=>v!==0).map(([k,v])=>`<span class="change ${((k==='debt' ? -v : v)>0)?'positive':'negative'}">${names[k]} ${v>0?'+':''}${money(v)}${['cash','debt','salary'].includes(k)?'万円':k==='happiness'?'pt':'口'}</span>`).join('') || '<span class="change">資産・能力の変化なし</span>';
}
function outcome(entry, compact=false) {
  return `<article class="outcome ${compact?'compact':''}" style="--player:${colors[entry.player]}"><div class="outcome-who"><span class="avatar">${esc(entry.name[0])}</span><div><strong>${esc(entry.name)}さん</strong><small>ROUND ${entry.round}</small></div><span class="result-label">結果</span></div><h3>${esc(entry.title)}</h3><p class="selection">選択：${esc(entry.selection)}</p><p>${esc(entry.detail)}</p><div class="change-list">${changes(entry)}</div></article>`;
}
function liveStory(current) {
  const pending=game.phase==='choice';
  return `<section class="activity-center" aria-live="polite"><div class="live-story" style="--player:${colors[game.turn]}"><span class="eyebrow">${game.status==='finished'?'JOURNEY COMPLETE':pending?'LIVE · 選択中':'LIVE · 次の手番'}</span><div class="story-who"><span class="avatar">${esc(current.name[0])}</span><strong>${esc(current.name)}さん${pending?'にイベント発生！':game.status==='finished'?'もゴール！':'のサイコロ待ち'}</strong></div><h2>${pending?esc(game.pending.title):game.status==='finished'?'全員の人生が完結しました':'次は、どんな出来事が？'}</h2><p>${pending?esc(game.pending.text):'各プレイヤーの選択と結果は、ここで確認できます。'}</p>${pending && game.pending.earned?`<span class="change positive">通過した給料日：+${game.pending.earned}万円</span>`:''}<span class="story-help">${pending?'選択肢は手番パネルで全員に公開されています。':'幸福は全員ゴール後に1pt＝5万円のボーナスになります。'}</span></div><div class="latest-outcome">${game.history[0]?outcome(game.history[0]):'<div class="no-outcome"><span>✦</span><h3>みんなの物語が、ここに。</h3><p>出来事・選択・結果をリアルタイムで共有します。</p></div>'}</div></section>`;
}
function render() {
  if (!game) return;
  document.body.classList.toggle('in-game',game.status!=='waiting');
  const mine = game.players[Number(me)], host = mine?.host, current = game.players[game.turn];
  if (game.status === 'waiting') {
    $('#app').innerHTML = `<section class="lobby"><span class="eyebrow">YOUR JOURNEY STARTS HERE</span><h1>旅の仲間を待っています。</h1><p>ルームコードを友達に共有して、同じURLから参加してもらいましょう。</p><button id="copy" class="room-code">${game.code} <small>コピー ⧉</small></button><div class="lobby-players">${game.players.map((p,i) => `<div><span class="avatar" style="--player:${colors[i]}">${esc(p.name[0])}</span><strong>${esc(p.name)}</strong><small>${p.host ? 'HOST' : p.bot ? 'AI PLAYER' : 'PLAYER'}</small></div>`).join('')}${Array.from({length:6-game.players.length},()=>'<div class="empty-seat"><span>＋</span><small>参加を待っています</small></div>').join('')}</div><div class="lobby-actions">${host ? `<button id="bot" class="secondary" ${game.players.length >= 6 ? 'disabled' : ''}>＋ AIを追加</button><button id="start" class="primary" ${game.players.length < 2 ? 'disabled' : ''}>人生の旅をはじめる →</button>` : '<p>ホストがゲームを開始するまでお待ちください。</p>'}</div><button id="leave" class="quiet">トップに戻る</button><p class="muted">開始前は自由に退出できます。ホストの退出時は次の参加者がホストになります。</p></section>`; return;
  }
  const isTurn = String(game.turn) === me;
  const oldScroll = $('.board-scroll')?.scrollTop || 0;
  const oldPosition = render.lastPosition;
  const turnKey = `${game.turn}:${current.position}`;
  $('#app').innerHTML = `<div class="game-top"><div><span class="eyebrow">${game.status === 'finished' ? 'JOURNEY COMPLETE' : 'THE JOURNEY OF A LIFETIME'}</span><h2>${game.status === 'finished' ? 'それぞれの人生に、拍手を。' : '人生は、選択の連続だ。'}</h2></div><div class="game-meta"><button class="quiet" id="history">📖 出来事の履歴</button><button class="quiet" id="copy">ROOM ${game.code} ⧉</button><span>ROUND <b>${game.round.toString().padStart(2,'0')}</b></span></div></div>${liveStory(current)}<div class="game-layout"><section class="board-panel"><div class="board-heading"><div><span class="eyebrow">LIFE ADVENTURE MAP</span><strong>人生のロードマップ</strong></div><span>18歳 → 65歳 <b>${game.board.length} マスの大冒険！</b></span></div><div class="map-scenery" aria-hidden="true"><span class="map-cloud cloud-a">☁</span><span class="map-cloud cloud-b">☁</span><span class="map-sun">☀</span><span class="map-town">🌳 🏡 🌷 🏢 🌳 🏫 🌲 🏠 🎡 🌳</span><span class="map-tagline">一歩ごとに、新しい物語。</span></div><div class="life-chapters"><span>🌱 旅立ち</span><span>💼 挑戦</span><span>🏡 暮らし</span><span>✨ 充実</span><span>🌴 自由</span><span>🏆 実り</span></div><div class="board-scroll"><div class="board">${game.board.map((cell,i) => `<div class="cell ${cell.type} ${current.position===i ? 'current-cell' : ''}" style="grid-column:${Math.floor(i/6)%2===0?i%6+1:6-i%6};grid-row:${Math.floor(i/6)+1};--chapter:${Math.floor(i/12)}" data-direction="${i===game.board.length-1?'end':i%6===5?'down':Math.floor(i/6)%2===0?'right':'left'}"><div class="cell-top"><small>${String(i+1).padStart(2,'0')}</small><span>${icons[cell.type]}</span></div><strong>${labels[cell.type]}</strong><small class="cell-age">${18+Math.floor(i*47/71)}歳</small><div class="tokens">${game.players.map((p,j)=>p.position === i ? `<span title="${esc(p.name)}" style="background:${colors[j]}">${esc(p.name[0])}</span>`:'').join('')}</div></div>`).join('')}</div></div><div class="board-legend">${['salary','career','family','divorce','invest','learn','health','leisure','event'].map(t=>`<span><i class="${t}"></i>${labels[t]}</span>`).join('')}<small>矢印に沿って、折り返しながら進みます ➜</small></div><div class="market"><span class="market-icon">↗</span><div><small>MARKET WATCH</small><strong>投資信託 <b>${game.price}</b> 万円 / 口</strong></div><span>ラウンドごとに変動<br><small>評価額は純資産に反映されます</small></span></div></section><aside><section class="turn-panel">${game.status === 'finished' ? `<span class="eyebrow">FINAL RANKING</span><h2>旅の結果 <button id="scoreDetails" class="quiet">詳細を見る →</button></h2>${[...game.players].sort((a,b)=>net(b)-net(a)).map((p,i)=>`<div class="rank"><b>${i+1}</b><span>${esc(p.name)}</span><strong>${money(net(p))}<small> 万円</small></strong></div>`).join('')}<button id="leave" class="primary">新しい旅へ →</button>` : `<span class="eyebrow">${isTurn ? 'YOUR TURN' : 'NEXT CHAPTER'}</span><h2>${esc(current.name)}さんの番</h2><p>${game.phase === 'choice' ? esc(game.pending.title)+(isTurn?'：次の一歩を選びましょう。':'：選択を待っています。') : isTurn ? 'サイコロを振って、次の一歩へ。' : 'ほかのプレイヤーの選択を見守りましょう。'}</p>${game.phase === 'choice' ? `<div class="choices ${!isTurn?'spectating':''}">${choices(isTurn)}</div>` : `<div class="dice-display" aria-label="サイコロ">${game.lastRoll ? ['⚀','⚁','⚂','⚃','⚄','⚅'][game.lastRoll.dice-1] : '⚄'}</div><button id="roll" class="primary" ${!isTurn || game.phase !== 'roll' ? 'disabled' : ''}>${isTurn ? '🎲 サイコロを振る' : '手番を待っています'} <span>→</span></button>`}${game.lastRoll ? `<small class="last-roll">前のサイコロ：${esc(game.lastRoll.name)} · ${game.lastRoll.dice}</small>` : ''}`}</section><section class="log-panel"><span class="eyebrow">JOURNEY LOG</span><h3>みんなの出来事</h3><div class="story-history">${game.history.map(e=>outcome(e,true)).join('') || '<p class="muted">最初の出来事を待っています。</p>'}</div><details class="detail-log"><summary>給料・相場などの詳細ログ</summary><div class="logs">${game.log.map((l,i)=>`<p class="${i===0?'latest':''}">${esc(l)}</p>`).join('')}</div></details></section></aside><section class="players-grid">${game.players.map(playerCard).join('')}</section></div>`;
  const boardScroll=$('.board-scroll');
  boardScroll.scrollTop=oldScroll;
  if (oldPosition!==turnKey) {
    const cell=$('.current-cell');
    boardScroll.scrollTop=Math.max(0,cell.getBoundingClientRect().top-boardScroll.getBoundingClientRect().top+boardScroll.scrollTop-boardScroll.clientHeight/2+cell.clientHeight/2);
  }
  render.lastPosition=turnKey;
}
$('#closeScores').onclick = () => $('#scoresDialog').close();
$('#rulesBtn').onclick = () => $('#rules').showModal(); $('#closeRules').onclick = () => $('#rules').close(); $('#closeHistory').onclick = () => $('#historyDialog').close();
$('#app').addEventListener('click', async e => {
  const btn = e.target.closest('button'); if (!btn || btn.disabled || busy) return;
  try {
    busy = true;
    if (['create','join'].includes(btn.id)) {
      const name = $('#name').value.trim(); if (!name) throw Error('名前を入力してください。');
      const code = $('#code').value.trim().toUpperCase(); if (btn.id === 'join' && !/^[A-F0-9]{6}$/.test(code)) throw Error('6桁のルームコードを入力してください。');
      localStorage.setItem('life-name',name); session = await api(btn.id,{name,code}); sessionStorage.setItem('life-session',JSON.stringify(session)); connect();
    } else if (btn.id === 'leave') { if (game?.status === 'waiting') await api('leave'); source?.close(); game = null; session = null; sessionStorage.removeItem('life-session'); landing(); }
    else if (btn.id === 'scoreDetails' && game.status === 'finished') { $('#scoresContent').innerHTML = finalScores(); $('#scoresDialog').showModal(); }
    else if (btn.id === 'history') { $('#historyContent').innerHTML = (game.history.map(e=>outcome(e)).join('') || '<p>まだ出来事はありません。</p>') + '<details class="detail-log"><summary>給料・相場などの詳細ログ</summary>' + game.log.map(l=>`<p>${esc(l)}</p>`).join('') + '</details>'; $('#historyDialog').showModal(); }
    else if (btn.id === 'copy') { try { await navigator.clipboard.writeText(game.code); toast('ルームコードをコピーしました。'); } catch { toast(`ルームコード：${game.code}`); } }
    else if (['bot','start'].includes(btn.id)) await api(btn.id);
    else if (btn.id === 'roll') await api('action',{action:'roll'});
    else if (btn.dataset.choice) await api('action',{action:'choose',choice:btn.dataset.choice});
  } catch (e) { toast(e.message); } finally { busy = false; }
});
landing(); if (session) connect();
