/* 抓原站兔子在不同播放头的姿态：node dev/air.js <url> <outDir> [times]
   times 用逗号分隔的毫秒，默认取起跳前的静止帧与弧线各关键点 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9347;
const URL_ = process.argv[2] || 'https://grassrabbit.fyi/';
const OUT = process.argv[3] || 'C:/Users/fm051/AppData/Local/Temp/air';
const TIMES = (process.argv[4] || '0,320,480,720,960,1152,1400,1600,1820,2020').split(',').map(Number);
const CLIP = process.argv[5] || 'forward';
const FAR = process.argv[6] === 'far';
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
  for (let i = 0; i < 60; i++) { try { t = await getJSON('/json/list'); if (t.length) break; } catch (e) {} await sleep(250); }
  const page = t.find(x => x.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.text || 'exc');
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result?.result?.value;
  };

  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url: URL_ });
  // 等站点就绪：原站暴露 window.gardenPlayer，复刻版暴露 window.__garden
  for (let i = 0; i < 40; i++) {
    const ok = await ev(`!!(window.gardenPlayer||window.__garden)`);
    if (ok === true) break;
    await sleep(400);
  }
  await sleep(600);

  const api = await ev(`(function(){ var CLIPNAME='${CLIP}';
    if (window.gardenPlayer) return 'original';
    if (window.__garden) return 'replica';
    return 'none';
  })()`);
  console.log('api =', api);

  for (const ms of TIMES) {
    await ev(`(function(){ var CLIPNAME='${CLIP}';
      var p = window.gardenPlayer || (window.__garden && window.__garden.player);
      if (window.gardenPlayer) {
        /* 原站的 garden.js 每帧用 idle 时钟调 player.pose()，会把我们定的播放头顶掉，
           所以先存下真实方法，再把公开的 pose 换成空函数把它冻住 */
        if (!window.__frozen) {
          window.__origSelect = p.select.bind(p);
          window.__origPose = p.pose.bind(p);
          p.pose = function () {};
          window.__frozen = 1;
        }
        window.__origSelect(CLIPNAME);
        window.__origPose(${ms});
      } else {
        window.__garden.forceClip('${CLIP}', ${FAR}); window.__garden.pose(${ms});
      }
      return 1;
    })()`);
    await sleep(120);
    const rect = await ev(`(function(){ var CLIPNAME='${CLIP}';
      /* 原站：位移在 .figma-motion 内层；复刻版：直接作用在 data-layer 上 */
      var el = document.querySelector('[data-node-id="35:610"] .figma-motion')
            || document.querySelector('[data-layer="rabbit"]');
      if(!el) return null;
      var r = el.getBoundingClientRect();
      return {x:r.x,y:r.y,w:r.width,h:r.height};
    })()`);
    if (!rect) { console.log('no rabbit rect at', ms); continue; }
    const pad = 40;
    const clip = {
      x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad),
      width: Math.min(1440 - Math.max(0, rect.x - pad), rect.w + pad * 2),
      height: Math.min(900 - Math.max(0, rect.y - pad), rect.h + pad * 2),
      scale: 1
    };
    const r = await send('Page.captureScreenshot', { format: 'png', clip });
    const name = `${api}-t${String(ms).padStart(4, '0')}`;
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64'));
    const full = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '-full.png'), Buffer.from(full.result.data, 'base64'));
    console.log('saved', name, JSON.stringify({ x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }));
  }
  console.log('errors:', errors.length ? errors.slice(0, 3).join(' ; ') : 'none');
  ws.close(); chrome.kill(); process.exit(0);
})();
