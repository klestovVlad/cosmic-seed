// GPU-backed simulation runner. Encodes K leapfrog steps per frame on the
// GPU and reads the *previous* frame's positions back via a ring of two
// staging buffers — by the time we await `mapAsync`, the fence has long
// completed, and the await collapses to a microtask. Without this pipeline
// every frame stalls on the GPU's submit-fence and the loop runs at the
// fence-latency rate (~ 30 fps even on a fast GPU).
//
// Step recipe (KDK leapfrog):
//   if first frame:
//     dispatch forceMain                      // prime accelerations
//   for i in 0..stepsPerFrame:
//     dispatch kickDriftMain                  // half kick + drift
//     dispatch forceMain                      // recompute accelerations
//     dispatch kickMain                       // closing half kick
//   copy positions → stagingRing[N % 2]
//   submit
//   if N == 0:
//     return initial-IC positions             // nothing to read yet
//   else:
//     await stagingRing[(N-1) % 2].mapAsync(READ)
//     copy mapped → cpuPositions
//     unmap

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
  destroy(): void;
}

export function createGpuRunner(ctx: GpuContext, opts: GpuRunnerOptions): GpuRunner {
  const { device, queue } = ctx;
  const buffers: ParticleGpuBuffers = createParticleGpuBuffers(device, opts.initialSystem);
  const pipelines: ComputePipelines = createComputePipelines(device, buffers, opts.params);

  // Seeded with the initial IC positions so the very first render frame —
  // before any GPU step has produced output — has something to draw.
  const cpuPositions = new Float32Array(opts.initialSystem.positions.length);
  cpuPositions.set(opts.initialSystem.positions);
  const positionByteLength = cpuPositions.byteLength;

  const cpuVelocities = new Float32Array(opts.initialSystem.velocities.length);
  cpuVelocities.set(opts.initialSystem.velocities);

  const stagingA = buffers.positionsStagingA;
  const stagingB = buffers.positionsStagingB;

  let frameIdx = 0;
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

  return {
    count: buffers.count,

    async runFrame(stepsPerFrame: number): Promise<Float32Array> {
      const writeStaging = frameIdx % 2 === 0 ? stagingA : stagingB;
      const readStaging = frameIdx % 2 === 0 ? stagingB : stagingA;

      const encoder = device.createCommandEncoder({ label: 'nbody-frame' });
      dispatchAll(encoder, stepsPerFrame);
      encoder.copyBufferToBuffer(buffers.positions, 0, writeStaging, 0, positionByteLength);
      queue.submit([encoder.finish()]);

      // Frame 0 has no previous staging to drain — fall through with the IC
      // positions seeded above. From frame 1 onward we read whatever frame
      // (N-1) wrote, which the GPU has had a full frame to finish.
      if (frameIdx === 0) {
        frameIdx += 1;
        return cpuPositions;
      }

      await readStaging.mapAsync(GPUMapMode.READ);
      const mapped = new Float32Array(readStaging.getMappedRange());
      cpuPositions.set(mapped);
      readStaging.unmap();
      frameIdx += 1;
      return cpuPositions;
    },

    async readVelocities(): Promise<Float32Array> {
      const encoder = device.createCommandEncoder({ label: 'vel-readback' });
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
    },

    destroy(): void {
      buffers.destroy();
      pipelines.uniformBuffer.destroy();
    },
  };
}
