// Critical-mass criterion for the first stars (Pop III) per Kulkarni,
// Visbal, Bryan (2021), ApJ 917, 40 — the modern fit for "what mass does
// a halo need before primordial gas inside it can cool, sink, and ignite".
//
//   M_crit(z, J_LW, v_bc) = 1.69e6 M☉ · ((1 + z) / 20)^(-1.58)
//                         · f_LW(J_LW) · f_vbc(v_bc)
//
//   f_LW(J_LW)   = 1 + 4 · J_LW^0.47        (J_LW in 10⁻²¹ erg/s/cm²/Hz/sr)
//   f_vbc(v_bc)  = 1 + 0.6 · (v_bc / σ_vbc)^1.8   (σ_vbc ≈ 30 km/s)
//
// In our toy units, masses are in code units (totalMass = 1). To map to a
// real M_sun scale the simulation needs a real box size; until that ships
// we expose a `unitMassMsun` parameter so the caller can convert. With
// `unitMassMsun = 1` this just returns the code-unit number; real numbers
// fall in once the box has a physical size in Mpc/h.

import type { Halo } from './halo-finder';
import type { Redshift } from './units';
import { asNumber } from './units';

export interface IgnitionParams {
  /** Lyman–Werner background, in 10⁻²¹ erg/s/cm²/Hz/sr. */
  readonly J_LW: number;
  /** Streaming velocity v_bc in km/s. σ_vbc = 30 km/s. */
  readonly v_bc: number;
  /** Code-unit mass that corresponds to 1 M☉ — multiplies the formula's M☉. */
  readonly unitMassPerMsun: number;
}

export function criticalHaloMass(z: Redshift, p: IgnitionParams): number {
  const zNum = asNumber(z);
  const baseMsun = 1.69e6 * Math.pow((1 + zNum) / 20, -1.58);
  const f_LW = 1 + 4 * Math.pow(Math.max(0, p.J_LW), 0.47);
  const sigmaVbc = 30; // km/s
  const f_vbc = 1 + 0.6 * Math.pow(Math.max(0, p.v_bc) / sigmaVbc, 1.8);
  return baseMsun * f_LW * f_vbc * p.unitMassPerMsun;
}

export interface IgnitionDecision {
  /** Halo mass in code units. */
  readonly haloMass: number;
  /** Critical mass at this redshift. */
  readonly mCrit: number;
  /** True iff the halo is now massive enough to host its first Pop III star. */
  readonly canIgnite: boolean;
}

export function evaluateIgnition(halo: Halo, z: Redshift, p: IgnitionParams): IgnitionDecision {
  const mCrit = criticalHaloMass(z, p);
  return {
    haloMass: halo.mass,
    mCrit,
    canIgnite: halo.mass >= mCrit,
  };
}

export interface Star {
  /** Position in code units. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Star mass in code units (= ε · M_halo, with ε ≈ 1e-3 typical for Pop III). */
  readonly mass: number;
  /** Redshift at which the star ignited. */
  readonly redshift: number;
  /** Halo mass at the ignition moment (code units). */
  readonly hostHaloMass: number;
}

/**
 * Pop III star formation efficiency — fraction of halo mass that goes into
 * Pop III stars at first ignition. Bromm 2013 §3 gives ε ≈ 10⁻³ as the
 * canonical order-of-magnitude estimate.
 */
export const POPIII_EFFICIENCY = 1e-3;

export interface IgnitionResult {
  readonly newStars: Star[];
  /** Halo IDs (their root index) that just lit up. */
  readonly newlyLit: readonly number[];
}

/**
 * Walk the halo list, ignite each halo that crosses M_crit AND hasn't been
 * lit before. The caller owns the "haloId → already lit" set.
 *
 * `haloIds` is a parallel array of stable identifiers (we use the FoF root
 * index for now). `ignitedSet` is a Set tracking which IDs have already
 * spawned a star — the same halo can stay on the lit list across passes
 * but won't double-ignite.
 */
export function igniteEligibleHalos(
  halos: readonly Halo[],
  haloIds: readonly number[],
  z: Redshift,
  ignitedSet: Set<number>,
  params: IgnitionParams,
): IgnitionResult {
  const newStars: Star[] = [];
  const newlyLit: number[] = [];
  const mCrit = criticalHaloMass(z, params);
  for (let i = 0; i < halos.length; i += 1) {
    const halo = halos[i];
    const id = haloIds[i];
    if (halo === undefined || id === undefined) continue;
    if (ignitedSet.has(id)) continue;
    if (halo.mass < mCrit) continue;
    ignitedSet.add(id);
    newlyLit.push(id);
    newStars.push({
      x: halo.cx,
      y: halo.cy,
      z: halo.cz,
      mass: halo.mass * POPIII_EFFICIENCY,
      redshift: asNumber(z),
      hostHaloMass: halo.mass,
    });
  }
  return { newStars, newlyLit };
}
