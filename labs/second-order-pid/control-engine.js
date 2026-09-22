/* Fixed plant: G(s) = 4 / (s^2 + 1.2s + 4), unity negative feedback.
 * Ideal parallel PID. Coefficient arrays use descending powers of s.
 * No numerical differentiation: the step response uses a strictly proper
 * transfer-function realization, including the ideal derivative kick.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PIDMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const EPS = Number.EPSILON;

  function finite(value, name) {
    const result = Number(value);
    if (!Number.isFinite(result)) throw new Error(name + ' must be finite.');
    return result;
  }

  function gainsOf(gains) {
    gains = gains || {};
    return {
      kp: finite(gains.kp === undefined ? 0 : gains.kp, 'Kp'),
      ki: finite(gains.ki === undefined ? 0 : gains.ki, 'Ki'),
      kd: finite(gains.kd === undefined ? 0 : gains.kd, 'Kd')
    };
  }

  function trim(coefficients) {
    let start = 0;
    while (start < coefficients.length - 1 && coefficients[start] === 0) start++;
    return coefficients.slice(start);
  }

  function quadratic(a, b) {
    const discriminant = a * a - 4 * b;
    if (discriminant < 0) {
      const imaginary = Math.sqrt(-discriminant) / 2;
      return [{ re: -a / 2, im: -imaginary }, { re: -a / 2, im: imaginary }];
    }
    const square = Math.sqrt(discriminant);
    const q = -0.5 * (a + (a < 0 ? -square : square));
    return q === 0
      ? [{ re: 0, im: 0 }, { re: 0, im: 0 }]
      : [{ re: q, im: 0 }, { re: b / q, im: 0 }];
  }

  function refineReal(x, a, b, c) {
    for (let iteration = 0; iteration < 5; iteration++) {
      const value = ((x + a) * x + b) * x + c;
      const derivative = (3 * x + 2 * a) * x + b;
      if (Math.abs(derivative) < 32 * EPS * Math.max(1, x * x, Math.abs(b))) break;
      const next = x - value / derivative;
      if (!Number.isFinite(next)) break;
      x = next;
      if (Math.abs(value) < EPS * Math.max(Math.abs(c), Math.abs(x * b), 1e-300)) break;
    }
    return x;
  }

  function roots(coefficients) {
    const polynomial = trim(coefficients);
    const order = polynomial.length - 1;
    if (order === 0) return [];
    if (order > 3) throw new Error('Only polynomials of degree at most three are supported.');
    const monic = polynomial.map(value => value / polynomial[0]);
    if (!monic.every(Number.isFinite)) throw new Error('Polynomial coefficients exceed numeric range.');
    if (order === 1) return [{ re: -monic[1], im: 0 }];
    // Scaling avoids overflow in the discriminant and depressed cubic.
    const scale = Math.max(1, ...monic.slice(1).map((value, index) => Math.pow(Math.abs(value), 1 / (index + 1))));
    const a = monic[1] / scale;
    const b = monic[2] / scale / scale;
    let result;
    if (order === 2) {
      result = quadratic(a, b);
    } else {
      const c = monic[3] / scale / scale / scale;
      const p = b - a * a / 3;
      const q = 2 * a * a * a / 27 - a * b / 3 + c;
      const discriminant = q * q / 4 + p * p * p / 27;
      const tolerance = 64 * EPS * (q * q / 4 + Math.abs(p * p * p / 27));
      if (discriminant < -tolerance) {
        const radius = 2 * Math.sqrt(-p / 3);
        const angle = Math.acos(Math.max(-1, Math.min(1, -q / (2 * Math.sqrt(-p * p * p / 27))))) / 3;
        result = [0, 1, 2].map(index => ({
          re: refineReal(radius * Math.cos(angle - 2 * Math.PI * index / 3) - a / 3, a, b, c), im: 0
        }));
      } else if (Math.abs(discriminant) <= tolerance || (p === 0 && q === 0)) {
        const triple = Math.abs(p) <= 64 * EPS * Math.max(a * a, Math.abs(b))
          && Math.abs(q) <= 64 * EPS * Math.max(Math.abs(a * a * a), Math.abs(a * b), Math.abs(c));
        if (triple) {
          result = Array.from({ length: 3 }, () => ({ re: -a / 3, im: 0 }));
        } else {
          // Near a repeated pair, solve the well-conditioned isolated root
          // first; deflation preserves tiny constant terms that a tolerance
          // on the cubic discriminant would otherwise erase.
          const real = refineReal(2 * Math.cbrt(-q / 2) - a / 3, a, b, c);
          result = [{ re: real, im: 0 }, ...quadratic(a + real, real === 0 ? b : -c / real)];
        }
      } else {
        const square = Math.sqrt(discriminant);
        const u = Math.cbrt(-q / 2 + (q <= 0 ? square : -square));
        const v = u === 0 ? 0 : -p / (3 * u);
        const real = refineReal(u + v - a / 3, a, b, c);
        // Product of the remaining roots is -c / real. This avoids loss of
        // significance when a tiny Ki creates two roots close to the origin.
        const pair = quadratic(a + real, real === 0 ? b : -c / real);
        result = [{ re: real, im: 0 }, ...pair];
      }
    }
    return result.map(value => ({ re: value.re * scale || 0, im: value.im * scale || 0 }))
      .sort((left, right) => left.re - right.re || left.im - right.im);
  }

  function stability(denominator) {
    const a = denominator[1];
    const b = denominator[2];
    if (denominator.length === 3) {
      if (a > 0 && b > 0) return 'stable';
      if ((a === 0 && b > 0) || (b === 0 && a > 0)) return 'marginal';
      return 'unstable';
    }
    const c = denominator[3];
    if (a > 0 && b > 0 && c > 0) {
      const difference = a * b - c;
      if (Math.abs(difference) <= 64 * EPS * Math.max(Math.abs(a * b), Math.abs(c))) return 'marginal';
      if (difference > 0) return 'stable';
    }
    return 'unstable';
  }

  function analyze(gains) {
    const { kp, ki, kd } = gainsOf(gains);
    // Ki=0 removes the controller's spurious integrator state exactly.
    // Other cancellations intentionally remain in the characteristic roots.
    const denominator = ki === 0
      ? [1, 1.2 + 4 * kd, 4 + 4 * kp]
      : [1, 1.2 + 4 * kd, 4 + 4 * kp, 4 * ki];
    const numerator = trim(ki === 0 ? [4 * kd, 4 * kp] : [4 * kd, 4 * kp, 4 * ki]);
    if (![...denominator, ...numerator].every(Number.isFinite)) throw new Error('PID gains exceed numeric range.');
    const status = stability(denominator);
    return {
      kp, ki, kd, poles: roots(denominator), zeros: roots(numerator),
      denominator, numerator, stable: status === 'stable', status,
      finalValue: status === 'stable' ? (ki === 0 ? kp / (1 + kp) : 1) : null
    };
  }

  function identity(size) {
    return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => row === col ? 1 : 0));
  }

  function multiply(left, right) {
    const size = left.length;
    const result = Array.from({ length: size }, () => Array(size).fill(0));
    for (let row = 0; row < size; row++) {
      for (let inner = 0; inner < size; inner++) {
        for (let col = 0; col < size; col++) result[row][col] += left[row][inner] * right[inner][col];
      }
    }
    return result;
  }

  function norm(matrix) {
    return Math.max(...matrix.map(row => row.reduce((sum, value) => sum + Math.abs(value), 0)));
  }

  function exponential(matrix) {
    const size = matrix.length;
    const squarings = Math.max(0, Math.ceil(Math.log2(Math.max(norm(matrix), 1e-300) / 0.5)));
    const divisor = Math.pow(2, squarings);
    const scaled = matrix.map(row => row.map(value => value / divisor));
    let total = identity(size);
    let term = identity(size);
    // The scaled matrix has norm <= 1/2; this converges to machine precision
    // before 24 terms, including at repeated poles and imaginary-axis poles.
    for (let order = 1; order <= 24; order++) {
      term = multiply(term, scaled).map(row => row.map(value => value / order));
      total = total.map((row, i) => row.map((value, j) => value + term[i][j]));
      if (norm(term) <= EPS * 0.1 * norm(total)) break;
    }
    for (let index = 0; index < squarings; index++) total = multiply(total, total);
    return total;
  }

  function response(analysis, options) {
    options = options || {};
    const duration = finite(options.duration === undefined ? 12 : options.duration, 'Duration');
    const samples = Math.max(2, Math.min(20000, Math.floor(finite(options.samples === undefined ? 1201 : options.samples, 'Samples'))));
    const maxAbs = options.maxAbs === undefined ? 1e5 : finite(options.maxAbs, 'Maximum amplitude');
    if (duration <= 0 || maxAbs <= 0) throw new Error('Duration and maximum amplitude must be positive.');
    const order = analysis.denominator.length - 1;
    const size = order + 1;
    const matrix = Array.from({ length: size }, () => Array(size).fill(0));
    for (let index = 0; index < order - 1; index++) matrix[index][index + 1] = 1;
    for (let index = 0; index < order; index++) matrix[order - 1][index] = -analysis.denominator[order - index];
    matrix[order - 1][order] = 1;
    const dt = duration / (samples - 1);
    const transition = exponential(matrix.map(row => row.map(value => value * dt)));
    const output = Array(order).fill(0);
    const ascending = analysis.numerator.slice().reverse();
    ascending.forEach((value, index) => { output[index] = value; });
    let state = Array(size).fill(0);
    state[order] = 1;
    const data = [{ t: 0, y: 0 }];
    let truncated = false;
    for (let index = 1; index < samples; index++) {
      const next = transition.map(row => row.reduce((sum, value, col) => sum + value * state[col], 0));
      state = next;
      const y = output.reduce((sum, value, col) => sum + value * state[col], 0);
      if (!Number.isFinite(y) || Math.abs(y) > maxAbs) {
        truncated = true;
        break;
      }
      data.push({ t: index * dt, y });
    }
    return { data, truncated, duration, samples: data.length, finalValue: analysis.finalValue };
  }

  function step(gains, options) { return response(analyze(gains), options); }

  function plantStep(options) {
    return response({ denominator: [1, 1.2, 4], numerator: [4], finalValue: 1 }, options);
  }

  function place(target) {
    const zeta = finite(target.zeta, 'Damping ratio');
    const wn = finite(target.wn, 'Natural frequency');
    const p = finite(target.p, 'Third-pole magnitude');
    if (zeta < 0 || wn <= 0 || p <= 0) throw new Error('Use zeta >= 0, wn > 0 and p > 0.');
    return {
      kp: (wn * wn + 2 * zeta * wn * p - 4) / 4,
      ki: wn * wn * p / 4,
      kd: (2 * zeta * wn + p - 1.2) / 4
    };
  }

  function permutations(array) {
    if (array.length <= 1) return [array];
    return array.flatMap((value, index) => permutations(array.filter((_, other) => other !== index)).map(rest => [value, ...rest]));
  }

  function rootLocus(gains, options) {
    const { kp, ki, kd } = gainsOf(gains);
    options = options || {};
    const maxGain = finite(options.maxGain === undefined ? 5 : options.maxGain, 'Maximum locus gain');
    const samples = Math.max(2, Math.min(5000, Math.floor(finite(options.samples === undefined ? 301 : options.samples, 'Locus samples'))));
    if (maxGain <= 0) throw new Error('Maximum locus gain must be positive.');
    const openDenominator = ki === 0 ? [1, 1.2, 4] : [1, 1.2, 4, 0];
    const openNumerator = trim(ki === 0 ? [4 * kd, 4 * kp] : [4 * kd, 4 * kp, 4 * ki]);
    const openPoles = roots(openDenominator);
    const branches = openPoles.map(pole => [{ ...pole, k: 0 }]);
    let previous = openPoles;
    for (let index = 1; index < samples; index++) {
      const k = maxGain * index / (samples - 1);
      const denominator = ki === 0
        ? [1, 1.2 + 4 * k * kd, 4 + 4 * k * kp]
        : [1, 1.2 + 4 * k * kd, 4 + 4 * k * kp, 4 * k * ki];
      const candidates = permutations(roots(denominator));
      let best = candidates[0];
      let minimum = Infinity;
      for (const candidate of candidates) {
        const cost = candidate.reduce((sum, pole, branch) => sum + Math.pow(pole.re - previous[branch].re, 2) + Math.pow(pole.im - previous[branch].im, 2), 0);
        if (cost < minimum) { minimum = cost; best = candidate; }
      }
      best.forEach((pole, branch) => branches[branch].push({ ...pole, k }));
      previous = best;
    }
    return { branches, openPoles, openZeros: roots(openNumerator), maxGain };
  }

  return Object.freeze({ analyze, step, plantStep, place, rootLocus, roots });
});
