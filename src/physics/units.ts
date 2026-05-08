// Branded numeric types per RULES §1.
//
// Stage 1 ran in code units (G = 1, sphere radius = 1, total mass = 1).
// Stage 2 introduces cosmological units alongside; conversions live next
// to the constructors so they're easy to audit.

export type CodeLength = number & { readonly __unit: 'CodeLength' };
export type CodeMass = number & { readonly __unit: 'CodeMass' };
export type CodeTime = number & { readonly __unit: 'CodeTime' };
export type CodeVelocity = number & { readonly __unit: 'CodeVelocity' };
export type CodeEnergy = number & { readonly __unit: 'CodeEnergy' };
export type CodeDensity = number & { readonly __unit: 'CodeDensity' };

export const codeLength = (n: number): CodeLength => n as CodeLength;
export const codeMass = (n: number): CodeMass => n as CodeMass;
export const codeTime = (n: number): CodeTime => n as CodeTime;
export const codeVelocity = (n: number): CodeVelocity => n as CodeVelocity;
export const codeEnergy = (n: number): CodeEnergy => n as CodeEnergy;
export const codeDensity = (n: number): CodeDensity => n as CodeDensity;

// Cosmological units. Real numbers, not codes.
//
//   Mpc       — comoving mega-parsec. 1 Mpc ≈ 3.0857e22 m.
//   Msun      — solar mass. 1 Msun ≈ 1.989e30 kg.
//   Myr       — million years. 1 Myr ≈ 3.156e13 s.
//   Redshift  — z, dimensionless. z = 0 today, z → ∞ at the Big Bang.
//   ScaleFactor — a, dimensionless. a = 1 today, a → 0 at the Big Bang.
//                 Related to redshift by a = 1 / (1 + z).
export type Mpc = number & { readonly __unit: 'Mpc' };
export type Msun = number & { readonly __unit: 'Msun' };
export type Myr = number & { readonly __unit: 'Myr' };
export type Redshift = number & { readonly __unit: 'Redshift' };
export type ScaleFactor = number & { readonly __unit: 'ScaleFactor' };
export type HubbleRate = number & { readonly __unit: 'HubbleRate' }; // (1/Myr)

export const mpc = (n: number): Mpc => n as Mpc;
export const msun = (n: number): Msun => n as Msun;
export const myr = (n: number): Myr => n as Myr;
export const redshift = (n: number): Redshift => n as Redshift;
export const scaleFactor = (n: number): ScaleFactor => n as ScaleFactor;
export const hubbleRate = (n: number): HubbleRate => n as HubbleRate;

// Unit-relations that can't be wrong: a = 1/(1+z), z = 1/a - 1.
export const aOfZ = (z: Redshift): ScaleFactor => scaleFactor(1 / (1 + z));
export const zOfA = (a: ScaleFactor): Redshift => redshift(1 / a - 1);

// Conversions to SI-equivalent kilometres / megaparsecs etc. for readouts.
// 1 Mpc = 3.262e6 light-years. Used by the scale bar UI.
export const MLY_PER_MPC = 3.2615;

// Unwrappers — explicit so a reader sees where unit-stripping happens.
export const asNumber = (
  v:
    | CodeLength
    | CodeMass
    | CodeTime
    | CodeVelocity
    | CodeEnergy
    | CodeDensity
    | Mpc
    | Msun
    | Myr
    | Redshift
    | ScaleFactor
    | HubbleRate,
): number => v;
