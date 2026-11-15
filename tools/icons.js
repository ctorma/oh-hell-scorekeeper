// Renders the app icons into the site's icons/ folder.
const {chromium} = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'icons');
const FONT = 'file://' + path.join(__dirname, '..', 'fonts', 'bricolage.woff2');
const html = (size, pad, round) => `<!doctype html><html><head><style>
@font-face{font-family:B;src:url(${FONT}) format("woff2");font-weight:200 800}
html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden}
.bg{width:${size}px;height:${size}px;border-radius:${round ? size*0.22 : 0}px;background:radial-gradient(circle at 50% 25%,#2a7356,#1d5641 55%,#123a2b);display:grid;place-items:center}
.card{width:${size*(1-2*pad)*0.62}px;height:${size*(1-2*pad)*0.86}px;border-radius:${size*0.07}px;background:#fbf5e6;transform:rotate(-8deg);box-shadow:0 ${size*0.03}px ${size*0.05}px rgba(0,0,0,.35);position:relative;font-family:B}
.c{position:absolute;left:${size*0.045}px;top:${size*0.03}px;color:#c0352a;font-size:${size*0.12}px;line-height:1;font-weight:800;text-align:center}
.c.b{left:auto;top:auto;right:${size*0.045}px;bottom:${size*0.03}px;transform:rotate(180deg)}
.s{position:absolute;inset:0;display:grid;place-items:center;font-size:${size*(1-2*pad)*0.5}px;color:#1b1a16;line-height:1;padding-bottom:${size*0.02}px}
</style></head><body><div class="bg"><div class="card"><div class="c">♥</div><div class="s">♠</div><div class="c b">♥</div></div></div></body></html>`;
(async () => {
  const b = await chromium.launch();
  const jobs = [['icon-192.png',192,0.08,false],['icon-512.png',512,0.08,false],['icon-maskable-512.png',512,0.16,false],['apple-touch-icon.png',180,0.08,false],['favicon-64.png',64,0.04,true]];
  for (const [name, size, pad, round] of jobs) {
    const p = await b.newPage({viewport:{width:size,height:size}, deviceScaleFactor:1});
    await p.setContent(html(size, pad, round)); await p.evaluate(() => document.fonts.ready);
    await p.screenshot({path: path.join(OUT, name), omitBackground: round});
    await p.close();
  }
  await b.close();
})();
