// GPU-backed simulation runner. Encodes K leapfrog steps per frame on the
// GPU, then maps the positions buffer back to a CPU Float32Array for
// rendering. Energy / momentum / virial are sampled at the HUD rate by
// also reading back velocities.
//
// Step recipe (KDK leapfrog):
//   if first frame:
//     dispatch forceMain                     // prime accelerations
//   for i in 0..stepsPerFrame:
//     dispatch kickDriftMain                 // half kick + drift
//     dispatch forceMain                     // recompute accelerations
//     dispatch kickMain                      // closing half kick
//   copy positions → positionsStaging
//   submit
//   await positionsStaging.mapAsync(READ)
//   copy mapped → cpuPositions Float32Array
//   unmap

import type { ParticleSystem } from '@physics/index';
import type { GpuContext } from './device';
import { createParticleGpuBuffers, type ParticleGpuBuffers } from './buffers';
import { createComputePipelines, type ComputePipelines, type PipelineParams } from './pipelines';

export interface GpuRunnerOptions {
  readonly initialSystem: ParticleSystem;
  readonly params: PipelineParams;
}

export interface GpuRunner {
  readonly count: number;
  /** Encode + submit `stepsPerFrame` leapfrog steps; returns when CPU has fresh positions. */
  runFrame(stepsPerFrame: number): Promise<Float32Array>;
  /** Read velocities back to CPU. Higher cost — call at HUD cadence (10 Hz), not per frame. */
  readVelocities(): Promise<Float32Array>;
  /** Read positions back independently of a frame (used for HUD energy). */
  readPositions(): Promise<Float32Array>;
  destroy(): void;
}

export function createGpuRunner(ctx: GpuContext, opts: GpuRunnerOptions): GpuRunner {
  const { device, queue } = ctx;
  const buffers: ParticleGpuBuffers = createParticleGpuBuffers(device, opts.initialSystem);
  const pipelines: ComputePipelines = createComputePipelines(device, buffers, opts.params);

  const cpuPositions = new Float32Array(opts.initialSystem.positions.length);
  const cpuVelocities = new Float32Array(opts.initialSystem.velocities.length);
  let primed = false;

  const dispatchAll = (encoder: GPUCommandEncoder, stepsPerFrame: number): void => {
    const pass = encoder.beginComputePass({ label: 'nbody-pass' });
    pass.setBindGroup(0, pipelines.bindGroup);

    if (!primed) {
      pass.setPipeline(pipelines.forcePipeline);
      pass.dispatchWorkgroups(pipelines.workgroupCount);
      primed = true;
    }

    for (let i = 0; i < stepsPerFrame; i += 1) {
      pass.setPipeline(pipelines.kickDriftPipeline);
      pass.dispatchWorkgroups(pipelines.workgroupCount);
      pass.setPipeline(pipelines.forcePipeline);
      pass.dispatchWorkgroups(pipelines.workgroupCount);
      pass.setPipeline(pipelines.kickPipeline);
      pass.dispatchWorkgroups(pipelines.workgroupCount);
    }
    pass.end();
  };

  const submitAndReadPositions = async (encoder: GPUCommandEncoder): Promise<Float32Array> => {
    encoder.copyBufferToBuffer(
      buffers.positions,
      0,
      buffers.positionsStaging,
      0,
      cpuPositions.byteLength,
    );
    queue.submit([encoder.finish()]);

    await buffers.positionsStaging.mapAsync(GPUMapMode.READ);
    const mapped = new Float32Array(buffers.positionsStaging.getMappedRange());
    cpuPositions.set(mapped);
    buffers.positionsStaging.unmap();
    return cpuPositions;
  };

  const submitAndReadVelocities = async (encoder: GPUCommandEncoder): Promise<Float32Array> => {
    encoder.copyBufferToBuffer(
      buffers.velocities,
      0,
      buffers.velocitiesStaging,
      0,
      cpuVelocities.byteLength,
    );
    queue.submit([encoder.finish()]);
    await buffers.velocitiesStaging.mapAsync(GPUMapMode.READ);
    const mapped = new Float32Array(buffers.velocitiesStaging.getMappedRange());
    cpuVelocities.set(mapped);
    buffers.velocitiesStaging.unmap();
    return cpuVelocities;
  };

  return {
    count: buffers.count,

    async runFrame(stepsPerFrame: number): Promise<Float32Array> {
      const encoder = device.createCommandEncoder({ label: 'nbody-frame' });
      dispatchAll(encoder, stepsPerFrame);
      return submitAndReadPositions(encoder);
    },

    async readPositions(): Promise<Float32Array> {
      const encoder = device.createCommandEncoder({ label: 'pos-readback' });
      return submitAndReadPositions(encoder);
    },

    async readVelocities(): Promise<Float32Array> {
      const encoder = device.createCommandEncoder({ label: 'vel-readback' });
      return submitAndReadVelocities(encoder);
    },

    destroy(): void {
      buffers.destroy();
      pipelines.uniformBuffer.destroy();
    },
  };
}
