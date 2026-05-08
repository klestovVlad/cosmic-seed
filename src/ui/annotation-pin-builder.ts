// Pure helpers for the in-scene annotation pins (EXPERIENCE.md §3).
// Kept separate from the React component file so vitest + the fast-refresh
// linter can reason about them as ordinary modules.

import * as THREE from 'three';
import { formatSolarMass, massAnchor } from './mass-anchor';

export const IGNITION_PIN_LIFETIME_MS = 3000;

export interface PinAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AnnotationPin {
  readonly id: string;
  readonly label: string;
  readonly anchor: PinAnchor;
}

export interface PinSource {
  readonly haloCount: number;
  readonly largestHaloMass: number;
  readonly largestHaloCentre: PinAnchor | null;
  readonly firstIgnitionAnchor: PinAnchor | null;
  readonly firstIgnitionRedshift: number | null;
  readonly firstIgnitionMassMsun: number | null;
  /** Code-unit-mass-per-M☉, so we can convert the largest halo's mass back. */
  readonly unitMassPerMsun: number;
}

/** Build the pin set from a snapshot + the externally-managed ignition window. */
export function buildPins(src: PinSource): AnnotationPin[] {
  const pins: AnnotationPin[] = [];

  if (src.haloCount > 0 && src.largestHaloCentre !== null) {
    const massMsun = src.largestHaloMass / Math.max(src.unitMassPerMsun, 1e-30);
    pins.push({
      id: 'largest-halo',
      label: `← largest halo · ${formatSolarMass(massMsun)} ${massAnchor(massMsun)}`,
      anchor: src.largestHaloCentre,
    });
  }

  if (
    src.firstIgnitionAnchor !== null &&
    src.firstIgnitionRedshift !== null &&
    src.firstIgnitionMassMsun !== null
  ) {
    pins.push({
      id: 'first-ignition',
      label: `first star ignited · z = ${src.firstIgnitionRedshift.toFixed(1)} · ${formatSolarMass(src.firstIgnitionMassMsun)} ${massAnchor(src.firstIgnitionMassMsun)}`,
      anchor: src.firstIgnitionAnchor,
    });
  }

  return pins;
}

export interface ViewportPoint {
  readonly u: number;
  readonly v: number;
  readonly behind: boolean;
}

/**
 * Project a world-space point onto a [0,1]² viewport. Returns null when
 * the camera matrices haven't been initialised. `behind` is true when the
 * point lies outside the camera's frustum along z (behind the near plane
 * or past the far plane), where the (u, v) values can no longer be trusted
 * as a screen-space anchor.
 */
export function projectWorldToViewport(
  world: PinAnchor,
  camera: THREE.Camera,
): ViewportPoint | null {
  const v = new THREE.Vector3(world.x, world.y, world.z);
  v.project(camera);
  // After project(), v.z is in normalised device coordinates: clipspace
  // [-1, 1] is in front of the camera. Anything outside that range came
  // from a point behind the camera (or past the far plane); flag it.
  const behind = v.z > 1 || v.z < -1;
  const u = 0.5 * (v.x + 1);
  const vp = 0.5 * (1 - v.y);
  return { u, v: vp, behind };
}
