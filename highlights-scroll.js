// Pan the native scroll area so a swipe and the animation share one position.
export function initHighlights(root, win = window) {
  if (!root) return;
  const viewport = root.querySelector('.values-viewport');
  const track = root.querySelector('.values-track');
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  let max = 0, position = 0, direction = 1, frame = 0, last = null;
  let touching = false, drag = null, settleTimer = 0;

  function schedule() {
    if (!frame && max > 1 && !touching && !drag && !settleTimer &&
        !reduced.matches && !root.hidden && !root.ownerDocument.hidden) {
      frame = win.requestAnimationFrame(tick);
    }
  }
  function tick(time) {
    frame = 0;
    const elapsed = last === null ? 0 : Math.min(64, time - last);
    last = time;
    // Keep fractional progress even when the browser rounds scrollLeft.
    position = Math.max(0, Math.min(max, position + direction * elapsed * 0.028));
    viewport.scrollLeft = position;
    if (position >= max) direction = -1;
    if (position <= 0) direction = 1;
    schedule();
  }
  function stop() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    last = null;
  }
  function update() {
    stop();
    max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    viewport.toggleAttribute('data-overflow', max > 1);
    if (!max) viewport.scrollLeft = 0;
    position = viewport.scrollLeft;
    schedule();
  }
  function settle() {
    stop();
    win.clearTimeout(settleTimer);
    settleTimer = win.setTimeout(() => {
      settleTimer = 0;
      update();
    }, 200);
  }

  viewport.addEventListener('touchstart', () => { touching = true; stop(); }, { passive: true });
  function endTouch(event) {
    touching = event.touches.length > 0;
    if (!touching) settle();
  }
  viewport.addEventListener('touchend', endTouch);
  viewport.addEventListener('touchcancel', endTouch);
  viewport.addEventListener('scroll', () => { if (settleTimer) settle(); }, { passive: true });
  viewport.addEventListener('wheel', event => {
    if (event.deltaX || event.shiftKey) settle();
  }, { passive: true });
  viewport.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) settle();
  });

  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || max <= 1) return;
    drag = { id: event.pointerId, x: event.clientX, left: viewport.scrollLeft };
    viewport.setPointerCapture(event.pointerId);
    stop();
  });
  viewport.addEventListener('pointermove', event => {
    if (drag && drag.id === event.pointerId) viewport.scrollLeft = drag.left + drag.x - event.clientX;
  });
  function endDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    settle();
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('lostpointercapture', endDrag);

  win.addEventListener('resize', update);
  root.ownerDocument.addEventListener('visibilitychange', update);
  reduced.addEventListener?.('change', update);
  const resize = new win.ResizeObserver(update);
  resize.observe(viewport);
  resize.observe(track);
  new win.MutationObserver(update).observe(track, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  update();
  return { update };
}
