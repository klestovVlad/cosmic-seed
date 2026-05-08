import { describe, expect, it } from 'vitest';
import { DEFAULT_H2_NETWORK, evolveH2Fraction, h2EquilibriumFraction } from '@physics/h2-network';

const NETWORK = DEFAULT_H2_NETWORK;

describe('evolveH2Fraction — formation', () => {
  it('grows monotonically when J_LW = 0 and conditions favour formation', () => {
    let x = 1e-6;
    for (let i = 0; i < 5; i += 1) {
      const next = evolveH2Fraction({
        xH2: x,
        temperatureK: 1000,
        nHCgs: 100,
        jLW: 0,
        dtSeconds: 1e13, // ~ 0.3 Myr
        params: NETWORK,
      });
      expect(next).toBeGreaterThan(x);
      x = next;
    }
  });

  it('forms faster at higher density', () => {
    const lo = evolveH2Fraction({
      xH2: 1e-6,
      temperatureK: 1000,
      nHCgs: 0.1,
      jLW: 0,
      dtSeconds: 3e15,
      params: NETWORK,
    });
    const hi = evolveH2Fraction({
      xH2: 1e-6,
      temperatureK: 1000,
      nHCgs: 100,
      jLW: 0,
      dtSeconds: 3e15,
      params: NETWORK,
    });
    expect(hi).toBeGreaterThan(lo);
  });

  it('forms faster at higher temperature in the H⁻ rate window', () => {
    const cold = evolveH2Fraction({
      xH2: 1e-6,
      temperatureK: 100,
      nHCgs: 1,
      jLW: 0,
      dtSeconds: 3e15,
      params: NETWORK,
    });
    const warm = evolveH2Fraction({
      xH2: 1e-6,
      temperatureK: 3000,
      nHCgs: 1,
      jLW: 0,
      dtSeconds: 3e15,
      params: NETWORK,
    });
    expect(warm).toBeGreaterThan(cold);
  });
});

describe('evolveH2Fraction — dissociation', () => {
  it('shrinks toward the floor under a strong LW background', () => {
    let x = 1e-3;
    let strictlyDecreasingSteps = 0;
    for (let i = 0; i < 8; i += 1) {
      const next = evolveH2Fraction({
        xH2: x,
        temperatureK: 200,
        nHCgs: 1,
        jLW: 100,
        dtSeconds: 1e13,
        params: NETWORK,
      });
      expect(next).toBeLessThanOrEqual(x);
      if (next < x) strictlyDecreasingSteps += 1;
      x = next;
    }
    // Some prefix is strictly decreasing before x clamps to the floor.
    expect(strictlyDecreasingSteps).toBeGreaterThan(0);
    expect(x).toBe(NETWORK.floor);
  });

  it('respects the floor — no value drops below it even in the limit', () => {
    const x = evolveH2Fraction({
      xH2: 0,
      temperatureK: 100,
      nHCgs: 0,
      jLW: 1e6,
      dtSeconds: 1e20,
      params: NETWORK,
    });
    expect(x).toBe(NETWORK.floor);
  });
});

describe('evolveH2Fraction — implicit-step stability', () => {
  it('stays finite and inside [floor, ceiling] for an absurdly long dt', () => {
    const x = evolveH2Fraction({
      xH2: 1e-4,
      temperatureK: 2000,
      nHCgs: 50,
      jLW: 1,
      dtSeconds: 1e25,
      params: NETWORK,
    });
    expect(Number.isFinite(x)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(NETWORK.floor);
    expect(x).toBeLessThanOrEqual(NETWORK.ceiling);
  });

  it('returns the floor for non-finite input rather than NaN', () => {
    const x = evolveH2Fraction({
      xH2: Number.NaN,
      temperatureK: 1000,
      nHCgs: 1,
      jLW: 0,
      dtSeconds: 1e13,
      params: NETWORK,
    });
    expect(x).toBe(NETWORK.floor);
  });
});

describe('h2EquilibriumFraction', () => {
  it('matches the steady-state limit reached by long evolution', () => {
    const conditions = {
      temperatureK: 1500,
      nHCgs: 10,
      jLW: 1,
      params: NETWORK,
    };
    const eq = h2EquilibriumFraction(conditions);
    let x = 1e-6;
    for (let i = 0; i < 200; i += 1) {
      x = evolveH2Fraction({
        ...conditions,
        xH2: x,
        dtSeconds: 1e13,
      });
    }
    expect(x).toBeCloseTo(eq, 3);
  });

  it('hits the ceiling when J_LW = 0 (formation never catches a sink)', () => {
    expect(
      h2EquilibriumFraction({
        temperatureK: 1000,
        nHCgs: 1,
        jLW: 0,
        params: NETWORK,
      }),
    ).toBe(NETWORK.ceiling);
  });
});
