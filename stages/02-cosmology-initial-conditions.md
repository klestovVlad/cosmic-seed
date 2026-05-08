# Stage 2: Cosmology + initial conditions

**Status:** TODO
**Estimated:** 3–5 days
**Depends on:** Stage 1
**Spec reference:** Phase 1 (cosmology brief §5)

## Goal

Make the simulation truly cosmological: comoving coordinates, a Friedmann background driving the time integration, and physically-motivated initial conditions generated from a CDM power spectrum via the Zeldovich approximation. Time displays as redshift z. Replace the toy spherical perturbation with a realistic Gaussian random field. From this stage forward, every run should show linear growth (δ ∝ a) at first, a turnover into nonlinearity, and a recognisable filamentary cosmic web.

## Deliverables

- [ ] `src/physics/cosmology.ts` — `H(z)`, `aOfT`, `tOfA`, growth factor `D(a)`, `dD/da`, `f = dlnD/dlna`. Branded units throughout. Each function has a paper reference in its docstring.
- [ ] `src/physics/power-spectrum.ts` — Eisenstein–Hu fit (`Eisenstein & Hu 1998`). Inputs: cosmology params, k. Output: P(k).
- [ ] `src/physics/initial-conditions.ts` — Zeldovich generator: regular grid + displacement field from FFT'd P(k).
- [ ] `src/workers/ic-worker.ts` — runs IC generation off the main thread; FFT via a small in-house typed-array FFT (or a vetted lib if size budget allows).
- [ ] `src/physics/nbody.ts` — extended to comoving form: `dx/dt = v / a²`, `dv/dt = −∇Φ / a`, ∇²Φ = 4πGa²(ρ − ρ̄).
- [ ] **Adaptive timestep** based on local crossing time and Hubble rate. Document the CFL-like criterion at the top of `nbody.ts`.
- [ ] HUD shows redshift z, scale factor a, time-since-Big-Bang in Myr, δ_max(t).
- [ ] Diagnostics chart: log–log of δ_max(t) overlaid with the linear-theory prediction. Toggleable.
- [ ] `tests/physics/cosmology.test.ts` — H(z), D(a), critical density values match published numbers.
- [ ] `tests/physics/linear-growth.test.ts` — at small amplitude, sim δ_max grows ∝ a with relative error < 5 %.

**Clarity deliverables (`EXPERIENCE.md` §2):**

- [ ] **Time strip** at the top of the viewport: `z`, `t [Myr]`, and a thin progress bar from `z_init` to `z_end`. Always visible. Plain-language `redshift` / `age of universe` labels via the Expert/Explained toggle (toggle itself lands in Stage 5; both labels live in code from Stage 2).
- [ ] **Scale-bar widget** in the bottom-left of the viewport: `1 Mpc · 3.26 million ly` (or whatever fits the current box). Updates if the user changes box size. Pixel-accurate — measured from camera projection, not hardcoded.
- [ ] **Speed-of-time readout**: small inline string near the time strip, "1 sec sim ≈ N Myr universe-time at this speed". Recomputed when the speed slider (lands in Stage 5) changes; for Stage 2 the value is fixed at the implicit default speed.
- [ ] HUD includes a one-paragraph "Now showing" caption (auto-generated): "z = 47, 60 Myr after the Big Bang. Tiny seeds growing in a 1 Mpc box."

## Implementation steps

1. **Cosmology background.** Implement Friedmann for flat ΛCDM. For our era of interest (z > 6) we can also expose a "matter-only" simplification per the brief (Einstein–de Sitter, `a ∝ t^(2/3)`).
2. **Growth factor.** Numerical integration of the ODE for D(a) (Heath 1977 / standard form), or Carroll–Press–Turner fit. Test against tabulated values.
3. **Comoving N-body.** Modify the leapfrog from Stage 1: drift by `v / a²`, kick by `−∇Φ / a`, where Φ is sourced by the *over*density. The mean-density subtraction is critical — without it, the box collapses globally.
4. **Power spectrum.** Eisenstein–Hu (1998) fitting formula — single-file implementation, no Boltzmann code. Verify σ_8 normalisation by integrating `∫ P(k) W²(kR) k² dk / 2π²` and matching the user-set σ_8.
5. **FFT.** Implement Cooley–Tukey radix-2 on `Float32Array` complex pairs. 64³ grid is enough for v1 (~8 MB, runs in < 1 s in a worker). Validate against a known transform (Gaussian → Gaussian).
6. **Zeldovich displacement field.**
   - Sample `δ(k) = √P(k) · (gaussian random with given seed)` in Fourier space.
   - Compute `ψ(k) = −i k δ(k) / k²`, inverse FFT to real space.
   - Place each particle at `q + D(z_init) · ψ(q)`, with velocity `D · f · H · ψ`.
7. **Worker contract.** `src/workers/ic-worker.ts` accepts `{ params, seed, gridN }`, returns `{ positions: Float32Array, velocities: Float32Array }`. Typed messages.
8. **Adaptive timestep.** Per-step `dt = min(dt_max, η · √(ε / |a|_max))` where η ≈ 0.025 (Power et al. 2003). Bound by `0.01 / H(a)` so we never integrate over a Hubble time.
9. **HUD/timeline.** Replace step counter with `z` and `t [Myr]`. Show a progress bar from `z_init` (e.g. 100) to `z_end` (e.g. 6).
10. **Linear-growth chart.** A small Recharts/uPlot panel (pick one and decide in DECISIONS) plotting `log δ_max` vs `log a`, with an analytic reference line.

## Acceptance criteria (Definition of Done)

- [ ] At small amplitude (σ_8 ≪ default), δ_max grows linearly with a, slope = 1 in log–log within 5 % over a decade in a.
- [ ] At default σ_8, the run shows linear growth, then nonlinear turnover; visually a cosmic-web-like structure emerges.
- [ ] Adaptive timestep kicks in when the densest region's local dynamical time becomes < dt_max — visible in the HUD's `dt(t)` plot.
- [ ] Run from z = 100 → z = 10 takes < 60 s on desktop with 10 k particles.
- [ ] All cosmology and linear-growth tests pass.
- [ ] Time strip, scale bar, speed-of-time readout, and "now showing" caption are visible on every page load (`EXPERIENCE.md` §1, §2).
- [ ] Scale bar is dimensionally correct: 1 unit on screen at the default camera distance equals 1 unit in physical Mpc, within 5 %.

## Test plan

- **Unit:** `H(z=0) = 100 h km/s/Mpc` for `Ω_m = 1`. Standard checks against tabulated values.
- **Unit:** `D(a=1) = 1` by convention; `D(a) ≈ a` deep in matter era.
- **Unit:** σ_8 from integrated P(k) matches the input parameter to 1 %.
- **Integration:** at amplitude 1e-3, δ_max grows linearly. Slope test.
- **Integration:** at default amplitude, max density at z = 10 is at least 100× background.
- **Visual checkpoint:** screenshot of cosmic web at z = 15, saved to `docs/checkpoints/stage-02.png`.

## Performance budget

- IC generation (64³ FFT, off-thread) < 2 s.
- Main loop unchanged from Stage 1: ≥ 60 fps desktop with 10 k particles.

## Notes / learnings

_(filled during work)_
