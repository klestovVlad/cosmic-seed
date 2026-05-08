// Web Worker: builds the Zeldovich IC off the main thread so the UI stays
// responsive during a 64³ FFT (which can take ~100 ms on a slow CPU).
//
// Lifecycle:
//   main → worker.postMessage({ type: 'zeldovich', params })
//   worker → main: { type: 'zeldovich-result', positions, velocities, masses }
//   on error: { type: 'error', message }
//
// Buffers are transferred (not copied) on the response — see ic-runner.ts.

/// <reference lib="webworker" />

import { zeldovichField, type ZeldovichParams } from '@physics/zeldovich-ic';

export interface IcWorkerRequest {
  readonly type: 'zeldovich';
  readonly params: ZeldovichParams;
}

export interface IcWorkerResultMessage {
  readonly type: 'zeldovich-result';
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly masses: Float32Array;
  readonly maxDisplacement: number;
}

export interface IcWorkerErrorMessage {
  readonly type: 'error';
  readonly message: string;
}

export type IcWorkerResponse = IcWorkerResultMessage | IcWorkerErrorMessage;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (event: MessageEvent<IcWorkerRequest>) => {
  const req = event.data;
  try {
    const out = zeldovichField(req.params);
    const response: IcWorkerResultMessage = {
      type: 'zeldovich-result',
      positions: out.positions,
      velocities: out.velocities,
      masses: out.masses,
      maxDisplacement: out.maxDisplacement,
    };
    ctx.postMessage(response, {
      transfer: [out.positions.buffer, out.velocities.buffer, out.masses.buffer],
    });
  } catch (err) {
    const errMsg: IcWorkerErrorMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(errMsg);
  }
});
