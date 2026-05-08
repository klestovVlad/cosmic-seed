import { describe, expect, it } from 'vitest';
import {
  amplitudeFromSigma8,
  eisensteinHuTransfer,
  PLANCK_2018_PS,
  powerSpectrum,
  powerSpectrumShape,
  sigma8,
  topHatWindow,
} from '../../src/physics/power-spectrum';

describe('Eisenstein–Hu transfer function', () => {
  it('T → 1 on large scales (k → 0)', () => {
    const T = eisensteinHuTransfer(1e-4, PLANCK_2018_PS);
    expect(T).toBeGreaterThan(0.99);
    expect(T).toBeLessThan(1.01);
  });

  it('T → 0 on small scales (k → ∞)', () => {
    const T = eisensteinHuTransfer(1000, PLANCK_2018_PS);
    expect(T).toBeGreaterThan(0);
    expect(T).toBeLessThan(0.01);
  });

  it('T is monotonically decreasing in k', () => {
    let prev = eisensteinHuTransfer(1e-3, PLANCK_2018_PS);
    for (const k of [0.01, 0.1, 1, 10, 100]) {
      const T = eisensteinHuTransfer(k, PLANCK_2018_PS);
      expect(T).toBeLessThan(prev);
      prev = T;
    }
  });
});

describe('top-hat window', () => {
  it('W(0) = 1', () => {
    expect(topHatWindow(0)).toBeCloseTo(1, 6);
  });

  it('W series-expansion stays continuous near zero', () => {
    const w_eps = topHatWindow(1e-4);
    expect(w_eps).toBeGreaterThan(0.999);
    expect(w_eps).toBeLessThan(1.001);
  });

  it('W oscillates and decays beyond x = π', () => {
    const w_pi = topHatWindow(Math.PI);
    expect(Math.abs(w_pi)).toBeLessThan(0.4);
  });
});

describe('power spectrum shape', () => {
  it('powerSpectrumShape goes ~ k^n_s deep on large scales', () => {
    // T(k) → 1 as k → 0 but with an O(k²) correction; sample where the
    // correction is well below the slope tolerance.
    const k1 = 1e-6;
    const k2 = 1e-5;
    const p1 = powerSpectrumShape(k1, PLANCK_2018_PS);
    const p2 = powerSpectrumShape(k2, PLANCK_2018_PS);
    const slope = Math.log(p2 / p1) / Math.log(k2 / k1);
    expect(slope).toBeCloseTo(PLANCK_2018_PS.nSpectral, 2);
  });
});

describe('σ_8 normalisation', () => {
  it('amplitude is positive and finite', () => {
    const A = amplitudeFromSigma8(PLANCK_2018_PS);
    expect(A).toBeGreaterThan(0);
    expect(Number.isFinite(A)).toBe(true);
  });

  it('round-trip σ_8 matches the input', () => {
    expect(sigma8(PLANCK_2018_PS)).toBeCloseTo(PLANCK_2018_PS.sigma8, 4);
  });

  it('σ_8 scales linearly with √A — doubling sigma8 gives 4× amplitude', () => {
    const baseA = amplitudeFromSigma8(PLANCK_2018_PS);
    const doubledA = amplitudeFromSigma8({ ...PLANCK_2018_PS, sigma8: 2 * PLANCK_2018_PS.sigma8 });
    expect(doubledA / baseA).toBeCloseTo(4, 3);
  });

  it('powerSpectrum(k) has correct Parseval-like normalisation: σ_8 from full P', () => {
    // Recompute σ_8 directly from the full normalised P(k):
    // σ_R² = (1/2π²) · ∫ k² P(k) W²(kR) d ln k · k
    const R = 8.0;
    const kMin = 1e-4;
    const kMax = 1e3;
    const N = 4096;
    const lnKMin = Math.log(kMin);
    const lnKMax = Math.log(kMax);
    const dlnK = (lnKMax - lnKMin) / N;
    let sum = 0;
    for (let i = 0; i <= N; i += 1) {
      const k = Math.exp(lnKMin + i * dlnK);
      const W = topHatWindow(k * R);
      const integrand =
        (k * k * k * powerSpectrum(k, PLANCK_2018_PS) * W * W) / (2 * Math.PI * Math.PI);
      const weight = i === 0 || i === N ? 0.5 : 1.0;
      sum += weight * integrand * dlnK;
    }
    expect(Math.sqrt(sum)).toBeCloseTo(PLANCK_2018_PS.sigma8, 3);
  });
});
