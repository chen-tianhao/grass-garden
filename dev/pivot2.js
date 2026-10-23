/* 复刻版：各关节枢轴点在世界坐标里的位置，用来跟原站对照 */
const { spawn } = require('child_process');
const http = require('http');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe'; const PORT=9363;
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars',`--remote-debugging-port=${PORT}`,'--window-size=1440,900','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const getJSON=p=>new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:PORT,path:p},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on('error',rej)});
const SNIP=`(function(){
  return ['hind','torso','foreleg','head','earRear','earFront'].map(function(k){
    var el=document.querySelector('.j-'+k);
    var piv=(el.dataset.pivot||'0 0').split(' ').map(Number);
    var m=el.getScreenCTM();
    var pt=new DOMPoint(piv[0],piv[1]).matrixTransform(m);
    return k+' pivot=('+(pt.x-305).toFixed(2)+','+(pt.y-635).toFixed(2)+')';
  }).join('\\n');
})()`;
(async()=>{
  let t=null;for(let i=0;i<40;i++){try{t=await getJSON('/json/list');if(t.length)break}catch(e){}await sleep(250)}
  const page=t.find(x=>x.type==='page');const ws=new WebSocket(page.webSocketDebuggerUrl);let id=0;const pend=new Map();
  await new Promise(r=>{ws.onopen=r});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}};
  const send=(m,p)=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}))});
  const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true});if(r.result?.exceptionDetails)console.log('EXC',r.result.exceptionDetails.exception?.description?.split('\n')[0]);return r.result?.result?.value};
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:8790/'});
  for(let i=0;i<40;i++){if(await ev('!!window.__garden')===true)break;await sleep(300)}
  for(const ms of [0,1152]){
    await ev(`window.__garden.forceClip('forward',false); window.__garden.pose(${ms}); 1`);
    await sleep(200);
    console.log('--- t='+ms+'\n'+await ev(SNIP));
  }
  ws.close();chrome.kill();process.exit(0);
})();
