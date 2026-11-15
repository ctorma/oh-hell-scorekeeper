// Usage: node render.js preview t1,t2,...   |   node render.js full
const {chromium} = require('playwright');
const fs = require('fs'), path = require('path');
const {spawn} = require('child_process');
const FPS = 24;
(async () => {
  const mode = process.argv[2] || 'preview';
  const b = await chromium.launch();
  const p = await b.newPage({viewport:{width:720,height:1280}, deviceScaleFactor:1.5});
  const boxes = fs.readFileSync(path.join(__dirname,'boxes.json'),'utf8');
  await p.addInitScript(`window.BOXES=${boxes};window.DURS=${fs.existsSync(path.join(__dirname,'durs.json'))?fs.readFileSync(path.join(__dirname,'durs.json'),'utf8'):'null'}`);
  await p.goto('file://' + path.join(__dirname,'scene.html'));
  await p.evaluate(() => document.fonts.ready);
  const total = await p.evaluate(() => window.TOTAL);
  console.log('total', total);
  if (mode === 'preview') {
    const ts = (process.argv[3] || '').split(',').map(Number);
    for (const t of ts) { await p.evaluate(t => window.frame(t), t); await p.screenshot({path: path.join(__dirname, `prev-${t}.jpg`), type:'jpeg', quality:80}); }
  } else {
    const out = path.join(__dirname, 'oh-hell-how-to.mp4');
    const ff = spawn('ffmpeg', ['-y','-loglevel','error','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-',
      '-c:v','libx264','-preset','slow','-crf','27','-pix_fmt','yuv420p','-movflags','+faststart','-tune','animation', out], {stdio:['pipe','inherit','inherit']});
    const N = Math.ceil(total * FPS);
    for (let i = 0; i < N; i++) {
      await p.evaluate(t => window.frame(t), i / FPS);
      const buf = await p.screenshot({type:'jpeg', quality:90});
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % 240 === 0) console.log('frame', i, '/', N);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    // poster frame
    await p.evaluate(() => window.frame(1.8)); await p.screenshot({path: path.join(__dirname,'poster.jpg'), type:'jpeg', quality:80});
  }
  await b.close();
})();
