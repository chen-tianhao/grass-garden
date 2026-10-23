/* 量出原站每个关节“旋转盒”的中心（= CSS 的 transform-origin），用来校验枢轴换算 */
const { spawn } = require('child_process');
const http = require('http');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9361;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = p => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on('error', rej);
});

const SNIP = `(function(){
  var map=window.__map||{hind:'59:171',torso:'59:178',foreleg:'59:185',head:'59:189',earRear:'59:191',earFront:'59:201'};
  var rows=[];
  Object.keys(map).forEach(function(k){
    var list=document.querySelectorAll('[data-node-id="'+map[k]+'"]');
    var pick=null;
    for(var i=0;i<list.length;i++){var r=list[i].getBoundingClientRect();if(r.width>0){pick=list[i];break;}}
    if(!pick){rows.push(k+' hidden');return;}
    var inner=pick.querySelector('.figma-motion');
    var r=(inner||pick).getBoundingClientRect();
    rows.push(k+' pivot=('+(r.left-305+r.width/2).toFixed(2)+','+(r.top-635+r.height/2).toFixed(2)+') box='+r.width.toFixed(1)+'x'+r.height.toFixed(1));
  });
  return rows.join('\\n');
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
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: process.argv[2] || 'https://grassrabbit.fyi/' });
  const CLIP = process.argv[3] || 'forward';
  if (CLIP === 'near') await ev(`window.__map={foreleg:'59:59',head:'59:63',earRear:'59:65',earFront:'59:75',paw:'109:51'}`);
  for (let i = 0; i < 40; i++) { if (await ev('!!window.gardenPlayer') === true) break; await sleep(400); }
  await sleep(600);
  for (const ms of [0, 1152]) {
    await ev(`(function(){var p=window.gardenPlayer;
      if(!window.__f){window.__s=p.select.bind(p);window.__p=p.pose.bind(p);p.pose=function(){};window.__f=1}
      window.__s('${CLIP}');window.__p(${ms});return 1})()`);
    await sleep(200);
    console.log('--- t=' + ms + '\n' + await ev(SNIP));
  }
  ws.close(); chrome.kill(); process.exit(0);
})();
