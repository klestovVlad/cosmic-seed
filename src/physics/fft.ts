// In-place radix-2 Cooley–Tukey FFT on Float32Array. The complex array is
// stored as interleaved real/imaginary pairs: data[2i] = real(x_i),
// data[2i+1] = imag(x_i). Length must be a power of two; we throw if not.
//
// Convention: forward FFT has e^(-i 2π k n / N); inverse has e^(+i 2π k n / N)
// with a final 1/N scaling. Same convention as NumPy's `np.fft`.
//
// This is the reference implementation used by the worker IC generator and
// validated against analytic Gaussian round-trips. For the 64³ grid we
// expect (~ 256 k complex points), one in-place 1D pass is ~ 5 ms in JS;
// the 3D version is ~ 50 ms total. Plenty fast for an off-thread worker.

function isPow2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/** In-place 1D FFT on N complex points (so `data.length === 2 N`). */
export function fft1d(data: Float32Array, n: number, inverse = false): void {
  if (!isPow2(n)) {
    throw new RangeError(`fft1d: n must be a power of two, got ${String(n)}`);
  }
  if (data.length !== 2 * n) {
    throw new RangeError(`fft1d: expected ${String(2 * n)} reals, got ${String(data.length)}`);
  }

  // Bit-reverse permutation.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const ar = data[i * 2] ?? 0;
      const ai = data[i * 2 + 1] ?? 0;
      data[i * 2] = data[j * 2] ?? 0;
      data[i * 2 + 1] = data[j * 2 + 1] ?? 0;
      data[j * 2] = ar;
      data[j * 2 + 1] = ai;
    }
  }

  // Butterflies. `s` is the size of the current sub-FFT (power of two).
  const sign = inverse ? 1 : -1;
  for (let s = 2; s <= n; s *= 2) {
    const halfS = s / 2;
    const phase = (sign * 2 * Math.PI) / s;
    const wStepR = Math.cos(phase);
    const wStepI = Math.sin(phase);
    for (let kBase = 0; kBase < n; kBase += s) {
      let wR = 1;
      let wI = 0;
      for (let m = 0; m < halfS; m += 1) {
        const i1 = (kBase + m) * 2;
        const i2 = (kBase + m + halfS) * 2;
        const ar = data[i2] ?? 0;
        const ai = data[i2 + 1] ?? 0;
        const tr = wR * ar - wI * ai;
        const ti = wR * ai + wI * ar;
        const ur = data[i1] ?? 0;
        const ui = data[i1 + 1] ?? 0;
        data[i1] = ur + tr;
        data[i1 + 1] = ui + ti;
        data[i2] = ur - tr;
        data[i2 + 1] = ui - ti;
        const newWR = wR * wStepR - wI * wStepI;
        wI = wR * wStepI + wI * wStepR;
        wR = newWR;
      }
    }
  }

  if (inverse) {
    const inv = 1 / n;
    for (let i = 0; i < 2 * n; i += 1) data[i] = (data[i] ?? 0) * inv;
  }
}

/**
 * In-place 3D FFT on an N×N×N complex grid stored as a flat Float32Array
 * of length 2·N³ (real-imag interleaved). Indexing: cell (i, j, k) lives
 * at data[2·((i·N + j)·N + k) + {0,1}].
 *
 * Implemented as three passes of `fft1d` with strided gather/scatter into a
 * scratch buffer of length 2·N. Memory cost: O(N), time cost: O(N³ log N).
 */
export function fft3d(data: Float32Array, n: number, inverse = false): void {
  if (!isPow2(n)) {
    throw new RangeError(`fft3d: n must be a power of two, got ${String(n)}`);
  }
  if (data.length !== 2 * n * n * n) {
    throw new RangeError(
      `fft3d: expected ${String(2 * n * n * n)} reals, got ${String(data.length)}`,
    );
  }

  const scratch = new Float32Array(2 * n);
  const stride2 = n * n; // # of complex points between (i, j, k) and (i+1, j, k)
  const stride1 = n; // # of complex points between (i, j, k) and (i, j+1, k)
  // stride0 = 1: (i, j, k) → (i, j, k+1)

  // Pass 1: FFT along k axis (innermost, contiguous in memory).
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const offset = 2 * (i * stride2 + j * stride1);
      // The k-axis is contiguous, so we can transform in place via a slice view.
      const view = data.subarray(offset, offset + 2 * n);
      fft1d(view, n, inverse);
    }
  }

  // Pass 2: FFT along j axis.
  for (let i = 0; i < n; i += 1) {
    for (let k = 0; k < n; k += 1) {
      // Gather (i, *, k) → scratch.
      for (let j = 0; j < n; j += 1) {
        const idx = 2 * (i * stride2 + j * stride1 + k);
        scratch[2 * j] = data[idx] ?? 0;
        scratch[2 * j + 1] = data[idx + 1] ?? 0;
      }
      fft1d(scratch, n, inverse);
      for (let j = 0; j < n; j += 1) {
        const idx = 2 * (i * stride2 + j * stride1 + k);
        data[idx] = scratch[2 * j] ?? 0;
        data[idx + 1] = scratch[2 * j + 1] ?? 0;
      }
    }
  }

  // Pass 3: FFT along i axis.
  for (let j = 0; j < n; j += 1) {
    for (let k = 0; k < n; k += 1) {
      for (let i = 0; i < n; i += 1) {
        const idx = 2 * (i * stride2 + j * stride1 + k);
        scratch[2 * i] = data[idx] ?? 0;
        scratch[2 * i + 1] = data[idx + 1] ?? 0;
      }
      fft1d(scratch, n, inverse);
      for (let i = 0; i < n; i += 1) {
        const idx = 2 * (i * stride2 + j * stride1 + k);
        data[idx] = scratch[2 * i] ?? 0;
        data[idx + 1] = scratch[2 * i + 1] ?? 0;
      }
    }
  }
}
