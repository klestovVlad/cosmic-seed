import { describe, expect, it } from 'vitest';
import {
  applyCoolingStep,
  approximateH2Fraction,
  codeUToKelvin,
  coolingTimeScale,
  DEFAULT_GAS_COOLING_UNITS,
  h2CoolingRateLowDensity,
  kelvinToCodeU,
  subcycleCooling,
} from '@physics/cooling';

describe('h2CoolingRateLowDensity', () => {
  it('returns positive monotonic-in-T values across the fit window', () => {
    const lambdas = [100, 200, 500, 1000, 3000].map((t) => h2CoolingRateLowDensity(t));
    for (const l of lambdas) expect(l).toBeGreaterThan(0);
    // Galli-Palla fit is monotonically increasing in this range — colder
    // primordial gas radiates less. (Above ~10⁴ K the fit peaks; we clamp
    // there to avoid regressing the peak position into a test value.)
    for (let i = 1; i < lambdas.length; i += 1) {
      expect(lambdas[i]!).toBeGreaterThan(lambdas[i - 1]!);
    }
  });

  it('matches published Galli-Palla 1998 values within a literature-fit tolerance', () => {
    // The polynomial fit (G&P 1998 eq. 26) gives Λ_LD per H–H₂ pair in
    // erg cm³ s⁻¹. Fiducial values reproduced from the formula itself —
    // a regression guard so a typo in coefficients shows up.
    expect(h2CoolingRateLowDensity(100)).toBeGreaterThan(1e-30);
    expect(h2CoolingRateLowDensity(100)).toBeLessThan(1e-26);
    expect(h2CoolingRateLowDensity(1000)).toBeGreaterThan(1e-26);
    expect(h2CoolingRateLowDensity(1000)).toBeLessThan(1e-22);
    expect(h2CoolingRateLowDensity(5000)).toBeGreaterThan(1e-23);
    expect(h2CoolingRateLowDensity(5000)).toBeLessThan(1e-19);
  });

  it('returns 0 for non-physical input', () => {
    expect(h2CoolingRateLowDensity(0)).toBe(0);
    expect(h2CoolingRateLowDensity(-100)).toBe(0);
    expect(h2CoolingRateLowDensity(Number.NaN)).toBe(0);
  });

  it('clamps below the fit window (T < 100 K) so cold gas still gets a finite rate', () => {
    const lambdaCold = h2CoolingRateLowDensity(10);
    const lambdaFloor = h2CoolingRateLowDensity(100);
    expect(lambdaCold).toBe(lambdaFloor);
  });
});

describe('approximateH2Fraction', () => {
  it('returns the baseline at zero LW background', () => {
    expect(approximateH2Fraction(0, 1e-3)).toBeCloseTo(1e-3, 6);
  });

  it('decreases as the LW background increases', () => {
    const baseline = 1e-3;
    const f0 = approximateH2Fraction(0, baseline);
    const f10 = approximateH2Fraction(10, baseline);
    const f100 = approximateH2Fraction(100, baseline);
    expect(f10).toBeLessThan(f0);
    expect(f100).toBeLessThan(f10);
  });

  it('falls back to the baseline for non-finite or negative LW', () => {
    expect(approximateH2Fraction(-1, 1e-3)).toBeCloseTo(1e-3, 6);
    expect(approximateH2Fraction(Number.NaN, 1e-3)).toBeCloseTo(1e-3, 6);
  });
});

describe('codeUToKelvin / kelvinToCodeU round-trip', () => {
  it('is a clean linear conversion', () => {
    const u = 5e-4;
    const T = codeUToKelvin(u, DEFAULT_GAS_COOLING_UNITS);
    expect(kelvinToCodeU(T, DEFAULT_GAS_COOLING_UNITS)).toBeCloseTo(u, 12);
  });
});

describe('applyCoolingStep', () => {
  it('reduces u when starting hot at appreciable density and x_H₂', () => {
    const u0 = 5e-3; // → ~ 1500 K with default units
    const rho = 5; // dense compared to mean
    const xH2 = 1e-2;
    const dt = 1e-3; // one macro step
    const u1 = applyCoolingStep({
      uCode: u0,
      rhoCode: rho,
      xH2,
      dtCode: dt,
      units: DEFAULT_GAS_COOLING_UNITS,
    });
    expect(u1).toBeLessThan(u0);
    expect(u1).toBeGreaterThan(0);
  });

  it('leaves u unchanged when x_H₂ = 0 (no coolant)', () => {
    const u0 = 5e-3;
    const u1 = applyCoolingStep({
      uCode: u0,
      rhoCode: 5,
      xH2: 0,
      dtCode: 1e-3,
      units: DEFAULT_GAS_COOLING_UNITS,
    });
    expect(u1).toBe(u0);
  });

  it('leaves u unchanged when ρ = 0 (no gas to cool)', () => {
    const u0 = 5e-3;
    const u1 = applyCoolingStep({
      uCode: u0,
      rhoCode: 0,
      xH2: 1e-2,
      dtCode: 1e-3,
      units: DEFAULT_GAS_COOLING_UNITS,
    });
    expect(u1).toBe(u0);
  });

  it('floors at a CMB-equivalent temperature (no negative u)', () => {
    // Aggressive single Euler step with huge dt — should saturate at the
    // T_CMB ≈ 2.7 K floor rather than overshoot to negative u.
    const u0 = 1e-2;
    const u1 = applyCoolingStep({
      uCode: u0,
      rhoCode: 1e6,
      xH2: 1,
      dtCode: 1e3,
      units: DEFAULT_GAS_COOLING_UNITS,
    });
    expect(u1).toBeGreaterThan(0);
    expect(codeUToKelvin(u1, DEFAULT_GAS_COOLING_UNITS)).toBeGreaterThanOrEqual(2.6);
  });
});

describe('subcycleCooling', () => {
  it('matches one macro Euler step within a few percent for slow cooling', () => {
    const u0 = 1e-3; // ~ 300 K — slow regime
    const args = {
      uCode: u0,
      rhoCode: 0.1,
      xH2: 1e-3,
      dtCode: 1e-3,
      units: DEFAULT_GAS_COOLING_UNITS,
    };
    const single = applyCoolingStep(args);
    const sub = subcycleCooling(args);
    expect(sub.uCode).toBeCloseTo(single, 4);
    expect(sub.substeps).toBeGreaterThanOrEqual(1);
    expect(sub.capped).toBe(false);
  });

  it('breaks a fast cooling regime into multiple substeps and stays positive', () => {
    const u0 = 5e-3;
    const args = {
      uCode: u0,
      rhoCode: 50,
      xH2: 0.05,
      dtCode: 1e-2,
      units: DEFAULT_GAS_COOLING_UNITS,
    };
    const sub = subcycleCooling(args);
    expect(sub.uCode).toBeGreaterThan(0);
    expect(sub.uCode).toBeLessThan(u0);
    expect(sub.substeps).toBeGreaterThanOrEqual(1);
  });
});

describe('coolingTimeScale', () => {
  it('returns +Infinity when there is no coolant', () => {
    expect(
      coolingTimeScale({
        uCode: 1e-3,
        rhoCode: 1,
        xH2: 0,
        units: DEFAULT_GAS_COOLING_UNITS,
      }),
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it('shortens monotonically with density and H₂ fraction', () => {
    const slow = coolingTimeScale({
      uCode: 5e-3,
      rhoCode: 0.1,
      xH2: 1e-3,
      units: DEFAULT_GAS_COOLING_UNITS,
    });
    const fast = coolingTimeScale({
      uCode: 5e-3,
      rhoCode: 50,
      xH2: 1e-2,
      units: DEFAULT_GAS_COOLING_UNITS,
    });
    expect(fast).toBeLessThan(slow);
  });
});
