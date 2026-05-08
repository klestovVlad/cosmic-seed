# Cosmic Seed

Interactive browser simulation of dark-matter halo formation, baryon infall, and the ignition of the first stars (Population III). Educational artifact, not a science tool.

## Status

Stage 0 (foundation) complete. Next up: [Stage 1 — gravity prototype](stages/01-gravity-prototype.md). See [`stages/STATUS.md`](stages/STATUS.md) for the at-a-glance plan.

Live URL: **https://cosmic-seed.vercel.app** _(currently behind Vercel Authentication — disable Deployment Protection in the Vercel dashboard to make it public)_.

## Getting started

```bash
pnpm install
pnpm dev          # local dev server at http://localhost:5173
```

Other useful scripts:

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm format       # prettier --write
pnpm test         # vitest unit tests
pnpm e2e          # playwright smoke test
pnpm build        # production build into dist/
pnpm preview      # serve dist/ at http://localhost:4173
```

Requires Node 22+ and pnpm 11+. Run `pnpm e2e:install` once to fetch Playwright's chromium binary.

## Plan

The project is built up in eight numbered stages. Each stage is a self-contained document with goal, deliverables, steps, and acceptance criteria.

| #   | Stage                                                                       | Spec map                   |
| --- | --------------------------------------------------------------------------- | -------------------------- |
| 0   | [Foundation](stages/00-foundation.md)                                       | (tooling, deploy pipeline) |
| 1   | [Gravity prototype](stages/01-gravity-prototype.md)                         | Phase 0                    |
| 2   | [Cosmology + initial conditions](stages/02-cosmology-initial-conditions.md) | Phase 1                    |
| 3   | [Baryons & SPH](stages/03-baryons-sph.md)                                   | Phase 2                    |
| 4   | [Cooling, halos, first stars](stages/04-cooling-halos-stars.md)             | Phase 3                    |
| 5   | [Parameters & UI](stages/05-parameters-ui.md)                               | Phase 4                    |
| 6   | [WDM, SIDM, streaming velocity](stages/06-wdm-sidm-streaming.md)            | Phase 5                    |
| 7   | [Polish & deploy](stages/07-polish-deploy.md)                               | Phase 6                    |

## Working with Claude

This repo is structured so a coding agent can pick up at any stage. See [`CLAUDE.md`](CLAUDE.md) and [`RULES.md`](RULES.md). Invoke a stage with:

- `начни стадию N` — start a TODO stage
- `продолжи стадию N` — resume an IN PROGRESS stage
- `проверь стадию N` — run that stage's acceptance tests

## License

TBD.
