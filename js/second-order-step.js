(function () {
  'use strict';

  // Exact zero-state response of G(s) = wn^2 / (s^2 + 2*zeta*wn*s + wn^2).
  function response(t, zeta, wn) {
    if (t <= 0) return 0;
    const a = wn * t;
    if (Math.abs(zeta - 1) < 1e-8) return 1 - (1 + a) * Math.exp(-a);
    if (zeta < 1) {
      const b = Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * a) * (Math.cos(b * a) + zeta / b * Math.sin(b * a));
    }
    const b = Math.sqrt(zeta * zeta - 1);
    // Reciprocal avoids subtracting nearly equal numbers for the slow pole.
    const slow = -1 / (zeta + b);
    const fast = -(zeta + b);
    return 1 + (fast * Math.exp(slow * a) - slow * Math.exp(fast * a)) / (slow - fast);
  }

  function overshoot(zeta) {
    return zeta < 1 ? 100 * Math.exp(-Math.PI * zeta / Math.sqrt(1 - zeta * zeta)) : 0;
  }

  function description(zeta) {
    if (zeta === 0) return ['无阻尼 · 持续振荡', '无阻尼时输出在 0 与 2 之间持续振荡，不会收敛到 1；此处超调量相对目标值 1 计算。'];
    if (zeta < 1) return ['欠阻尼 · 衰减振荡', '欠阻尼时有超调，振荡随时间衰减，最终趋于 1。'];
    if (zeta === 1) return ['临界阻尼 · 无超调', '临界阻尼时，响应不振荡，单调趋于 1。'];
    return ['过阻尼 · 无超调', '过阻尼时响应单调趋于 1；保持自然角频率不变，增大阻尼比会使响应变慢。'];
  }

  // The same model is available to numerical checks without a browser.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { response, overshoot, description };
    return;
  }
  if (customElements.get('second-order-step')) return;

  const NS = 'http://www.w3.org/2000/svg';
  function svgElement(tag, attrs, text) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text !== undefined) node.textContent = text;
    return node;
  }

  class SecondOrderStep extends HTMLElement {
    connectedCallback() {
      if (!this.initialized) {
        this.initialized = true;
        this.zInput = this.querySelector('[data-z]');
        this.wInput = this.querySelector('[data-w]');
        this.svg = this.querySelector('.sos-chart');
        this.plot = this.querySelector('.sos-plot');
        this.addEventListener('input', event => {
          if (event.target === this.zInput || event.target === this.wInput) this.scheduleDraw();
        });
        this.observer = new ResizeObserver(() => this.scheduleDraw());
      }
      this.observer.observe(this.plot);
      this.scheduleDraw();
    }

    disconnectedCallback() {
      this.observer.disconnect();
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }

    scheduleDraw() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.draw();
      });
    }

    draw() {
      const zeta = Number(this.zInput.value);
      const wn = Number(this.wInput.value);
      const [state, note] = description(zeta);
      const peak = overshoot(zeta).toFixed(1) + '%';
      this.querySelector('[data-z-value]').textContent = zeta.toFixed(2);
      this.querySelector('[data-w-value]').textContent = wn.toFixed(1) + ' rad/s';
      this.zInput.setAttribute('aria-valuetext', zeta.toFixed(2) + '，' + state);
      this.wInput.setAttribute('aria-valuetext', wn.toFixed(1) + ' 弧度每秒');
      this.querySelector('[data-state]').textContent = state;
      this.querySelector('[data-overshoot]').textContent = peak;
      this.querySelector('[data-note]').textContent = note;

      const width = Math.max(200, this.plot.getBoundingClientRect().width);
      const height = 290;
      const margin = { top: 28, right: 12, bottom: 46, left: 38 };
      const plotWidth = width - margin.left - margin.right;
      const plotHeight = height - margin.top - margin.bottom;
      const x = t => margin.left + t / 12 * plotWidth;
      // A fixed scale makes amplitude comparisons valid while moving either slider.
      const y = value => margin.top + (2.1 - value) / 2.1 * plotHeight;
      const fragment = document.createDocumentFragment();
      fragment.append(svgElement('title', {}, '二阶系统的单位阶跃响应'));
      fragment.append(svgElement('desc', {}, `阻尼比 ${zeta.toFixed(2)}，自然角频率 ${wn.toFixed(1)} rad/s。${state}，理论超调量 ${peak}。横轴为 0 至 12 秒，纵轴为归一化输出。${note}`));

      for (let value = 0; value <= 2; value += 0.5) {
        fragment.append(svgElement('line', { x1: x(0), x2: x(12), y1: y(value), y2: y(value), class: 'sos-grid-line' }));
        fragment.append(svgElement('text', { x: margin.left - 9, y: y(value), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, value.toFixed(1)));
      }
      const tickStep = width < 360 ? 4 : 2;
      for (let t = 0; t <= 12; t += tickStep) {
        fragment.append(svgElement('line', { x1: x(t), x2: x(t), y1: y(0), y2: margin.top, class: 'sos-grid-line' }));
        fragment.append(svgElement('text', { x: x(t), y: y(0) + 21, 'text-anchor': t === 12 ? 'end' : 'middle' }, String(t)));
      }
      fragment.append(svgElement('line', { x1: x(0), x2: x(12), y1: y(0), y2: y(0), class: 'sos-axis' }));
      fragment.append(svgElement('line', { x1: x(0), x2: x(0), y1: y(0), y2: margin.top, class: 'sos-axis' }));
      fragment.append(svgElement('text', { x: margin.left, y: 14 }, '输出 y(t)'));
      fragment.append(svgElement('text', { x: margin.left + plotWidth / 2, y: height - 3, 'text-anchor': 'middle' }, '时间 t / s'));
      fragment.append(svgElement('line', { x1: x(0), x2: x(12), y1: y(1), y2: y(1), class: 'sos-target' }));

      const points = [];
      for (let index = 0; index <= 720; index++) {
        const t = index / 60;
        points.push(`${index ? 'L' : 'M'}${x(t).toFixed(3)},${y(response(t, zeta, wn)).toFixed(3)}`);
      }
      fragment.append(svgElement('path', { d: points.join(' '), class: 'sos-response' }));
      this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      this.svg.setAttribute('aria-label', `单位阶跃响应，ζ = ${zeta.toFixed(2)}，ωₙ = ${wn.toFixed(1)} rad/s，${state}，超调量 ${peak}`);
      this.svg.replaceChildren(fragment);
    }
  }
  customElements.define('second-order-step', SecondOrderStep);
}());
