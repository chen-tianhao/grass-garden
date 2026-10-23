/* 裁剪并放大：node dev/crop.js <src> <dst> <x0> <y0> <x1> <y1> [倍数] */
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
function writePNG(path, W, H, rgb) {
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const idat = zlib.deflateSync(raw);
  const crcTable = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  function chunk(t, d) {
    const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    const tt = Buffer.from(t, 'ascii');
    let crc = 0xffffffff; const all = Buffer.concat([tt, d]);
    for (const b of all) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
    const c = Buffer.alloc(4); c.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, tt, d, c]);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}
const [src, dst, a, b, c, d, k] = process.argv.slice(2);
const K = Number(k || 3);
const img = readPNG(src);
const x0 = Math.max(0, +a), y0 = Math.max(0, +b);
const x1 = Math.min(img.w, +c), y1 = Math.min(img.h, +d);
const W = (x1 - x0) * K, H = (y1 - y0) * K;
const rgb = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const px = Math.min(img.w - 1, x0 + Math.floor(x / K)), py = Math.min(img.h - 1, y0 + Math.floor(y / K));
  const si = (py * img.w + px) * img.bpp, di = (y * W + x) * 3;
  rgb[di] = img.data[si]; rgb[di + 1] = img.data[si + 1]; rgb[di + 2] = img.data[si + 2];
}
writePNG(dst, W, H, rgb);
console.log(dst, W + 'x' + H);
