# Status — source of truth

Last updated: 2026-05-08

## At a glance

| #   | Stage                                                                | Status      | Notes                                         |
| --- | -------------------------------------------------------------------- | ----------- | --------------------------------------------- |
| 00  | [Foundation](00-foundation.md)                                       | DONE        | scaffold, tooling, CI, Vercel deploy live     |
| 01  | [Gravity prototype](01-gravity-prototype.md)                         | IN PROGRESS | 1a/1b done. 1c: WebGPU compute, 10k @ 60 fps. |
| 02  | [Cosmology + initial conditions](02-cosmology-initial-conditions.md) | TODO        | comoving, Zeldovich, FFT in worker            |
| 03  | [Baryons & SPH](03-baryons-sph.md)                                   | TODO        | gas, pressure, viscosity                      |
| 04  | [Cooling, halos, first stars](04-cooling-halos-stars.md)             | TODO        | H₂ cooling, FoF, M_crit ignition              |
| 05  | [Parameters & UI](05-parameters-ui.md)                               | TODO        | sliders, presets, URL share                   |
| 06  | [WDM, SIDM, streaming velocity](06-wdm-sidm-streaming.md)            | TODO        | dark-matter alternatives                      |
| 07  | [Polish & deploy](07-polish-deploy.md)                               | TODO        | bloom, mobile, copy, prod deploy              |

## Active stage

**Stage 1 — Gravity prototype.** Sub-stages 1a (CPU physics + tests + render) and 1b (spatial-grid density estimation, density-coloured particles, WebGPU capability detection, visual checkpoint) landed. Sub-stage 1c is the actual WebGPU compute pipeline + 10k particles at 60 fps.

## Open blockers

_None._ One UX nit from Stage 0: Vercel project still has Deployment Protection enabled — live URL requires SSO. User to disable in dashboard.

## Recent activity

- 2026-05-08 — Stage 1b: spatial hash grid + poly6 density kernel, density-coloured particle shader (violet ramp), WebGPU capability detection + amber CPU-fallback banner, Playwright visual checkpoint at `docs/checkpoints/stage-01.png`. 19 unit tests + 2 e2e green.
- 2026-05-08 — Stage 1a: CPU N-body physics (units, gravity, leapfrog, IC, diagnostics), 16 unit tests passing, Three.js scene + particle cloud rendering 1500-particle spherical collapse, full HUD with energy drift. All checks green.
- 2026-05-08 — Vercel project linked, GitHub repo connected, first prod deploy live at https://cosmic-seed.vercel.app.
- 2026-05-08 — Stage 0 landed: full toolchain, CI workflow, Vercel config, landing UI with FPS overlay. All checks green locally.
- 2026-05-08 — repo scaffold, RULES, stages plan committed.
