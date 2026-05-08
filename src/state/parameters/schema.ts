// Parameter schema — the single source of truth for every user-tunable
// physics knob. Stage 5b grows this with the four parameters that have
// the most direct educational impact (σ_8, J_LW, v_bc, maxStars); the
// full §2-brief list arrives in 5c (presets) and beyond.
//
// Schema entries drive:
//   * parametersStore.ts — typed default values + per-key updaters.
//   * url.ts — versioned URL serialisation; we use the short `urlKey`
//              field to keep shared links compact.
//   * Sliders.tsx — UI rendering: label, group heading, range, step.
//   * SimulationCanvas.tsx — when a `requiresRegen` parameter changes
//                            the in-flight sim is left alone; the user
//                            confirms via the "Regenerate" button.
//
// Adding a parameter is one entry here + one labels.ts label-pair +
// runner config wiring. Tests in `tests/ui/parameters.test.ts` enforce
// "every schema key has a label-pair" and "URL round-trips losslessly".

import type { LabelKey } from '@ui/i18n/labels';

export type ParameterGroup = 'cosmology' | 'baryons' | 'ignition';

interface BaseSpec {
  /** camelCase identifier; matches parametersStore key. */
  readonly key: string;
  /** Maps to LABELS[labelKey] — single source of truth for register pairs. */
  readonly labelKey: LabelKey;
  /** Short URL key (`?v=1&s8=0.22&jlw=0&...`). Avoid collisions with the
   *  `x` flag used by ExpertToggle. */
  readonly urlKey: string;
  readonly group: ParameterGroup;
  /** A free-form one-line tooltip — typically pulled from the label's
   *  own tooltip, but parameters often want a slightly more action-y
   *  framing ("higher → fewer halos cool", not just "Lyman-Werner
   *  background"). */
  readonly help: string;
  /** When true, changing the value queues a "Regenerate" action rather
   *  than mutating the live runner (some parameters affect IC). */
  readonly requiresRegen: boolean;
}

export interface NumberParameterSpec extends BaseSpec {
  readonly type: 'number';
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
}

export interface IntegerParameterSpec extends BaseSpec {
  readonly type: 'integer';
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
}

export type ParameterSpec = NumberParameterSpec | IntegerParameterSpec;

export const PARAMETER_SCHEMA = {
  sigma8: {
    key: 'sigma8',
    labelKey: 'sigma8',
    urlKey: 's8',
    group: 'cosmology',
    type: 'number',
    min: 0.05,
    max: 1.0,
    step: 0.01,
    default: 0.22,
    requiresRegen: true,
    help: 'Initial fluctuation amplitude. Higher → more aggressive structure formation; lower → smoother field that has to grow.',
  },
  ignitionJ_LW: {
    key: 'ignitionJ_LW',
    labelKey: 'jLW',
    urlKey: 'jlw',
    group: 'ignition',
    type: 'number',
    min: 0,
    max: 1000,
    step: 1,
    default: 0,
    requiresRegen: false,
    help: 'Lyman–Werner background (J_21 units). Higher → harder for halos to cool, first stars delayed.',
  },
  ignitionVbc: {
    key: 'ignitionVbc',
    labelKey: 'vbc',
    urlKey: 'vbc',
    group: 'baryons',
    type: 'number',
    min: 0,
    max: 100,
    step: 1,
    default: 0,
    requiresRegen: false,
    help: 'Baryon-DM streaming velocity (km/s). Higher → gas falls in slower, M_crit rises.',
  },
  maxStars: {
    key: 'maxStars',
    labelKey: 'maxStars',
    urlKey: 'mx',
    group: 'ignition',
    type: 'integer',
    min: 0,
    max: 25,
    step: 1,
    default: 3,
    requiresRegen: false,
    help: 'Cap on Pop III ignitions across the run. Higher → see the cooling cascade; 0 → no ignition.',
  },
} as const satisfies Record<string, ParameterSpec>;

export type ParameterKey = keyof typeof PARAMETER_SCHEMA;

export type ParameterValues = Record<ParameterKey, number>;

/** Default values pulled from the schema — used by parametersStore at
 *  startup and by the URL serialiser as the baseline against which
 *  non-default values are written. */
export function defaultValues(): ParameterValues {
  const out = {} as ParameterValues;
  for (const k of Object.keys(PARAMETER_SCHEMA) as ParameterKey[]) {
    out[k] = PARAMETER_SCHEMA[k].default;
  }
  return out;
}

/** Validate-and-clamp: keeps slider drags within the spec's range and
 *  rounds integers. Returns the clamped value the store should write. */
export function clampValue(key: ParameterKey, raw: number): number {
  const spec = PARAMETER_SCHEMA[key];
  if (!Number.isFinite(raw)) return spec.default;
  const clamped = Math.min(spec.max, Math.max(spec.min, raw));
  if (spec.type === 'integer') return Math.round(clamped);
  // Snap to step grid for slider stability.
  const stepped = Math.round(clamped / spec.step) * spec.step;
  return Number(stepped.toFixed(6));
}
