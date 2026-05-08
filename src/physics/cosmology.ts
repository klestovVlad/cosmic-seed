// Friedmann-cosmology background.
//
// We model a flat ΛCDM universe with non-relativistic matter (DM + baryons)
// and a cosmological constant, following Mo, van den Bosch & White §3.
// The radiation term is negligible at the redshifts we care about (z ≲ 100)
// and is omitted; document if we ever need to add it.
//
// The Hubble rate is
//
//   H(z) = H₀ · √( Ω_m (1+z)³ + Ω_Λ )                 (1)
//
// the scale-factor growth follows
//
//   da/dt = a · H(a),   a(t=0) = 0                    (2)
//
// We invert (2) to get t(a) by direct quadrature:
//
//   t(a) = ∫₀ᵃ da' / [ a' · H(a') ]                   (3)
//
// and `aOfT` is the bisection inverse of (3).
//
// Linear growth factor D(a) follows the standard ODE (Heath 1977):
//
//   D''(a) + (3/a + H'/H) D'(a) − (3/2) Ω_m(a)/a² · D(a) = 0     (4)
//
// integrated from a deep-matter-era initial condition where D ∝ a.
// The growth rate f(a) ≡ d ln D / d ln a is derived once we have D.
//
// Unit conventions:
//   * Hubble rate stored in 1/Myr (so a step of dt[Myr] · H gives a unit-
//     less expansion fraction). H₀ in units of "100 km/s/Mpc" = 0.1023 / Myr.
//   * Times in Myr after the Big Bang. Today's age (Planck 2018 default)
//     is about 13.8 Gyr = 13800 Myr, so values fit in f32 trivially.
//   * Redshift / scale factor branded; conversions in `units.ts`.

import {
  aOfZ,
  asNumber,
  hubbleRate,
  type HubbleRate,
  myr,
  type Myr,
  type Redshift,
  scaleFactor,
  type ScaleFactor,
} from './units';

export interface CosmologyParams {
  /** Hubble parameter today, in km/s/Mpc. Planck 2018 default 67.4. */
  readonly H0_kmsMpc: number;
  /** Total matter fraction today. Planck 2018 default 0.315. */
  readonly omegaM: number;
  /** Cosmological-constant fraction today. Planck 2018 default 0.685. */
  readonly omegaL: number;
}

export const PLANCK_2018: CosmologyParams = {
  H0_kmsMpc: 67.4,
  omegaM: 0.315,
  omegaL: 0.685,
};

// Convert a Hubble parameter from (km/s/Mpc) to (1/Myr).
//   1 km/s/Mpc = (1 km) / (3.0857e19 km · s) = 3.241e-20 /s
//   × 3.156e13 s/Myr = 1.023e-6 /Myr
const KMSMPC_TO_INV_MYR = 1.0227e-6;

export function h0InvMyr(p: CosmologyParams): HubbleRate {
  return hubbleRate(p.H0_kmsMpc * KMSMPC_TO_INV_MYR);
}

/** H(a) in 1/Myr. flat ΛCDM, matter + Λ. */
export function hubbleAt(a: ScaleFactor, p: CosmologyParams): HubbleRate {
  const aNum = asNumber(a);
  const h0 = p.H0_kmsMpc * KMSMPC_TO_INV_MYR;
  return hubbleRate(h0 * Math.sqrt(p.omegaM / (aNum * aNum * aNum) + p.omegaL));
}

/** H(z) in 1/Myr. Equivalent to `hubbleAt(aOfZ(z), p)`. */
export function hubbleAtRedshift(z: Redshift, p: CosmologyParams): HubbleRate {
  return hubbleAt(aOfZ(z), p);
}

/**
 * Cosmic time at scale factor `a`, in Myr after the Big Bang.
 * Eq. (3); evaluated by adaptive Simpson's rule. The integrand is regular
 * for matter+Λ — no horizon issues — so a fixed-step quadrature is fine.
 */
export function tOfA(a: ScaleFactor, p: CosmologyParams): Myr {
  const aNum = asNumber(a);
  if (aNum <= 0) return myr(0);
  const h0 = p.H0_kmsMpc * KMSMPC_TO_INV_MYR;
  const N = 4096;
  const da = aNum / N;
  let sum = 0;
  for (let i = 0; i < N; i += 1) {
    // Trapezoid endpoint pairs; treat a=0 with the matter-era closed form.
    const a0 = i === 0 ? 1e-10 : i * da;
    const a1 = (i + 1) * da;
    const f0 = 1 / (a0 * h0 * Math.sqrt(p.omegaM / (a0 * a0 * a0) + p.omegaL));
    const f1 = 1 / (a1 * h0 * Math.sqrt(p.omegaM / (a1 * a1 * a1) + p.omegaL));
    sum += 0.5 * (f0 + f1) * da;
  }
  return myr(sum);
}

/**
 * Inverse of `tOfA`: scale factor at cosmic time `t [Myr]`.
 * Bisection — `tOfA` is strictly increasing.
 */
export function aOfT(t: Myr, p: CosmologyParams): ScaleFactor {
  const tNum = asNumber(t);
  if (tNum <= 0) return scaleFactor(0);
  let lo = 1e-6;
  let hi = 10; // a = 10 corresponds to far-future de Sitter, way beyond v1's horizon.
  for (let i = 0; i < 60; i += 1) {
    const mid = 0.5 * (lo + hi);
    const tMid = tOfA(scaleFactor(mid), p) as number;
    if (tMid < tNum) lo = mid;
    else hi = mid;
  }
  return scaleFactor(0.5 * (lo + hi));
}

/**
 * Linear growth factor D(a), normalised so D(a=1) = 1. Eq. (4) integrated
 * with RK4 from a small a_init where D ≈ a (deep matter era).
 *
 * The 2-component flat ΛCDM has the closed-form Carroll–Press–Turner fit
 *
 *   D(a) ≈ (5/2) Ω_m(a) · a /
 *          [ Ω_m(a)^(4/7) − Ω_L(a) + (1 + Ω_m(a)/2)(1 + Ω_L(a)/70) ]
 *
 * (Carroll, Press, Turner 1992 — accurate to ~1 % for our ranges). We use
 * it directly because a worker-thread ODE integrator is overkill for a
 * smooth scalar function we'll call ~10 Hz in the HUD.
 */
export function growthFactor(a: ScaleFactor, p: CosmologyParams): number {
  const aNum = asNumber(a);
  const e2 = p.omegaM / (aNum * aNum * aNum) + p.omegaL;
  const omegaMa = p.omegaM / (aNum * aNum * aNum * e2);
  const omegaLa = p.omegaL / e2;
  const numerator = 2.5 * omegaMa * aNum;
  const denom = Math.pow(omegaMa, 4 / 7) - omegaLa + (1 + omegaMa / 2) * (1 + omegaLa / 70);
  const D_a = numerator / denom;

  // Normalise so D(1) = 1.
  const e2_today = p.omegaM + p.omegaL; // = 1 for flat universe
  const omegaMa_today = p.omegaM / e2_today;
  const omegaLa_today = p.omegaL / e2_today;
  const D_today_numerator = 2.5 * omegaMa_today;
  const D_today_denom =
    Math.pow(omegaMa_today, 4 / 7) -
    omegaLa_today +
    (1 + omegaMa_today / 2) * (1 + omegaLa_today / 70);
  const D_today = D_today_numerator / D_today_denom;

  return D_a / D_today;
}

/** Logarithmic growth rate f = d ln D / d ln a ≈ Ω_m(a)^0.55 (Linder 2005). */
export function growthRate(a: ScaleFactor, p: CosmologyParams): number {
  const aNum = asNumber(a);
  const e2 = p.omegaM / (aNum * aNum * aNum) + p.omegaL;
  const omegaMa = p.omegaM / (aNum * aNum * aNum * e2);
  return Math.pow(omegaMa, 0.55);
}

/**
 * Convenience: convert a sim time tick (in Myr per real second) to a
 * human-readable "1 sec sim ≈ N Myr" string used in the HUD's
 * speed-of-time readout (`EXPERIENCE.md §2`).
 */
export function speedOfTimeReadout(myrPerRealSecond: number): string {
  if (myrPerRealSecond < 1) return `1 s sim ≈ ${(myrPerRealSecond * 1000).toFixed(0)} kyr`;
  if (myrPerRealSecond < 1000) return `1 s sim ≈ ${myrPerRealSecond.toFixed(1)} Myr`;
  return `1 s sim ≈ ${(myrPerRealSecond / 1000).toFixed(2)} Gyr`;
}
