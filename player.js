/* grassgarden · 时间轴播放器
   —— 把原站 choreography 的关键帧数据喂给场景各层。
   两种静止状态：
     near（入口 / About）= 原值几何
     far （跳过之后 / Projects）= near + forward 跳跃终值（整体放大 1.04 倍，兔子站到目标灌木右下角）
   静止姿态已画在 SVG 里，跳跃关节按“相对末端的增量”施加。 */

window.Player = (function () {
  'use strict';

  const M = window.MOTION;
  const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  /* far 状态 = forward clip 在 100% 的层变换
     （原站 far clip 的几何正好等于此，逐项吻合：远山 1976×936 @(-103,7) 等） */
  const FAR = {
    hills:    { t: [-65, 25],        s: [1.04, 1.04] },
    meadow:   { t: [-130, 50],       s: [1.16, 1.16] },
    trees:    { t: [-90, 25],        s: [1.13, 1.13] },
    destBush: { t: [-260, -15.455],  s: [1.652, 1.652] },
    depBush:  { t: [-495, 360],      s: [1.16, 1.16] }
  };
  const FAR_SHADOW = { t: [665, -69.75], s: [1, 1] };
  const FAR_RABBIT = { t: [665, -65], s: [0.95, 0.95], face: -1 };
  const NEAR_RABBIT = { t: [0, 0], s: [1, 1], face: 1 };

  /* 兔子的骨骼：原站六个可旋转节点，层层嵌套（后腿 / 躯干 / 前腿 / 头 / 双耳）。
     枢轴 = 原站节点「旋转盒」中心在**静止姿态下**的世界位置，已换算到兔子 180×190 局部坐标。
     不能用父级坐标系里的原值：我们这套图形是把静止姿态整体烘焙进 path 的，
     每层 <g> 的坐标系就是静止时的世界坐标，不是旋转前的父级坐标。 */
  const JOINT_KEYS = ['hind', 'torso', 'foreleg', 'head', 'earRear', 'earFront'];

  /* 待机只启用头与耳朵的细微摆动；前爪轨道摆幅达 75°，会破坏叼草姿态，故不启用 */
  const IDLE_JOINTS = ['head', 'earRear', 'earFront'];

  /* 我们画的耳朵在静止态比原站多向后压约 12°（原站 -0.209 / -0.157 rad，我们的图形约 -0.42 / -0.31）
     站立姿态是已经确认的现状，不去动它；跳跃时补回这 0.209 rad，空中耳朵才与原站同角。 */
  const EAR_BIAS = 0.209;

  /* 绕 (cx,cy) 旋转 deg 度的 SVG 矩阵；transform-origin 已由 CSS 归零，
     所以这里直接给出用户坐标系里的矩阵，平移量叠在旋转之后 */
  function jointMatrix(deg, cx, cy, tx, ty) {
    const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    const e = cx - c * cx + s * cy + (tx || 0);
    const f = cy - s * cx - c * cy + (ty || 0);
    return `matrix(${c.toFixed(6)},${s.toFixed(6)},${(-s).toFixed(6)},${c.toFixed(6)},${e.toFixed(3)},${f.toFixed(3)})`;
  }

  /* 在 [百分比, 值] 列表上采样；稠密轨用线性，稀疏轨用 ease-in-out */
  function sample(track, p) {
    if (!track || !track.length) return null;
    const n = track.length;
    if (p <= track[0][0]) return track[0][1];
    if (p >= track[n - 1][0]) return track[n - 1][1];
    for (let i = 0; i < n - 1; i++) {
      const a = track[i], b = track[i + 1];
      if (p >= a[0] && p <= b[0]) {
        const t = (p - a[0]) / ((b[0] - a[0]) || 1);
        const e = n > 12 ? t : easeInOut(t);
        const va = a[1], vb = b[1];
        if (Array.isArray(va)) return [lerp(va[0], vb[0], e), lerp(va[1], vb[1], e)];
        return lerp(va, vb, e);
      }
    }
    return track[n - 1][1];
  }

  /* 相对末端的增量——因为静止姿态已经画在图形里 */
  function delta(track, p) {
    if (!track || !track.length) return null;
    const end = track[track.length - 1][1];
    const v = sample(track, p);
    if (Array.isArray(v)) return [v[0] - end[0], v[1] - end[1]];
    return v - end;
  }

  function create(sceneEl) {
    const layers = {};
    ['hills', 'meadow', 'trees', 'destBush', 'depBush', 'shadow'].forEach(k => {
      layers[k] = sceneEl.querySelector(`[data-layer="${k}"]`);
    });
    const leafEls = [1, 2, 3, 4, 5].map(i => sceneEl.querySelector(`[data-layer="leaf${i}"]`));
    const rabbit = sceneEl.querySelector('[data-layer="rabbit"]');
    const facing = sceneEl.querySelector('.r-facing');
    const poseSit = sceneEl.querySelector('.pose-sit');
    const joints = {};
    [...JOINT_KEYS, 'paw'].forEach(k => {
      joints[k] = sceneEl.querySelector('.j-' + k);
    });

    /* 摆一个关节：rad 是相对静止姿态的增量，t 是可选的平移补偿 */
    function setJoint(el, rad, t) {
      if (!el) return;
      const p = (el.dataset.pivot || '0 0').split(/\s+/).map(Number);
      el.style.transform = jointMatrix((rad || 0) * 180 / Math.PI, p[0] || 0, p[1] || 0, t ? t[0] : 0, t ? t[1] : 0);
    }

    function applyLayer(el, t, s) {
      if (!el) return;
      const tx = t ? t[0] : 0, ty = t ? t[1] : 0;
      const sx = s ? s[0] : 1, sy = s ? s[1] : 1;
      el.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
    }
    /* far 状态下 destBush 层被放大 1.652 倍，层内的标签必须抵消，
       否则字号会跟着变大（原站 far 状态的标签仍是 48px） */
    const workLabel = sceneEl.querySelector('.info-label[data-section="work"] .label');
    function setLabelScale(farState) {
      if (!workLabel) return;
      workLabel.style.transform = farState ? 'scale(0.6053)' : '';
    }
    function shadowOpacity(v) {
      const e = layers.shadow && layers.shadow.querySelector('ellipse');
      if (e) e.setAttribute('opacity', Number(v).toFixed(3));
    }

    /* 落叶：始终用真实的 8s 环境时钟驱动，避免随跳跃播放头跳变 */
    function applyLeaves() {
      const p = (performance.now() % 8000) / 80;
      const tracks = (M.idle && M.idle.leaves) || [];
      leafEls.forEach((el, i) => {
        const lf = tracks[i];
        if (!el || !lf) return;
        const o = sample(lf.o, p);
        const t = sample(lf.t, p) || [0, 0];
        const r = sample(lf.r, p) || 0;
        el.style.opacity = o === null ? '1' : o.toFixed(3);
        el.style.transform = `translate(${t[0].toFixed(2)}px, ${t[1].toFixed(2)}px) rotate(${r.toFixed(3)}rad)`;
      });
    }

    function pose(clipName, ms, farState) {
      const j = M[clipName];
      if (!j) return;
      const p = Math.min(100, Math.max(0, (ms / j.dur) * 100));

      if (clipName === 'idle') {
        /* 静止：层用 near 原值或 far 放大值；兔子本体不动 */
        for (const [key, el] of Object.entries(layers)) {
          if (key === 'shadow') {
            const f = farState ? FAR_SHADOW : null;
            applyLayer(el, f ? f.t : null, f ? f.s : null);
            continue;
          }
          const f = farState ? FAR[key] : null;
          applyLayer(el, f ? f.t : null, f ? f.s : null);
        }
        shadowOpacity(0.14);
        setLabelScale(farState);
        const base = farState ? FAR_RABBIT : NEAR_RABBIT;
        rabbit.style.transform = `translate(${base.t[0]}px, ${base.t[1]}px) scale(${base.s[0]}, ${base.s[1]})`;
        facing.style.transform = `scaleX(${base.face})`;
        for (const key of IDLE_JOINTS) {
          const track = j.joints && j.joints[key] && j.joints[key].r;
          setJoint(joints[key], delta(track, p) || 0);
        }
        /* 躯干、前爪与后腿在待机时回到静止姿态 */
        for (const key of ['torso', 'foreleg', 'hind', 'paw']) {
          setJoint(joints[key], 0);
        }
        if (poseSit) poseSit.style.opacity = '1';
        applyLeaves();
        return;
      }

      /* 跳跃：层与兔子按轨迹绝对施加。
         back 的轨道是「相对 far 基态的镜像增量」（位移取反、缩放取倒数），
         必须叠加在 far 之上，否则回程第一帧会从 far 弹回 near，落地再弹一次。 */
      const isBack = clipName === 'back';
      function farBase(key) {
        if (!isBack) return null;
        if (key === 'shadow') return FAR_SHADOW;
        if (key === 'rabbit') return FAR_RABBIT;   // 兔子的平移同样要叠基态，否则回程首帧位移被清零
        return FAR[key] || null;
      }
      function composed(key, track, which) {
        const v = sample(track && track[which], p);
        const base = farBase(key);
        if (which === 't') {
          const tx = v ? v[0] : 0, ty = v ? v[1] : 0;
          return [tx + (base ? base.t[0] : 0), ty + (base ? base.t[1] : 0)];
        }
        const sx = v ? v[0] : 1, sy = v ? v[1] : 1;
        return [sx * (base ? base.s[0] : 1), sy * (base ? base.s[1] : 1)];
      }

      for (const [key, el] of Object.entries(layers)) {
        if (key === 'shadow') {
          applyLayer(el, composed('shadow', j.shadow, 't'), composed('shadow', j.shadow, 's'));
          const op = sample(j.shadow.o, p);
          if (op !== null) shadowOpacity(op);
          continue;
        }
        const track = j.layers[key];
        if (track) applyLayer(el, composed(key, track, 't'), composed(key, track, 's'));
      }

      const rt = composed('rabbit', j.rabbit, 't');
      const rr = delta(j.rabbit.r, p) || 0;
      /* 兔子自身缩放是绝对值（far 0.95 → near 1），不做倒数合成 */
      const rsRaw = sample(j.rabbit.s, p) || [1, 1];
      rabbit.style.transform =
        `translate(${rt[0]}px, ${rt[1]}px) rotate(${(rr * 180 / Math.PI).toFixed(2)}deg) scale(${rsRaw[0]}, ${rsRaw[1]})`;

      /* facing 同样是相对量：far 是 -1，back 从 1 走到 -1，相乘回到 +1 */
      const fs = sample(j.facing, p);
      const localSign = fs && fs[0] < 0 ? -1 : 1;
      const faceSign = isBack ? FAR_RABBIT.face * localSign : localSign;
      facing.style.transform = `scaleX(${faceSign})`;

      /* 姿态：驱动原站的六关节骨骼。
         静止姿态已经画进图形里（等于轨道末值），所以施加的是 θ(p) − θ(静止) 的增量：
         起跳瞬间躯干从 −55° 展开到 0°、前爪后收 −112°、头反向补偿 −62°、
         双耳向后贴 −28°/−23°，这正是原站空中那一帧的样子。 */
      const jt = j.joints || {};
      for (const key of JOINT_KEYS) {
        const tr = jt[key];
        let d = tr ? (delta(tr.r, p) || 0) : 0;
        if (key === 'earRear' || key === 'earFront') d += EAR_BIAS;
        const t = tr && tr.t ? delta(tr.t, p) : null;
        setJoint(joints[key], d, t);
      }

      if (poseSit) poseSit.style.opacity = '1';

      applyLeaves();
    }

    return {
      pose,
      /* 从当前姿态平滑过渡到目标时间点 */
      settle(clipName, ms, farState) {
        return new Promise(res => {
          const els = [rabbit, facing, poseSit, ...Object.values(layers), ...Object.values(joints)].filter(Boolean);
          const from = els.map(el => ({ el, tf: getComputedStyle(el).transform }));
          pose(clipName, ms, farState);
          const anims = from.map(f => f.el.animate(
            [{ transform: f.tf === 'none' ? 'none' : f.tf }, { transform: getComputedStyle(f.el).transform }],
            { duration: 160, easing: 'ease-in-out' }
          ));
          Promise.all(anims.map(a => a.finished.catch(() => {}))).then(() => {
            anims.forEach(a => a.cancel());
            res();
          });
        });
      }
    };
  }

  return { create, sample, delta, FAR };
})();
