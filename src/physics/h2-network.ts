// Primordial H₂ formation/dissociation network — the per-particle tracker
// that replaces the flat baseline used by Stage 4c. With this in place,
// dense-and-cool halo cores genuinely build up x_H₂ over their dynamical
// time, while diffuse IGM gas stays near the floor — and a Lyman-Werner
// background relaxes everything back down.
//
// For v1 we use the rate-limited Saslaw-Zipoy H⁻ pathway:
//
//     H + e⁻ → H⁻ + γ          (rate-limiting; Galli & Palla 1998 fit)
//     H⁻ + H → H₂ + e⁻          (fast follow-up; not modelled separately)
//     H₂ + γ_LW → 2H            (Lyman-Werner photodissociation; Abel+1997)
//
// Skipped for v1 (lands later if a stage exposes it):
//   * H + H⁺ → H₂⁺ → H₂ pathway (matters only for T ≳ 10⁴ K)
//   * Collisional dissociation H₂ + H → 3H (matters only T ≳ 5000 K)
//   * Self-shielding of the LW background in dense gas
//   * Tracking x_e(T) — we hold it at the post-recombination freeze-out
//     value (Tegmark+ 1997 §3) instead of integrating the ionisation balance.
//
// References:
//   * Galli & Palla 1998, A&A 335, 403, Table 1 — rate coefficients.
//   * Abel et al. 1997, NewA 2, 181 — LW dissociation rate.
//   * Tegmark et al. 1997, ApJ 474, 1 — primordial-gas freeze-out picture.

export interface H2NetworkParams {
  /**
   * Coefficient a in k_f(T) = a · T^β for the rate-limiting H⁻ formation
   * step. CGS — a is in cm³ s⁻¹ K^(-β).
   */
  readonly formationCoefficient: number;
  readonly formationExponent: number;
  /**
   * Residual electron fraction. Tegmark+ 1997 §3: post-recombination
   * primordial gas freezes out at x_e ≈ 2 × 10⁻⁴.
   */
  readonly electronFraction: number;
  /**
   * Lyman-Werner photodissociation rate per unit J_LW (with J_LW in
   * 10⁻²¹ erg s⁻¹ cm⁻² Hz⁻¹ sr⁻¹). Abel+ 1997 give ≈ 1.4 × 10⁻¹² s⁻¹
   * per J_21.
   */
  readonly lwDissociationCoefficient: number;
  /**
   * Floor on x_H₂ — keeps cooling from completely shutting off when the
   * solver wanders to zero, and matches the post-recombination freeze-out
   * residual that Tegmark notes is always present.
   */
  readonly floor: number;
  /**
   * Soft cap on x_H₂ — physically a halo core saturates somewhere around
   * 10⁻³ to a few × 10⁻², since x_e goes up at higher T and we'd need the
   * full ionisation network to keep up. Cap = 0.1 here (well above the
   * value our toy gets to in practice) so the cap doesn't quietly skew the
   * cooling story; it's a safety bound, not a calibration.
   */
  readonly ceiling: number;
}

/**
 * Default network parameters — Galli & Palla 1998 H⁻ rate, Abel+ 1997 LW
 * rate, Tegmark x_e, conservative floor / cap. Tested by callers, not by a
 * separate "is this exactly the literature value" assertion: the rates
 * come straight from the references and any change to them is a deliberate
 * physics decision that the test will catch by name.
 */
export const DEFAULT_H2_NETWORK: H2NetworkParams = {
  formationCoefficient: 1.43e-18, // cm³ s⁻¹ K⁻⁰·⁹³
  formationExponent: 0.93,
  electronFraction: 2e-4,
  lwDissociationCoefficient: 1.4e-12, // s⁻¹ per J_21
  floor: 1e-6,
  ceiling: 0.1,
};

export interface H2EvolutionInputs {
  /** Current H₂ number-fraction relative to total H. */
  readonly xH2: number;
  /** Gas temperature, K. */
  readonly temperatureK: number;
  /** H number density, cm⁻³. */
  readonly nHCgs: number;
  /** Lyman-Werner background, in J_21 units (10⁻²¹ erg s⁻¹ cm⁻² Hz⁻¹ sr⁻¹). */
  readonly jLW: number;
  /** Step in *seconds* — caller has already done the code↔CGS conversion. */
  readonly dtSeconds: number;
  readonly params: H2NetworkParams;
}

/**
 * Step the H₂ fraction by `dtSeconds` using a one-step implicit Euler:
 *
 *     x_new = (x + R_f · dt) / (1 + R_d · dt)
 *
 * where R_f = k_f(T) · n_H · x_e is the formation rate and R_d the LW
 * dissociation rate. The implicit form is unconditionally stable for any
 * dt ≥ 0, which matters because at the IC the "macro" cosmological step
 * (≈ Myr) is millions of formation timescales long; an explicit step
 * would overshoot wildly into negative x_H₂ before the floor catches it.
 *
 * The result is clamped into `[floor, ceiling]` so a single-step that
 * produces a non-physical value (sqrt of negative T, NaN J_LW, …) can't
 * leak into the cooling integrator.
 */
export function evolveH2Fraction(inputs: H2EvolutionInputs): number {
  const { params } = inputs;
  const xH2 = inputs.xH2;
  const T = inputs.temperatureK;
  const nH = inputs.nHCgs;
  const jLW = inputs.jLW;
  const dt = inputs.dtSeconds;
  if (
    !Number.isFinite(xH2) ||
    !Number.isFinite(T) ||
    !Number.isFinite(nH) ||
    !Number.isFinite(jLW) ||
    !Number.isFinite(dt)
  ) {
    return clampH2(xH2, params);
  }
  if (dt <= 0) return clampH2(xH2, params);
  const tSafe = Math.max(T, 1);
  const kForm = params.formationCoefficient * Math.pow(tSafe, params.formationExponent);
  const formationRate = kForm * Math.max(nH, 0) * params.electronFraction;
  const dissociationRate = params.lwDissociationCoefficient * Math.max(jLW, 0);
  const xNew = (xH2 + formationRate * dt) / (1 + dissociationRate * dt);
  return clampH2(xNew, params);
}

function clampH2(x: number, params: H2NetworkParams): number {
  if (!Number.isFinite(x)) return params.floor;
  if (x < params.floor) return params.floor;
  if (x > params.ceiling) return params.ceiling;
  return x;
}

/**
 * Equilibrium H₂ fraction the network would relax to, given current
 * conditions. Useful for sanity checks and tests; the runner doesn't
 * call this in the hot loop.
 */
export function h2EquilibriumFraction(args: {
  readonly temperatureK: number;
  readonly nHCgs: number;
  readonly jLW: number;
  readonly params: H2NetworkParams;
}): number {
  const { params } = args;
  const tSafe = Math.max(args.temperatureK, 1);
  const kForm = params.formationCoefficient * Math.pow(tSafe, params.formationExponent);
  const formationRate = kForm * Math.max(args.nHCgs, 0) * params.electronFraction;
  const dissociationRate = params.lwDissociationCoefficient * Math.max(args.jLW, 0);
  if (dissociationRate <= 0) return params.ceiling; // run-away → cap
  return clampH2(formationRate / dissociationRate, params);
}
