# Status — source of truth

Last updated: 2026-05-08

## At a glance

| #   | Stage                                                                | Status      | Notes                                     |
| --- | -------------------------------------------------------------------- | ----------- | ----------------------------------------- |
| 00  | [Foundation](00-foundation.md)                                       | DONE        | scaffold, tooling, CI, Vercel deploy live |
| 01  | [Gravity prototype](01-gravity-prototype.md)                         | IN PROGRESS | 1a/1b/1c landed. Cross-val test pending.  |
| 02  | [Cosmology + initial conditions](02-cosmology-initial-conditions.md) | TODO        | comoving, Zeldovich, FFT in worker        |
| 03  | [Baryons & SPH](03-baryons-sph.md)                                   | TODO        | gas, pressure, viscosity                  |
| 04  | [Cooling, halos, first stars](04-cooling-halos-stars.md)             | TODO        | H₂ cooling, FoF, M_crit ignition          |
| 05  | [Parameters & UI](05-parameters-ui.md)                               | TODO        | sliders, presets, URL share               |
| 06  | [WDM, SIDM, streaming velocity](06-wdm-sidm-streaming.md)            | TODO        | dark-matter alternatives                  |
| 07  | [Polish & deploy](07-polish-deploy.md)                               | TODO        | bloom, mobile, copy, prod deploy          |

## Active stage

**Stage 1 — Gravity prototype.** Sub-stages 1a / 1b / 1c landed. WebGPU compute pipeline is live (force kernel with workgroup tiling, leapfrog kickDrift + kick). On a Chrome with WebGPU it runs 10 000 particles; falls back to CPU at 1 500 otherwise. Outstanding: cross-validation test (Playwright with WebGPU-enabled chromium), sampled potential-energy readout in GPU mode, refreshed checkpoint from a real browser. Stage closes once those land.

## Open blockers

_None._ One UX nit from Stage 0: Vercel project still has Deployment Protection enabled — live URL requires SSO. User to disable in dashboard.

## Recent activity

- 2026-05-08 — Stage 1c: WebGPU compute pipeline. WGSL force kernel with workgroup tiling + leapfrog kickDrift / kick; GPU buffer mgmt + staging readback; unified `FrameRunner` interface (CPU and GPU paths behind one async API); render loop refactored to async hooks; `particle-cloud` takes raw Float32Array now. Default config: 10 000 particles on GPU, 1 500 on CPU fallback. Energy / virial / drift in GPU mode show "—" until the sampled-pair estimator lands (carried).
- 2026-05-08 — Added top-level `EXPERIENCE.md` (v1.0 user-experience target — 14 numbered sections), threaded clarity deliverables into Stages 2/4/5/6/7. New `DECISIONS.md` entry: educational clarity is acceptance, not polish. `CLAUDE.md` now loads `EXPERIENCE.md` every session.
- 2026-05-08 — Stage 1b: spatial hash grid + poly6 density kernel, density-coloured particle shader (violet ramp), WebGPU capability detection + amber CPU-fallback banner, Playwright visual checkpoint at `docs/checkpoints/stage-01.png`. 19 unit tests + 2 e2e green.
- 2026-05-08 — Stage 1a: CPU N-body physics (units, gravity, leapfrog, IC, diagnostics), 16 unit tests passing, Three.js scene + particle cloud rendering 1500-particle spherical collapse, full HUD with energy drift. All checks green.
- 2026-05-08 — Vercel project linked, GitHub repo connected, first prod deploy live at https://cosmic-seed.vercel.app.
- 2026-05-08 — Stage 0 landed: full toolchain, CI workflow, Vercel config, landing UI with FPS overlay. All checks green locally.
- 2026-05-08 — repo scaffold, RULES, stages plan committed.
