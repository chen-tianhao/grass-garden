/* 测量兔子在舞台上的实际包围盒 */
const { spawn } = require('child_process');
const http = require('http');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9342;
const URL_ = process.argv[2] || 'http://127.0.0.1:8790/';
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-sandbox',`--remote-debugging-port=${PORT}`,'--window-size=1440,900','about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = p => new Promise((res, rej) => { http.get({host:'127.0.0.1',port:PORT,path:p}, r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on('error',rej); });
(async () => {
  let t=null; for(let i=0;i<40;i++){try{t=await getJSON('/json/list');if(t.length)break}catch(e){}await sleep(250)}
  const page=t.find(x=>x.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  let id=0; const pending=new Map();
  await new Promise(r=>{ws.onopen=r});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}};
  const send=(method,params)=>new Promise(res=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method,params}))});
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:URL_});
  await sleep(2800);
  const r = await send('Runtime.evaluate', { expression: `(() => {
    const svg = document.querySelector('.pose-sit svg');
    if (!svg) return 'no svg';
    const b = svg.getBBox();
    const rect = svg.getBoundingClientRect();
    const scene = document.querySelector('#scene');
    const sc = new DOMMatrix(getComputedStyle(scene).transform);
    return JSON.stringify({
      bbox: { x:+b.x.toFixed(1), y:+b.y.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1) },
      screen: { w:+rect.width.toFixed(1), h:+rect.height.toFixed(1) },
      sceneScale: +sc.a.toFixed(4),
      stage: { w:+(b.width*sc.a).toFixed(1), h:+(b.height*sc.a).toFixed(1) }
    });
  })()`, returnByValue: true });
  console.log(r.result.result.value);
  ws.close(); chrome.kill(); process.exit(0);
})();
