(() => {
  'use strict';
  if (customElements.get('second-order-pid')) return;
  class SecondOrderPID extends HTMLElement {
    connectedCallback() {
      if (this._cleanup) return;
      const frame = this.querySelector('iframe');
      if (!frame) return;
      const origin = new URL(frame.src, location.href).origin;
      const theme = () => frame.contentWindow?.postMessage({ type: 'second-order-pid-theme', theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light' }, origin);
      const receive = event => {
        if (event.source !== frame.contentWindow || event.origin !== origin || !event.data) return;
        if (event.data.type === 'second-order-pid-ready') theme();
        if (event.data.type === 'second-order-pid-height' && Number.isFinite(event.data.height)) {
          const height = Math.max(400, Math.min(12000, Math.ceil(event.data.height)));
          if (frame.style.height !== `${height}px`) frame.style.height = `${height}px`;
        }
      };
      const observer = new MutationObserver(theme);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      frame.addEventListener('load', theme); window.addEventListener('message', receive); theme();
      this._cleanup = () => { observer.disconnect(); frame.removeEventListener('load', theme); window.removeEventListener('message', receive); this._cleanup = null; };
    }
    disconnectedCallback() { this._cleanup?.(); }
  }
  customElements.define('second-order-pid', SecondOrderPID);
})();
