# Stage 1: Gravity prototype

**Status:** TODO
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

_(filled during work)_
