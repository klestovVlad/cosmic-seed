# Status — source of truth

Last updated: 2026-05-08

## At a glance

| #   | Stage                                                                | Status      | Notes                                     |
| --- | -------------------------------------------------------------------- | ----------- | ----------------------------------------- |
| 00  | [Foundation](00-foundation.md)                                       | DONE        | scaffold, tooling, CI, Vercel deploy live |
| 01  | [Gravity prototype](01-gravity-prototype.md)                         | IN PROGRESS | 1a/1b/1c landed. Cross-val test pending.  |
| 02  | [Cosmology + initial conditions](02-cosmology-initial-conditions.md) | IN PROGRESS | 2a/2b1/2b2 landed. 2c: comoving leapfrog. |
| 03  | [Baryons & SPH](03-baryons-sph.md)                                   | TODO        | gas, pressure, viscosity                  |
| 04  | [Cooling, halos, first stars](04-cooling-halos-stars.md)             | TODO        | H₂ cooling, FoF, M_crit ignition          |
| 05  | [Parameters & UI](05-parameters-ui.md)                               | TODO        | sliders, presets, URL share               |
| 06  | [WDM, SIDM, streaming velocity](06-wdm-sidm-streaming.md)            | TODO        | dark-matter alternatives                  |
| 07  | [Polish & deploy](07-polish-deploy.md)                               | TODO        | bloom, mobile, copy, prod deploy          |

## Active stage

**Stage 2 — Cosmology + IC.** Sub-stage 2a landed: cosmological branded units (Mpc, Msun, Myr, Redshift, ScaleFactor), Friedmann background (H(z), tOfA, aOfT, growth factor), time-strip + scale-bar UI from `EXPERIENCE.md §2`. 2b is the Zeldovich IC + Eisenstein–Hu power spectrum + FFT in a Web Worker; 2c is comoving leapfrog + adaptive timestep + δ_max chart. Simulation physics still in code units until 2c.

Stage 1 stays open in parallel: cross-validation test (Playwright with WebGPU-enabled chromium), sampled potential-energy readout in GPU mode. Default GPU count tuned to 5 k after user testing.

## Open blockers

_None._ One UX nit from Stage 0: Vercel project still has Deployment Protection enabled — live URL requires SSO. User to disable in dashboard.

## Recent activity

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
