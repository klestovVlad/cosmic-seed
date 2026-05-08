// Typed wrapper around `ic-worker.ts`. Spawns a single-shot worker, posts
// the request, waits for the response, terminates. No worker pool yet —
// IC generation is a one-time cost per simulation start.

import type { ZeldovichParams } from '@physics/zeldovich-ic';
import IcWorker from './ic-worker?worker';
import type { IcWorkerRequest, IcWorkerResponse, IcWorkerResultMessage } from './ic-worker';

export interface ZeldovichResult {
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly masses: Float32Array;
  readonly maxDisplacement: number;
}

export async function generateZeldovichIcAsync(params: ZeldovichParams): Promise<ZeldovichResult> {
  const worker = new IcWorker();
  return new Promise<ZeldovichResult>((resolve, reject) => {
    worker.addEventListener(
      'message',
      (event: MessageEvent<IcWorkerResponse>) => {
        const data = event.data;
        worker.terminate();
        if (data.type === 'zeldovich-result') {
          const result: IcWorkerResultMessage = data;
          resolve({
            positions: result.positions,
            velocities: result.velocities,
            masses: result.masses,
            maxDisplacement: result.maxDisplacement,
          });
        } else {
          reject(new Error(`Zeldovich IC worker failed: ${data.message}`));
        }
      },
      { once: true },
    );
    worker.addEventListener(
      'error',
      (event: ErrorEvent) => {
        worker.terminate();
        reject(new Error(`Zeldovich IC worker errored: ${event.message}`));
      },
      { once: true },
    );
    const req: IcWorkerRequest = { type: 'zeldovich', params };
    worker.postMessage(req);
  });
}
