import { describe, expect, it } from 'vitest';
import {
  aOfT,
  aOfZ,
  asNumber,
  growthFactor,
  growthRate,
  h0InvMyr,
  hubbleAt,
  hubbleAtRedshift,
  myr,
  PLANCK_2018,
  redshift,
  scaleFactor,
  speedOfTimeReadout,
  tOfA,
  zOfA,
} from '../../src/physics';

describe('redshift / scale factor', () => {
  it('round-trips a ↔ z exactly at z = 0 (a = 1)', () => {
    expect(asNumber(aOfZ(redshift(0)))).toBe(1);
    expect(asNumber(zOfA(scaleFactor(1)))).toBe(0);
  });

  it('z = 100 corresponds to a ≈ 1/101', () => {
    expect(asNumber(aOfZ(redshift(100)))).toBeCloseTo(1 / 101, 6);
    expect(asNumber(zOfA(scaleFactor(1 / 101)))).toBeCloseTo(100, 6);
  });
});

describe('Hubble rate', () => {
  it('H(z = 0) returns H₀ for the Planck-2018 cosmology', () => {
    const h0 = asNumber(h0InvMyr(PLANCK_2018));
    const h = asNumber(hubbleAtRedshift(redshift(0), PLANCK_2018));
    expect(h).toBeCloseTo(h0, 10);
  });

  it('H grows with redshift in matter-dominated era', () => {
    const h0 = asNumber(hubbleAtRedshift(redshift(0), PLANCK_2018));
    const h10 = asNumber(hubbleAtRedshift(redshift(10), PLANCK_2018));
    const h100 = asNumber(hubbleAtRedshift(redshift(100), PLANCK_2018));
    expect(h10).toBeGreaterThan(h0);
    expect(h100).toBeGreaterThan(h10);
  });

  it('H(z = 100) is dominated by the matter term Ω_m · (1+z)³', () => {
    // Matter-only flat: H(z)² = H₀² · Ω_m · (1+z)³.
    // At z=100, (1+z)³ = 1.03e6, Λ contribution negligible.
    const z = 100;
    const h0 = asNumber(h0InvMyr(PLANCK_2018));
    const expected = h0 * Math.sqrt(PLANCK_2018.omegaM * Math.pow(1 + z, 3));
    const actual = asNumber(hubbleAtRedshift(redshift(z), PLANCK_2018));
    expect(actual / expected).toBeCloseTo(1, 4);
  });
});

describe('cosmic time', () => {
  it('t(a → 0) → 0 (Big Bang)', () => {
    const t = asNumber(tOfA(scaleFactor(1e-3), PLANCK_2018));
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1); // less than one Myr — far before recombination
  });

  it('age of universe today (a = 1) is ~13.8 Gyr for Planck-2018', () => {
    const tNow = asNumber(tOfA(scaleFactor(1), PLANCK_2018));
    expect(tNow).toBeGreaterThan(13_500); // 13.5 Gyr
    expect(tNow).toBeLessThan(14_100); // 14.1 Gyr
  });

  it('aOfT inverts tOfA (round-trip)', () => {
    for (const aSample of [0.01, 0.05, 0.5, 1.0]) {
      const t = tOfA(scaleFactor(aSample), PLANCK_2018);
      const back = asNumber(aOfT(t, PLANCK_2018));
      expect(back).toBeCloseTo(aSample, 3);
    }
  });
});

describe('linear growth factor', () => {
  it('D(a = 1) = 1 by normalisation', () => {
    expect(growthFactor(scaleFactor(1), PLANCK_2018)).toBeCloseTo(1, 4);
  });

  it('D(a) ≈ a deep in the matter era (small a)', () => {
    const a = 0.005; // z ≈ 200
    const D = growthFactor(scaleFactor(a), PLANCK_2018);
    // In strict matter-dom, D = a · (5 Ω_m / 2) / (Ω_m^(4/7) + …) — close to a.
    expect(D).toBeGreaterThan(a * 0.5);
    expect(D).toBeLessThan(a * 1.5);
  });

  it('D is monotonically increasing in a', () => {
    let prev = growthFactor(scaleFactor(0.01), PLANCK_2018);
    for (const a of [0.05, 0.1, 0.3, 0.5, 0.8, 1.0]) {
      const D = growthFactor(scaleFactor(a), PLANCK_2018);
      expect(D).toBeGreaterThan(prev);
      prev = D;
    }
  });

  it('growth rate f = Ω_m(a)^0.55 ≈ 0.55 today (Linder fit)', () => {
    const f = growthRate(scaleFactor(1), PLANCK_2018);
    // Ω_m ≈ 0.315, so f ≈ 0.315^0.55 ≈ 0.524.
    expect(f).toBeGreaterThan(0.45);
    expect(f).toBeLessThan(0.6);
  });
});

describe('speed-of-time readout', () => {
  it('renders sub-Myr speeds in kyr', () => {
    expect(speedOfTimeReadout(0.04)).toBe('1 s sim ≈ 40 kyr');
  });

  it('renders sub-Gyr speeds in Myr', () => {
    expect(speedOfTimeReadout(15)).toBe('1 s sim ≈ 15.0 Myr');
  });

  it('renders Gyr-scale speeds in Gyr', () => {
    expect(speedOfTimeReadout(1500)).toBe('1 s sim ≈ 1.50 Gyr');
  });
});

describe('myr / unit branded constructors', () => {
  it('asNumber strips the brand', () => {
    expect(asNumber(myr(123.4))).toBe(123.4);
  });
});

describe('hubble rate at default cosmology', () => {
  it('H₀ ≈ 67.4 km/s/Mpc converts to ~ 6.9e-5 / Myr', () => {
    const h0 = asNumber(h0InvMyr(PLANCK_2018));
    expect(h0).toBeGreaterThan(6.5e-5);
    expect(h0).toBeLessThan(7.5e-5);
  });

  it('hubbleAt(0.5) makes physical sense', () => {
    // At a = 0.5, (1+z) = 2, matter term dominates: H ≈ H₀ · sqrt(Ω_m · 8).
    const h0 = asNumber(h0InvMyr(PLANCK_2018));
    const h = asNumber(hubbleAt(scaleFactor(0.5), PLANCK_2018));
    const expected = h0 * Math.sqrt(PLANCK_2018.omegaM * 8 + PLANCK_2018.omegaL);
    expect(h / expected).toBeCloseTo(1, 4);
  });
});
