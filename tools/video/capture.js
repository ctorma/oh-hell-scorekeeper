// Captures real app screens in scripted states for the explainer video.
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const APP = 'file://' + path.resolve(__dirname, '../../index.html');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, {recursive: true});

let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const SCHED = [[1,'trump'],[2,'trump'],[3,'trump'],[4,'trump'],[5,'trump'],[6,'trump'],[7,'trump'],[7,'nt'],[7,'trump'],[6,'trump'],[5,'trump'],[4,'trump'],[3,'trump'],[2,'trump'],[1,'trump'],[7,'nt'],[1,'blind']].map(([cards,type])=>({cards,type}));
const NAMES = ['Grandma','Dad','Mia','Leo','Aunt Jo'];
function baseGame(){
  return {id:'demo1', startedAt: Date.now()-3600e3, players: NAMES.map(name=>({name})), firstDealer:0, schedule: SCHED,
    rules:{bonus:4,perTrick:1,penalty:4,hook:true}, hands: SCHED.map(()=>null), cur:0, phase:'bid'};
}
const dealer = (g,h) => (g.firstDealer+h)%5;
function genHand(g,h){
  const c = g.schedule[h].cards, d = dealer(g,h);
  const order = [1,2,3,4,5].map(i => (d+i)%5);
  const bids = Array(5).fill(0);
  order.forEach(p => { bids[p] = Math.min(c, Math.floor(rng()*(c/2.5+1.4))); });
  const tot = bids.reduce((a,b)=>a+b,0);
  if (tot === c) bids[d] = bids[d] > 0 ? bids[d]-1 : bids[d]+1;
  const tricks = bids.slice();
  if (rng() < 0.7) { const a = Math.floor(rng()*5), b = Math.floor(rng()*5); if (tricks[a] > 0 && a !== b) { tricks[a]--; tricks[b]++; } }
  let s = tricks.reduce((a,b)=>a+b,0);
  while (s !== c) { const p = Math.floor(rng()*5); if (s < c) { tricks[p]++; s++; } else if (tricks[p] > 0) { tricks[p]--; s--; } }
  return {bids, tricks, done:true, fanfare:true};
}
function gameUpTo(cur){ seed = 7; const g = baseGame(); for (let h=0; h<cur; h++) g.hands[h] = genHand(g,h); g.cur = cur; g.hands[cur] = {bids:Array(5).fill(null), tricks:Array(5).fill(null), done:false}; return g; }
const PAST = ['Grandma','Dad','Mia','Leo','Aunt Jo','Uncle Ray','Nana'];
function storeWith(current, extra = {}){
  return Object.assign({settings:{data:{bonus:4,perTrick:1,penalty:4,hook:true,schedule:SCHED},at:1}, names:{data:PAST,at:1}, current:{data:current,at:1}, history:{}}, extra);
}

(async () => {
  const browser = await chromium.launch();
  const boxes = {};
  async function shot(name, store, fn, opts = {}){
    const ctx = await browser.newContext({viewport:{width:390,height:844}, deviceScaleFactor:2});
    await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ohhell-scorer:v1', s); sessionStorage.setItem('seeded','1'); } }, JSON.stringify(store));
    const p = await ctx.newPage();
    await p.goto(APP); await p.evaluate(() => document.fonts.ready);
    if (fn) await fn(p);
    await p.waitForTimeout(opts.wait || 250);
    await p.screenshot({path: path.join(OUT, name + '.png'), fullPage: !!opts.full});
    if (opts.box) { boxes[name] = {}; for (const [k, sel] of Object.entries(opts.box)) { const b = await p.locator(sel).first().boundingBox(); if (b) boxes[name][k] = b; } }
    await ctx.close();
  }

  // Home with a game in progress
  const gHook = gameUpTo(4);
  await shot('home', storeWith(gHook), async p => { await p.click('[data-a=home]'); });

  // Setup: two typed, one from chips
  await shot('setup', storeWith(null), async p => {
    await p.click('[data-a=new]');
    await p.fill('#name-input','Grandma'); await p.press('#name-input','Enter');
    await p.click('[data-a=add-name][data-v="Dad"]');
    await p.click('[data-a=add-name][data-v="Mia"]');
    await p.click('[data-a=add-name][data-v="Leo"]');
    await p.click('[data-a=add-name][data-v="Aunt Jo"]');
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
  }, {box:{chip:'[data-a=add-name]', start:'[data-a=start]', dealer:'[data-a=dealer]'}});

  // Bidding: two bids in, Mia to bid
  const gBid = gameUpTo(4); gBid.hands[4].bids = [1,0,null,null,null];
  await shot('bid', storeWith(gBid), null, {box:{two:'.pad button[data-v="2"]', active:'.prow.active'}});

  // Hook: dealer Aunt Jo bids last, total 4 of 5, so 1 is blocked
  const gH = gameUpTo(4); gH.hands[4].bids = [1,0,2,1,null];
  await shot('hook', storeWith(gH), null, {box:{forb:'.pad button[disabled]', hook:'.hook', status:'.status'}});

  // Tricks partly entered
  const gT = gameUpTo(4); gT.hands[4].bids = [1,0,2,1,2]; gT.hands[4].tricks = [1,0,1,null,null]; gT.phase = 'tricks';
  await shot('tricks', storeWith(gT), null, {box:{chip:'.prow:nth-child(4) .tchip[data-v="1"]', status:'.status'}});

  // Result
  const gR = gameUpTo(4); gR.hands[4] = {bids:[1,0,2,1,2], tricks:[1,0,1,1,2], done:true}; gR.phase = 'result';
  await shot('result', storeWith(gR), null, {box:{board:'.board', next:'[data-a=next]'}});

  // No trump hand
  await shot('nt', storeWith(gameUpTo(7)), null, {box:{hand:'.hand'}});

  // Blind fanfare
  const gB = gameUpTo(16); delete gB.hands[16].fanfare;
  await shot('blind', storeWith(gB), null, {wait:1600});

  // Scorecard mid-game
  await shot('scorecard', storeWith(gameUpTo(9)), async p => { await p.click('[data-a=scorecard]'); }, {box:{row:'tr[data-h="3"]'}});

  // End of game
  const gE = gameUpTo(16); gE.hands[16] = genHand(gE,16); gE.phase = 'result';
  await shot('end', storeWith(gE), async p => { await p.click('[data-a=next]'); }, {full:true, wait:400});

  fs.writeFileSync(path.join(__dirname, 'boxes.json'), JSON.stringify(boxes, null, 1));
  console.log(JSON.stringify(boxes));
  await browser.close();
})();
