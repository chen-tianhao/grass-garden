const http=require('http'),fs=require('fs'),path=require('path');
const root=__dirname;
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/')p='/index.html';
  const f=path.join(root,p);
  try{
    let file=f;
    if(fs.statSync(f).isDirectory()) file=path.join(f,'index.html');
    const d=fs.readFileSync(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
    res.end(d);
  }catch(e){res.writeHead(404);res.end('404 '+p);}
}).listen(8790,()=>console.log('serving '+root+' on 8790'));
