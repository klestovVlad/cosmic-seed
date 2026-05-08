// GPU buffer management for the N-body simulation. SoA, vec4-aligned
// (xyz + pad) so future SIMD compaction in WGSL is free.

import type { ParticleSystem } from '@physics/index';

export interface ParticleGpuBuffers {
  readonly count: number;
  /** count × vec4<f32> — positions ping. */
  readonly positions: GPUBuffer;
  readonly velocities: GPUBuffer;
  readonly accelerations: GPUBuffer;
  /** count × f32. */
  readonly masses: GPUBuffer;
  /** Mappable copy of `positions` for read-back to CPU each frame. */
  readonly positionsStaging: GPUBuffer;
  /** Mappable copy of `velocities` for HUD readback (lower cadence). */
  readonly velocitiesStaging: GPUBuffer;
  destroy(): void;
}

const VEC4_BYTES = 16;
const F32_BYTES = 4;

export function createParticleGpuBuffers(
  device: GPUDevice,
  ps: ParticleSystem,
): ParticleGpuBuffers {
  const count = ps.count;
  const vec4Bytes = count * VEC4_BYTES;
  const massBytes = count * F32_BYTES;

  const positions = device.createBuffer({
    label: 'positions',
    size: vec4Bytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const velocities = device.createBuffer({
    label: 'velocities',
    size: vec4Bytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const accelerations = device.createBuffer({
    label: 'accelerations',
    size: vec4Bytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const masses = device.createBuffer({
    label: 'masses',
    size: massBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const positionsStaging = device.createBuffer({
    label: 'positionsStaging',
    size: vec4Bytes,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const velocitiesStaging = device.createBuffer({
    label: 'velocitiesStaging',
    size: vec4Bytes,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // Initial state from the CPU IC. The vec4 stride is already 4-wide in
  // ParticleSystem (xyz + pad), so we can write the typed-array directly.
  device.queue.writeBuffer(positions, 0, ps.positions.buffer, 0, vec4Bytes);
  device.queue.writeBuffer(velocities, 0, ps.velocities.buffer, 0, vec4Bytes);
  device.queue.writeBuffer(masses, 0, ps.masses.buffer, 0, massBytes);
  // Accelerations start at zero; the first force pass fills them.

  return {
    count,
    positions,
    velocities,
    accelerations,
    masses,
    positionsStaging,
    velocitiesStaging,
    destroy(): void {
      positions.destroy();
      velocities.destroy();
      accelerations.destroy();
      masses.destroy();
      positionsStaging.destroy();
      velocitiesStaging.destroy();
    },
  };
}
