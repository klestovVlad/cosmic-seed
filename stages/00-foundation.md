# Stage 0: Foundation

**Status:** TODO
**Estimated:** 1 day
**Depends on:** —
**Spec reference:** project tooling (not in cosmology brief)

## Goal

Lay the engineering foundation: install the latest-stable stack, wire up linting, formatting, type-checking, tests, and CI. Stand up a Vercel preview deploy from `main` so every subsequent stage's progress is visible at a public URL. No physics yet — just a window that says "Cosmic Seed" against a dark gradient and proves the whole pipeline works.

## Deliverables

- [ ] `package.json` with pinned latest versions of the stack.
- [ ] `tsconfig.json` in strict mode (see `RULES.md §1`).
- [ ] Vite config with WGSL/GLSL shader imports as text and asset hashing.
- [ ] Tailwind 4 configured with the design tokens from `RULES.md §9`.
- [ ] ESLint 9 flat config + Prettier, both wired to `pnpm lint` / `pnpm format`.
- [ ] Vitest configured; one trivial test passes.
- [ ] Playwright configured with one smoke test (page loads, title matches).
- [ ] GitHub Actions workflow: `lint → typecheck → test → build → e2e`.
- [ ] Vercel project linked, preview deploy on PRs, prod deploy on `main`.
- [ ] `src/` directory tree as in `CLAUDE.md`.
- [ ] Landing screen: dark gradient background, centered "Cosmic Seed" wordmark, subtitle, FPS counter overlay (proves the render loop runs).
- [ ] README updated with working `pnpm dev` instructions and a live URL.

## Implementation steps

1. **Init.** `pnpm create vite cosmic-seed --template react-ts` into a temp dir, then merge into our existing folder (preserving `CLAUDE.md`, `RULES.md`, `stages/`).
2. **Tighten `tsconfig.json`** per `RULES.md §1`. Run `tsc --noEmit` clean.
3. **Tooling.**
   - ESLint 9 flat config (`eslint.config.js`) with `@typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`. No legacy `.eslintrc`.
   - Prettier with project conventions (semi: true, single quotes, 100 cols, trailing commas).
   - `lint-staged` + `simple-git-hooks` for pre-commit lint/format.
4. **Tailwind 4.** Install `tailwindcss` + `@tailwindcss/vite`. Define design tokens from `RULES.md §9` in `src/styles/tokens.css`.
5. **Folder skeleton.** Create empty `src/{physics,rendering,ui,state,workers}/` and `shaders/{compute,render}/` with `.gitkeep`.
6. **Test scaffolding.**
   - Vitest config with happy-dom env. One trivial test in `tests/sanity.test.ts`.
   - Playwright config; one spec in `tests/e2e/loads.spec.ts` checking the page mounts and the FPS counter ticks.
7. **CI.** `.github/workflows/ci.yml` with the five-step matrix from `RULES.md §12`.
8. **Vercel.** `pnpm dlx vercel link`, then `vercel.json` with strict CSP headers and an SPA fallback. Confirm `cosmic-seed.vercel.app` (or chosen subdomain) deploys from `main`.
9. **Landing UI.** A single React component: gradient background, monospace wordmark, subtitle, fps overlay component using `requestAnimationFrame`.
10. **Wire up the dev FPS overlay** as a reusable component — we'll extend it in Stage 1.

## Acceptance criteria (Definition of Done)

- [ ] `pnpm install && pnpm dev` opens a window with the landing screen at 60 fps.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all green.
- [ ] `pnpm e2e` passes the smoke test.
- [ ] CI is green on `main`.
- [ ] A live URL exists and is in the README.
- [ ] No `any`, no `!`, no eslint-disable comments without a written reason.

## Test plan

- `tests/sanity.test.ts` — `expect(1 + 1).toBe(2)`. Confirms Vitest runs.
- `tests/e2e/loads.spec.ts` — open root, assert title and FPS counter element present and updates within 2 s.

## Performance budget

- First Contentful Paint < 1 s on a desktop, < 2 s on mid-tier mobile.
- Bundle size < 200 KB gzipped (no Three.js yet).

## Notes / learnings

_(filled during work)_
