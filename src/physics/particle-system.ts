// Particle data in struct-of-arrays form. RULES §7: typed arrays only,
// 16-byte aligned for future GPU vec4 packing (xyz + pad).
//
// Positions and velocities are stored as 4-tuples (x, y, z, _pad). Masses
// are a single Float32. Acceleration is reused as scratch on the CPU path.

export interface ParticleSystem {
  readonly count: number;
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly accelerations: Float32Array;
  readonly masses: Float32Array;
}

export function createParticleSystem(count: number): ParticleSystem {
  if (count <= 0 || !Number.isInteger(count)) {
    throw new RangeError(`particle count must be a positive integer, got ${String(count)}`);
  }
  return {
    count,
    positions: new Float32Array(count * 4),
    velocities: new Float32Array(count * 4),
    accelerations: new Float32Array(count * 4),
    masses: new Float32Array(count),
  };
}

export function setParticle(
  ps: ParticleSystem,
  i: number,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  mass: number,
): void {
  const j = i * 4;
  ps.positions[j] = x;
  ps.positions[j + 1] = y;
  ps.positions[j + 2] = z;
  ps.velocities[j] = vx;
  ps.velocities[j + 1] = vy;
  ps.velocities[j + 2] = vz;
  ps.masses[i] = mass;
}

export function totalMass(ps: ParticleSystem): number {
  let m = 0;
  for (let i = 0; i < ps.count; i += 1) {
    m += ps.masses[i] ?? 0;
  }
  return m;
}

export function centerOfMass(ps: ParticleSystem, out: Float32Array): void {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let mTotal = 0;
  for (let i = 0; i < ps.count; i += 1) {
    const j = i * 4;
    const m = ps.masses[i] ?? 0;
    cx += (ps.positions[j] ?? 0) * m;
    cy += (ps.positions[j + 1] ?? 0) * m;
    cz += (ps.positions[j + 2] ?? 0) * m;
    mTotal += m;
  }
  const inv = mTotal === 0 ? 0 : 1 / mTotal;
  out[0] = cx * inv;
  out[1] = cy * inv;
  out[2] = cz * inv;
}

export function totalMomentum(ps: ParticleSystem, out: Float32Array): void {
  let px = 0;
  let py = 0;
  let pz = 0;
  for (let i = 0; i < ps.count; i += 1) {
    const j = i * 4;
    const m = ps.masses[i] ?? 0;
    px += (ps.velocities[j] ?? 0) * m;
    py += (ps.velocities[j + 1] ?? 0) * m;
    pz += (ps.velocities[j + 2] ?? 0) * m;
  }
  out[0] = px;
  out[1] = py;
  out[2] = pz;
}
