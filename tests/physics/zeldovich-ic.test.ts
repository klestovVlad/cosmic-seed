import { describe, expect, it } from 'vitest';
import { PLANCK_2018 } from '../../src/physics/cosmology';
import { PLANCK_2018_PS } from '../../src/physics/power-spectrum';
import { redshift } from '../../src/physics/units';
import { zeldovichField, type ZeldovichParams } from '../../src/physics/zeldovich-ic';

const baseParams: ZeldovichParams = {
  cosmology: PLANCK_2018,
  powerSpectrum: PLANCK_2018_PS,
  seed: 42,
  gridN: 8,
  boxSizeMpcH: 1,
  zInit: redshift(100),
};

function rmsDisplacement(positions: Float32Array, gridN: number, boxL: number): number {
  const dx = boxL / gridN;
  let sum2 = 0;
  let count = 0;
  for (let i = 0; i < gridN; i += 1) {
    for (let j = 0; j < gridN; j += 1) {
      for (let k = 0; k < gridN; k += 1) {
        const idx = (i * gridN + j) * gridN + k;
        const offset = idx * 4;
        const qx = (i + 0.5) * dx - boxL / 2;
        const qy = (j + 0.5) * dx - boxL / 2;
        const qz = (k + 0.5) * dx - boxL / 2;
        const px = positions[offset] ?? 0;
        const py = positions[offset + 1] ?? 0;
        const pz = positions[offset + 2] ?? 0;
        const ddx = px - qx;
        const ddy = py - qy;
        const ddz = pz - qz;
        sum2 += ddx * ddx + ddy * ddy + ddz * ddz;
        count += 1;
      }
    }
  }
  return Math.sqrt(sum2 / count);
}

describe('zeldovichField', () => {
  it('rejects non-power-of-two grid sizes', () => {
    expect(() => {
      zeldovichField({ ...baseParams, gridN: 5 });
    }).toThrow(/power of two/);
  });

  it('produces N³ × 4 positions and velocities', () => {
    const out = zeldovichField(baseParams);
    expect(out.positions.length).toBe(8 * 8 * 8 * 4);
    expect(out.velocities.length).toBe(8 * 8 * 8 * 4);
    expect(out.masses.length).toBe(8 * 8 * 8);
  });

  it('total mass sums to 1 (uniform per particle)', () => {
    const out = zeldovichField(baseParams);
    let sum = 0;
    for (const m of out.masses) sum += m;
    expect(sum).toBeCloseTo(1, 5);
  });

  it('mean displacement is approximately zero', () => {
    const out = zeldovichField(baseParams);
    const N = baseParams.gridN;
    const dx = baseParams.boxSizeMpcH / N;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    for (let i = 0; i < N; i += 1) {
      for (let j = 0; j < N; j += 1) {
        for (let k = 0; k < N; k += 1) {
          const idx = (i * N + j) * N + k;
          const offset = idx * 4;
          const qx = (i + 0.5) * dx - baseParams.boxSizeMpcH / 2;
          const qy = (j + 0.5) * dx - baseParams.boxSizeMpcH / 2;
          const qz = (k + 0.5) * dx - baseParams.boxSizeMpcH / 2;
          sumX += (out.positions[offset] ?? 0) - qx;
          sumY += (out.positions[offset + 1] ?? 0) - qy;
          sumZ += (out.positions[offset + 2] ?? 0) - qz;
        }
      }
    }
    const total = N * N * N;
    expect(Math.abs(sumX / total)).toBeLessThan(1e-3);
    expect(Math.abs(sumY / total)).toBeLessThan(1e-3);
    expect(Math.abs(sumZ / total)).toBeLessThan(1e-3);
  });

  it('is deterministic for the same seed', () => {
    const a = zeldovichField(baseParams);
    const b = zeldovichField(baseParams);
    for (let i = 0; i < a.positions.length; i += 1) {
      expect(a.positions[i]).toBe(b.positions[i]);
    }
  });

  it('different seeds produce different fields', () => {
    const a = zeldovichField(baseParams);
    const b = zeldovichField({ ...baseParams, seed: 99 });
    let diffCount = 0;
    for (let i = 0; i < a.positions.length; i += 1) {
      if ((a.positions[i] ?? 0) !== (b.positions[i] ?? 0)) diffCount += 1;
    }
    expect(diffCount).toBeGreaterThan(a.positions.length / 2);
  });

  it('rms displacement scales linearly with σ_8', () => {
    const halfSigma = zeldovichField({
      ...baseParams,
      powerSpectrum: { ...PLANCK_2018_PS, sigma8: 0.5 * PLANCK_2018_PS.sigma8 },
    });
    const fullSigma = zeldovichField(baseParams);
    const r1 = rmsDisplacement(halfSigma.positions, baseParams.gridN, baseParams.boxSizeMpcH);
    const r2 = rmsDisplacement(fullSigma.positions, baseParams.gridN, baseParams.boxSizeMpcH);
    expect(r2 / r1).toBeCloseTo(2, 1);
  });

  it('rms displacement scales linearly with the linear growth factor D', () => {
    const earlier = zeldovichField({ ...baseParams, zInit: redshift(199) });
    const later = zeldovichField({ ...baseParams, zInit: redshift(99) });
    const rEarlier = rmsDisplacement(earlier.positions, baseParams.gridN, baseParams.boxSizeMpcH);
    const rLater = rmsDisplacement(later.positions, baseParams.gridN, baseParams.boxSizeMpcH);
    // Deeper into matter era D ≈ a, so D(z=99)/D(z=199) ≈ (1+199)/(1+99) ≈ 2.
    expect(rLater / rEarlier).toBeCloseTo(2, 0);
  });

  it('reports a maxDisplacement consistent with the rms', () => {
    const out = zeldovichField(baseParams);
    const rms = rmsDisplacement(out.positions, baseParams.gridN, baseParams.boxSizeMpcH);
    // peak ≥ rms but not absurdly larger for a Gaussian field of N=512 samples.
    expect(out.maxDisplacement).toBeGreaterThanOrEqual(rms * 0.9);
    expect(out.maxDisplacement).toBeLessThan(rms * 10);
  });
});
