// Leapfrog Kick–Drift–Kick (KDK) integrator. Symplectic, second-order accurate.
// Reference: Springel 2005 (GADGET-2), eq. 7. RULES §6: Euler is banned.
//
//   v_{n+1/2} = v_n + a_n · dt/2     // half kick
//   x_{n+1}   = x_n + v_{n+1/2} · dt // drift
//   compute a_{n+1}
//   v_{n+1}   = v_{n+1/2} + a_{n+1} · dt/2 // half kick

import type { ParticleSystem } from './particle-system';

export type ForceEvaluator = (ps: ParticleSystem) => void;

export interface LeapfrogState {
  readonly system: ParticleSystem;
  readonly evaluateForces: ForceEvaluator;
  /** Whether `accelerations` have been computed for the current `positions`. */
  hasFreshAccelerations: boolean;
  step: number;
  time: number;
}

export function createLeapfrogState(
  system: ParticleSystem,
  evaluateForces: ForceEvaluator,
): LeapfrogState {
  return {
    system,
    evaluateForces,
    hasFreshAccelerations: false,
    step: 0,
    time: 0,
  };
}

export function leapfrogStep(state: LeapfrogState, dt: number): void {
  const { system, evaluateForces } = state;
  const { positions, velocities, accelerations, count } = system;

  if (!state.hasFreshAccelerations) {
    evaluateForces(system);
    state.hasFreshAccelerations = true;
  }

  const halfDt = 0.5 * dt;

  // Half kick: v_{n+1/2} = v_n + a_n · dt/2
  for (let i = 0; i < count; i += 1) {
    const j = i * 4;
    velocities[j] = (velocities[j] ?? 0) + (accelerations[j] ?? 0) * halfDt;
    velocities[j + 1] = (velocities[j + 1] ?? 0) + (accelerations[j + 1] ?? 0) * halfDt;
    velocities[j + 2] = (velocities[j + 2] ?? 0) + (accelerations[j + 2] ?? 0) * halfDt;
  }

  // Drift: x_{n+1} = x_n + v_{n+1/2} · dt
  for (let i = 0; i < count; i += 1) {
    const j = i * 4;
    positions[j] = (positions[j] ?? 0) + (velocities[j] ?? 0) * dt;
    positions[j + 1] = (positions[j + 1] ?? 0) + (velocities[j + 1] ?? 0) * dt;
    positions[j + 2] = (positions[j + 2] ?? 0) + (velocities[j + 2] ?? 0) * dt;
  }

  evaluateForces(system);

  // Half kick: v_{n+1} = v_{n+1/2} + a_{n+1} · dt/2
  for (let i = 0; i < count; i += 1) {
    const j = i * 4;
    velocities[j] = (velocities[j] ?? 0) + (accelerations[j] ?? 0) * halfDt;
    velocities[j + 1] = (velocities[j + 1] ?? 0) + (accelerations[j + 1] ?? 0) * halfDt;
    velocities[j + 2] = (velocities[j + 2] ?? 0) + (accelerations[j + 2] ?? 0) * halfDt;
  }

  state.step += 1;
  state.time += dt;
}

export interface CosmologicalLeapfrogOptions {
  /** Drift scale factor: x_co += v · dt · driftScale (= 1/a² in canonical-momentum form). */
  readonly driftScale: number;
  /** If set, wrap positions into [-L/2, L/2) after the drift. */
  readonly periodicBoxSize?: number;
}

/**
 * Comoving leapfrog (Stage 2c2). Same KDK structure as the standard
 * `leapfrogStep`, but the drift is scaled by `driftScale` to reflect the
 * cosmic expansion: with x_co the comoving position and v the canonical
 * momentum, dx_co/dt = v / a², so the drift over a step is v · dt / a².
 *
 * In a periodic box, positions are wrapped back into [-L/2, L/2) after the
 * drift so they stay in the simulated region.
 */
export function cosmologicalLeapfrogStep(
  state: LeapfrogState,
  dt: number,
  opts: CosmologicalLeapfrogOptions,
): void {
  const { system, evaluateForces } = state;
  const { positions, velocities, accelerations, count } = system;

  if (!state.hasFreshAccelerations) {
    evaluateForces(system);
    state.hasFreshAccelerations = true;
  }

  const halfDt = 0.5 * dt;
  const driftDt = dt * opts.driftScale;
  const L = opts.periodicBoxSize ?? 0;
  const halfL = 0.5 * L;
  const periodic = L > 0;

  // Half kick.
  for (let i = 0; i < count; i += 1) {
    const j = i * 4;
    velocities[j] = (velocities[j] ?? 0) + (accelerations[j] ?? 0) * halfDt;
    velocities[j + 1] = (velocities[j + 1] ?? 0) + (accelerations[j + 1] ?? 0) * halfDt;
    velocities[j + 2] = (velocities[j + 2] ?? 0) + (accelerations[j + 2] ?? 0) * halfDt;
  }

  // Drift with cosmological scaling + periodic wrap.
  for (let i = 0; i < count; i += 1) {
    const j = i * 4;
    let x = (positions[j] ?? 0) + (velocities[j] ?? 0) * driftDt;
    let y = (positions[j + 1] ?? 0) + (velocities[j + 1] ?? 0) * driftDt;
    let z = (positions[j + 2] ?? 0) + (velocities[j + 2] ?? 0) * driftDt;
    if (periodic) {
      x = x - L * Math.floor((x + halfL) / L);
      y = y - L * Math.floor((y + halfL) / L);
      z = z - L * Math.floor((z + halfL) / L);
    }
    positions[j] = x;
    positions[j + 1] = y;
    positions[j + 2] = z;
  }

  evaluateForces(system);

  // Half kick.
  for (let i = 0; i < count; i += 1) {
    const j = i * 4;
    velocities[j] = (velocities[j] ?? 0) + (accelerations[j] ?? 0) * halfDt;
    velocities[j + 1] = (velocities[j + 1] ?? 0) + (accelerations[j + 1] ?? 0) * halfDt;
    velocities[j + 2] = (velocities[j + 2] ?? 0) + (accelerations[j + 2] ?? 0) * halfDt;
  }

  state.step += 1;
  state.time += dt;
}
