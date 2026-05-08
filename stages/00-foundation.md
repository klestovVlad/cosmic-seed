# Stage 0: Foundation

**Status:** DONE (Vercel link pending — manual user step)
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

**2026-05-08 — landed.**

- Stack installed at latest stable (no downgrades): React 19.2.6, Vite 8.0.11, TypeScript 6.0.3, Tailwind 4.2.4, Zustand 5.0.13, Vitest 4.1.5, Playwright 1.59.1, ESLint 10.3.0 (flat config), Prettier 3.8.3, pnpm 11.0.8.
- TypeScript 6 deprecates `baseUrl` — paths now declared without it, with explicit `./` prefixes.
- Vite 8's `manualChunks` API changed; removed the chunking hint for now and will revisit when bundle size warrants it.
- pnpm 11 requires `pnpm approve-builds` to allowlist install scripts even when listed in `pnpm.onlyBuiltDependencies`. Approved `simple-git-hooks`, `esbuild`, `@tailwindcss/oxide`. CI uses `--frozen-lockfile`, which inherits the approved list.
- Bundle: 194 KB raw / 61 KB gzipped — under the 200 KB Stage-0 budget.
- All local checks green: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (3 unit tests), `pnpm build`, `pnpm e2e` (1 Playwright spec, 905 ms).
- React 19 type for component return is `React.JSX.Element`, not `JSX.Element`. Used the namespaced form throughout.
- Three test files: `tests/sanity.test.ts`, `tests/fps-overlay.test.tsx`, `tests/e2e/loads.spec.ts`. Separate `tsconfig.e2e.json` so ESLint's project service can resolve the Playwright spec.
- Folder skeleton present (`src/{physics,rendering,ui,state,workers}/`, `shaders/{compute,render}/`); empty modules carry `.gitkeep` placeholders so the tree survives.
- Landing screen: animated starfield canvas behind a centred wordmark; FPS/frames overlay top-right, throttled to 10 Hz per `RULES §7`.

**Open follow-ups for the user (not blocking later stages):**

1. `pnpm dlx vercel link` from the repo root → connect to a Vercel project named `cosmic-seed`. After that the next push to `main` produces a live URL.
2. Add the live URL to `README.md` under "Status".
3. (Optional) point a custom domain at the Vercel project; otherwise default subdomain is fine.
