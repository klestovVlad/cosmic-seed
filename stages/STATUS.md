# Status — source of truth

Last updated: 2026-05-08

## At a glance

| #   | Stage                                                                | Status | Notes                                      |
| --- | -------------------------------------------------------------------- | ------ | ------------------------------------------ |
| 00  | [Foundation](00-foundation.md)                                       | DONE\* | scaffold, tooling, CI; Vercel link pending |
| 01  | [Gravity prototype](01-gravity-prototype.md)                         | TODO   | reproduce Stern's spherical collapse       |
| 02  | [Cosmology + initial conditions](02-cosmology-initial-conditions.md) | TODO   | comoving, Zeldovich, FFT in worker         |
| 03  | [Baryons & SPH](03-baryons-sph.md)                                   | TODO   | gas, pressure, viscosity                   |
| 04  | [Cooling, halos, first stars](04-cooling-halos-stars.md)             | TODO   | H₂ cooling, FoF, M_crit ignition           |
| 05  | [Parameters & UI](05-parameters-ui.md)                               | TODO   | sliders, presets, URL share                |
| 06  | [WDM, SIDM, streaming velocity](06-wdm-sidm-streaming.md)            | TODO   | dark-matter alternatives                   |
| 07  | [Polish & deploy](07-polish-deploy.md)                               | TODO   | bloom, mobile, copy, prod deploy           |

## Active stage

_None._ Stage 0 is code-complete; Stage 1 is next.

## Open blockers

\* **Stage 0 footnote.** Manual user step pending: `pnpm dlx vercel link` to attach a Vercel project so preview/prod deploys go live. Doesn't block Stage 1.

## Recent activity

- 2026-05-08 — Stage 0 landed: full toolchain, CI workflow, Vercel config, landing UI with FPS overlay. All checks green locally.
- 2026-05-08 — repo scaffold, RULES, stages plan committed.
