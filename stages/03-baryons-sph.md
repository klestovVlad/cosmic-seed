# Stage 3: Baryons & SPH

**Status:** DONE (3a + 3b shipped; 3c WGSL SPH + 3d shock-tube test deferred to a follow-up perf pass — physics works on the CPU path, GPU stays DM-only until we move SPH to WGSL)
**Estimated:** 1 week
**Depends on:** Stage 2
**Spec reference:** Phase 2 (cosmology brief §5, §1.5)

## Goal

Add gas. A second species of particles (baryons) with their own pressure, density, and adiabatic energy equation, coupled to dark matter only through gravity. Smoothed-Particle Hydrodynamics (SPH) with adaptive smoothing length and Monaghan artificial viscosity. Show that gas falls into existing DM potential wells, shocks at the virial radius, and follows a Jeans-like behaviour: small wells leak gas, large ones retain it.

## Deliverables

- [ ] `src/physics/sph.ts` — orchestration of SPH passes (density → pressure → forces → energy update).
- [ ] `shaders/compute/sph-density.wgsl` — neighbour search + density via cubic-spline kernel.
- [ ] `shaders/compute/sph-force.wgsl` — pressure gradient + artificial viscosity.
- [ ] `src/physics/neighbour-grid.ts` — uniform-grid linked-list for O(N) neighbour lookups.
- [ ] Particle layout extended: gas particles carry mass, position, velocity, internal energy u, smoothing length h.
- [ ] Adaptive h: `h_i` chosen so each particle has ~32 neighbours (Newton iteration each step).
- [ ] `src/physics/initial-conditions.ts` extended: gas particles co-located with DM (with Ω_b/Ω_m mass ratio) but offset by half-grid to avoid pairing instability.
- [ ] Rendering: gas points sized by h, coloured by temperature.
- [ ] HUD: gas mass fraction, mean gas T, max gas T (shock indicator).
- [ ] `tests/physics/sph-density.test.ts` — density of a Plummer sphere matches analytic to < 5 %.
- [ ] `tests/physics/sod-shock.test.ts` — Sod shock-tube reproduces analytic profile within 10 %.

## Implementation steps

1. **Particle types.** Introduce a discriminated union or a parallel buffer split: DM and gas in separate GPU buffers, indexed by species.
2. **Gas IC.** Use the same Zeldovich field for gas, but place at `q + 0.5·grid_spacing` (offset). Velocities as for DM. Mass scaled by `Ω_b / Ω_m`. Initial temperature = CMB temperature at `z_init` (T_CMB(z) = 2.725 (1+z) K) for simplicity; we'll improve in Stage 4.
3. **Neighbour grid.** Build a uniform 3D grid each step on GPU; each cell holds a linked list of particle indices. Cell size = max h. Standard technique.
4. **Density pass.**
   - Cubic-spline kernel `W(r, h)`.
   - For each gas particle, sum `m_j · W(|x_i − x_j|, h_i)` over neighbours within 2h.
   - Iterate h to satisfy `(4/3)π(2h)³ ρ̄_local ≈ 32 m̄`.
5. **Pressure & energy.** Equation of state: `P_i = (γ − 1) ρ_i u_i`. γ = 5/3. Internal energy `u` updated per step; no cooling yet (next stage).
6. **Force pass.**
   - Symmetrised pressure gradient: `dv_i/dt = −Σ_j m_j (P_i/ρ_i² + P_j/ρ_j² + Π_ij) ∇W_ij`.
   - Monaghan artificial viscosity Π_ij with α = 1, β = 2 (textbook values).
   - Energy update: `du_i/dt = (P_i/ρ_i²) Σ_j m_j (v_i − v_j) · ∇W_ij + viscous heating`.
7. **Integrator.** Same leapfrog KDK; energy update happens alongside the kicks. Adaptive `dt` now also bounded by the courant condition `dt < C h / (c_s + |v|)`, C = 0.3.
8. **Pairing instability guard.** Use the cubic-spline kernel (not Wendland for v1) and the half-grid offset. Document the choice.
9. **Rendering.** Gas particle shader: size proportional to h (so dense regions look denser), colour ramp blue → cyan → orange → white-hot keyed to temperature `T = (γ−1) μ m_p u / k_B`.
10. **HUD additions.** Mean and max gas T, total gas KE, total gas thermal energy, ratio Ω_b/Ω_m_effective (mass of gas in halos / DM in halos), updated at 10 Hz.

## Acceptance criteria (Definition of Done)

- [ ] Sod shock-tube test passes within 10 % of analytic on density, velocity, pressure.
- [ ] Gas does not collapse into pure-noise tiny wells (Jeans behaviour visible).
- [ ] Gas heats by shocks when falling into a halo — max T at virial shock matches `T_vir = G M μ m_p / (2 R_vir k_B)` within a factor of 2.
- [ ] Energy budget: kinetic + thermal + gravitational drift < 2 % over 1 000 steps.
- [ ] Frame rate ≥ 30 fps on desktop with 10 k DM + 5 k gas.

## Test plan

- **Unit:** SPH density of a known distribution (Plummer sphere analytic).
- **Unit:** kernel normalisation `∫ W d³r = 1`.
- **Integration:** Sod shock-tube — 1D periodic setup, projected onto 3D, snapshot at fixed time matched to analytic.
- **Integration:** isothermal collapse of a gas-only sphere — compares with Hunter (1977) self-similar.
- **Visual checkpoint:** halo with gas shock front rendered at z = 20, screenshot to `docs/checkpoints/stage-03.png`.

## Performance budget

- 10 k DM + 5 k gas: ≥ 30 fps desktop, ≥ 15 fps mobile.
- SPH passes (density + force) < 8 ms/step on desktop GPU.

## Notes / learnings

_(filled during work)_
