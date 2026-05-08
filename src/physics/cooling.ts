// Primordial H₂ cooling — the only effective channel below 10⁴ K in
// metal-free gas. This is what lets the first halos' baryons radiate
// energy faster than dynamical heating, sink to the centre, and ignite
// Pop III stars.
//
// References:
//   * Galli & Palla 1998, A&A 335, 403 — H₂ cooling rate, low-density
//     limit (eq. 26): a polynomial fit log Λ_LD = polynomial(log T).
//   * Tegmark+ 1997, ApJ 474, 1 — analytic equilibrium H₂ fraction.
//   * Bromm & Yoshida 2011, ARA&A 49, 373 — first-stars overview.
//
// All "physical" quantities here are CGS (Λ in erg cm³ s⁻¹, T in K,
// n in cm⁻³, t in s). Code-unit conversions live behind a tiny adapter
// (`GasCoolingUnits`) so the simulation runner can stay in code units.

// Adiabatic index for primordial monatomic-dominated gas (H, He).
// Matches the value passed into `computeSphForcesAndEnergy` in the
// simulation runner; kept local to avoid a circular import.
const GAMMA = 5 / 3;

/**
 * H₂ low-density cooling rate Λ_LD per H–H₂ pair (erg cm³ s⁻¹).
 * Galli & Palla 1998 eq. 26 — polynomial fit in log T valid for
 * 100 K ≤ T ≤ 1.2 × 10⁴ K. Returned value × n_H × n_H₂ gives the
 * volumetric cooling rate. Outside the fit's validity range we clamp to
 * the boundary T so the integrator never blows up at startup.
 */
export function h2CoolingRateLowDensity(temperatureK: number): number {
  if (!Number.isFinite(temperatureK) || temperatureK <= 0) return 0;
  const tClamped = Math.max(100, Math.min(1.2e4, temperatureK));
  const logT = Math.log10(tClamped);
  const logT2 = logT * logT;
  const logT3 = logT2 * logT;
  const logT4 = logT3 * logT;
  const logLambda = -103.0 + 97.59 * logT - 48.05 * logT2 + 10.8 * logT3 - 0.9032 * logT4;
  return Math.pow(10, logLambda);
}

/**
 * Tegmark+ 1997 analytic equilibrium H₂ fraction estimate. This is a
 * stand-in for a full Saslaw–Zipoy network — the real network requires
 * tracking H, H⁻, H⁺, H₂⁺, H₂, e⁻ and ~10 reaction channels. For v1
 * we fix x_H₂ at a primordial-collapse-like value (≈ 10⁻³–10⁻²) and
 * suppress it under a Lyman-Werner background.
 *
 * Stage 4c2 will replace this with the proper rate-equation network.
 */
export function approximateH2Fraction(jLW: number, baseline = 1e-3): number {
  if (!Number.isFinite(jLW) || jLW < 0) return baseline;
  // f_diss = 1 + 4 · J_LW^0.47 mirrors the Kulkarni+2021 LW-suppression
  // shape used in `criticalHaloMass`. At J_LW = 0 the fraction is the
  // baseline; at J_LW = 100 it drops by ~ 30× — qualitatively correct
  // for the "LW destroys H₂, delays cooling" narrative.
  const fDiss = 1 + 4 * Math.pow(jLW, 0.47);
  return baseline / fDiss;
}

// --- Code-unit adapter --------------------------------------------------

export interface GasCoolingUnits {
  /** T_K = u_code · kelvinPerCodeU. Calibrated so that the Stage-3b
   *  initial u₀ ≈ 5 × 10⁻⁴ (code) maps to T ≈ 150 K — i.e. the post-
   *  decoupling temperature at z ≈ 50. */
  readonly kelvinPerCodeU: number;
  /** n_H_cgs = ρ_code · nHCgsPerCodeRho. Tuned so the IC mean SPH
   *  density at z = 50 corresponds to a few × 10⁻² cm⁻³ (cosmic baryon
   *  mean × (1+z)³). */
  readonly nHCgsPerCodeRho: number;
  /** dt_seconds = dt_code · secondsPerCodeTime. Derived from the
   *  simulation's `dt → dtMyr` mapping: at default cosmological mode
   *  dt = 1.2e-3 (code) ≡ 0.2 Myr, so 1 code-time-unit ≈ 167 Myr. */
  readonly secondsPerCodeTime: number;
}

/** Default unit-conversion factors — tuned to the Stage-3b/4 cosmological
 *  mode defaults (see `SimulationCanvas.tsx`'s CPU_CONFIG / GPU_CONFIG). */
export const DEFAULT_GAS_COOLING_UNITS: GasCoolingUnits = {
  kelvinPerCodeU: 3.0e5,
  nHCgsPerCodeRho: 0.6,
  secondsPerCodeTime: 5.27e15,
};

/** Boltzmann constant in CGS — erg / K. */
export const K_B_CGS = 1.380649e-16;

/**
 * Convert a code-unit u to a Kelvin temperature. Linear scaling — the
 * thermodynamic γ (γ-1) factor is folded into `kelvinPerCodeU`, so a
 * single-parameter conversion is all the simulation needs.
 */
export function codeUToKelvin(uCode: number, units: GasCoolingUnits): number {
  return uCode * units.kelvinPerCodeU;
}

export function kelvinToCodeU(temperatureK: number, units: GasCoolingUnits): number {
  return temperatureK / units.kelvinPerCodeU;
}

// --- Cooling step -------------------------------------------------------

export interface CoolingStepInputs {
  readonly uCode: number;
  readonly rhoCode: number;
  /** H₂ number-fraction relative to total H. */
  readonly xH2: number;
  readonly dtCode: number;
  readonly units: GasCoolingUnits;
}

/**
 * Apply one explicit cooling step to a single gas particle. Returns the
 * new internal-energy value in code units. The integrator is forward-
 * Euler on T (cooling rate is steeply T-dependent so we want subcycling,
 * not a fancier per-step scheme — that's the caller's job).
 *
 * Floors u at a tiny positive value so finite-precision drift can't
 * make the gas pressure negative.
 */
export function applyCoolingStep(inputs: CoolingStepInputs): number {
  const { uCode, rhoCode, xH2, dtCode, units } = inputs;
  if (uCode <= 0 || rhoCode <= 0 || xH2 <= 0 || dtCode <= 0) return uCode;

  const T = codeUToKelvin(uCode, units);
  const nH = rhoCode * units.nHCgsPerCodeRho;
  if (nH <= 0) return uCode;
  const lambda = h2CoolingRateLowDensity(T); // erg cm³ s⁻¹
  // Volumetric cooling rate Γ_vol = Λ · n_H · n_H₂ = Λ · n_H² · x_H₂
  // (erg cm⁻³ s⁻¹). Temperature evolution from the first law of
  // thermodynamics with constant volume (no PdV work in the cooling
  // sub-step) is dT/dt = -(γ-1) · Γ_vol / (n · k_B), with n ≈ n_H for a
  // pure-H plasma — close enough at primordial composition.
  const dTdtCgs = (-(GAMMA - 1) * lambda * nH * xH2) / K_B_CGS;
  const dtSeconds = dtCode * units.secondsPerCodeTime;
  const dT = dTdtCgs * dtSeconds;
  const newT = T + dT;
  // Floor the temperature at the CMB at the relevant redshift. v1 uses a
  // fixed 2.7 K (today's CMB); cooling can't take primordial gas below
  // it because the photon bath is thermalising the gas back up. This
  // matters numerically more than physically — keeps the integrator
  // monotone toward equilibrium instead of overshooting into negatives.
  const flooredT = Math.max(2.7, newT);
  return kelvinToCodeU(flooredT, units);
}

/**
 * Subcycle cooling so the integrator stays stable when the cooling time
 * is much shorter than the macro step. Each substep is at most
 * `cflFraction` × t_cool (with `cflFraction = 0.1` by default — same
 * order of magnitude as the SPH viscosity CFL). Capped at `maxSubsteps`
 * to bound CPU cost; if we hit the cap we still apply the full remaining
 * dt as a single Euler step (a small monotonicity hit is OK; runaway is
 * not).
 */
export function subcycleCooling(
  inputs: CoolingStepInputs & { readonly maxSubsteps?: number; readonly cflFraction?: number },
): { uCode: number; substeps: number; capped: boolean } {
  const maxSubsteps = inputs.maxSubsteps ?? 8;
  const cflFraction = inputs.cflFraction ?? 0.1;
  let u = inputs.uCode;
  let dtRemaining = inputs.dtCode;
  let substeps = 0;
  while (dtRemaining > 0 && substeps < maxSubsteps) {
    const tCool = coolingTimeScale({
      uCode: u,
      rhoCode: inputs.rhoCode,
      xH2: inputs.xH2,
      units: inputs.units,
    });
    const dtSub =
      Number.isFinite(tCool) && tCool > 0
        ? Math.min(dtRemaining, cflFraction * tCool)
        : dtRemaining;
    u = applyCoolingStep({
      uCode: u,
      rhoCode: inputs.rhoCode,
      xH2: inputs.xH2,
      dtCode: dtSub,
      units: inputs.units,
    });
    dtRemaining -= dtSub;
    substeps += 1;
  }
  const capped = dtRemaining > 0;
  if (capped) {
    // Apply the rest as one big Euler step to keep dt accounting honest.
    u = applyCoolingStep({
      uCode: u,
      rhoCode: inputs.rhoCode,
      xH2: inputs.xH2,
      dtCode: dtRemaining,
      units: inputs.units,
    });
  }
  return { uCode: u, substeps, capped };
}

/**
 * Cooling timescale t_cool = u / |du/dt| in code time units. Returns
 * `+Infinity` when there's no cooling (Λ = 0 or x_H₂ = 0) so the
 * subcycler picks the macro step.
 */
export function coolingTimeScale(args: {
  readonly uCode: number;
  readonly rhoCode: number;
  readonly xH2: number;
  readonly units: GasCoolingUnits;
}): number {
  const T = codeUToKelvin(args.uCode, args.units);
  const nH = args.rhoCode * args.units.nHCgsPerCodeRho;
  const lambda = h2CoolingRateLowDensity(T);
  if (lambda <= 0 || nH <= 0 || args.xH2 <= 0) return Number.POSITIVE_INFINITY;
  // |du_code/dt_code| = |dT/dt_cgs| · secondsPerCodeTime / kelvinPerCodeU.
  const dTdtCgs = ((GAMMA - 1) * lambda * nH * args.xH2) / K_B_CGS;
  const duCodeDtCode = (dTdtCgs * args.units.secondsPerCodeTime) / args.units.kelvinPerCodeU;
  if (duCodeDtCode <= 0) return Number.POSITIVE_INFINITY;
  return args.uCode / duCodeDtCode;
}
