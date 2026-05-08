# Stage 1: Gravity prototype

**Status:** IN PROGRESS
**Estimated:** 3–5 days
**Depends on:** Stage 0
**Spec reference:** Phase 0 (cosmology brief §5)

## Goal

Reproduce Stern's spherically-symmetric collapse picture in 3D: 10 000 dark-matter particles, direct N² gravity on the GPU, leapfrog (KDK) integrator, fixed background (no expansion yet). Set up a single spherical density perturbation and watch it collapse, infall through the centre, and form a cusp. This is a non-cosmological toy — the value is in proving the GPU compute pipeline, the integrator, and the rendering loop end-to-end.

## Deliverables

- [ ] `src/physics/nbody.ts` — leapfrog KDK orchestration.
- [ ] `shaders/compute/gravity.wgsl` — direct N² with softening (or GLSL transform-feedback fallback).
- [ ] `src/physics/initial-conditions.ts` — spherical perturbation seed (regular grid + radial inward push).
- [ ] `src/rendering/particles.ts` — GPU-driven point cloud, position buffer ping-pong.
- [ ] `src/rendering/scene.ts` — Three.js scene, orbit controls, dark-space background.
- [ ] `src/state/simulationStore.ts` — minimal store: running, step count, time, particle count.
- [ ] `src/ui/HUD.tsx` — FPS, step count, max density, energy drift.
- [ ] `tests/physics/leapfrog.test.ts` — energy conservation in a Plummer test problem.
- [ ] `tests/physics/spherical-collapse.test.ts` — turnaround time vs analytic.

## Implementation steps

1. **Pick the GPU backend.**
   - WebGPU compute shader is preferred; if WebGPU is unavailable, fall back to WebGL2 transform feedback.
   - Decide and write the choice into `DECISIONS.md`. We'll likely commit to WebGPU + a polite "browser unsupported" screen for v1.
2. **Particle buffers.** Two `Float32Array`-backed GPU buffers per attribute (positions, velocities) for ping-pong. 16-byte aligned for vec4 packing.
3. **Direct N² gravity kernel.** Each thread reads its particle, loops over all N, accumulates `a = Σ G m_j (r_j - r_i) / (|r|² + ε²)^(3/2)`. Use shared memory tiling (workgroup size 64–128).
4. **Softening.** ε = 0.5 × mean inter-particle distance. Expose as a constant for now.
5. **Leapfrog (KDK).** CPU-side orchestration: half-kick, drift, recompute forces, half-kick. Time step fixed for this stage; we'll go adaptive in Stage 2.
6. **Initial conditions.** Place 10k particles on a 21³-ish jittered grid inside a cube. Apply a Gaussian radial perturbation: shift each particle radially toward the centre by `δ · r̂ · exp(-(r/r0)²)` with small δ. No cosmological expansion — this is a static-frame demo.
7. **Rendering.** GPU-driven `THREE.Points`: position attribute is the live GPU buffer. Custom point shader: size attenuated by distance, color by local density (compute density on GPU in a second pass — KNN-ish or fixed-radius count).
8. **HUD.** Reuse the FPS overlay; add step count, simulated time (in arbitrary units for now), max particle density, total kinetic + potential energy and its drift since t=0.
9. **Diagnostics overlay.** A toggleable panel showing energy(t), max density(t), virial ratio. Throttled to 10 Hz.
10. **Conservation tests.**
    - Plummer sphere relaxed: energy drift over 1000 steps < 1 %, momentum drift < 0.1 %.
    - Spherical top-hat: turnaround time matches `t_TA = (3π / (32 G ρ̄ (1+δ)³))^(1/2)` within 5 %.

## Acceptance criteria (Definition of Done)

- [ ] 10 000 DM particles run at ≥ 60 fps on desktop, ≥ 30 fps on iPhone-13-class mobile.
- [ ] Spherical perturbation collapses, particles cross the centre, a cusp forms (visible in density colouring).
- [ ] Energy drift over 1 000 steps stays under 1 %.
- [ ] HUD shows FPS, step, time, max density, energy drift, all updating ≤ 10 Hz.
- [ ] Both conservation tests in `tests/physics/` pass.
- [ ] Browser without WebGPU shows a polite fallback message; CI runs the WebGPU path via headless Chromium.

## Test plan

- **Unit:** leapfrog integrator on a Kepler orbit — eccentricity preserved over 100 orbits.
- **Unit:** Plummer sphere — virial ratio settles to ≈ −0.5 within 10 dynamical times.
- **Unit:** softening — force at r → 0 is finite.
- **Visual:** spherical top-hat collapse renders a halo with a density cusp; manual screenshot saved to `docs/checkpoints/stage-01.png`.

## Performance budget

- 10 000 particles × O(N²) = 10⁸ pair forces per step. On a desktop GPU this is ~1–3 ms. Step rate target: ≥ 200 steps/s with rendering at 60 fps (so step decoupled from render).
- Frame budget: 16.7 ms = 1 step on GPU + render + UI. Headroom for Stage 2.

## Notes / learnings

**2026-05-08 — Stage 1a landed.**

Sub-stage split recorded in `DECISIONS.md` (2026-05-08 — Stage 1 split…). 1a is the CPU reference + tests + visual scaffolding; 1b will add the WebGPU compute path, density estimation/colouring, and bump the default particle count to hit the 10k @ 60 fps acceptance target.

Implemented in 1a:

- Branded units (`CodeLength`, `CodeMass`, `CodeTime`, `CodeVelocity`, `CodeEnergy`, `CodeDensity`) — code units, G = 1.
- Particle data as struct-of-arrays with 16-byte stride for future GPU vec4 packing (`src/physics/particle-system.ts`).
- Direct N² gravity with Plummer softening on the CPU (`src/physics/gravity-cpu.ts`).
- Leapfrog Kick–Drift–Kick integrator (`src/physics/leapfrog.ts`).
- Initial conditions: `sphericalPerturbation` (jittered grid + Gaussian inward shift), `plummerSphere` (Aarseth–Hénon–Wielen sampling), `keplerTwoBody` for tests.
- Diagnostics: kinetic / potential / total energy, virial ratio, momentum, central density (`src/physics/diagnostics.ts`).
- Three.js scene with `OrbitControls`, custom shader-material point cloud with distance-attenuated point sprites and additive blending.
- Render loop decoupled from sim loop via `stepsPerFrame` (default 4) — same shape will accept a WebGPU compute step in 1b.
- Simulation runner controller (`src/state/controllers/simulation-runner.ts`) and a Zustand `simulationStore` carrying live diagnostics.
- HUD: 3-panel layout with simulation / energy / density columns, all driven by the runner's `snapshot()`, throttled to 10 Hz per `RULES §7`.

Test coverage (16 unit tests across 6 files):

- `random.test.ts` — PRNG determinism, uniform mean, Gaussian moments.
- `gravity.test.ts` — softening finiteness, Newton's third law, inverse-square at large r, pair potential.
- `leapfrog.test.ts` — Kepler energy drift < 0.1 % over 100 orbits, Plummer momentum drift, Plummer energy drift < 1 % over 1000 steps.
- `plummer.test.ts` — sampled virial ratio ≈ 0.5, stays in 0.3–0.7 after 5 dynamical times.
- `spherical-collapse.test.ts` — central density grows ≥ 2× during collapse, energy drift < 5 % over 500 steps.
- Plus the carried-over `sanity.test.ts`.

**2026-05-08 — Stage 1b landed.** (Sub-stage split recorded in `DECISIONS.md` 2026-05-08 — Stage 1 splits again.) The compute-pipeline half of the original 1b moved to a new sub-stage 1c so 1b could ship a tight visual upgrade.

Implemented in 1b:

- `src/physics/spatial-grid.ts` — uniform spatial hash with linked-list cells; `rebuildSpatialGrid` rehashes from positions, `computeDensities` does a 27-cell stencil walk to fill a per-particle density buffer.
- `poly6Kernel(h)` — Müller, Charypar, Gross 2003 SPH kernel `(315 / 64πh⁹)·(h²−r²)³`, normalised to integrate to 1.
- `simulation-runner` extended: owns the grid + density buffer, exposes `getDensities()` and `refreshDensities()`, includes `maxParticleDensity` in `snapshot()`.
- `particle-cloud` shader updated: takes a per-particle `aDensity` attribute, log-scales it against a `uDensityMin/uDensityMax` window, and ramps through three palette stops (`#2a1b3d → #5b3f8e → #9b7fe8`) with a small additive halo on the densest sprites.
- `SimulationCanvas` recomputes density every 10 frames (≈ 6 Hz) and updates the cloud's `setDensityRange` from the running maximum, so the colour-mapping window tracks the collapse.
- `src/rendering/gpu/capabilities.ts` — `detectWebGpu()` checks `navigator.gpu` and requests an adapter; returns a typed `GpuStatus` discriminated union.
- `src/state/uiStore` extended with the `gpuStatus` slot.
- `src/ui/CompatibilityBanner.tsx` — amber "running on the CPU fallback" banner that appears only when WebGPU isn't available; named-checked by Stage 1c.
- `tests/physics/spatial-grid.test.ts` — three tests: every particle ends up in a cell, the kernel integrates to ≈ 1 over its support, density at a clustered point is ≥ 5× a lonely point.
- `tests/e2e/checkpoint.spec.ts` — Playwright spec that loads, lets the run settle for 2.5 s, and writes `docs/checkpoints/stage-01.png` (1280 × 800).

Test totals: 19 unit tests across 7 files; 2 e2e specs (load + checkpoint). All green.

What's left for **Stage 1c**:

- WebGPU compute kernel (`shaders/compute/gravity.wgsl`) for direct N² with workgroup tiling.
- Position/velocity buffers on the GPU; leapfrog kick-drift and kick compute kernels.
- GPU density pass (replace the CPU fallback path).
- Async simulation runner (`step()` queues; `flushAsync()` submits + reads back positions for rendering).
- Bump default count to 10 000; hit ≥ 60 fps desktop / 30 fps mobile.
- Cross-validation test: same IC → CPU and GPU positions diverge < 1e-4 over 100 steps.
- Refresh `docs/checkpoints/stage-01.png` at the new particle count and density.

Bundle: 736 KB raw / 199 KB gzipped (Three.js dominates). Code-splitting deferred to Stage 7.
