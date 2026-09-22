(function () {
  'use strict';

  const BOUNDARY = Math.SQRT1_2;
  const DEFAULTS = { zeta: 0.2, wn: 2, ratio: 0.96 };

  function gain(ratio, zeta) {
    return 1 / Math.hypot(1 - ratio * ratio, 2 * zeta * ratio);
  }

  function phase(ratio, zeta) {
    if (zeta === 0 && ratio === 1) return null;
    return -Math.atan2(2 * zeta * ratio, 1 - ratio * ratio);
  }

  function resonance(zeta, wn) {
    if (zeta === 0) return { kind: 'unbounded', ratio: 1, frequency: wn, peak: Infinity };
    if (zeta >= BOUNDARY) return { kind: 'none', ratio: null, frequency: null, peak: null };
    const ratio = Math.sqrt(1 - 2 * zeta * zeta);
    return { kind: 'finite', ratio, frequency: wn * ratio, peak: 1 / (2 * zeta * Math.sqrt(1 - zeta * zeta)) };
  }

  // Exact zero-state solution for zeta = 0 and input sin(ratio * wn * t).
  // Free oscillations persist here, so a steady-state-only sinusoid is misleading.
  function undampedResponse(t, wn, ratio) {
    const tau = wn * t;
    if (Math.abs(ratio - 1) < 1e-7) return (Math.sin(tau) - tau * Math.cos(tau)) / 2;
    return (Math.sin(ratio * tau) - ratio * Math.sin(tau)) / (1 - ratio * ratio);
  }

  function waveform(t, zeta, wn, ratio) {
    if (zeta === 0) return undampedResponse(t, wn, ratio);
    return gain(ratio, zeta) * Math.sin(wn * ratio * t + phase(ratio, zeta));
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { gain, phase, resonance, undampedResponse, waveform, BOUNDARY };
    return;
  }
  if (customElements.get('second-order-resonance')) return;

  function element(tag, attrs, text) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function format(value, digits = 3) {
    return Number.isFinite(value) ? value.toFixed(digits) : '∞';
  }

  function niceCeiling(value) {
    const scale = 10 ** Math.floor(Math.log10(value));
    return [1, 2, 2.5, 5, 10].find(step => step * scale >= value) * scale;
  }

  // Break paths at singularities and out-of-range values instead of joining
  // them across an asymptote or suggesting that a clipped peak is finite.
  function pathFor(samples, x, y, min, max) {
    let path = '';
    let connected = false;
    for (const [xValue, yValue] of samples) {
      if (!Number.isFinite(yValue) || yValue < min || yValue > max) {
        connected = false;
        continue;
      }
      path += `${connected ? 'L' : 'M'}${x(xValue).toFixed(2)},${y(yValue).toFixed(2)} `;
      connected = true;
    }
    return path;
  }

  function chart(svg, width, height, xMax, yMin, yMax, xTicks, yTicks, xTitle, yTitle, summary) {
    const margin = { left: 48, right: 16, top: 30, bottom: 44 };
    const x = value => margin.left + value / xMax * (width - margin.left - margin.right);
    const y = value => margin.top + (yMax - value) / (yMax - yMin) * (height - margin.top - margin.bottom);
    const fragment = document.createDocumentFragment();
    fragment.append(element('title', {}, yTitle));
    fragment.append(element('desc', {}, summary));
    const line = (x1, y1, x2, y2, className) => fragment.append(element('line', { x1, y1, x2, y2, class: className }));
    yTicks.forEach(value => {
      line(x(0), y(value), x(xMax), y(value), 'sor-grid');
      fragment.append(element('text', { x: x(0) - 8, y: y(value), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, String(Number(value.toFixed(2)))));
    });
    xTicks.forEach(value => {
      line(x(value), y(yMin), x(value), y(yMax), 'sor-grid');
      fragment.append(element('text', { x: x(value), y: y(yMin) + 20, 'text-anchor': value === xMax ? 'end' : (value === 0 ? 'start' : 'middle') }, String(Number(value.toFixed(xMax < 10 ? 2 : 1)))));
    });
    line(x(0), y(yMin), x(xMax), y(yMin), 'sor-axis');
    line(x(0), y(yMin), x(0), y(yMax), 'sor-axis');
    fragment.append(element('text', { x: margin.left, y: 16 }, yTitle));
    fragment.append(element('text', { x: (x(0) + x(xMax)) / 2, y: height - 3, 'text-anchor': 'middle' }, xTitle));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('aria-label', summary);
    return { fragment, x, y, line };
  }

  class SecondOrderResonance extends HTMLElement {
    connectedCallback() {
      if (!this.initialized) {
        this.initialized = true;
        this.state = { ...DEFAULTS };
        this.zInput = this.querySelector('[data-z]');
        this.wInput = this.querySelector('[data-w]');
        this.rInput = this.querySelector('[data-r]');
        this.normalized = this.querySelector('[data-normalized]');
        this.frequency = this.querySelector('[data-frequency]');
        this.wave = this.querySelector('[data-wave]');
        this.addEventListener('input', event => {
          const input = event.target;
          if (input === this.zInput) this.state.zeta = Math.round(Number(input.value) * 100) / 100;
          if (input === this.wInput) this.state.wn = Number(input.value);
          if (input === this.rInput) this.state.ratio = Math.round(Number(input.value) * 100) / 100;
          this.scheduleDraw();
        });
        this.addEventListener('click', event => {
          const button = event.target.closest('button[data-action]');
          if (!button) return;
          const action = button.dataset.action;
          if (action === 'peak') {
            const peak = resonance(this.state.zeta, this.state.wn);
            if (peak.ratio !== null) this.state.ratio = peak.ratio;
          }
          if (action === 'boundary') this.state.zeta = BOUNDARY;
          if (action === 'underdamped') this.state.zeta = 0.8;
          if (action === 'reset') {
            this.state = { ...DEFAULTS };
            this.normalized.checked = false;
          }
          this.scheduleDraw();
        });
        this.querySelector('details').addEventListener('toggle', () => this.scheduleDraw());
        this.observer = new ResizeObserver(() => this.scheduleDraw());
      }
      this.observer.observe(this);
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

    setText(selector, text) { this.querySelector(selector).textContent = text; }

    draw() {
      const { zeta, wn, ratio } = this.state;
      const peak = resonance(zeta, wn);
      const magnitude = gain(ratio, zeta);
      const angle = phase(ratio, zeta);
      this.zInput.value = zeta;
      this.wInput.value = wn;
      // Near the boundary a resonant ratio can be below the manual scan minimum.
      this.rInput.min = Math.min(0.05, ratio);
      this.rInput.value = ratio;
      const zText = zeta === BOUNDARY ? '1/√2 ≈ 0.7071' : zeta.toFixed(2);
      this.setText('[data-z-value]', zText);
      this.setText('[data-w-value]', format(wn, 1) + ' rad/s');
      this.setText('[data-r-value]', format(ratio));
      this.setText('[data-drive]', `输入角频率 ω = ${format(wn * ratio)} rad/s；调节 ωₙ 时保持频率比 r 不变。`);
      this.zInput.setAttribute('aria-valuetext', zText);
      this.wInput.setAttribute('aria-valuetext', format(wn, 1) + ' 弧度每秒');
      this.rInput.setAttribute('aria-valuetext', `${format(ratio)}，输入角频率 ${format(wn * ratio)} 弧度每秒`);
      this.setText('[data-wr]', peak.frequency === null ? '无非零谐振峰' : format(peak.frequency) + ' rad/s');
      this.setText('[data-mr]', peak.kind === 'none' ? '无（最大增益 1）' : peak.kind === 'unbounded' ? '∞ · 无有限稳态' : format(peak.peak));
      this.setText('[data-gain-label]', zeta === 0 ? '频域幅值 |G(jω)|' : '当前增益 M(ω)');
      this.setText('[data-phase-label]', zeta === 0 ? '频域相位 φ' : '相位 φ');
      this.setText('[data-gain]', format(magnitude));
      this.setText('[data-phase]', angle === null ? '未定义' : format(angle * 180 / Math.PI, 1) + '°');
      const peakButton = this.querySelector('[data-action="peak"]');
      peakButton.disabled = peak.kind === 'none';
      peakButton.textContent = zeta === 0 ? '定位无阻尼共振' : '定位谐振峰';
      let note;
      if (zeta === 0) {
        note = 'ζ = 0：自由振动不会衰减。上图为频域幅值，不能直接当作零初始条件下最终的幅值比；ω = ωₙ 时发散。下图改画零初始条件响应，可观察共振增长或拍振。';
      } else if (peak.kind === 'finite') {
        note = `存在谐振峰：ωᵣ / ωₙ = ${format(peak.ratio)}，Mᵣ = ${format(peak.peak)}。固定 ωₙ 时，增大阻尼比会使峰降低并向低频移动；固定 ζ 时，改变 ωₙ 只改变频率尺度，峰高不变。`;
      } else if (zeta < 1) {
        note = '当前仍为欠阻尼，但已无非零频率谐振峰。自由响应是否振荡的分界是 ζ = 1；幅频曲线是否有谐振峰的分界是 ζ = 1/√2。最大增益 1 对应 ω → 0 的低频极限。';
      } else {
        note = '当前为临界阻尼或过阻尼，无非零频率谐振峰。幅值增益随输入频率增大而下降，最大增益 1 对应低频极限；持续正弦输入仍会产生同频的受迫响应。';
      }
      this.setText('[data-note]', note);
      this.drawFrequency(peak, magnitude);
      this.drawWave();
    }

    drawFrequency(peak, magnitude) {
      const { zeta, wn, ratio } = this.state;
      const normalized = this.normalized.checked;
      const width = Math.max(220, this.frequency.parentElement.getBoundingClientRect().width);
      const xMax = normalized ? 3 : 12;
      const toX = r => normalized ? r : r * wn;
      const yMax = zeta === 0 ? 6 : niceCeiling(Math.max(1, peak.peak || 1) * 1.12);
      const xCount = width < 380 ? 3 : 6;
      const summary = `幅频响应，ζ = ${format(zeta)}，ωₙ = ${format(wn)} rad/s。当前输入角频率 ${format(wn * ratio)} rad/s，幅值 ${format(magnitude)}。${peak.kind === 'finite' ? `谐振峰 ${format(peak.peak)}，位于 ${format(peak.frequency)} rad/s。` : peak.kind === 'none' ? '无非零频率谐振峰。' : '自然频率处发散，无有限稳态。'}`;
      const c = chart(this.frequency, width, 290, xMax, 0, yMax,
        Array.from({ length: xCount + 1 }, (_, i) => i * xMax / xCount),
        Array.from({ length: 5 }, (_, i) => i * yMax / 4),
        normalized ? '输入频率比 r = ω / ωₙ' : '输入角频率 ω / (rad/s)', '幅值增益 M', summary);
      c.line(c.x(0), c.y(1), c.x(xMax), c.y(1), 'sor-reference');
      c.line(c.x(toX(1)), c.y(0), c.x(toX(1)), c.y(yMax), 'sor-reference');
      const ratios = Array.from({ length: 901 }, (_, i) => i / 900 * xMax / (normalized ? 1 : wn));
      // Extra samples resolve narrow peaks even at small wn and small damping.
      for (let i = 0; i <= 240; i++) ratios.push(1 + (i / 120 - 1) * Math.max(0.08, 8 * zeta));
      ratios.push(1, ratio);
      if (peak.ratio !== null) ratios.push(peak.ratio);
      const samples = [...new Set(ratios)].filter(r => r >= 0 && toX(r) <= xMax).sort((a, b) => a - b).map(r => [toX(r), gain(r, zeta)]);
      c.fragment.append(element('path', { d: pathFor(samples, c.x, c.y, 0, yMax), class: 'sor-response' }));
      if (peak.kind === 'finite') {
        const px = c.x(toX(peak.ratio));
        const py = c.y(peak.peak);
        c.fragment.append(element('path', { d: `M${px},${py - 5} l5,5 l-5,5 l-5,-5 Z`, class: 'sor-peak' }));
      }
      c.line(c.x(toX(ratio)), c.y(0), c.x(toX(ratio)), c.y(yMax), 'sor-probe-line');
      if (magnitude <= yMax) {
        c.fragment.append(element('circle', { cx: c.x(toX(ratio)), cy: c.y(magnitude), r: 4.5, class: 'sor-probe' }));
      } else {
        const px = c.x(toX(ratio));
        const py = c.y(yMax);
        c.fragment.append(element('path', { d: `M${px},${py} l-5,9 h10 Z`, class: 'sor-probe' }));
      }
      this.frequency.replaceChildren(c.fragment);
      this.setText('[data-scale-note]', zeta === 0
        ? '纵轴只显示 0–6，超出部分省略；ω = ωₙ 处发散，截断处不是有限峰顶。'
        : '横轴范围固定，纵轴按峰值自动缩放；比较峰高时请同时看刻度与数值。');
    }

    drawWave() {
      const { zeta, wn, ratio } = this.state;
      const width = Math.max(220, this.wave.parentElement.getBoundingClientRect().width);
      const duration = 8 * Math.PI / (wn * ratio);
      const samples = Array.from({ length: 1601 }, (_, i) => {
        const t = i / 1600 * duration;
        return [t, waveform(t, zeta, wn, ratio)];
      });
      const peak = Math.max(1, ...samples.map(sample => Math.abs(sample[1])));
      const yMax = niceCeiling(peak * 1.08);
      const title = zeta === 0 ? '正弦输入与零初始条件输出' : '正弦输入与稳态输出';
      const summary = `${title}，横轴显示四个输入周期，共 ${format(duration, 2)} 秒，纵轴为幅值。`;
      const count = width < 380 ? 2 : 4;
      const c = chart(this.wave, width, 230, duration, -yMax, yMax,
        Array.from({ length: count + 1 }, (_, i) => i / count * duration),
        [-yMax, -yMax / 2, 0, yMax / 2, yMax], '时间 t / s', '输入 / 输出幅值', summary);
      c.line(c.x(0), c.y(0), c.x(duration), c.y(0), 'sor-axis');
      const input = samples.map(([t]) => [t, Math.sin(wn * ratio * t)]);
      c.fragment.append(element('path', { d: pathFor(input, c.x, c.y, -yMax, yMax), class: 'sor-reference' }));
      c.fragment.append(element('path', { d: pathFor(samples, c.x, c.y, -yMax, yMax), class: 'sor-response' }));
      this.wave.replaceChildren(c.fragment);
      this.setText('[data-wave-title]', title);
      this.setText('[data-wave-note]', zeta === 0
        ? '此图取 y(0) = 0、y′(0) = 0，包含不会衰减的自由振动；共振时振幅随时间增长。显示四个输入周期，坐标自动缩放。'
        : '此图只显示过渡过程衰减后的稳态正弦波，t = 0 是稳态时间参考点。输入与输出同频；输出幅值为 M(ω)，相位差为 φ。显示四个输入周期，坐标自动缩放。');
    }
  }

  customElements.define('second-order-resonance', SecondOrderResonance);
}());
