// Gently pan only overflowing highlights. No duplicated text or layout animation.
export function initHighlights(root, win = window) {
  if (!root) return;
  const viewport = root.querySelector('.values-viewport'), track = root.querySelector('.values-track'), button = root.querySelector('.values-pause');
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, last = 0, direction = 1, waitUntil = 0, paused = false, hovering = false, focused = false, max = 0;
  const canRun = () => max > 1 && !paused && !hovering && !focused && !reduced.matches && !root.ownerDocument.hidden && !root.hidden;
  function schedule() { if (!frame && canRun()) frame = win.requestAnimationFrame(tick); }
  function tick(time) {
    frame = 0;
    if (!canRun()) { last = 0; return; }
    const delta = last ? Math.min(time - last, 64) : 0; last = time;
    if (time >= waitUntil) {
      viewport.scrollLeft = Math.max(0, Math.min(max, viewport.scrollLeft + direction * delta * .028));
      if (viewport.scrollLeft >= max || viewport.scrollLeft <= 0) { direction = viewport.scrollLeft >= max ? -1 : 1; waitUntil = time + 1600; }
    }
    schedule();
  }
  function update() {
    max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    button.hidden = max <= 1 || reduced.matches || root.hidden;
    button.textContent = paused ? 'Play' : 'Pause'; button.setAttribute('aria-pressed', String(paused));
    button.setAttribute('aria-label', paused ? 'Play moving highlights' : 'Pause moving highlights');
    if (!max) { viewport.scrollLeft = 0; direction = 1; }
    if (!canRun() && frame) { win.cancelAnimationFrame(frame); frame = 0; }
    last = 0; schedule();
  }
  button.onclick = () => { paused = !paused; update(); };
  viewport.addEventListener('mouseenter', () => { hovering = true; update(); });
  viewport.addEventListener('mouseleave', () => { hovering = false; update(); });
  viewport.addEventListener('focus', () => { focused = true; update(); });
  viewport.addEventListener('blur', () => { focused = false; update(); });
  viewport.addEventListener('pointerdown', () => { paused = true; update(); });
  win.addEventListener('resize', update);
  root.ownerDocument.addEventListener('visibilitychange', update);
  reduced.addEventListener?.('change', update);
  const resize = new win.ResizeObserver(update); resize.observe(viewport); resize.observe(track);
  const mutation = new win.MutationObserver(update); mutation.observe(track, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  update();
  return { update };
}
