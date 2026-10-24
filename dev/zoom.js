/* 生成局部放大对照页：node dev/zoom.js <src> <out.html> <x,y,w,h,s;...>
   例：node dev/zoom.js shots/new-entrance.png shots/zoom.html "520,630,190,150,4;830,520,190,190,4" */
const fs = require('fs');
const [src, out, spec] = process.argv.slice(2);
const panels = spec.split(';').map((s, i) => {
  const [x, y, w, h, k] = s.split(',').map(Number);
  return `<div class="p" style="width:${w * k}px;height:${h * k}px">
    <img src="${src}" style="transform:scale(${k});left:${-x * k}px;top:${-y * k}px">
    <b>#${i + 1} · ${x},${y} ×${k}</b></div>`;
}).join('');
fs.writeFileSync(out, `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#fff;display:flex;gap:10px;padding:8px;font:11px system-ui}
.p{position:relative;overflow:hidden;border:1px solid #ddd}
.p img{position:absolute;transform-origin:0 0;display:block}
b{position:absolute;left:4px;top:2px;color:#888;font-weight:400}
</style>${panels}`);
console.log('written', out);
