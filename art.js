/* grassgarden · 场景美术
   —— 按原站的构图几何与采样色值重新绘制，全部为自有 SVG。
   每个可动画层的盒子尺寸/位置与原站场景图节点一一对应，
   这样 transform-origin:50% 50% 的缩放中心才与原站吻合。 */

window.ART = (function () {
  'use strict';

  const W = 1440, H = 900;

  /* 采样自原站的色值 */
  const C = {
    sky: '#f5f3e8',
    hill: '#eceedd',
    meadowA: '#dfe5d2',
    meadowB: '#d1ddc3',
    meadowC: '#bbcca6',
    meadowD: '#a7bd91',
    bush: '#789b73',
    treeLight: '#d3ddc6',
    treeMid: '#dfe5d2',
    treeTrunk: '#b2c1a0',
    ink: '#f4f3e5',
    rabbit: '#f6f2e4',
    rabbitSh: '#eae4d3',
    rabbitIn: '#e9c9c3',
    rabbitEye: '#2b2b26',
    rabbitNose: '#4a4640',
    leaf: '#7d9c6c',
    shadow: '#92a783'
  };

  /* 点列 → 平滑闭合路径（Catmull-Rom 转三次贝塞尔） */
  function smooth(pts, close) {
    if (!pts.length) return '';
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0]} ${p2[1]}`;
    }
    return close ? d + ' Z' : d;
  }

  /* 确定性微抖：给轮廓一点手绘的不规则，避免“数学完美”感 */
  function wobble(pts, amp) {
    return pts.map((p, i) => [
      +(p[0] + Math.sin(i * 2.399) * amp).toFixed(1),
      +(p[1] + Math.cos(i * 1.731) * amp * 0.8).toFixed(1)
    ]);
  }

  /* 手绘褶边：先把控制点加密成 Catmull-Rom 折线，再沿法向叠加正弦扰动。
     原站的灌木上缘是一串小圆弧，纯数学曲线会显得“太干净”。 */
  function scallop(pts, amp, waves) {
    const dense = [];
    const N = 20;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      for (let k = 0; k < N; k++) {
        const t = k / N, t2 = t * t, t3 = t2 * t;
        dense.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    dense.push(pts[pts.length - 1].slice());
    const out = dense.map((p, i) => {
      const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      // 只在两端衰减，避免首尾被扰动
      const fade = Math.min(1, i / 12, (dense.length - 1 - i) / 12);
      const s = Math.sin(i / dense.length * Math.PI * 2 * waves) * amp * fade;
      return [p[0] + (-dy / len) * s, p[1] + (dx / len) * s];
    });
    let d = `M${out[0][0].toFixed(1)} ${out[0][1].toFixed(1)}`;
    for (let i = 1; i < out.length; i++) d += ` L${out[i][0].toFixed(1)} ${out[i][1].toFixed(1)}`;
    return d;
  }

  /* 轮廓点去毛刺：3 次轻量平滑，把叶瓣之间的小起伏抹圆，
     但保留大轮廓（否则会变成山脊而不是云朵）。 */
  function soften(pts, passes) {
    passes = passes || 3;
    let a = pts.map(p => p.slice());
    for (let k = 0; k < passes; k++) {
      const b = a.map(p => p.slice());
      for (let i = 1; i < a.length - 1; i++) {
        b[i][0] = (a[i - 1][0] + 2 * a[i][0] + a[i + 1][0]) / 4;
        b[i][1] = (a[i - 1][1] + 2 * a[i][1] + a[i + 1][1]) / 4;
      }
      a = b;
    }
    return a;
  }

  function svgBox(w, h, inner, style) {
    return `<svg class="art" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${inner}</svg>`;
  }

  /* ---------------- 1 · 远山（1900×900 @ 0,0） ---------------- */
  function hills() {
    return svgBox(1900, 900,
      `<path d="${smooth([[0,470],[240,452],[520,438],[760,432],[1000,430],[1240,436],[1500,450],[1900,468],[1900,900],[0,900]], true)}" fill="${C.hill}"/>`);
  }

  /* ---------------- 2 · 草地与弧形光带（1800×1000 @ 0,0） ---------------- */
  function meadow() {
    const bands = [
      { fill: C.meadowA, top: [[0,432],[300,414],[600,392],[900,369],[1150,376],[1400,398],[1800,414]] },
      { fill: C.meadowB, top: [[0,520],[300,504],[600,487],[900,469],[1150,452],[1400,438],[1800,444]] },
      { fill: C.meadowC, top: [[0,592],[300,578],[600,556],[900,516],[1150,492],[1400,472],[1800,482]] },
      { fill: C.meadowD, top: [[0,772],[300,760],[600,742],[900,713],[1150,696],[1400,684],[1800,702]] }
    ];
    let out = '';
    for (const b of bands) {
      out += `<path d="${smooth(b.top.concat([[1800,1000],[0,1000]]), true)}" fill="${b.fill}"/>`;
    }
    return svgBox(1800, 1000, out);
  }

  /* ---------------- 3 · 纵深树木（1700×900 @ 0,0） ---------------- */
  function trees() {
    // 树冠 = 单块柔软剪影（原站是手绘的云状块，不是圆的堆叠）
    function crown(cx, cy, w, h, fill) {
      const pts = [];
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const r = 1 + 0.10 * Math.sin(a * 3 + cx * 0.01) + 0.06 * Math.cos(a * 5);
        pts.push([+(cx + Math.cos(a) * w * r).toFixed(1), +(cy + Math.sin(a) * h * r).toFixed(1)]);
      }
      return `<path d="${smooth(pts, true)}" fill="${fill}"/>`;
    }
    return svgBox(1700, 900, `
      <g transform="translate(120 30)">
        <rect x="-7" y="300" width="14" height="440" fill="${C.treeTrunk}"/>
        ${crown(-18, 228, 116, 92, C.treeLight)}
        ${crown(-108, 282, 78, 62, C.treeLight)}
        ${crown(78, 284, 74, 58, C.treeLight)}
      </g>
      <g transform="translate(1150 128)">
        <rect x="-4" y="196" width="8" height="112" fill="${C.treeTrunk}"/>
        ${crown(0, 150, 92, 74, C.treeMid)}
        ${crown(-64, 192, 62, 48, C.treeMid)}
        ${crown(66, 190, 58, 46, C.treeMid)}
      </g>
      <g transform="translate(1400 186)">
        <rect x="-3" y="150" width="6" height="96" fill="${C.treeTrunk}"/>
        ${crown(0, 110, 72, 56, C.treeLight)}
        ${crown(-50, 142, 48, 38, C.treeLight)}
        ${crown(50, 140, 46, 36, C.treeLight)}
      </g>`);
  }

  /* ---------------- 4 · 目标灌木（460×259 @ 1020,390） ---------------- */
  function destBush() {
    // 轮廓采样自原站（每 15 单位），保留叶瓣的圆润起伏
    const top = [
      [15,97],[30,77],[45,64],[60,55],[75,50],[90,49],[105,50],[120,41],[135,34],[150,30],[165,30],[180,35],
      [195,40],[210,35],[225,33],[240,36],[255,43],[270,59],[285,55],[300,55],[315,57],[330,64],[345,77],
      [360,89],[375,92],[390,97],[405,110],[420,124],[438,142],[452,152]
    ];
    return svgBox(460, 259,
      `<path d="${scallop(soften(top, 3).concat([[452,244],[330,254],[180,252],[78,238],[14,196],[4,120]]), 2.4, 4)} Z" fill="${C.bush}"/>`) +
      `<div class="info-label" data-section="work">
        <h2 class="label" style="left:138px;top:86px"><a class="projects-link" href="projects/">Projects</a></h2>
      </div>`;
  }

  /* ---------------- 5 · 出发灌木（1100×620 @ -180,180） ---------------- */
  function depBush() {
    // 轮廓采样自原站（每 20 单位），保留 4 个叶瓣
    const top = [
      [0,124],[40,121],[80,119],[120,118],[160,117],[180,119],[200,116],[220,116],[240,117],[260,120],
      [280,102],[300,89],[320,80],[340,74],[360,71],[380,70],[400,73],[420,78],[440,88],[460,99],
      [480,90],[500,84],[520,80],[540,79],[560,81],[580,86],[600,94],[620,107],[640,130],[660,137],
      [680,132],[700,129],[720,130],[740,132],[760,139],[780,146],[800,158],[820,176],[840,207],[860,213],
      [880,215],[900,220],[920,228],[940,238],[960,252],[980,275],[1000,341],[1020,353],[1040,369],[1060,395]
    ];
    return svgBox(1100, 620,
      `<path d="${scallop(soften(top, 3).concat([[1072,470],[1072,556],[0,612]]), 3.0, 8)} Z" fill="${C.bush}"/>`) +
      `<div class="info-label" data-section="about">
        <h1 class="label" style="left:330px;top:205px">About</h1>
        <p class="about-intro" style="left:330px;top:286px">Hello, I'm Grassrabbit</p>
      </div>`;
  }

  /* ---------------- 6 · 接触影（150×10 @ 320,820） ---------------- */
  function shadow() {
    return `<svg class="art" width="150" height="10" viewBox="0 0 150 10">
      <ellipse cx="75" cy="5" rx="75" ry="5" fill="${C.shadow}" opacity="0.14"/>
    </svg>`;
  }

  /* ---------------- 7 · 兔子（180×190 @ 305,635） ---------------- */
  /* 静止姿态 = 坐着吃草。比例取自原站裁图：
     身体大而圆润，头相对小，耳朵极长（约 1.3 倍头高），
     吻部向前凸出，前爪举到嘴边叼着草叶。 */
  function rabbit() {
    /* 坐姿（站立）姿态。轮廓逐点取自原站 5 倍实拍的像素，
       按「身体宽 102、脚底为 y=0」映射到本盒子：
       臀部在左下、身体近乎垂直向上、头在右上方、后脚向前平伸。
       这是"站立"而不是"蜷着"的关键——背线接近竖直，肩不向右倾。 */
    return `
    <div class="r-facing">
      <div class="r-part pose-sit">
        <svg width="180" height="190" viewBox="0 0 180 190" overflow="visible">
          <!-- Hind leg Â· push-off [fbc74.svg] -->
          <g transform="matrix(1.0000,0.0000,0.0000,1.0000,10.58,121.31)">
          <g>
          <path d="M49.8111 2.50025C17.2949 -7.95137 3.35945 16.4357 13.8111 37.339L3.35945 52.4357C-3.60829 62.5003 0.262673 67.5325 14.9723 67.5325H56.7788C68.3917 62.1131 67.2304 57.8551 53.2949 54.7583L38.1982 51.2744C61.424 37.339 65.2949 21.0809 49.8111 2.50025Z" fill="#E9E7DA"/>
          </g>
          </g>
          <!-- Tail [5a482.svg] -->
          <g transform="matrix(0.5735,-0.8192,0.8192,0.5735,-1.72,175.82)">
          <g>
          <path d="M17.4194 34.8387C27.0398 34.8387 34.8387 27.0398 34.8387 17.4194C34.8387 7.79891 27.0398 0 17.4194 0C7.79891 0 0 7.79891 0 17.4194C0 27.0398 7.79891 34.8387 17.4194 34.8387Z" fill="#FAF7EB"/>
          </g>
          </g>
          <!-- Torso [f066e.svg] -->
          <g transform="matrix(0.5735,-0.8192,0.8192,0.5735,-15.32,150.70)">
          <g>
          <path d="M52.2581 83.6129C81.1194 83.6129 104.516 64.8956 104.516 41.8064C104.516 18.7173 81.1194 0 52.2581 0C23.3967 0 0 18.7173 0 41.8064C0 64.8956 23.3967 83.6129 52.2581 83.6129Z" fill="#FAF7EB"/>
          </g>
          </g>
          <!-- Far ear Â· trailing [42c54.svg] -->
          <g transform="matrix(0.9139,-0.4059,0.4059,0.9139,18.15,-8.41)">
          <g>
          <path d="M11.9107 80.2703C-3.5732 29.1735 -3.9603 2.46382 10.7494 0.141238C27.0074 -2.18134 31.6526 24.1413 24.6849 79.109L11.9107 80.2703Z" fill="#E8E5D8"/>
          <path d="M14.2332 67.4961C5.71707 28.7864 4.94287 9.04447 11.9106 8.27027C19.6526 9.04447 21.9752 28.7864 18.8783 67.4961H14.2332Z" fill="#D9BEB0"/>
          </g>
          </g>
          <!-- Vector [0580b.svg] -->
          <g transform="matrix(1.0000,-0.0000,0.0000,1.0000,48.77,45.27)">
          <path d="M14.8645 4.40068C36.542 -4.88964 51.2516 0.529714 58.9935 20.6587L69.4452 38.0781C70.9935 43.4975 67.1226 47.3684 57.8323 49.691C43.8968 63.6265 28.4129 64.0135 11.3806 50.8523C-4.87742 36.9168 -3.71613 21.433 14.8645 4.40068Z" fill="#FAF7EB"/>
          </g>
          <!-- Vector_2 [2d7fa.svg] -->
          <g transform="matrix(1.0000,-0.0000,0.0000,1.0000,92.67,69.41)">
          <path d="M3.48387 6.96774C5.40801 6.96774 6.96774 5.40801 6.96774 3.48387C6.96774 1.55973 5.40801 0 3.48387 0C1.55973 0 0 1.55973 0 3.48387C0 5.40801 1.55973 6.96774 3.48387 6.96774Z" fill="#293C32"/>
          </g>
          <!-- Vector_3 [08e0c.svg] -->
          <g transform="matrix(1.0000,-0.0000,0.0000,1.0000,112.41,84.51)">
          <path d="M0 0L5.80645 2.32258L0 6.96774V0Z" fill="#BA9483"/>
          </g>
          <!-- Near ear Â· trailing [7d180.svg] -->
          <g transform="matrix(0.9511,-0.3089,0.3089,0.9511,41.04,-20.91)">
          <g>
          <path d="M11.0323 88.4819C-3.67742 32.74 -3.67742 3.32064 11.0323 0.223864C29.6129 -2.87291 34.6451 26.1593 26.129 87.3206L11.0323 88.4819Z" fill="#FAF7EB"/>
          <path d="M14.5162 74.5464C6.00003 32.7399 5.61292 11.0625 13.3549 9.51413C21.871 11.0625 24.1935 32.7399 20.3226 74.5464H14.5162Z" fill="#D9BEB0"/>
          </g>
          </g>
          <!-- Front legs Â· reach and tuck [fc1fc.svg] -->
          <g transform="matrix(0.9397,0.3420,-0.3420,0.9397,62.81,110.91)">
          <g>
          <path d="M4.25997 0.325218C16.4142 -1.74591 23.1726 6.07531 24.5352 23.7889L31.5029 40.0469L47.761 41.2082C55.503 46.6276 55.1158 51.2728 46.5997 55.1437H19.89C14.4706 54.3695 10.9868 49.7243 9.4384 41.2082L0.240985 6.46241C-0.595144 3.3037 0.744518 1.25797 4.25997 0.325218Z" fill="#F2EFE3"/>
          </g>
          </g>
          <!-- Front legs Â· reach and tuck [bc7d5.svg] -->
          <g transform="matrix(0.9397,0.3420,-0.3420,0.9397,62.81,110.91)">
          <g>
          <path d="M4.26 0.325224C16.4142 -1.7459 23.1727 6.07532 24.5352 23.7889L31.5029 40.0469L47.761 41.2082C55.503 46.6276 55.1158 51.2728 46.5997 55.1437H19.89C14.4707 54.3695 10.9868 49.7243 9.43843 41.2082L0.241013 6.46241C-0.595116 3.3037 0.744545 1.25797 4.26 0.325224Z" fill="#F2EFE3"/>
          </g>
          </g>
        </svg>
      </div>

    </div>`;
  }

  /* ---------------- 8 · 落叶（各 20×12，透明度 .5） ---------------- */
  function leaves() {
    return [[80,150],[240,85],[1270,150],[1370,250],[1010,120]].map((s, i) =>
      `<div class="layer leaf leaf-${i + 1}" data-layer="leaf${i + 1}" style="left:${s[0]}px;top:${s[1]}px;width:20px;height:12px">
        <svg width="20" height="12" viewBox="0 0 20 12"><path d="M0 6 q 10 -8 20 0 q -10 8 -20 0 z" fill="${C.treeLight}" opacity="0.5"/></svg>
      </div>`).join('');
  }

  /* ---------------- 舞台组装 ---------------- */
  function scene() {
    return [
      `<div class="layer" data-layer="hills"     style="left:0;top:0;width:1900px;height:900px">${hills()}</div>`,
      `<div class="layer" data-layer="meadow"    style="left:0;top:0;width:1800px;height:1000px">${meadow()}</div>`,
      `<div class="layer" data-layer="trees"     style="left:0;top:0;width:1700px;height:900px">${trees()}</div>`,
      `<div class="layer" data-layer="destBush"  style="left:1020px;top:390px;width:460px;height:259px">${destBush()}</div>`,
      `<div class="layer" data-layer="depBush"   style="left:-180px;top:180px;width:1100px;height:620px">${depBush()}</div>`,
      `<div class="layer" data-layer="shadow"    style="left:320px;top:820px;width:150px;height:10px">${shadow()}</div>`,
      `<div class="layer rabbit" data-layer="rabbit" style="left:305px;top:635px;width:180px;height:190px">${rabbit()}</div>`,
      leaves()
    ].join('');
  }

  return { W, H, C, scene };
})();
