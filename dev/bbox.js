/* 用内耳粉色 #D9BEB0 定位兔子，输出 bbox：node dev/bbox.js <png> */
const fs = require('fs'), zlib = require('zlib');
function readPNG(p) {
  const b = fs.readFileSync(p); let pos = 8, w, h, ct, idat = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos); const type = b.toString('ascii', pos + 4, pos + 8);
    const data = b.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 1, stride = w * bpp;
  const out = Buffer.alloc(h * stride); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, bb = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v = (v + a) & 255; else if (f === 2) v = (v + bb) & 255;
      else if (f === 3) v = (v + Math.floor((a + bb) / 2)) & 255;
      else if (f === 4) { const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c)) & 255; }
      cur[x] = v;
    }
    cur.copy(out, y * stride); prev = cur;
  }
  return { w, h, bpp, data: out };
}
const img = readPNG(process.argv[2]);
let mnx = 1e9, mxx = -1, mny = 1e9, mxy = -1, n = 0;
for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
  const i = (y * img.w + x) * img.bpp;
  const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
  // #D9BEB0 = 217,190,176
  if (Math.abs(r - 217) < 16 && Math.abs(g - 190) < 16 && Math.abs(b - 176) < 16) {
    if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; n++;
  }
}
console.log(`${process.argv[2]}: img ${img.w}x${img.h}  bbox x${mnx}..${mxx} y${mny}..${mxy}  (w${mxx-mnx} h${mxy-mny}) px${n}`);
