import { useEffect, useRef } from 'react';
import { createScene } from '@rendering/scene';
import { createGasCloud, type GasCloud } from '@rendering/gas-cloud';
import { createParticleCloud, type ParticleCloud } from '@rendering/particle-cloud';
import { createStarCloud, type StarCloud } from '@rendering/star-cloud';
import { createLoop } from '@rendering/loop';
import { initWebGpu } from '@rendering/gpu/device';
import { useSimulationStore } from '@state/simulationStore';
import { useUiStore } from '@state/uiStore';
import { useParametersStore } from '@state/parametersStore';
import { deserialiseParameters, serialiseParameters } from '@state/parameters/url';
import {
  createCpuFrameRunner,
  createGpuFrameRunner,
  type FrameRunner,
} from '@state/controllers/frame-runner';
import { DEFAULT_CONFIG, type SimulationConfig } from '@state/controllers/simulation-runner';
import {
  createParticleSystem,
  type ParticleSystem,
  PLANCK_2018,
  PLANCK_2018_PS,
  redshift,
  zeldovichField,
} from '@physics/index';
import { AnnotationPins, type AnnotationPinsHandle } from './AnnotationPins';

const HUD_REFRESH_HZ = 10;
const HUD_REFRESH_INTERVAL_MS = 1000 / HUD_REFRESH_HZ;

// Stage 2c2 — cosmological mode by default: Zeldovich IC, periodic
// min-image gravity, comoving leapfrog with 1/a² drift scale.
// User-experience tuning (post 2c3 polish):
//   * grid must be a power of two (Zeldovich uses radix-2 FFT). 16³ = 4096
//     fits comfortably under the compositor-starvation threshold; the
//     in-between 8000 → 32768 jump (next power of 2) is too aggressive
//     until Stage 3c moves the SPH pass to the GPU.
//   * lower σ_8 so the field stays in a visually-rewarding linear → mildly
//     nonlinear regime instead of collapsing to a single dominant halo.
//   * tighter density kernel + smaller point sprites so individual halos
//     are crisp instead of merging into puffs.
//   * slower dtMyr so the eye can follow the structure-formation arc.
const GPU_GRID = 16;
const GPU_CONFIG: SimulationConfig = {
  ...DEFAULT_CONFIG,
  count: GPU_GRID ** 3,
  cosmologicalMode: true,
  boxHalfExtent: 0.5,
  softening: 0.018,
  densityKernelRadius: 0.06,
  dt: 1.2e-3,
  // 0.02 Myr/step × 60 fps ≈ 1.2 Myr / real-second. Halved again to
  // push per-frame particle displacement well into sub-pixel territory.
  // The full z = 50 → 15 viewing window now takes ~ 3 minutes —
  // calm enough that the eye can follow a single halo's trajectory
  // rather than seeing blurred motion. Stage 5d's speed slider lets
  // viewers fast-forward.
  dtMyr: 0.02,
  zInit: redshift(50),
  // EXPERIENCE.md §3 / §5 frame "first star ignited" as a *singular*
  // educational milestone — a rare beat, not a fireworks display. With
  // 16³ DM and unitMassPerMsun = 1e-8, only halos of ≳ 70 particles
  // cross M_crit at z ≈ 18 — matching the spec's [10⁵, 10⁷] M☉ window
  // and producing 1–3 ignitions across a full run, which the user can
  // actually point to and remember.
  unitMassPerMsun: 1e-8,
};

const CPU_GRID = 8;
// CPU mode runs Stage-3b two-species hydrodynamics: same Zeldovich field
// gives DM at the grid cell centres and gas offset by half-cell to avoid
// the SPH pairing instability. GPU mode stays DM-only until Stage 3c
// adds WGSL SPH compute kernels.
const CPU_CONFIG: SimulationConfig = {
  ...DEFAULT_CONFIG,
  count: CPU_GRID ** 3,
  cosmologicalMode: true,
  boxHalfExtent: 0.5,
  softening: 0.05,
  densityKernelRadius: 0.16,
  dt: 1.2e-3,
  // Same target Myr/sec as GPU mode, accounting for stepsPerFrame = 2.
  dtMyr: 0.02,
  zInit: redshift(50),
  gasCount: CPU_GRID ** 3,
  // u₀ small but non-zero so initial pressure exists (prevents immediate
  // gas collapse before adiabatic compression wakes things up).
  gasInitialEnergy: 5e-4,
  gasSmoothingLength: 0.18,
};

// σ_8 default falls in via parametersStore; see PARAMETER_SCHEMA.sigma8
// for the chosen 0.22 default and rationale.
function tamedPowerSpectrum(sigma8: number): typeof PLANCK_2018_PS {
  return { ...PLANCK_2018_PS, sigma8 };
}

// Seed search: with σ_8 = 0.35 on a 16³ grid only a handful of the
// longest-wavelength modes carry visible amplitude, so the seed
// effectively picks where the dominant overdensities land. Bad seeds
// drop them on the periodic faces of the box (overdensity wraps and
// reads as "two halos glued to the cube walls"). Seed 271828 places
// the dominant mode along ~(1, 0.5, 0.4) — neither axis-aligned nor
// face-bound, so the resulting halos sit interior to the box and the
// cosmic web reads as a 3-D structure rather than a wall artefact.
function zeldovichParamsFor(
  sigma8: number,
  gridN: number,
): {
  cosmology: typeof PLANCK_2018;
  powerSpectrum: typeof PLANCK_2018_PS;
  seed: number;
  gridN: number;
  boxSizeMpcH: number;
  zInit: ReturnType<typeof redshift>;
} {
  return {
    cosmology: PLANCK_2018,
    powerSpectrum: tamedPowerSpectrum(sigma8),
    seed: 271828,
    gridN,
    boxSizeMpcH: 1.0,
    zInit: redshift(50),
  };
}

function buildZeldovichInitialSystem(useGpu: boolean, sigma8: number): ParticleSystem {
  const config = useGpu ? GPU_CONFIG : CPU_CONFIG;
  const zParams = zeldovichParamsFor(sigma8, useGpu ? GPU_GRID : CPU_GRID);
  const dmIc = zeldovichField(zParams);
  const dmCount = dmIc.positions.length / 4;

  if (config.gasCount === 0) {
    // DM-only path (GPU mode for Stage 3b).
    const ps = createParticleSystem(dmCount);
    ps.positions.set(dmIc.positions);
    ps.velocities.fill(0);
    ps.masses.set(dmIc.masses);
    return ps;
  }

  // Two-species: DM at grid cell centres, gas offset by half-cell.
  const gridN = zParams.gridN;
  const halfCell = zParams.boxSizeMpcH / gridN / 2;
  const gasIc = zeldovichField(zParams);
  const gasCount = gasIc.positions.length / 4;
  const total = dmCount + gasCount;
  const ps = createParticleSystem(total);

  // DM particles. Mass scaled so DM contributes ~ 0.85 of total (Ω_DM/Ω_m).
  const dmMassFactor = 0.85;
  const gasMassFactor = 0.15;
  for (let i = 0; i < dmCount; i += 1) {
    const idx = i * 4;
    ps.positions[idx] = dmIc.positions[idx] ?? 0;
    ps.positions[idx + 1] = dmIc.positions[idx + 1] ?? 0;
    ps.positions[idx + 2] = dmIc.positions[idx + 2] ?? 0;
    ps.masses[i] = (dmIc.masses[i] ?? 0) * dmMassFactor;
  }

  // Gas particles, offset by + halfCell on each axis. Wrap into the box.
  const halfL = zParams.boxSizeMpcH / 2;
  const L = zParams.boxSizeMpcH;
  for (let g = 0; g < gasCount; g += 1) {
    const src = g * 4;
    const dst = (dmCount + g) * 4;
    let x = (gasIc.positions[src] ?? 0) + halfCell;
    let y = (gasIc.positions[src + 1] ?? 0) + halfCell;
    let z = (gasIc.positions[src + 2] ?? 0) + halfCell;
    if (x > halfL) x -= L;
    if (y > halfL) y -= L;
    if (z > halfL) z -= L;
    ps.positions[dst] = x;
    ps.positions[dst + 1] = y;
    ps.positions[dst + 2] = z;
    ps.masses[dmCount + g] = (gasIc.masses[g] ?? 0) * gasMassFactor;
  }

  // Velocities zero everywhere — Zeldovich pec velocities at z=50 are noise.
  return ps;
}

export function SimulationCanvas(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pinsRef = useRef<AnnotationPinsHandle | null>(null);
  // Pinned to a ref so the loop closure (created once on mount) can read
  // the latest canvas size without re-creating the loop on resize.
  const canvasSizeRef = useRef<{ width: number; height: number }>({ width: 1, height: 1 });

  // Stage 5b: parameters store drives the runner config. `runId` bumps
  // when the user commits a regen-required parameter change (or the
  // store is hydrated from a URL with non-defaults), forcing this whole
  // effect to tear down and rebuild — which is what "regenerate the IC"
  // means in our model.
  const runId = useParametersStore((s) => s.runId);

  // Hydrate the parametersStore from `?s8=…&jlw=…` on first mount.
  // Schedule the hydrate via `setTimeout(0)` so the setState happens out
  // of the effect body — keeps the React-hooks/set-state-in-effect
  // linter quiet and matches the ExpertToggle's pattern.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const fromUrl = deserialiseParameters(window.location.search);
    if (Object.keys(fromUrl).length === 0) return undefined;
    const id = window.setTimeout(() => {
      useParametersStore.getState().hydrate(fromUrl);
    }, 0);
    return () => {
      window.clearTimeout(id);
    };
  }, []);

  // Mirror committed values into the URL query string. Only non-default
  // values are written; the search string stays empty for a fresh run.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const unsub = useParametersStore.subscribe((state, prev) => {
      if (state.committed === prev.committed) return;
      const search = serialiseParameters(state.committed, window.location.search);
      const url = window.location.pathname + search + window.location.hash;
      window.history.replaceState(null, '', url);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const lifecycle = { cancelled: false };
    let cleanup: (() => void) | null = null;

    void (async (): Promise<void> => {
      const gpuCtx = await initWebGpu();
      if (lifecycle.cancelled) {
        gpuCtx?.destroy();
        return;
      }

      const useGpu = gpuCtx !== null;
      const baseConfig = useGpu ? GPU_CONFIG : CPU_CONFIG;
      // Apply the committed parameter values to the base config. Live
      // params (J_LW, v_bc, maxStars) are also pushed into the runner's
      // config object on every store change below.
      const initialParams = useParametersStore.getState().committed;
      const config: SimulationConfig = {
        ...baseConfig,
        ignitionJ_LW: initialParams.ignitionJ_LW,
        ignitionVbc: initialParams.ignitionVbc,
        maxStars: initialParams.maxStars,
      };
      const initialSystem = buildZeldovichInitialSystem(useGpu, initialParams.sigma8);
      const runner: FrameRunner = useGpu
        ? createGpuFrameRunner(gpuCtx, config, initialSystem)
        : createCpuFrameRunner(config, initialSystem);
      console.warn(
        `[sim] mode=${runner.mode} particles=${String(runner.count)} ic=zeldovich z_init=${String(config.zInit)}`,
      );

      useUiStore.getState().setGpuStatus(
        useGpu
          ? { kind: 'supported' }
          : {
              kind: 'unsupported',
              reason: 'WebGPU adapter not available — running on the CPU fallback.',
            },
      );

      const scene = createScene(canvas);
      const dmCloud: ParticleCloud = createParticleCloud(runner.dmCount, window.devicePixelRatio);
      scene.scene.add(dmCloud.object);
      const gasCloud: GasCloud | null =
        runner.gasCount > 0 ? createGasCloud(runner.gasCount, window.devicePixelRatio) : null;
      if (gasCloud !== null) scene.scene.add(gasCloud.object);
      const starCloud: StarCloud | null = config.cosmologicalMode
        ? createStarCloud(256, window.devicePixelRatio)
        : null;
      if (starCloud !== null) scene.scene.add(starCloud.object);
      // The wireframe cube was a numerical artefact — the periodic-
      // boundary box used by the simulation, not a physical structure.
      // It actively hurt comprehension: halos that straddled the box
      // wall read as "two halos glued to opposite faces". We keep the
      // periodic physics but drop the visual cube; particles are
      // unwrapped around the camera target below so a halo on the
      // periodic boundary appears as one connected structure.

      const store = useSimulationStore.getState();
      store.setParticleCount(runner.count);
      store.setRunning(true);

      let frames = 0;
      let lastSampleAt = performance.now();
      let lastDensityRange = { min: 1e-3, max: 1.0 };
      let lastTempRange = { min: 1e-4, max: 1e-3 };
      let initialMaxDensity = 0;
      useSimulationStore.getState().resetDensitySamples();

      const dmPositionsBytes = runner.dmCount * 4;
      const gasPositionsByteStart = dmPositionsBytes;

      // --- Periodic-unwrap render transform -----------------------------
      //
      // Simulation lives in a periodic [-L/2, L/2]³ box. Visually we
      // don't want to show the box; we want the user's view to follow the
      // most massive halo so the action stays in frame. To keep the
      // cosmic web *connected* across the periodic boundary (a halo that
      // straddles the wall must read as one structure, not two), every
      // particle gets unwrapped around the live camera target via
      // min-image: dx = (raw - target) wrapped into [-L/2, L/2].
      //
      // The target lerps slowly toward the snapshot's largestHaloCentre
      // so a sudden halo-rank swap (rare) doesn't jolt the view.
      const boxSize = 2 * config.boxHalfExtent;
      const halfBox = config.boxHalfExtent;
      const unwrapTarget = { x: 0, y: 0, z: 0 };
      // Very slow lerp: ~ 5 s time-constant at 60 fps. The earlier 0.04
      // factor caused a visible global "slide" of every particle each
      // frame as the target chased a wandering halo COM — what the user
      // perceived as "скорости огромные". At 0.005 the target update is
      // sub-pixel between frames; particles look stationary.
      const TARGET_LERP = 0.005;
      const unwrappedDmPositions = new Float32Array(runner.dmCount * 4);
      const unwrappedGasPositions = new Float32Array(runner.gasCount * 4);

      const minImageDelta = (delta: number): number => {
        let d = delta;
        if (d > halfBox) d -= boxSize;
        else if (d < -halfBox) d += boxSize;
        return d;
      };

      const unwrapPositionsAroundTarget = (
        src: Float32Array,
        srcOffsetBytes: number,
        count: number,
        out: Float32Array,
      ): void => {
        const tx = unwrapTarget.x;
        const ty = unwrapTarget.y;
        const tz = unwrapTarget.z;
        for (let i = 0; i < count; i += 1) {
          const off = srcOffsetBytes / 4 + i * 4;
          const dx = minImageDelta((src[off] ?? 0) - tx);
          const dy = minImageDelta((src[off + 1] ?? 0) - ty);
          const dz = minImageDelta((src[off + 2] ?? 0) - tz);
          const dst = i * 4;
          out[dst] = dx;
          out[dst + 1] = dy;
          out[dst + 2] = dz;
          out[dst + 3] = 0;
        }
      };

      // Star cloud takes a struct array; build a small unwrapped buffer.
      const unwrapStars = (
        stars: readonly { x: number; y: number; z: number; mass: number }[],
      ): { x: number; y: number; z: number; mass: number }[] =>
        stars.map((s) => ({
          x: minImageDelta(s.x - unwrapTarget.x),
          y: minImageDelta(s.y - unwrapTarget.y),
          z: minImageDelta(s.z - unwrapTarget.z),
          mass: s.mass,
        }));

      const loop = createLoop(
        scene,
        {
          async runFrame(stepsPerFrame): Promise<void> {
            const frame = await runner.runFrame(stepsPerFrame);

            // Update unwrap target: lerp toward the snapshot's largest-
            // halo centre via min-image so we don't drift through wraps.
            const halo = runner.snapshot().largestHaloCentre;
            if (halo !== null) {
              unwrapTarget.x += minImageDelta(halo.x - unwrapTarget.x) * TARGET_LERP;
              unwrapTarget.y += minImageDelta(halo.y - unwrapTarget.y) * TARGET_LERP;
              unwrapTarget.z += minImageDelta(halo.z - unwrapTarget.z) * TARGET_LERP;
            }

            // DM cloud: unwrap positions around the target so the halo
            // sits at the scene origin and surrounding structure reads as
            // a connected web (no periodic-wall split).
            unwrapPositionsAroundTarget(frame.positions, 0, runner.dmCount, unwrappedDmPositions);
            dmCloud.syncPositions(unwrappedDmPositions);
            dmCloud.syncDensities(frame.densities);
            if (frame.maxDensity > lastDensityRange.max) {
              const min = Math.max(1e-3, frame.maxDensity * 1e-2);
              dmCloud.setDensityRange(min, frame.maxDensity);
              lastDensityRange = { min, max: frame.maxDensity };
            }
            if (gasCloud !== null && runner.gasCount > 0) {
              unwrapPositionsAroundTarget(
                frame.positions,
                gasPositionsByteStart,
                runner.gasCount,
                unwrappedGasPositions,
              );
              gasCloud.syncPositions(unwrappedGasPositions);
              gasCloud.syncTemperatures(frame.gasInternalEnergy);
              let maxT = 0;
              for (const t of frame.gasInternalEnergy) if (t > maxT) maxT = t;
              if (maxT > lastTempRange.max) {
                const min = Math.max(1e-5, maxT * 5e-2);
                gasCloud.setTemperatureRange(min, maxT);
                lastTempRange = { min, max: maxT };
              }
            }
            if (starCloud !== null) {
              starCloud.syncStars(unwrapStars(frame.stars));
            }
          },
          onRender(s): void {
            const size = canvasSizeRef.current;
            pinsRef.current?.updatePinScreenPositions(s.camera, size.width, size.height, {
              target: unwrapTarget,
              boxSize,
            });
          },
          async onFrame(): Promise<void> {
            frames += 1;
            const now = performance.now();
            const elapsed = now - lastSampleAt;
            if (elapsed >= HUD_REFRESH_INTERVAL_MS) {
              await runner.refreshSnapshotAsync();
              const snap = runner.snapshot();
              const fps = (frames * 1000) / elapsed;
              const store = useSimulationStore.getState();
              store.setDiagnostics({
                ...snap,
                fps,
                stepsPerSecond: (snap.step * 1000) / Math.max(now, 1),
              });
              if (initialMaxDensity === 0 && snap.maxParticleDensity > 0) {
                initialMaxDensity = snap.maxParticleDensity;
              }
              if (initialMaxDensity > 0 && snap.scaleFactor > 0) {
                store.pushDensitySample({
                  a: snap.scaleFactor,
                  delta: snap.maxParticleDensity / initialMaxDensity,
                });
              }
              frames = 0;
              lastSampleAt = now;
            }
          },
        },
        // 1 GPU step per frame — keeps the compute kernel short so the
        // compositor isn't starved of GPU time. CPU path runs 2/frame
        // because each step is cheaper at 512 particles, but no more
        // than that — the educational beats need viewing time, not
        // numerical fast-forward.
        useGpu ? 1 : 2,
      );

      const handleResize = (): void => {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const dpr = window.devicePixelRatio;
        canvasSizeRef.current = { width: w, height: h };
        scene.resize(w, h, dpr);
        dmCloud.resize(dpr);
        gasCloud?.resize(dpr);
        starCloud?.resize(dpr);
      };

      handleResize();
      window.addEventListener('resize', handleResize);

      // Live-parameter push: subscribe to parametersStore.committed and
      // mutate the runner's config in place. Cast away `readonly` —
      // both runners read these via `config.x` on each FoF / ignition
      // pass, so writes take effect on the next pass without a restart.
      const mutableConfig = config as {
        -readonly [K in keyof SimulationConfig]: SimulationConfig[K];
      };
      const unsubscribeLive = useParametersStore.subscribe((state, prev) => {
        if (state.committed === prev.committed) return;
        mutableConfig.ignitionJ_LW = state.committed.ignitionJ_LW;
        mutableConfig.ignitionVbc = state.committed.ignitionVbc;
        mutableConfig.maxStars = state.committed.maxStars;
      });

      loop.start();

      cleanup = (): void => {
        loop.stop();
        unsubscribeLive();
        useSimulationStore.getState().setRunning(false);
        window.removeEventListener('resize', handleResize);
        dmCloud.dispose();
        gasCloud?.dispose();
        starCloud?.dispose();
        scene.dispose();
        runner.destroy();
        gpuCtx?.destroy();
      };
    })().catch((err: unknown) => {
      console.error('[sim-canvas] init failed', err);
    });

    return () => {
      lifecycle.cancelled = true;
      cleanup?.();
    };
    // runId bumps on commitRegen → full tear-down + rebuild with the
    // new IC parameters (σ_8 etc.).
  }, [runId]);

  return (
    <>
      <canvas
        ref={canvasRef}
        data-testid="simulation-canvas"
        className="absolute inset-0 z-0 block h-full w-full"
      />
      <AnnotationPins ref={pinsRef} unitMassPerMsun={GPU_CONFIG.unitMassPerMsun} />
    </>
  );
}
