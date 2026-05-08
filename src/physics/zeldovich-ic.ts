// Zeldovich initial-condition generator. Builds a 3-D Gaussian random
// density field with a CDM power spectrum (Eisenstein–Hu transfer × σ_8
// normalisation), takes its gradient in Fourier space, inverse-FFTs the
// three displacement components, and places particles on the deformed
// grid: x = q + D · ψ(q), v = a · D · f · H · ψ(q).
//
// The full pipeline:
//
//   1. Sample white noise η(x_n) ∈ N(0,1) in real space (one per cell).
//   2. Forward FFT to η(k); the discrete Hermitian symmetry is automatic
//      because the input was real.
//   3. Build δ(k) = η(k) · √(P(k)) · normalisation. The normalisation
//      converts |η̂|² ~ N³ into |δ̂|² ~ P(k) / V_cell² so the resulting
//      real-space variance matches σ_R² for any R when integrated against
//      the top-hat window.
//   4. Compute ψ_α(k) = −i · k_α / k² · δ(k) for α ∈ {x, y, z}.
//   5. Inverse-FFT each ψ_α to real space.
//   6. Place particles at q + D(z_init) · ψ(q), velocities scaled by
//      growth-rate · Hubble.
//
// The output is in the same `count × 4` (xyz + pad) typed-array layout
// the rest of the simulation expects, with masses uniform.
//
// References:
//   Zel'dovich (1970) MNRAS 168, 359 — the displacement-field IC.
//   Bertschinger (1995) astro-ph/9506070 — practical recipe still used.
//   Eisenstein & Hu (1998) ApJ 496, 605 — transfer function.

import { type CosmologyParams, growthFactor, growthRate, hubbleAt } from './cosmology';
import { fft3d } from './fft';
import { powerSpectrum, type PowerSpectrumParams } from './power-spectrum';
import { createRandom } from './random';
import { aOfZ, asNumber, type Redshift } from './units';

export interface ZeldovichParams {
  readonly cosmology: CosmologyParams;
  readonly powerSpectrum: PowerSpectrumParams;
  readonly seed: number;
  /** Grid resolution per side; must be a power of two. Particle count is N³. */
  readonly gridN: number;
  /** Box length L in h⁻¹ Mpc. */
  readonly boxSizeMpcH: number;
  /** Starting redshift. The displacement is scaled by D(z_init) / D(0). */
  readonly zInit: Redshift;
}

export interface ZeldovichOutput {
  /** N³ × 4 (xyz + pad). Positions in h⁻¹ Mpc, centred on origin. */
  readonly positions: Float32Array;
  /** N³ × 4 (xyz + pad). Peculiar velocities in km/s. */
  readonly velocities: Float32Array;
  /** N³ scalar. Uniform per-particle mass; sum = 1 (code-unit mass). */
  readonly masses: Float32Array;
  /** The peak |ψ| · D(z_init); useful for diagnostics. */
  readonly maxDisplacement: number;
}

function isPow2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

export function zeldovichField(p: ZeldovichParams): ZeldovichOutput {
  const N = p.gridN;
  if (!isPow2(N)) {
    throw new RangeError(`zeldovichField: gridN must be a power of two, got ${String(N)}`);
  }
  const N3 = N * N * N;
  const L = p.boxSizeMpcH;
  const dx = L / N;
  const dk = (2 * Math.PI) / L;
  const vCell = dx * dx * dx;
  const rng = createRandom(p.seed);

  // --- 1. White-noise η(x): real-space Gaussian, one sample per cell ---
  const eta = new Float32Array(2 * N3);
  for (let n = 0; n < N3; n += 1) {
    eta[2 * n] = rng.normal();
    // imag part stays zero — the input is a real field
  }

  // --- 2. Forward 3-D FFT: η(x) → η(k) ---
  fft3d(eta, N, false);

  // --- 3 & 4. Build ψ_α(k) = (k_α / k²) · (-i · δ(k))
  //              with δ(k) = η(k) · √(P(k) / V_cell)
  //
  // Multiplying the complex (re, im) by (-i) gives (im, -re).
  // Then scaling by (k_α / k²) gives the real and imaginary parts of ψ_α.
  // ----------------------------------------------------------------- ---
  const psiX = new Float32Array(2 * N3);
  const psiY = new Float32Array(2 * N3);
  const psiZ = new Float32Array(2 * N3);

  for (let i = 0; i < N; i += 1) {
    const kxi = i <= N / 2 ? i : i - N;
    const kx = kxi * dk;
    for (let j = 0; j < N; j += 1) {
      const kyi = j <= N / 2 ? j : j - N;
      const ky = kyi * dk;
      for (let kk = 0; kk < N; kk += 1) {
        const kzi = kk <= N / 2 ? kk : kk - N;
        const kz = kzi * dk;
        const k2 = kx * kx + ky * ky + kz * kz;
        const idx = (i * N + j) * N + kk;

        if (k2 === 0) {
          // DC mode: no displacement (preserves zero net momentum / position).
          continue;
        }

        const kMag = Math.sqrt(k2);
        const Pk = powerSpectrum(kMag, p.powerSpectrum);
        // ⟨|η̂|²⟩ = N³ from white noise. We want ⟨|δ̂|²⟩ = P / V_cell²
        // (so |δ_continuous|² = V_cell² · |δ̂|² = P).
        // Scale per discrete bin: amp = √(P / V_cell²) / √N³ = √(P / V_box) / V_cell.
        const amp = Math.sqrt(Pk / (L * L * L)) / vCell;

        const re = (eta[2 * idx] ?? 0) * amp;
        const im = (eta[2 * idx + 1] ?? 0) * amp;

        // ψ_α(k) = (k_α / k²) · (im, -re)
        const factor = 1 / k2;
        psiX[2 * idx] = kx * factor * im;
        psiX[2 * idx + 1] = -kx * factor * re;
        psiY[2 * idx] = ky * factor * im;
        psiY[2 * idx + 1] = -ky * factor * re;
        psiZ[2 * idx] = kz * factor * im;
        psiZ[2 * idx + 1] = -kz * factor * re;
      }
    }
  }

  // --- 5. Inverse FFT each component ---
  fft3d(psiX, N, true);
  fft3d(psiY, N, true);
  fft3d(psiZ, N, true);

  // --- 6. Place particles at q + D · ψ(q), velocities a · D · f · H · ψ ---
  const positions = new Float32Array(N3 * 4);
  const velocities = new Float32Array(N3 * 4);
  const masses = new Float32Array(N3);

  const aInit = aOfZ(p.zInit);
  const D_z = growthFactor(aInit, p.cosmology);
  const fGrow = growthRate(aInit, p.cosmology);
  const HInvMyr = asNumber(hubbleAt(aInit, p.cosmology));
  const aNum = asNumber(aInit);
  // Velocity prefactor: peculiar v = a · ḋ_lin · ψ = a · D · f · H · ψ.
  // Units: ψ in h⁻¹ Mpc; H in 1/Myr → v in (h⁻¹ Mpc)/Myr.
  // To km/s: 1 (h⁻¹ Mpc)/Myr ≈ 977.8 km/s.
  const MPC_H_PER_MYR_TO_KM_S = 977.79;
  const vPrefactor = aNum * D_z * fGrow * HInvMyr * MPC_H_PER_MYR_TO_KM_S;

  const m = 1 / N3; // total mass = 1 in code units; uniform
  let maxD = 0;

  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      for (let kk = 0; kk < N; kk += 1) {
        const idx = (i * N + j) * N + kk;
        const offset = idx * 4;
        const realIdx = idx * 2;

        // Lagrangian grid centre relative to box origin (centred).
        const qx = (i + 0.5) * dx - L / 2;
        const qy = (j + 0.5) * dx - L / 2;
        const qz = (kk + 0.5) * dx - L / 2;

        const dxDisp = (psiX[realIdx] ?? 0) * D_z;
        const dyDisp = (psiY[realIdx] ?? 0) * D_z;
        const dzDisp = (psiZ[realIdx] ?? 0) * D_z;

        positions[offset] = qx + dxDisp;
        positions[offset + 1] = qy + dyDisp;
        positions[offset + 2] = qz + dzDisp;

        velocities[offset] = (psiX[realIdx] ?? 0) * vPrefactor;
        velocities[offset + 1] = (psiY[realIdx] ?? 0) * vPrefactor;
        velocities[offset + 2] = (psiZ[realIdx] ?? 0) * vPrefactor;

        masses[idx] = m;

        const mag = Math.sqrt(dxDisp * dxDisp + dyDisp * dyDisp + dzDisp * dzDisp);
        if (mag > maxD) maxD = mag;
      }
    }
  }

  return { positions, velocities, masses, maxDisplacement: maxD };
}
