import { describe, expect, it } from 'vitest';
import { createRandom } from '../../src/physics/random';

describe('createRandom', () => {
  it('is deterministic for the same seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    for (let i = 0; i < 10; i += 1) {
      expect(a.uniform()).toBe(b.uniform());
    }
  });

  it('produces uniformly distributed samples in [0, 1)', () => {
    const rng = createRandom(7);
    let sum = 0;
    const N = 5_000;
    for (let i = 0; i < N; i += 1) {
      const v = rng.uniform();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / N).toBeCloseTo(0.5, 1);
  });

  it('produces a unit Gaussian via Box–Muller', () => {
    const rng = createRandom(11);
    let sum = 0;
    let sum2 = 0;
    const N = 10_000;
    for (let i = 0; i < N; i += 1) {
      const v = rng.normal();
      sum += v;
      sum2 += v * v;
    }
    const mean = sum / N;
    const variance = sum2 / N - mean * mean;
    expect(mean).toBeCloseTo(0, 1);
    expect(variance).toBeCloseTo(1, 1);
  });
});
