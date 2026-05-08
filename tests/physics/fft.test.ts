import { describe, expect, it } from 'vitest';
import { fft1d, fft3d } from '../../src/physics/fft';

function gaussian(N: number, sigma: number): Float32Array {
  const out = new Float32Array(2 * N);
  const cx = (N - 1) / 2;
  for (let i = 0; i < N; i += 1) {
    const x = i - cx;
    out[2 * i] = Math.exp((-x * x) / (2 * sigma * sigma));
    out[2 * i + 1] = 0;
  }
  return out;
}

function maxAbsDiff(a: Float32Array, b: Float32Array): number {
  let m = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    if (d > m) m = d;
  }
  return m;
}

describe('fft1d', () => {
  it('rejects non-power-of-two sizes', () => {
    expect(() => {
      fft1d(new Float32Array(2 * 5), 5);
    }).toThrow(/power of two/);
  });

  it('forward + inverse round-trip recovers a Gaussian (N = 64)', () => {
    const N = 64;
    const orig = gaussian(N, 4);
    const data = new Float32Array(orig);
    fft1d(data, N, false);
    fft1d(data, N, true);
    expect(maxAbsDiff(data, orig)).toBeLessThan(1e-4);
  });

  it('DC bin equals the sum of inputs (N = 32)', () => {
    const N = 32;
    const data = new Float32Array(2 * N);
    let sum = 0;
    for (let i = 0; i < N; i += 1) {
      data[2 * i] = i + 1;
      sum += i + 1;
    }
    fft1d(data, N, false);
    expect(data[0]).toBeCloseTo(sum, 4);
    expect(data[1]).toBeCloseTo(0, 4);
  });

  it("Parseval's theorem: Σ|x|² = (1/N) Σ|X|² (forward only)", () => {
    const N = 64;
    const data = new Float32Array(2 * N);
    for (let i = 0; i < N; i += 1) {
      data[2 * i] = Math.cos((2 * Math.PI * i) / N);
    }
    let energyTime = 0;
    for (let i = 0; i < N; i += 1) {
      const r = data[2 * i] ?? 0;
      const im = data[2 * i + 1] ?? 0;
      energyTime += r * r + im * im;
    }
    fft1d(data, N, false);
    let energyFreq = 0;
    for (let i = 0; i < N; i += 1) {
      const r = data[2 * i] ?? 0;
      const im = data[2 * i + 1] ?? 0;
      energyFreq += r * r + im * im;
    }
    expect(energyFreq / N).toBeCloseTo(energyTime, 4);
  });
});

describe('fft3d', () => {
  it('forward + inverse round-trip on an 8³ grid', () => {
    const N = 8;
    const original = new Float32Array(2 * N * N * N);
    // Random-ish but reproducible.
    for (let i = 0; i < N * N * N; i += 1) {
      original[2 * i] = Math.sin(i * 0.07) + Math.cos(i * 0.13);
    }
    const data = new Float32Array(original);
    fft3d(data, N, false);
    fft3d(data, N, true);
    expect(maxAbsDiff(data, original)).toBeLessThan(1e-3);
  });

  it('round-trip on a 16³ grid stays accurate', () => {
    const N = 16;
    const original = new Float32Array(2 * N * N * N);
    for (let i = 0; i < N * N * N; i += 1) {
      original[2 * i] = (i % 7) - 3;
      original[2 * i + 1] = ((i * 11) % 5) - 2;
    }
    const data = new Float32Array(original);
    fft3d(data, N, false);
    fft3d(data, N, true);
    expect(maxAbsDiff(data, original)).toBeLessThan(1e-3);
  });

  it('DC bin of a 3D constant equals N³', () => {
    const N = 8;
    const data = new Float32Array(2 * N * N * N);
    for (let i = 0; i < N * N * N; i += 1) {
      data[2 * i] = 1;
    }
    fft3d(data, N, false);
    expect(data[0]).toBeCloseTo(N * N * N, 2);
    expect(data[1]).toBeCloseTo(0, 4);
  });
});
