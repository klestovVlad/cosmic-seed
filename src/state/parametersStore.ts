// Parameter store — Zustand state for every user-tunable physics knob.
// Stage 5b: σ_8 + J_LW + v_bc + maxStars. The store separates *committed*
// values (what the runner uses) from *pending* values (what the UI is
// editing). Live params (`!requiresRegen`) commit immediately; regen
// params buffer in `pending` until the user hits the "Regenerate" button.

import { create } from 'zustand';
import {
  clampValue,
  defaultValues,
  type ParameterKey,
  PARAMETER_SCHEMA,
  type ParameterValues,
} from './parameters/schema';

export interface ParametersState {
  /** Values currently driving the running simulation. */
  readonly committed: ParameterValues;
  /** Values shown in the UI; differ from `committed` when a
   *  `requiresRegen` parameter has been edited but not applied. */
  readonly pending: ParameterValues;
  /** True iff at least one regen-required parameter has a pending
   *  value different from its committed value. UI surfaces a
   *  "Regenerate" button while this is true. */
  readonly hasPendingRegen: boolean;
  /** Increments every commitRegen / hydrate-with-IC-affecting-changes —
   *  SimulationCanvas keeps it as a useEffect dependency so a regen
   *  fully tears down and rebuilds the runner with the new IC. */
  readonly runId: number;

  /** Update a parameter. Live parameters commit immediately; regen
   *  parameters update only `pending`. Caller doesn't need to know the
   *  distinction — the store reads it from the schema. */
  setParameter(key: ParameterKey, value: number): void;
  /** Apply pending regen-required values into committed. The runner
   *  picks them up at the next IC build (full sim restart). */
  commitRegen(): void;
  /** Drop pending regen-required edits and snap the UI back to the
   *  committed values. */
  resetRegen(): void;
  /** Replace the committed + pending state in one shot — used by the
   *  URL hydrator on app startup. Skips schema-clamp for the caller
   *  (the URL parser already validated). */
  hydrate(values: Partial<ParameterValues>): void;
}

function makeStore(initial: ParameterValues) {
  return {
    committed: { ...initial },
    pending: { ...initial },
    hasPendingRegen: false,
    runId: 0,
  };
}

function recomputePendingRegen(committed: ParameterValues, pending: ParameterValues): boolean {
  for (const k of Object.keys(PARAMETER_SCHEMA) as ParameterKey[]) {
    if (PARAMETER_SCHEMA[k].requiresRegen && committed[k] !== pending[k]) {
      return true;
    }
  }
  return false;
}

export const useParametersStore = create<ParametersState>((set) => ({
  ...makeStore(defaultValues()),

  setParameter: (key, raw) => {
    const value = clampValue(key, raw);
    const spec = PARAMETER_SCHEMA[key];
    set((state) => {
      const pending = { ...state.pending, [key]: value };
      if (spec.requiresRegen) {
        return {
          pending,
          hasPendingRegen: recomputePendingRegen(state.committed, pending),
        };
      }
      const committed = { ...state.committed, [key]: value };
      return {
        committed,
        pending,
        hasPendingRegen: recomputePendingRegen(committed, pending),
      };
    });
  },

  commitRegen: () => {
    set((state) => ({
      committed: { ...state.pending },
      hasPendingRegen: false,
      runId: state.runId + 1,
    }));
  },

  resetRegen: () => {
    set((state) => ({
      pending: { ...state.committed },
      hasPendingRegen: false,
    }));
  },

  hydrate: (values) => {
    set((state) => {
      const next: ParameterValues = { ...state.committed };
      for (const k of Object.keys(values) as ParameterKey[]) {
        const v = values[k];
        if (v === undefined) continue;
        next[k] = clampValue(k, v);
      }
      return {
        committed: { ...next },
        pending: { ...next },
        hasPendingRegen: false,
        runId: state.runId + 1,
      };
    });
  },
}));
