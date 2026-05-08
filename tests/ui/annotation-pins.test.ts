import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPins, projectWorldToViewport } from '@/ui/annotation-pin-builder';

const baseSrc = {
  haloCount: 0,
  largestHaloMass: 0,
  largestHaloCentre: null,
  firstIgnitionAnchor: null,
  firstIgnitionRedshift: null,
  firstIgnitionMassMsun: null,
  unitMassPerMsun: 1e-8,
} as const;

describe('buildPins', () => {
  it('emits no pins when there are no halos and no ignition', () => {
    expect(buildPins({ ...baseSrc })).toHaveLength(0);
  });

  it('emits a largest-halo pin with the mass-anchor string', () => {
    const pins = buildPins({
      ...baseSrc,
      haloCount: 3,
      largestHaloMass: 1e-2, // → 1e6 M☉ at unitMassPerMsun = 1e-8
      largestHaloCentre: { x: 0.1, y: -0.2, z: 0.05 },
    });
    expect(pins).toHaveLength(1);
    const pin = pins[0];
    if (pin === undefined) throw new Error('no pin');
    expect(pin.id).toBe('largest-halo');
    expect(pin.label).toContain('largest halo');
    // 1e6 M☉ falls in the 'dwarf-galaxy seed' bucket per EXPERIENCE.md §3.
    expect(pin.label).toContain('dwarf-galaxy seed');
    expect(pin.anchor).toEqual({ x: 0.1, y: -0.2, z: 0.05 });
  });

  it('emits a first-ignition pin when the ignition fields are populated', () => {
    const pins = buildPins({
      ...baseSrc,
      firstIgnitionAnchor: { x: 0.3, y: 0, z: -0.1 },
      firstIgnitionRedshift: 18.4,
      firstIgnitionMassMsun: 8e5,
    });
    const ignitionPin = pins.find((p) => p.id === 'first-ignition');
    expect(ignitionPin).toBeDefined();
    expect(ignitionPin?.label).toContain('first star ignited');
    expect(ignitionPin?.label).toContain('z = 18.4');
    expect(ignitionPin?.label).toContain('globular-cluster mass');
    expect(ignitionPin?.anchor).toEqual({ x: 0.3, y: 0, z: -0.1 });
  });

  it('skips the first-ignition pin once the caller marks it not visible', () => {
    const pins = buildPins({
      ...baseSrc,
      // Caller drops the anchor when the 3-second window expires.
      firstIgnitionAnchor: null,
      firstIgnitionRedshift: 18.4,
      firstIgnitionMassMsun: 8e5,
    });
    expect(pins.find((p) => p.id === 'first-ignition')).toBeUndefined();
  });
});

describe('projectWorldToViewport', () => {
  it('puts a point on the camera axis at the centre of the viewport', () => {
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    cam.position.set(0, 0, 5);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const proj = projectWorldToViewport({ x: 0, y: 0, z: 0 }, cam);
    expect(proj).not.toBeNull();
    if (proj === null) return;
    expect(proj.u).toBeCloseTo(0.5, 5);
    expect(proj.v).toBeCloseTo(0.5, 5);
    expect(proj.behind).toBe(false);
  });

  it('flags points behind the camera', () => {
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    cam.position.set(0, 0, 5);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const proj = projectWorldToViewport({ x: 0, y: 0, z: 10 }, cam);
    expect(proj?.behind).toBe(true);
  });

  it('positive y in world maps to the upper half of the viewport', () => {
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    cam.position.set(0, 0, 5);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const proj = projectWorldToViewport({ x: 0, y: 1, z: 0 }, cam);
    expect(proj).not.toBeNull();
    if (proj === null) return;
    // Screen y grows downward, so a positive world-y should give v < 0.5.
    expect(proj.v).toBeLessThan(0.5);
  });
});
