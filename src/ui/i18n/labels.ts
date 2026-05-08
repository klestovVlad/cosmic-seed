// Label-pair registry — single source of truth for every on-screen
// physics label. Each entry has an Expert string (paper notation,
// `−T/U`, `σ_8`, `M_h`) and an Explained string (plain language,
// "virial ratio", "initial-fluctuation amplitude", "halo mass").
//
// EXPERIENCE.md §10 — defaults to Explained; the Expert/Explained
// toggle in the toolbar flips every label across the page.
//
// Keys are short camelCase identifiers. Adding a new HUD readout?
// File its pair here first; `tests/ui/labels.test.ts` enforces both
// registers exist for every key the UI references.

export interface LabelPair {
  /** Physics-paper notation. Concise; assumes physics literacy. */
  readonly expert: string;
  /** Plain-language equivalent. The default register for v1. */
  readonly explained: string;
  /** Optional one-line tooltip, register-independent. */
  readonly tooltip?: string;
}

export const LABELS = {
  // Run-state metadata — same in both registers; included so callers
  // can centralise lookup rather than hard-coding strings everywhere.
  particles: {
    expert: 'particles',
    explained: 'particles',
  },
  step: {
    expert: 'step',
    explained: 'step',
  },
  simTime: {
    expert: 'time',
    explained: 'sim time',
  },
  fps: {
    expert: 'fps',
    explained: 'frame rate',
  },
  stepsPerSecond: {
    expert: 'steps/s',
    explained: 'steps per sec',
  },
  stepsPerFrame: {
    expert: 'steps/frame',
    explained: 'steps per frame',
  },

  // Energy / dynamics — the cryptic Expert symbols are exactly the
  // strings EXPERIENCE.md §10 calls out as opaque to non-physicists.
  kineticEnergy: {
    expert: 'T',
    explained: 'kinetic energy',
    tooltip: 'Sum of ½mv² across all particles. Code units.',
  },
  potentialEnergy: {
    expert: 'U',
    explained: 'potential energy',
    tooltip: 'Gravitational binding energy. Negative when attractive.',
  },
  totalEnergy: {
    expert: 'E',
    explained: 'total energy',
    tooltip: 'T + U. Should drift only slightly under leapfrog.',
  },
  energyDrift: {
    expert: 'drift',
    explained: 'energy drift',
    tooltip: '(E − E₀) / |E₀|; integrator should keep this small.',
  },
  virialRatio: {
    expert: '−T/U',
    explained: 'virial ratio',
    tooltip: '0.5 in virial equilibrium; > 0.5 means kinetic-dominated.',
  },
  momentum: {
    expert: '‖p‖',
    explained: 'total momentum',
    tooltip: 'Magnitude of summed particle momenta. Should stay near 0.',
  },

  // Density.
  centralDensity: {
    expert: 'ρ central',
    explained: 'central density',
    tooltip: 'Density inside the central probe radius.',
  },
  peakDensity: {
    expert: 'ρ max',
    explained: 'peak density',
    tooltip: 'Highest particle density seen so far in the run.',
  },
  densityGrowth: {
    expert: 'ρ / ρ₀',
    explained: 'density growth',
    tooltip: 'Peak density relative to current. Tracks structure formation.',
  },

  // Gas.
  gasMassFraction: {
    expert: 'mass frac',
    explained: 'baryon fraction',
    tooltip: "Fraction of total mass that's baryons (Ω_b/Ω_m ≈ 0.157).",
  },
  meanGasEnergy: {
    expert: 'mean u',
    explained: 'mean gas energy',
    tooltip: 'Average gas internal energy (proxy for temperature).',
  },
  peakGasEnergy: {
    expert: 'max u',
    explained: 'hottest gas',
    tooltip: 'Hottest gas particle. Heated via adiabatic compression.',
  },
  compressionHeating: {
    expert: 'u_max / u_0',
    explained: 'compression heating',
    tooltip: 'Compression-heating amplification factor.',
  },
  minGasTemperature: {
    expert: 'T_min',
    explained: 'coldest gas',
    tooltip: 'Coldest gas particle. H₂ cooling drives this down.',
  },
  peakH2Fraction: {
    expert: 'x_H₂ peak',
    explained: 'peak H₂ fraction',
    tooltip: 'Densest cool gas builds molecular hydrogen — the v1 coolant.',
  },

  // Halos & stars.
  haloCount: {
    expert: 'halos',
    explained: 'halo count',
    tooltip: 'FoF clusters above minMembers.',
  },
  largestHaloMass: {
    expert: 'largest M',
    explained: 'largest halo mass',
    tooltip: 'Most massive halo (code units).',
  },
  starCount: {
    expert: 'stars',
    explained: 'stars lit',
    tooltip: 'Halos that have crossed M_crit and ignited Pop III.',
  },
  firstIgnitionRedshift: {
    expert: 'first z',
    explained: 'first ignition redshift',
    tooltip: 'Redshift of the first ignition event.',
  },
  firstIgnitionMass: {
    expert: 'first M',
    explained: 'first ignition mass',
    tooltip: 'Halo mass at first ignition.',
  },

  // Time strip / scale bar (already used by TimeStrip, ScaleBar — register
  // the canonical pair so future stages don't drift to ad-hoc strings).
  redshift: {
    expert: 'z',
    explained: 'redshift',
    tooltip: 'Redshift z = 1/a − 1. Higher z = earlier in the universe.',
  },
  cosmicTime: {
    expert: 't',
    explained: 'age of universe',
    tooltip: 'Time since the Big Bang.',
  },
} as const satisfies Record<string, LabelPair>;

export type LabelKey = keyof typeof LABELS;

export type LabelMode = 'expert' | 'explained';

/**
 * Resolve a label key to its string in the chosen register. Pure —
 * components combine this with a `useUiStore` selector so React
 * re-renders precisely when the toggle flips, not on every state change.
 */
export function getLabel(key: LabelKey, mode: LabelMode): string {
  const pair = LABELS[key];
  return mode === 'expert' ? pair.expert : pair.explained;
}

export function getTooltip(key: LabelKey): string | undefined {
  const pair: LabelPair = LABELS[key];
  return pair.tooltip;
}
