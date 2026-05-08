# Status — source of truth

Last updated: 2026-05-08 (post Stage 4c2)

## At a glance

| #   | Stage                                                                | Status      | Notes                                                                    |
| --- | -------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------ |
| 00  | [Foundation](00-foundation.md)                                       | DONE        | scaffold, tooling, CI, Vercel deploy live                                |
| 01  | [Gravity prototype](01-gravity-prototype.md)                         | IN PROGRESS | 1a/1b/1c landed. Cross-val test pending.                                 |
| 02  | [Cosmology + initial conditions](02-cosmology-initial-conditions.md) | DONE        | Zeldovich IC, periodic comoving leapfrog, δ_max chart                    |
| 03  | [Baryons & SPH](03-baryons-sph.md)                                   | DONE\*      | 3a/3b: CPU SPH + T-coloured gas. 3c/3d: GPU SPH + shock test deferred.   |
| 04  | [Cooling, halos, first stars](04-cooling-halos-stars.md)             | IN PROGRESS | 4a/4b/4c/4c2 shipped. 4d (acceptance suite + visual checkpoint) pending. |
| 05  | [Parameters & UI](05-parameters-ui.md)                               | TODO        | sliders, presets, URL share                                              |
| 06  | [WDM, SIDM, streaming velocity](06-wdm-sidm-streaming.md)            | TODO        | dark-matter alternatives                                                 |
| 07  | [Polish & deploy](07-polish-deploy.md)                               | TODO        | bloom, mobile, copy, prod deploy                                         |

## Active stage

**Stage 4 — Cooling, halos, first stars.** 4a (FoF + Kulkarni+2021 ignition + star cloud + halos-and-stars HUD card + first-ignition banner), 4b (UnrealBloomPass on stars + in-scene annotation pins with mass anchors from EXPERIENCE.md §3), 4c (Galli-Palla H₂ cooling rate + code↔physical unit adapter + cooling integration with subcycling + min-T HUD readout), and 4c2 (per-particle H₂ tracker — Galli-Palla H⁻ formation, Abel-1997 LW dissociation, implicit-Euler one-step, peak/mean x_H₂ in HUD) are shipped. Next: 4d — acceptance suite (no-DM regression, J_LW=100 ignition-delay, halo-mass-fn smoke + visual checkpoint).

Stage 1 stays open in parallel (cross-validation test, sampled potential-energy readout in GPU mode). Stage 3 closed with two deferred items: 3c (WGSL SPH compute kernels for the GPU path — currently GPU mode is DM-only, gas only visible on CPU fallback) and 3d (Sod shock-tube test + isothermal-collapse self-similar test). Both are physics-quality items, not blocking the Stage-4 visual story.

## Open blockers

_None._ One UX nit from Stage 0: Vercel project still has Deployment Protection enabled — live URL requires SSO. User to disable in dashboard.

## Recent activity

- 2026-05-08 — Stage 4c2: per-particle H₂ network. `src/physics/h2-network.ts` ships rate-limited H⁻ formation (Galli-Palla 1998, k_f = 1.43e-18 · T^0.93 cm³/s) + Abel-1997 LW dissociation (k_d = 1.4e-12 · J_21 s⁻¹) with Tegmark+1997 freeze-out x_e = 2e-4, integrated by a one-step implicit Euler clamped into [1e-6, 0.1]. Simulation runner evolves x_H₂ per particle each step before the cooling pass — so cool-dense halo cores genuinely build up the coolant and accelerate cooling, while diffuse IGM stays near the floor. Snapshot adds `gasMaxH2Fraction` + `gasMeanH2Fraction`; HUD gas card shows `x_H₂ peak`. 137 unit (9 new) + 2 e2e green.
- 2026-05-08 — Stage 4c: H₂ cooling channel. `src/physics/cooling.ts` ships the Galli-Palla 1998 low-density Λ(T) polynomial fit, a CMB-floored Euler cooling step, and a subcycler with a CFL-bound substep cap. Code↔physical unit adapter (`GasCoolingUnits`) parametrised by three calibration scalars so the simulation runner stays in code units while the cooling math runs in CGS. `approximateH2Fraction(J_LW)` stands in for the full Saslaw-Zipoy network, suppressing the baseline H₂ fraction with the same `1 + 4·J_LW^0.47` factor that governs M_crit. Snapshot grew `gasMinInternalEnergy`, `gasMinTemperatureK`, `coolingMaxSubsteps`, `coolingCappedThisStep`; HUD shows T_min in Kelvin. 128 unit (22 new) + 2 e2e green.
- 2026-05-08 — Stage 4b: UnrealBloomPass on the star cloud (selective high-threshold bloom — DM and gas stay clean, only the bright white star core glows) + in-scene annotation pins. Pure pin builder + projection helpers in `src/ui/annotation-pin-builder.ts`, React overlay in `AnnotationPins.tsx` with imperative per-frame screen-position updates. Snapshot now carries `largestHaloCentre` and `firstIgnition.{x,y,z}` so pins anchor in 3D space; the largest-halo pin tracks the most massive halo live, and the first-ignition pin shows for 3 wall-clock seconds at the ignition site with z + M☉ + mass-anchor (`≈ dwarf-galaxy seed`). 112 unit + 2 e2e green.
- 2026-05-08 — Stage 4a: FoF halo finder (`src/physics/halo-finder.ts`) with periodic min-image distances + mass-weighted unwrapped halo centres. Kulkarni+2021 critical-mass criterion in `src/physics/star-ignition.ts`. Halo finder runs every K physics steps; halos crossing M_crit spawn star particles, rendered as a sparse `THREE.Points` cloud (white additive). HUD gains a "halos & stars" card; first ignition triggers an amber banner with z + M_halo. 100 unit + 2 e2e green.
- 2026-05-08 — Stage 3 closed (3c/3d deferred): two-species hydrodynamics on the CPU path. SPH cubic-spline kernel + density estimator + symmetrised pressure-gradient force + adiabatic energy update; gas particles render in a separate THREE.Points cloud with a blue→cyan→orange→white temperature ramp; HUD gains a gas section (mass fraction, mean/max u, compression-heating amplification). 86 unit tests + 2 e2e green. GPU mode stays DM-only until the WGSL SPH kernels (3c) ship.
- 2026-05-08 — Stage 2c3 / Stage 2 closed: δ_max(a) chart with Carroll-Press-Turner reference line, linear-growth regression test, density-sample ring buffer in the store. 68 unit tests + 2 e2e green.
- 2026-05-08 — Stage 2c2: cosmological dynamics live. Periodic min-image gravity (CPU + WGSL), `cosmologicalLeapfrogStep` with `1/a²` drift scale, Zeldovich IC as default, runner refactored to accept external particles. Visual: spherical-collapse single blob → multiple discrete halos forming on Zeldovich seeds.
- 2026-05-08 — Stage 2c1: cosmic time bookkeeping. SimulationDiagnostics carries ageInMyr, scaleFactor, redshift; runner advances cosmological clock by dtMyr; TimeStrip reads from store instead of wall-clock.
- 2026-05-08 — Stage 2b2: Zeldovich displacement-field IC generator (`zeldovich-ic.ts`) — white-noise → forward FFT → δ(k) = η · √P / V*cell → ψ*α(k) = -i·k_α/k²·δ → inverse FFT → particles at q + D·ψ. Web Worker (`ic-worker.ts`) wraps it with a typed message contract; `ic-runner.ts` is the typed Promise wrapper. 9 statistical tests (σ_8 scaling, D scaling, seed determinism, mass conservation). Worker is shipped as code; integration into `frame-runner` lands in 2c when comoving leapfrog can keep the field stable.
- 2026-05-08 — Stage 2b1: Eisenstein-Hu transfer function + power spectrum with σ_8 normalisation, in-house Cooley-Tukey 1D + 3D FFT on Float32Array, 18 unit tests.
- 2026-05-08 — Stage 2a: cosmology math (`cosmology.ts` — H(z), tOfA, aOfT, growth factor, growth rate), cosmological branded units, time-strip UI (z + age + speed-of-time + progress bar), scale-bar widget (Mpc + Mly), Expert/Explained label-pair scaffolding. 18 cosmology unit tests; 37 total green. Visual checkpoint refreshed.
- 2026-05-08 — Perf hotfixes for Stage 1c GPU path: vec3→vec4 in workgroup memory, double-buffered staging readback, density throttle, GPU default tuned to 5 k particles after compositor-contention testing.
- 2026-05-08 — Stage 1c: WebGPU compute pipeline. WGSL force kernel with workgroup tiling + leapfrog kickDrift / kick; GPU buffer mgmt + staging readback; unified `FrameRunner` interface (CPU and GPU paths behind one async API); render loop refactored to async hooks; `particle-cloud` takes raw Float32Array now. Default config: 10 000 particles on GPU, 1 500 on CPU fallback. Energy / virial / drift in GPU mode show "—" until the sampled-pair estimator lands (carried).
- 2026-05-08 — Added top-level `EXPERIENCE.md` (v1.0 user-experience target — 14 numbered sections), threaded clarity deliverables into Stages 2/4/5/6/7. New `DECISIONS.md` entry: educational clarity is acceptance, not polish. `CLAUDE.md` now loads `EXPERIENCE.md` every session.
- 2026-05-08 — Stage 1b: spatial hash grid + poly6 density kernel, density-coloured particle shader (violet ramp), WebGPU capability detection + amber CPU-fallback banner, Playwright visual checkpoint at `docs/checkpoints/stage-01.png`. 19 unit tests + 2 e2e green.
- 2026-05-08 — Stage 1a: CPU N-body physics (units, gravity, leapfrog, IC, diagnostics), 16 unit tests passing, Three.js scene + particle cloud rendering 1500-particle spherical collapse, full HUD with energy drift. All checks green.
- 2026-05-08 — Vercel project linked, GitHub repo connected, first prod deploy live at https://cosmic-seed.vercel.app.
- 2026-05-08 — Stage 0 landed: full toolchain, CI workflow, Vercel config, landing UI with FPS overlay. All checks green locally.
- 2026-05-08 — repo scaffold, RULES, stages plan committed.
