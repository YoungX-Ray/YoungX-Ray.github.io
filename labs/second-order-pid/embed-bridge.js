// Defer execution of this bridge; CSS is present before the first paint.
(() => {
  'use strict';
  const embedded = new URLSearchParams(location.search).get('embed') === '1' && window.parent !== window;
  if (!embedded) return;
  document.documentElement.dataset.embedded = 'true';
  const origin = location.origin;
  let previousHeight = 0, pending = false;
  const resize = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const height = Math.ceil(document.querySelector('main').getBoundingClientRect().height) + 2;
      if (Math.abs(height - previousHeight) > 1) {
        previousHeight = height;
        window.parent.postMessage({ type: 'second-order-pid-height', height }, origin);
      }
    });
  };
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== origin || event.data?.type !== 'second-order-pid-theme') return;
    if (['light', 'dark'].includes(event.data.theme)) {
      document.documentElement.dataset.blogTheme = event.data.theme;
      // A cached child may have sent its first height before the parent script
      // was ready. The theme handshake also requests a fresh measurement.
      previousHeight = 0;
      resize();
    }
  });
  new ResizeObserver(resize).observe(document.body);
  window.parent.postMessage({ type: 'second-order-pid-ready' }, origin);
  resize();
})();
