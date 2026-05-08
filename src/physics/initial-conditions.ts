// Stage 1 initial conditions: a non-cosmological toy. Cosmological IC
// (Zeldovich approximation, FFT'd power spectrum) lands in Stage 2.
//
// Generators here:
//   sphericalPerturbation — jittered grid + radial inward shift, used for
//     the visual collapse demo.
//   plummerSphere — equilibrium Plummer model, used by the conservation
//     and virial tests.
//   keplerTwoBody — minimal two-body system in a circular orbit (tests).

import { createParticleSystem, setParticle, type ParticleSystem } from './particle-system';
import { createRandom } from './random';

export interface SphericalPerturbationIC {
  readonly count: number;
  readonly seed: number;
  /** Box half-extent. Particles fill [−L, L]³, then the sphere is masked. */
  readonly boxHalfExtent: number;
  /** Radius of the central perturbation (Gaussian width). */
  readonly perturbationRadius: number;
  /** Peak fractional inward shift at r → 0. */
  readonly perturbationAmplitude: number;
  /** Total mass split equally across particles. */
  readonly totalMass: number;
}

interface Vec3R {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
}

function sampleInsideSphere(rng: ReturnType<typeof createRandom>, R: number): Vec3R {
  for (;;) {
    const x = rng.uniformIn(-R, R);
    const y = rng.uniformIn(-R, R);
    const z = rng.uniformIn(-R, R);
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r > 0 && r <= R) return { x, y, z, r };
  }
}

function rejectionSampleQ(rng: ReturnType<typeof createRandom>, bound: number): number {
  for (;;) {
    const candidate = rng.uniform();
    const g = candidate * candidate * Math.pow(1 - candidate * candidate, 3.5);
    if (bound * rng.uniform() < g) return candidate;
  }
}

export function sphericalPerturbation(spec: SphericalPerturbationIC): ParticleSystem {
  const rng = createRandom(spec.seed);
  const ps = createParticleSystem(spec.count);
  const m = spec.totalMass / spec.count;
  const R = spec.boxHalfExtent;
  const r0 = spec.perturbationRadius;
  const delta = spec.perturbationAmplitude;

  for (let i = 0; i < spec.count; i += 1) {
    const { x, y, z, r } = sampleInsideSphere(rng, R);
    // Radial inward shift: r' = r · (1 − δ · exp(−(r/r0)²)).
    const shift = delta * Math.exp(-(r * r) / (r0 * r0));
    const k = 1 - shift;
    setParticle(ps, i, x * k, y * k, z * k, 0, 0, 0, m);
  }

  return ps;
}

export interface PlummerIC {
  readonly count: number;
  readonly seed: number;
  /** Plummer scale length 'a'. */
  readonly scale: number;
  /** Total mass M of the cluster. */
  readonly totalMass: number;
  /** Newton's G for converting potential → velocity dispersion. */
  readonly G: number;
}

// Plummer (1911) model — equilibrium isotropic cluster.
//
//   ρ(r) = (3 M / 4π a³) · (1 + r²/a²)^(−5/2)
//   Φ(r) = − G M / √(r² + a²)
//
// Radii from the cumulative mass profile (analytic inverse). Velocity
// magnitudes via Aarseth, Hénon, Wielen (1974) rejection on
//   g(q) = q² (1 − q²)^(7/2),    q = v / v_esc(r),
// bounded above by ≈ 0.10076 (peak at q² = 2/9).
export function plummerSphere(spec: PlummerIC): ParticleSystem {
  const rng = createRandom(spec.seed);
  const ps = createParticleSystem(spec.count);
  const m = spec.totalMass / spec.count;
  const a = spec.scale;
  const escapeFactor = Math.sqrt((2 * spec.G * spec.totalMass) / a);
  const REJECTION_BOUND = 0.10078; // > max of g(q) on [0, 1].

  for (let i = 0; i < spec.count; i += 1) {
    // Inverse of the Plummer cumulative mass: M(<r)/M = (r/a)³ / (1 + r²/a²)^(3/2).
    const massFrac = rng.uniform();
    const r = a / Math.sqrt(Math.pow(massFrac, -2 / 3) - 1);

    // Isotropic position direction.
    const cosTheta = rng.uniformIn(-1, 1);
    const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
    const phi = rng.uniformIn(0, 2 * Math.PI);
    const x = r * sinTheta * Math.cos(phi);
    const y = r * sinTheta * Math.sin(phi);
    const z = r * cosTheta;

    // Speed via rejection on g(q).
    const q = rejectionSampleQ(rng, REJECTION_BOUND);
    const vEsc = escapeFactor * Math.pow(1 + (r * r) / (a * a), -0.25);
    const speed = q * vEsc;

    const cosThetaV = rng.uniformIn(-1, 1);
    const sinThetaV = Math.sqrt(1 - cosThetaV * cosThetaV);
    const phiV = rng.uniformIn(0, 2 * Math.PI);
    const vx = speed * sinThetaV * Math.cos(phiV);
    const vy = speed * sinThetaV * Math.sin(phiV);
    const vz = speed * cosThetaV;

    setParticle(ps, i, x, y, z, vx, vy, vz, m);
  }

  return ps;
}

/**
 * Two-body Kepler IC: a small satellite orbiting a heavy central body, set up so
 * the centre of mass is at rest at the origin and the orbit is circular.
 * Used by the integrator unit tests.
 */
export function keplerTwoBody(args: {
  centralMass: number;
  satelliteMass: number;
  radius: number;
  G: number;
}): ParticleSystem {
  const { centralMass, satelliteMass, radius, G } = args;
  const totalMass = centralMass + satelliteMass;
  const omega = Math.sqrt((G * totalMass) / radius ** 3);
  // CM-frame positions and velocities — perpendicular momenta cancel.
  const xCentral = -(satelliteMass / totalMass) * radius;
  const xSatellite = (centralMass / totalMass) * radius;
  const vCentral = -(satelliteMass / totalMass) * radius * omega;
  const vSatellite = (centralMass / totalMass) * radius * omega;

  const ps = createParticleSystem(2);
  setParticle(ps, 0, xCentral, 0, 0, 0, vCentral, 0, centralMass);
  setParticle(ps, 1, xSatellite, 0, 0, 0, vSatellite, 0, satelliteMass);
  return ps;
}
