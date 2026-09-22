(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RBF = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const defaults = Object.freeze({ count: 7, sigma: 0.55, rate: 0.08, target: 'wave', epochs: 1200 });
  const target = (x, kind) => kind === 'bump' ? 1.2 * Math.exp(-2 * (x - 0.6) ** 2) - 0.55 * Math.exp(-3 * (x + 1.1) ** 2) : 0.7 * Math.sin(1.8 * x) + 0.22 * x;
  const phi = (x, c, sigma) => Math.exp(-((x - c) ** 2) / (2 * sigma * sigma));
  function create(options = {}) {
    const config = { ...defaults, ...options };
    if (!Number.isInteger(config.count) || config.count < 3 || config.count > 9 || !Number.isFinite(config.sigma) || config.sigma < 0.15 || config.sigma > 1.5 || !Number.isFinite(config.rate) || config.rate <= 0 || config.rate > 0.2 || !['wave', 'bump'].includes(config.target) || !Number.isInteger(config.epochs) || config.epochs < 1 || config.epochs > 3000) throw new Error('Invalid RBF configuration');
    const centers = Array.from({ length: config.count }, (_, j) => -2 + 4 * j / (config.count - 1));
    const xs = Array.from({ length: 41 }, (_, i) => -2 + i / 10);
    const ys = xs.map(x => target(x, config.target));
    const features = xs.map(x => centers.map(c => phi(x, c, config.sigma)));
    return { config, centers, xs, ys, features };
  }
  function predict(model, state, x) { return state.b + model.centers.reduce((sum, c, j) => sum + state.w[j] * phi(x, c, model.config.sigma), 0); }
  function measure(model, w, b) {
    const errors = model.features.map((row, i) => b + row.reduce((sum, v, j) => sum + v * w[j], 0) - model.ys[i]);
    const mse = errors.reduce((sum, e) => sum + e * e, 0) / errors.length;
    const grad = w.map((_, j) => errors.reduce((sum, e, i) => sum + e * model.features[i][j], 0) / errors.length);
    return { mse, grad, gradB: errors.reduce((s, v) => s + v, 0) / errors.length };
  }
  function train(options = {}) {
    const model = create(options), history = [];
    let w = model.centers.map(() => 0), b = 0;
    for (let epoch = 0; epoch <= model.config.epochs; epoch++) {
      const metrics = measure(model, w, b);
      if (!Number.isFinite(metrics.mse)) throw new Error('Training diverged');
      history.push({ epoch, w: [...w], b, ...metrics });
      w = w.map((v, j) => v - model.config.rate * metrics.grad[j]);
      b -= model.config.rate * metrics.gradB;
    }
    return { ...model, history };
  }
  return { defaults, target, phi, create, predict, measure, train };
});
