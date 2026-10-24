/* 抓一段连续帧，用来看角色的动作：node dev/motion.js <mode> <outDir> [帧数] [间隔ms]
   mode = idle | jump | back —— jump/back 会强制切到对应片段并每帧驱动 pose() */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9371;
const MODE = process.argv[2] || 'idle';
const OUT = process.argv[3] || 'C:/Users/fm051/AppData/Local/Temp/motion';
const COUNT = Number(process.argv[4] || 16);
const STEP = Number(process.argv[5] || 180);
const CLIP = { idle: 900, forward: 1000, back: 1200 }[MODE] || 1000;
fs.mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = p => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on('error', rej);
});

(async () => {
  let t = null;
  for (let i = 0; i < 40; i++) { try { t = await getJSON('/json/list'); if (t.length) break; } catch (e) {} await sleep(250); }
  const page = t.find(x => x.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (m, p) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async x => {
    const r = await send('Runtime.evaluate', { expression: x, returnByValue: true });
    if (r.result?.exceptionDetails) console.log('EXC', r.result.exceptionDetails.exception?.description?.split('\n')[0]);
    return r.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8790/' });
  for (let i = 0; i < 40; i++) { if (await ev('!!window.__garden') === true) break; await sleep(300); }
  await sleep(900);

  if (MODE !== 'idle') {
    await ev(`(function(){
      window.__garden.forceClip('${MODE}', ${MODE === 'back'});
      if (window.__pump) clearInterval(window.__pump);
      window.__pump = setInterval(function(){ window.__garden.pose(${CLIP}); }, 16);
      return 1;
    })()`);
    await sleep(300);
  }

  // 裁切区域：x y w h scale；第 6 个参数传 auto + 选择器名则按元素实时定位
  const [cx, cy, cw, ch, cs] = process.argv.slice(6).map(Number);
  const autoSel = process.argv[6] === 'auto' ? (process.argv[7] || '.dog') : null;
  const fixedClip = { x: 80, y: 420, width: 640, height: 420, scale: 1 };
  const pad = 24, zoom = Number(process.argv[8] || 2);
  const clipAt = async () => {
    if (!autoSel) {
      return cw ? { x: cx, y: cy, width: cw, height: ch, scale: cs || 1 } : fixedClip;
    }
    const r = await ev(`(function(){
      var el=document.querySelector('${autoSel}');
      if(!el) return null;
      var b=el.getBoundingClientRect();
      return {x:b.x,y:b.y,w:b.width,h:b.height};
    })()`);
    if (!r) return fixedClip;
    const w = Math.max(60, r.w + pad * 2), h = Math.max(60, r.h + pad * 2);
    return { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: w, height: h, scale: zoom };
  };
  for (let i = 0; i < COUNT; i++) {
    const clip = await clipAt();
    const r = await send('Page.captureScreenshot', { format: 'png', clip });
    fs.writeFileSync(path.join(OUT, `f${String(i).padStart(2, '0')}.png`), Buffer.from(r.result.data, 'base64'));
    await sleep(STEP);
  }
  console.log('saved', COUNT, 'frames to', OUT);
  ws.close(); chrome.kill(); process.exit(0);
})();
