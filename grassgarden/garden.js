/* grassgarden · 状态机
   —— 逐行复刻原站 garden.js 的节奏与阈值。
   滚动只触发站点，跳跃用真实时间推进播放头，回程有独立编排。 */

(() => {
  'use strict';

  const DURATION = 3600, RELEASE = 260, REVEAL = 650, JUMP_THRESHOLD = 140;
  const viewport = document.querySelector('#viewport');
  const scene = document.querySelector('#scene');

  // 先组装场景，再建立播放器（它要查询各层节点）
  scene.innerHTML = window.ART.scene();

  const cue = document.querySelector('#scroll-cue');
  const status = document.querySelector('#scene-status');
  const player = window.Player.create(scene);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  let state = 'entrance', busy = false, returned = false, camera = 0;
  let lastInput = -Infinity, consumed = false, accumulated = 0, sign = 0;
  let touchY = null, touchId = null;
  let idleEnabled = true, idleOrigin = performance.now();
  let activeClip = 'idle';
  let farState = false;   // 跳过之后 = far 几何（整体放大 1.04 倍）

  function layout() {
    const width = viewport.clientWidth, height = viewport.clientHeight;
    const portrait = width / height < 1.05;
    const scale = portrait ? Math.max(width / 950, height / 1100) : Math.max(width / 1440, height / 900);
    const focusX = portrait ? 350 + 630 * camera : 720;
    const left = Math.min(0, width / 2 - focusX * scale);
    scene.style.transform = 'translate(' + left + 'px, ' + (height - 900 * scale) + 'px) scale(' + scale + ')';
  }

  const LABELS = {
    entrance: 'Garden', about: 'About', forward: 'Moving to Projects',
    landing: 'Projects garden', work: 'Projects', back: 'Returning to About',
    projects: 'Opening Projects', redirectError: 'Projects could not load'
  };
  function report(next) {
    state = next;
    document.documentElement.dataset.state = next;
    document.documentElement.dataset.busy = String(busy);
    status.textContent = LABELS[next] || '';
  }

  function pose(ms) {
    player.pose(activeClip, ms, farState);
    document.documentElement.dataset.playhead = String(Math.round(ms));
  }

  function show(section) {
    document.querySelectorAll('.info-label').forEach(el => {
      const on = el.dataset.section === section;
      el.classList.toggle('is-visible', on);
      el.setAttribute('aria-hidden', String(!on));
    });
  }

  function finish(next) { busy = false; report(next); cue.style.opacity = '1'; }

  function reveal(section, next) {
    busy = true; report(state); cue.style.opacity = '0'; show(section);
    setTimeout(() => finish(next), reduced.matches ? 0 : REVEAL);
  }

  async function jump(direction) {
    busy = true;
    show(direction === 'forward' ? 'about' : null);
    cue.style.opacity = '0';
    report(direction === 'forward' ? 'forward' : 'back');
    idleEnabled = false;
    if (!reduced.matches) await player.settle(activeClip, 0, farState);
    scene.dataset.direction = direction;
    activeClip = direction === 'forward' ? 'forward' : 'back';
    pose(0);
    camera = direction === 'forward' ? 0 : 1;
    layout();
    const start = performance.now();
    function frame(now) {
      const progress = reduced.matches ? 1 : Math.min(1, (now - start) / DURATION);
      pose(progress * DURATION);
      const contact = direction === 'forward' ? 1820 : 1900;
      const follow = Math.max(0, Math.min(1, (progress * DURATION - 320) / (contact - 320)));
      const eased = follow * follow * (3 - 2 * follow);
      camera = direction === 'forward' ? eased : 1 - eased;
      layout();
      if (progress < 1) requestAnimationFrame(frame);
      else {
        returned = direction === 'back';
        farState = direction === 'forward';
        activeClip = 'idle';
        pose(0);
        idleOrigin = performance.now();
        idleEnabled = true;
        finish(direction === 'forward' ? 'landing' : 'entrance');
      }
    }
    requestAnimationFrame(frame);
  }

  function input(delta) {
    if (!delta || !Number.isFinite(delta)) return;
    const now = performance.now(), fresh = now - lastInput > RELEASE;
    lastInput = now;
    if (fresh) { consumed = false; accumulated = 0; sign = 0; }
    // 跳跃过程中的惯量与变向一律丢弃，不排队
    if (busy || consumed) { consumed = true; return; }
    const direction = Math.sign(delta);
    if (sign !== direction) { accumulated = 0; sign = direction; }
    accumulated += Math.min(180, Math.abs(delta));
    const threshold = (state === 'about' && direction > 0) || (state === 'landing' && direction < 0) ? JUMP_THRESHOLD : 28;
    if (accumulated < threshold) return;
    consumed = true;
    if (state === 'entrance' && (direction > 0 || returned)) reveal('about', 'about');
    else if (state === 'about' && direction > 0) jump('forward');
    else if (state === 'about' && direction < 0) reveal(null, 'entrance');
    else if (state === 'landing' && direction > 0) reveal('work', 'work');
    else if (state === 'landing' && direction < 0) jump('back');
    else if (state === 'work' && direction < 0) reveal(null, 'landing');
  }

  window.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    input(event.deltaY * units);
  }, { passive: false });

  window.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    const down = ['ArrowDown', 'PageDown', 'End'].includes(event.key) || (event.key === ' ' && !event.shiftKey);
    const up = ['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey);
    if (!down && !up) return;
    event.preventDefault();
    input(down ? 180 : -180);
  });

  viewport.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) return;
    touchY = event.touches[0].clientY; touchId = event.touches[0].identifier;
  }, { passive: true });
  viewport.addEventListener('touchmove', event => {
    if (event.touches.length !== 1 || touchY === null) return;
    const touch = [...event.touches].find(t => t.identifier === touchId);
    if (!touch) return;
    event.preventDefault();
    const delta = touchY - touch.clientY; touchY = touch.clientY;
    input(delta);
  }, { passive: false });
  viewport.addEventListener('touchend', () => { touchY = null; touchId = null; }, { passive: true });
  viewport.addEventListener('touchcancel', () => { touchY = null; touchId = null; }, { passive: true });
  window.addEventListener('resize', layout, { passive: true });

  cue.addEventListener('click', () => input(180));

  /* ---------------- Projects 转场 ----------------
     原站是一段完整的“跃进灌木”编排；此处用等效的推进 + 淡出过渡，
     避免链接点了没反应。 */
  document.addEventListener('click', event => {
    const link = event.target.closest && event.target.closest('a.projects-link');
    if (!link) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (busy) { event.preventDefault(); return; }
    event.preventDefault();
    busy = true;
    report('projects');
    cue.style.opacity = '0';
    show(null);
    scene.style.transition = 'transform 900ms cubic-bezier(.4,0,.2,1), opacity 900ms ease-in';
    const base = scene.style.transform;
    scene.style.transform = base + ' scale(1.14)';
    scene.style.opacity = '0';
    setTimeout(() => { location.href = link.getAttribute('href'); }, 940);
  });

  /* ---------------- 耳朵的指针响应（加性，不干扰编排动画） ---------------- */
  let pointer = null, previous = performance.now();
  const trackPointer = event => { if (event.isPrimary !== false) pointer = { x: event.clientX, y: event.clientY }; };
  window.addEventListener('pointermove', trackPointer, { passive: true });
  window.addEventListener('pointerdown', trackPointer, { passive: true });
  window.addEventListener('pointerup', event => { if (event.pointerType !== 'mouse') setTimeout(() => pointer = null, 180); }, { passive: true });
  window.addEventListener('pointercancel', () => pointer = null, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => pointer = null, { passive: true });
  window.addEventListener('blur', () => pointer = null);

  const earEls = [...scene.querySelectorAll('.j-earRear, .j-earFront')];
  const earAngles = new Map();
  function react(now) {
    const blend = 1 - Math.exp(-Math.min(60, now - previous) / 85);
    previous = now;
    if (pointer && !reduced.matches && (state === 'entrance' || state === 'about')) {
      for (const el of earEls) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dx = pointer.x - cx, dy = pointer.y - cy;
        const dist = Math.hypot(dx, dy);
        const reach = 170;
        let target = 0;
        if (dist < reach) {
          const f = 1 - dist / reach;
          target = Math.max(-1, Math.min(1, dx / reach)) * f * 16;
        }
        const cur = earAngles.get(el) || 0;
        const next = cur + (target - cur) * blend;
        earAngles.set(el, next);
        el.style.rotate = next.toFixed(2) + 'deg';
      }
    }
    requestAnimationFrame(react);
  }

  /* ---------------- 启动 ---------------- */
  requestAnimationFrame(() => {
    activeClip = 'idle';
    pose(0);
    show(null);
    report('entrance');
    layout();
    idleOrigin = performance.now();
    document.documentElement.dataset.ready = 'true';

    function idle(now) {
      if (idleEnabled) pose(reduced.matches ? 0 : (now - idleOrigin) % 8000);
      requestAnimationFrame(idle);
    }
    requestAnimationFrame(idle);
    requestAnimationFrame(react);
  });
})();
