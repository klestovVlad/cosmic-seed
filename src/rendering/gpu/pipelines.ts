// Compute pipelines for the N-body kernels. All three entry points
// (forceMain, kickDriftMain, kickMain) share the same WGSL module and
// the same bind group layout — see shaders/compute/nbody.wgsl.

import shaderSrc from '../../../shaders/compute/nbody.wgsl?raw';
import type { ParticleGpuBuffers } from './buffers';

export interface ComputePipelines {
  readonly forcePipeline: GPUComputePipeline;
  readonly kickDriftPipeline: GPUComputePipeline;
  readonly kickPipeline: GPUComputePipeline;
  readonly bindGroup: GPUBindGroup;
  readonly uniformBuffer: GPUBuffer;
  /** Workgroups required to cover N particles at the shader's WG=64. */
  readonly workgroupCount: number;
}

export interface PipelineParams {
  readonly count: number;
  readonly dt: number;
  readonly softening: number;
  readonly G: number;
  /** Periodic box side length. Set 0 to disable periodic mode. */
  readonly boxSize: number;
  /** 1 / a² for cosmological mode; 1 in non-cosmological mode. */
  readonly driftScale: number;
}

const WORKGROUP_SIZE = 64;
// SimParams: count u32, dt f32, soft² f32, G f32, boxSize f32, driftScale f32, 2×pad f32.
const UNIFORM_BYTES = 32;

export function createComputePipelines(
  device: GPUDevice,
  buffers: ParticleGpuBuffers,
  params: PipelineParams,
): ComputePipelines {
  const module = device.createShaderModule({ label: 'nbody', code: shaderSrc });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'nbody-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ],
  });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

  const forcePipeline = device.createComputePipeline({
    label: 'force',
    layout,
    compute: { module, entryPoint: 'forceMain' },
  });
  const kickDriftPipeline = device.createComputePipeline({
    label: 'kickDrift',
    layout,
    compute: { module, entryPoint: 'kickDriftMain' },
  });
  const kickPipeline = device.createComputePipeline({
    label: 'kick',
    layout,
    compute: { module, entryPoint: 'kickMain' },
  });

  const uniformBuffer = device.createBuffer({
    label: 'sim-params',
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writePipelineParams(device, uniformBuffer, params);

  const bindGroup = device.createBindGroup({
    label: 'nbody-bg',
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.positions } },
      { binding: 2, resource: { buffer: buffers.velocities } },
      { binding: 3, resource: { buffer: buffers.accelerations } },
      { binding: 4, resource: { buffer: buffers.masses } },
    ],
  });

  return {
    forcePipeline,
    kickDriftPipeline,
    kickPipeline,
    bindGroup,
    uniformBuffer,
    workgroupCount: Math.ceil(buffers.count / WORKGROUP_SIZE),
  };
}

export function writePipelineParams(
  device: GPUDevice,
  uniformBuffer: GPUBuffer,
  params: PipelineParams,
): void {
  const view = new ArrayBuffer(UNIFORM_BYTES);
  const u32 = new Uint32Array(view);
  const f32 = new Float32Array(view);
  u32[0] = params.count;
  f32[1] = params.dt;
  f32[2] = params.softening * params.softening;
  f32[3] = params.G;
  f32[4] = params.boxSize;
  f32[5] = params.driftScale;
  // f32[6], f32[7] = padding (uninitialised → 0).
  device.queue.writeBuffer(uniformBuffer, 0, view);
}
