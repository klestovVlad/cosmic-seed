// Branded numeric types per RULES §1.
//
// Stage 1 is a non-cosmological toy: `Code*` units have G = 1 by convention
// (see `constants.ts`). Stage 2 will add `Mpc`, `Msun`, `Myr`, `Redshift`,
// `ScaleFactor`, and explicit conversions.

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

// Unwrappers — explicit so a reader sees where unit-stripping happens.
export const asNumber = (
  v: CodeLength | CodeMass | CodeTime | CodeVelocity | CodeEnergy | CodeDensity,
): number => v;
