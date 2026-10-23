/* 复算原站场景树在某一播放头的绝对矩阵，用来看兔子的枢轴落在哪 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('C:/Users/fm051/AppData/Local/Temp/gr_scenes.json', 'utf8'));

const I = () => [[1, 0, 0], [0, 1, 0]];
const mul = (a, b) => [
  [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1], a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2]],
  [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1], a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2]]
];
const rot = (th, cx, cy) => {
  const c = Math.cos(th), s = Math.sin(th);
  return mul(mul([[1, 0, cx], [0, 1, cy]], [[c, -s, 0], [s, c, 0]]), [[1, 0, -cx], [0, 1, -cy]]);
};
const ap = (m, x, y) => [m[0][0] * x + m[0][1] * y + m[0][2], m[1][0] * x + m[1][1] * y + m[1][2]];

/* 从 CSS 片段里取某百分比的旋转值（rad） */
function rotAt(css, pct) {
  const re = /(\d+(?:\.\d+)?)%\s*\{([^}]*)\}/g;
  const keys = [];
  let m;
  while ((m = re.exec(css))) {
    const v = /--rotate-transform:\s*(-?[\d.]+)rad/.exec(m[2]);
    if (v) keys.push([Number(m[1]), Number(v[1])]);
  }
  if (!keys.length) return null;
  if (pct <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [a, va] = keys[i], [b, vb] = keys[i + 1];
    if (pct >= a && pct <= b) {
      const t = (pct - a) / (b - a);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease-in-out 近似
      return va + (vb - va) * e;
    }
  }
  return keys[keys.length - 1][1];
}

function walk(clip, pct, filter) {
  const motion = (clip.motion && clip.motion.nodes) || {};
  const byId = {};
  for (const k of Object.keys(motion)) byId[motion[k].nodeId] = motion[k].codeSnippets.css;
  const out = [];
  const rec = (node, parentAbs) => {
    let local = node.m || I();
    const css = byId[node.id];
    if (css && /--rotate-transform/.test(css)) {
      const th = rotAt(css, pct);
      if (th !== null) local = mul(local, rot(th, node.w / 2, node.h / 2));
    }
    const abs = mul(parentAbs, local);
    out.push({ node, abs, cx: node.w / 2, cy: node.h / 2 });
    for (const ch of node.children || []) rec(ch, abs);
  };
  const root = (clip.scene.children || []).find(n => /Rabbit ·/.test(n.name));
  rec(root, I());
  return out;
}

const clip = d.clips.forward;
const near = d.clips.near;
const rootNear = (near.scene.children || []).find(n => /Rabbit ·/.test(n.name));
const nearOut = [];
(function rec(n, pa) {
  const abs = mul(pa, n.m || I());
  nearOut.push({ node: n, abs });
  for (const ch of n.children || []) rec(ch, abs);
})(rootNear, I());

function report(label, pct) {
  console.log('\n===== ' + label + ' (pct ' + pct + ')');
  for (const r of walk(clip, pct)) {
    const n = r.node;
    if (!/jump hind|jump torso|jump foreleg|jump head|Rear ear|Front ear|Torso$|Tail$|Head silhouette|push-off/.test(n.name)) continue;
    const c = ap(r.abs, n.w / 2, n.h / 2);
    console.log(n.name.slice(0, 46).padEnd(46), 'center', c.map(v => v.toFixed(2)).join(', '), '| box', n.w.toFixed(1) + 'x' + n.h.toFixed(1));
  }
}
report('forward t=0ms', 0);
report('forward t=1152ms', 1152 / 36);
report('forward t=1820ms', 1820 / 36);

console.log('\n===== near (rest)');
for (const r of nearOut) {
  const n = r.node;
  if (!/jump hind|jump torso|jump foreleg|jump head|Rear ear|Front ear|Torso$|Tail$|Head silhouette|push-off/.test(n.name)) continue;
  const c = ap(r.abs, n.w / 2, n.h / 2);
  console.log(n.name.slice(0, 46).padEnd(46), 'center', c.map(v => v.toFixed(2)).join(', '), '| box', n.w.toFixed(1) + 'x' + n.h.toFixed(1));
}

/* 枢轴：父级链绝对矩阵 × 自身 m × 盒中心，再减去兔子根节点位移 */
console.log('\n===== pivots (root-local, 已减 305/635)');
const PIVOTS = {};
(function () {
  const motion = (clip.motion && clip.motion.nodes) || {};
  const byId = {};
  for (const k of Object.keys(motion)) byId[motion[k].nodeId] = motion[k];
  const rec = (node, parentAbs) => {
    const abs = mul(parentAbs, node.m || I());
    const c = ap(abs, node.w / 2, node.h / 2);
    if (byId[node.id]) {
      const key = node.name;
      console.log(key.slice(0, 46).padEnd(46), 'pivot', (c[0] - 305).toFixed(2) + ', ' + (c[1] - 635).toFixed(2), '| box', node.w.toFixed(2) + 'x' + node.h.toFixed(2));
    }
    for (const ch of node.children || []) rec(ch, abs);
  };
  const root = (clip.scene.children || []).find(n => /Rabbit ·/.test(n.name));
  rec(root, I());
})();
