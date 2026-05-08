// Linear matter power spectrum P(k) at z = 0.
//
//   P(k) = A · k^n_s · T²(k)
//
// We use the Eisenstein–Hu "no-wiggle" (zero-baryon) transfer function
// from Eisenstein & Hu 1998 §4.2 — a cleanly closed-form fit that drops
// the baryon-acoustic-oscillation wiggles. For Stage 2's visualisation
// the wiggle suppression isn't pedagogically important and the no-wiggle
// form is half the code with no `sin(k r_s)` term to debug. Stage 5 can
// switch to the full EH formula if a parameter slider needs the wiggles
// to be visible.
//
// The amplitude A is set by σ_8 normalisation: the rms density contrast
// inside a top-hat window of radius R = 8 h⁻¹ Mpc is σ_R, and we choose
// A so σ_R = σ_8 (user-set, Planck 2018 default 0.811).
//
//   σ_R² = (1/2π²) ∫₀^∞ k² P(k) W²(kR) dk
//   W(x) = 3 (sin x − x cos x) / x³                       (top-hat)
//
// All wave numbers in this file are in `h Mpc⁻¹` units (the convention
// cosmologists use for σ_8). To avoid leaking that subtlety past the
// public API, the integrators take the params object directly.

export interface PowerSpectrumParams {
  /** Total matter fraction today. Planck 2018 default 0.315. */
  readonly omegaM: number;
  /** Baryon fraction today. Planck 2018 default 0.0493. */
  readonly omegaB: number;
  /** H₀ / 100 km/s/Mpc. Planck 2018 default 0.674. */
  readonly h: number;
  /** Spectral tilt n_s. Planck 2018 default 0.965. */
  readonly nSpectral: number;
  /** Top-hat-8 normalisation σ_8. Planck 2018 default 0.811. */
  readonly sigma8: number;
  /** CMB temperature today, K. Default 2.7255 (Fixsen 2009). */
  readonly tCmb: number;
}

export const PLANCK_2018_PS: PowerSpectrumParams = {
  omegaM: 0.315,
  omegaB: 0.0493,
  h: 0.674,
  nSpectral: 0.965,
  sigma8: 0.811,
  tCmb: 2.7255,
};

/**
 * Eisenstein–Hu zero-baryon transfer function. Eq. (29)–(31) of
 * Eisenstein & Hu 1998. `kHMpc` in units of h Mpc⁻¹.
 */
export function eisensteinHuTransfer(kHMpc: number, p: PowerSpectrumParams): number {
  const omegaMh2 = p.omegaM * p.h * p.h;
  const omegaBh2 = p.omegaB * p.h * p.h;
  const fBaryon = p.omegaB / p.omegaM;
  const theta = p.tCmb / 2.7;

  // Sound horizon at drag epoch (eq. 26).
  const s = (44.5 * Math.log(9.83 / omegaMh2)) / Math.sqrt(1 + 10 * Math.pow(omegaBh2, 0.75));

  // α_Γ — baryon-suppression factor (eq. 31).
  const alphaGamma =
    1 -
    0.328 * Math.log(431 * omegaMh2) * fBaryon +
    0.38 * Math.log(22.3 * omegaMh2) * fBaryon * fBaryon;

  // Effective shape parameter Γ_eff(k) (eq. 30). Note kHMpc · s is needed
  // in Mpc — convert via the h factor: kHMpc · s = (k/h) · s_Mpc · h = k · s_Mpc.
  // EH §4.2 expresses this explicitly in h-units; we follow.
  const ks = kHMpc * s * p.h;
  const gammaEff = p.omegaM * p.h * (alphaGamma + (1 - alphaGamma) / (1 + Math.pow(0.43 * ks, 4)));

  const q = (kHMpc * theta * theta) / gammaEff;
  const L = Math.log(2 * Math.E + 1.8 * q);
  const C = 14.2 + 731 / (1 + 62.5 * q);
  return L / (L + C * q * q);
}

/** Top-hat window in Fourier space: W(x) = 3 (sin x − x cos x) / x³. */
export function topHatWindow(x: number): number {
  if (x < 1e-3) {
    // Series: W = 1 − x²/10 + x⁴/280 − …
    return 1 - x * x * 0.1 + Math.pow(x, 4) / 280;
  }
  return (3 * (Math.sin(x) - x * Math.cos(x))) / (x * x * x);
}

/**
 * Unnormalised P(k) = k^n_s · T²(k). The full P uses an amplitude A from
 * σ_8 calibration; this is the shape only.
 */
export function powerSpectrumShape(kHMpc: number, p: PowerSpectrumParams): number {
  const T = eisensteinHuTransfer(kHMpc, p);
  return Math.pow(kHMpc, p.nSpectral) * T * T;
}

/**
 * Compute σ_R from a *shape* power spectrum (without amplitude). To get the
 * actual σ_R for a normalised P, multiply by √A. Logarithmic-k trapezoidal
 * integration over [k_min, k_max].
 */
function sigmaR2FromShape(
  R: number,
  p: PowerSpectrumParams,
  kMin = 1e-4,
  kMax = 1e3,
  N = 4096,
): number {
  const lnKMin = Math.log(kMin);
  const lnKMax = Math.log(kMax);
  const dlnK = (lnKMax - lnKMin) / N;
  let sum = 0;
  for (let i = 0; i <= N; i += 1) {
    const k = Math.exp(lnKMin + i * dlnK);
    const W = topHatWindow(k * R);
    const integrand = (k * k * k * powerSpectrumShape(k, p) * W * W) / (2 * Math.PI * Math.PI);
    const weight = i === 0 || i === N ? 0.5 : 1.0;
    sum += weight * integrand * dlnK;
  }
  return sum;
}

/**
 * Amplitude A such that σ_8 from `A · powerSpectrumShape(k)` equals the
 * params' `sigma8`. Linear in A: A = σ_8² / σ²_R(R = 8, shape).
 */
export function amplitudeFromSigma8(p: PowerSpectrumParams): number {
  const sigmaR2_shape = sigmaR2FromShape(8.0, p);
  return (p.sigma8 * p.sigma8) / sigmaR2_shape;
}

/**
 * Normalised matter power spectrum P(k) at z = 0, in (h⁻¹ Mpc)³.
 * `kHMpc` in h Mpc⁻¹.
 */
export function powerSpectrum(kHMpc: number, p: PowerSpectrumParams): number {
  return amplitudeFromSigma8(p) * powerSpectrumShape(kHMpc, p);
}

/**
 * Round-trip σ_8 from the normalised P(k). Should equal `p.sigma8` to
 * floating-point precision (used as a self-test in unit tests and
 * occasionally at runtime as a calibration check).
 */
export function sigma8(p: PowerSpectrumParams): number {
  const A = amplitudeFromSigma8(p);
  return Math.sqrt(A * sigmaR2FromShape(8.0, p));
}
