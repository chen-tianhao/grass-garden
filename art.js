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
    /* 比例按原站实测：整体 local x 3..126、y -20..188。
       身体用一条带肩部凹口的路径（而非椭圆），头才能与身体分离出颈部。 */
    return `
    <div class="r-facing">
      <div class="r-part pose-sit">
      <div class="r-part j-torso">
        <svg width="180" height="190" viewBox="0 0 180 190" overflow="visible">
          <!-- 后脚并入躯干：跳跃时跟随身体转动，否则身体会在脚的位置断开 -->
          <ellipse cx="54" cy="184" rx="19" ry="7" fill="${C.rabbit}"/>
          <path d="M14 180 C 2 158 0 126 8 106 C 16 86 32 74 50 73
                   C 62 72 70 82 76 96 C 84 114 94 134 97 154
                   C 99 170 95 183 87 187 C 68 195 30 194 14 180 Z"
                fill="${C.rabbit}"/>
          <circle cx="7" cy="124" r="9" fill="${C.rabbit}"/>
          <ellipse cx="44" cy="170" rx="30" ry="16" fill="${C.rabbitSh}"/>

          <g class="r-part j-head">
            <g class="r-part j-earRear">
              <path d="M72 54 C 68 32 70 4 78 -16 C 84 -24 92 -18 92 -4 C 92 18 88 42 84 56 Z"
                    fill="${C.rabbit}"/>
              <path d="M76 50 C 73 32 75 10 81 -6 C 85 -12 88 -6 88 2 C 88 20 85 38 82 50 Z"
                    fill="${C.rabbitIn}"/>
            </g>
            <g class="r-part j-earFront">
              <path d="M88 54 C 86 30 90 2 98 -18 C 104 -26 112 -18 112 -4 C 112 20 106 44 100 56 Z"
                    fill="${C.rabbit}"/>
              <path d="M93 50 C 91 30 95 8 101 -6 C 105 -12 108 -4 108 4 C 108 22 104 40 100 50 Z"
                    fill="${C.rabbitIn}"/>
            </g>
            <circle cx="85" cy="77" r="27" fill="${C.rabbit}"/>
            <ellipse cx="106" cy="94" rx="15" ry="11" fill="${C.rabbit}"/>
            <circle cx="95" cy="78" r="4" fill="${C.rabbitEye}"/>
            <ellipse cx="119" cy="96" rx="2.6" ry="2.1" fill="${C.rabbitNose}"/>
          </g>

          <g class="r-part j-foreleg">
            <ellipse cx="92" cy="132" rx="9" ry="24" fill="${C.rabbit}" transform="rotate(-36 92 132)"/>
            <ellipse cx="104" cy="116" rx="12" ry="9" fill="${C.rabbit}"/>
            <path d="M110 106 Q 122 100 130 107 Q 125 115 112 114 Z" fill="${C.leaf}"/>
          </g>
        </svg>
      </div>
      </div>

      <!-- 腾空姿态：坐姿素材旋转后无法变成飞跃形状（缺伸展的四肢），
           故单独画一版水平姿态，起跳后交叉淡入、落地前淡出。 -->
      <div class="r-part pose-air">
        <svg width="180" height="190" viewBox="0 0 180 190" overflow="visible">
          <!-- 后腿：从臀部向左下伸出，必须露在身体轮廓之外才读得出 -->
          <path d="M36 114 C 22 116 8 126 0 136 C 6 148 22 150 34 142 Z" fill="${C.rabbit}"/>
          <ellipse cx="-3" cy="139" rx="12" ry="7" fill="${C.rabbit}" transform="rotate(-26 -3 139)"/>
          <!-- 尾巴 -->
          <circle cx="10" cy="88" r="8" fill="${C.rabbit}"/>
          <!-- 身体：水平长椭圆 -->
          <ellipse cx="68" cy="100" rx="56" ry="34" fill="${C.rabbit}" transform="rotate(-5 68 100)"/>
          <!-- 肩颈过渡，填平头与身体之间的夹角 -->
          <ellipse cx="106" cy="88" rx="26" ry="24" fill="${C.rabbit}"/>
          <!-- 腹部 -->
          <ellipse cx="76" cy="118" rx="28" ry="9" fill="${C.rabbitSh}"/>
          <!-- 头与吻部 -->
          <circle cx="120" cy="72" r="26" fill="${C.rabbit}"/>
          <ellipse cx="141" cy="84" rx="14" ry="10" fill="${C.rabbit}"/>
          <!-- 耳朵向后掠 -->
          <ellipse cx="106" cy="30" rx="8.5" ry="30" fill="${C.rabbit}" transform="rotate(-50 106 30)"/>
          <ellipse cx="106" cy="31" rx="4.2" ry="22" fill="${C.rabbitIn}" transform="rotate(-50 106 31)"/>
          <ellipse cx="119" cy="22" rx="8.5" ry="31" fill="${C.rabbit}" transform="rotate(-40 119 22)"/>
          <ellipse cx="119" cy="23" rx="4.2" ry="23" fill="${C.rabbitIn}" transform="rotate(-40 119 23)"/>
          <!-- 前腿：收在胸前，末端有脚掌 -->
          <path d="M108 98 C 121 95 133 101 137 111 C 131 120 116 118 107 110 Z" fill="${C.rabbit}"/>
          <ellipse cx="138" cy="114" rx="10" ry="7" fill="${C.rabbit}" transform="rotate(12 138 114)"/>
          <circle cx="130" cy="68" r="4" fill="${C.rabbitEye}"/>
          <ellipse cx="153" cy="86" rx="2.6" ry="2.1" fill="${C.rabbitNose}"/>
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
