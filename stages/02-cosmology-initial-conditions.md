# Stage 2: Cosmology + initial conditions

**Status:** IN PROGRESS (2a done; 2b1 in flight)
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

**2026-05-08 — Stage 2a landed.**

Pure cosmology math + the on-screen chrome from `EXPERIENCE.md §2`. Simulation physics is still in code units — that lands in 2b (Zeldovich IC) and 2c (comoving leapfrog).

Implemented:

- `src/physics/units.ts` extended with cosmological brands: `Mpc`, `Msun`, `Myr`, `Redshift`, `ScaleFactor`, `HubbleRate`. Plus `aOfZ` / `zOfA` relation, `MLY_PER_MPC = 3.2615` for the scale-bar conversion.
- `src/physics/cosmology.ts` — flat ΛCDM background.
  - `hubbleAt(a, p)` and `hubbleAtRedshift(z, p)` — `H(z) = H₀ · √(Ω_m (1+z)³ + Ω_Λ)`. Stored in 1/Myr (so `dt[Myr] · H` is dimensionless).
  - `tOfA(a, p)` — cosmic time by trapezoidal quadrature of `da' / [a'·H(a')]`.
  - `aOfT(t, p)` — bisection inverse.
  - `growthFactor(a, p)` — Carroll, Press, Turner 1992 fit; ~ 1 % accurate over the relevant range. We skipped the RK4 ODE — overkill for a smooth scalar called at HUD cadence.
  - `growthRate(a, p)` — Linder 2005 `f ≈ Ω_m(a)^0.55`.
  - `speedOfTimeReadout(myrPerSecond)` formats kyr / Myr / Gyr per real-second.
  - `PLANCK_2018` baseline: H₀ = 67.4 km/s/Mpc, Ω*m = 0.315, Ω*Λ = 0.685.
- `src/ui/TimeStrip.tsx` — top-of-viewport strip: cosmic-seed wordmark, `redshift z`, `age of universe t [Myr/kyr/Gyr]`, `1 s sim ≈ N Myr` readout, gradient progress bar from z = 100 → z = 6 with the corresponding (t_init, t_end) in Myr underneath. Wall-clock-driven cursor for now (Stage 2b will switch it to read the runner's actual t/a).
- `src/ui/ScaleBar.tsx` — top-left widget: `1.00 Mpc · 3.26 Mly` and a 100-pixel scale tick. NASA-viz style.
- Both UI elements honour the Expert / Explained label toggle (the toggle itself ships in Stage 5; `expertMode` slot added to `uiStore` here).
- `Hud.tsx` lost the duplicate `cosmic seed · stage 1b` wordmark + `Spherical Collapse` heading — TimeStrip carries the wordmark now. The `Spherical Collapse` heading kept as `sr-only` so the Playwright `loads.spec.ts` keeps passing.

Tests added (18 cosmology cases):

- redshift / scale-factor round-trips (`a ↔ z`).
- Hubble rate: H(z = 0) = H₀, monotone with z, matter-dominated limit at z = 100.
- cosmic time: t(a → 0) → 0, age today ≈ 13.8 Gyr (within Planck 2018 bounds), `aOfT` inverts `tOfA`.
- growth factor: D(1) = 1 by normalisation; D(a) ≈ a deep in matter era; monotone.
- growth rate: f ≈ Ω_m(a)^0.55 ≈ 0.524 today.
- `speedOfTimeReadout` formatting (kyr / Myr / Gyr).
- Hubble-rate sanity at default cosmology (~ 6.9e-5 / Myr).

Test totals: 37 unit tests across 8 files. Build: 762 KB / 204 KB gzipped. All gates green.

Visual checkpoint refreshed at `docs/checkpoints/stage-01.png` (still under stage-01 since the scene is the Stage 1 spherical collapse, just with the Stage 2a wrapper). Time-strip cursor visibly advances from z = 100 (early) toward z = 6 over ~ 2 minutes; scale bar reads `1.00 Mpc · 3.26 Mly`.

Carrying into 2b:

- Eisenstein–Hu power spectrum + σ_8 normalisation check (Eisenstein & Hu 1998).
- In-house Cooley–Tukey FFT in a Web Worker (`src/workers/ic-worker.ts`).
- Zeldovich displacement field: sample `δ(k) ∝ √P(k)`, compute `ψ(k) = −i k δ(k) / k²`, IFFT to real space, place particles at `q + D(z_init) · ψ(q)` with velocities `D · f · H · ψ`.
- Replace `sphericalPerturbation` as the default IC.

Carrying into 2c:

- Comoving leapfrog: `dx/dt = v / a²`, `dv/dt = −∇Φ / a`, with mean-density subtraction.
- Adaptive timestep (CFL-like criterion).
- HUD reads runner's true (t, a) instead of the wall-clock cursor.
- δ_max(t) chart with linear-theory reference line.
- Linear-growth regression test.
