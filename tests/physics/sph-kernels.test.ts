import { describe, expect, it } from 'vitest';
import { cubicSplineKernel } from '../../src/physics/sph-kernels';

describe('cubic-spline SPH kernel (Monaghan 1992 M4)', () => {
  it('rejects non-positive smoothing length', () => {
    expect(() => cubicSplineKernel(0)).toThrow(/positive/);
    expect(() => cubicSplineKernel(-1)).toThrow(/positive/);
  });

  it('integrates to 1 over the 3-D support sphere', () => {
    // Riemann sum over a cube enclosing the support.
    const h = 0.5;
    const k = cubicSplineKernel(h);
    const N = 60;
    const dx = (4 * h) / N;
    let sum = 0;
    for (let ix = 0; ix < N; ix += 1) {
      const x = -2 * h + (ix + 0.5) * dx;
      for (let iy = 0; iy < N; iy += 1) {
        const y = -2 * h + (iy + 0.5) * dx;
        for (let iz = 0; iz < N; iz += 1) {
          const z = -2 * h + (iz + 0.5) * dx;
          const r = Math.sqrt(x * x + y * y + z * z);
          sum += k.weight(r) * dx * dx * dx;
        }
      }
    }
    expect(sum).toBeGreaterThan(0.95);
    expect(sum).toBeLessThan(1.05);
  });

  it('weight is zero outside the support (r ≥ 2h)', () => {
    const k = cubicSplineKernel(0.3);
    expect(k.weight(0.6)).toBe(0);
    expect(k.weight(1.0)).toBe(0);
    expect(k.weight(1e9)).toBe(0);
  });

  it('weight at the centre (r = 0) is the normalisation constant σ₃ = 1 / (π h³)', () => {
    const h = 0.5;
    const k = cubicSplineKernel(h);
    const expected = 1 / (Math.PI * h * h * h);
    expect(k.weight(0)).toBeCloseTo(expected, 8);
  });

  it('weight is monotonically decreasing in r', () => {
    const k = cubicSplineKernel(0.4);
    let prev = k.weight(0);
    for (let i = 1; i < 100; i += 1) {
      const r = (i / 100) * 2 * 0.4;
      const w = k.weight(r);
      expect(w).toBeLessThanOrEqual(prev + 1e-12);
      prev = w;
    }
  });

  it('gradient is continuous at the q = 1 piecewise boundary', () => {
    const h = 0.4;
    const k = cubicSplineKernel(h);
    const epsilon = 1e-5;
    // Approach q = 1 from below and above.
    const g_below = k.gradient(h - epsilon);
    const g_above = k.gradient(h + epsilon);
    expect(Math.abs(g_above - g_below)).toBeLessThan(1e-3);
  });

  it('gradient matches finite-difference of the weight', () => {
    const k = cubicSplineKernel(0.5);
    const epsilon = 1e-4;
    for (const r of [0.05, 0.2, 0.4, 0.6, 0.8]) {
      const fd = (k.weight(r + epsilon) - k.weight(r - epsilon)) / (2 * epsilon);
      expect(k.gradient(r)).toBeCloseTo(fd, 3);
    }
  });

  it('gradient is zero outside support', () => {
    const k = cubicSplineKernel(0.3);
    expect(k.gradient(0.6)).toBe(0);
    expect(k.gradient(1.0)).toBe(0);
  });

  it('gradient is negative inside support (kernel decreasing outward)', () => {
    const k = cubicSplineKernel(0.5);
    for (const r of [0.01, 0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(k.gradient(r)).toBeLessThanOrEqual(0);
    }
  });
});
