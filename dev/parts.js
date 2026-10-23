/* 对比原站与复刻版兔子各零件的渲染位置：node dev/parts.js <url> */
const { spawn } = require('child_process');
const http = require('http');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9357;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = p => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on('error', rej);
});

const ORIG = `(function(){
  var map={hind:'59:173',tail:'59:180',torso:'59:183',earRear:'59:193',head:'59:197',earFront:'59:203',foreleg:'59:187'};
  var out={};
  Object.keys(map).forEach(function(k){
    var list=document.querySelectorAll('[data-node-id="'+map[k]+'"]');
    for(var i=0;i<list.length;i++){
      var r=list[i].getBoundingClientRect();
      if(r.width>0&&r.height>0){out[k]=[r.left,r.top,r.width,r.height].map(function(v){return Math.round(v*10)/10});break;}
    }
  });
  return JSON.stringify(out);
})()`;

const REPLICA = `(function(){
  var map={hind:'hind',tail:'tail',torso:'torso',earRear:'earRear',head:'head',earFront:'earFront',foreleg:'forelegA'};
  var out={};
  Object.keys(map).forEach(function(k){
    var el=document.querySelector('[data-part="'+map[k]+'"]');
    if(!el) return;
    var r=el.getBoundingClientRect();
    out[k]=[r.left,r.top,r.width,r.height].map(function(v){return Math.round(v*10)/10});
  });
  return JSON.stringify(out);
})()`;

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
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: process.argv[2] });
  for (let i = 0; i < 40; i++) { if (await ev('!!(window.gardenPlayer||window.__garden)') === true) break; await sleep(400); }
  await sleep(600);
  const isOrig = await ev('!!window.gardenPlayer');
  const ms = Number(process.argv[3] || 0);
  if (isOrig) {
    await ev(`(function(){var p=window.gardenPlayer;
      if(!window.__f){window.__s=p.select.bind(p);window.__p=p.pose.bind(p);p.pose=function(){};window.__f=1}
      window.__s('forward');window.__p(${ms});return 1})()`);
  } else {
    await ev(`window.__garden.forceClip('forward',false); window.__garden.pose(${ms}); 1`);
  }
  await sleep(250);
  const out = await ev(isOrig ? ORIG : REPLICA);
  console.log((isOrig ? 'ORIGINAL' : 'REPLICA') + ' t=' + ms);
  const obj = JSON.parse(out);
  for (const k of Object.keys(obj)) {
    const [x, y, w, h] = obj[k];
    console.log('  ' + k.padEnd(9) + ' left=' + (x - 305).toFixed(1) + ' top=' + (y - 635).toFixed(1) + ' w=' + w + ' h=' + h);
  }
  ws.close(); chrome.kill(); process.exit(0);
})();
