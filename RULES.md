# Engineering rules — Cosmic Seed

These rules apply to every stage. They are tight on purpose — physics simulations punish carelessness, and an interactive product punishes mess. If a rule blocks the task, raise it in chat and amend the rule. Don't silently break it.

---

## 1. Language & types

- **TypeScript strict mode.** `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`.
- **No `any`.** Use `unknown` and narrow. The only acceptable `any` is at a third-party seam with a `// HACK:` comment explaining why.
- **No non-null assertions (`!`).** If you know it's non-null, narrow with a check or a type guard. The exception is GPU/Three.js handles right after creation.
- **`readonly` by default** for arrays and properties that aren't mutated.
- **Discriminated unions** over enums where the variants carry data.
- **Branded types for units.** `type Mpc = number & { __brand: 'Mpc' }`, same for `Msun`, `Kelvin`, `Redshift`, `ScaleFactor`. Mixing units is the #1 physics-sim bug.
- **No implicit number → boolean coercion.** `if (n)` is banned for numeric checks; write `n !== 0`.

## 2. File and module structure

- **One concern per file.** A file is named after the thing it exports. `gravity.ts` exports gravity logic, not also halo-finder utilities.
- **Named exports preferred.** Default exports only for React components and Three.js scene roots.
- **No barrel files (`index.ts` re-exports)** except at hard module boundaries (`src/physics/index.ts` for the public API of physics). Barrels everywhere kill tree-shaking and create circular import risk.
- **Folder shape:**
  - `src/physics/` — pure functions. No imports of Three.js, React, DOM, or `window`. Must be testable in Node.
  - `src/rendering/` — Three.js + GPU. Imports physics types but not the other way around.
  - `src/ui/` — React components. Imports state and rendering hooks; never reaches into physics directly.
  - `src/state/` — Zustand stores. The bridge layer. Physics produces snapshots; UI reads them.
  - `src/workers/` — long-running off-thread tasks (FFT, IC generation). Communicate via typed message contracts.
  - `shaders/` — `.wgsl` (compute) and `.glsl` (render). Imported as text; build-time validated.
- **No upward imports.** UI → state → rendering → physics. Never the other way.
- **Public API of `src/physics/` is a single `index.ts`.** Other layers import only from there. Internals are implementation detail.

## 3. Dependencies

Use **latest stable** versions at install time. Pin via `package.json`. Don't downgrade without a `DECISIONS.md` entry. Target stack:

- **Vite** — bundler. Latest 6.x or newer.
- **React 19+** with the new compiler (where stable).
- **TypeScript 5.7+**.
- **Three.js** — latest r-release. Use `three` + `@types/three`; don't pull `react-three-fiber` until we've decided we want it (see DECISIONS).
- **Tailwind CSS 4+** with the new Oxide engine.
- **Zustand 5+** for state.
- **shadcn/ui** for primitives (copy-in, not a dep).
- **Vitest** for unit tests.
- **Playwright** for one or two end-to-end smoke tests.
- **ESLint 9+ flat config** + **Prettier**.
- **pnpm** as the package manager (faster, strict by default).
- **Node 22 LTS** minimum.

Avoid: lodash, moment, redux, axios. Use the platform.

## 4. Naming

- **Files:** `kebab-case.ts`. React components: `PascalCase.tsx`.
- **Symbols:** `camelCase` for functions/variables, `PascalCase` for types/components, `SCREAMING_SNAKE` only for genuine compile-time constants.
- **Booleans** start with `is`, `has`, `should`, `can`.
- **No abbreviations** except canonical physics ones (`pos`, `vel`, `acc` are OK; `cfg`, `mgr`, `proc` are not).
- **Physics symbols.** Keep paper notation in identifiers when it aids readability: `sigma8`, `omegaM`, `omegaB`, `H0`, `zInit`, `aOfT`. Add a one-line comment with the unit if it's not branded.

## 5. Comments and docs

- **Default to no comment.** Identifiers should carry meaning.
- **Write a comment when WHY is non-obvious:** a hidden constraint, a numerical-stability hack, a physical assumption (e.g. "// matter-dominated era; breaks if we add Λ before z=2").
- **Every physics function gets a one-line docstring** with the formula reference (paper + equation, e.g. "Springel 2005 eq. 11"). This is non-negotiable — it's how we audit correctness later.
- **No "what" comments.** `// increment counter` above `i++` gets deleted.
- **No task references** (`// added for issue #12`, `// part of stage 3`). Those rot.
- **TODO/FIXME format:** `// TODO(scope): action` so they're greppable. Don't merge code with unresolved FIXMEs without an issue link.

## 6. Physics correctness

- **Branded units everywhere a number crosses a function boundary.** A function that takes `Mpc` cannot accept `Kpc`.
- **Comoving vs physical distinction is explicit in the type.** `type Comoving<T> = T & { __frame: 'comoving' }`. Mixing comoving and physical is a banned sin.
- **No Euler integration for dynamics.** Leapfrog (KDK) for N-body, predictor-corrector or leapfrog for SPH. Document the integrator at the top of the file.
- **Always include softening** in gravity. The softening length is a parameter, not a magic number.
- **Adaptive timesteps.** Global fixed `dt` is allowed only in Stage 1 (toy prototype) and must be removed by Stage 2.
- **Conservation tests.** Every integrator change runs the energy/momentum conservation tests in `tests/physics/conservation.test.ts`. Drift > 1% in 1000 steps is a regression.
- **Random seeds are explicit and recorded.** Every stochastic IC takes a `seed: number`. Never `Math.random()` in physics code.

## 7. Performance

Performance is a feature, not an afterthought. Each stage states its budget; stages that miss budget don't get a DONE.

- **Targets** (default config 10k DM + 5k gas):
  - Desktop 60 fps
  - Mobile (iPhone 13-class) 30 fps
  - First IC generation < 2 s
- **GPU compute first.** Direct N² gravity, SPH density, FFT — all on GPU. Stage 1 may use CPU as scaffolding; remove by Stage 2.
- **Object allocation is forbidden in hot loops.** No `new Vector3()` inside a per-particle update. Use scratch buffers.
- **Typed arrays only** for particle data: `Float32Array`, `Int32Array`. Never `Array<number>`.
- **HUD updates throttled to 10 Hz.** Don't `setState` per frame.
- **Profile before optimizing.** Use `performance.measure` and the dev overlay. Don't guess.

## 8. State management (Zustand)

- **Stores are small and focused.** `simulationStore`, `uiStore`, `parametersStore` — not one mega-store.
- **No derived state in the store.** Compute it in selectors with `useShallow` or `useMemo`.
- **Actions are pure-ish.** They take the current state and produce the next. Side effects (starting the sim loop, posting to a worker) live in dedicated controllers in `src/state/controllers/`.
- **Snapshot pattern for sim → UI.** Physics writes to a typed-array snapshot at the end of each tick; UI reads from it. No structured-clone in the loop.

## 9. Rendering & UI

- **Dark space aesthetic.** Background gradient `#000814 → #0A0E27`. No neon. Reference: NASA viz, Tufte.
- **Typography:** monospaced for numbers (`JetBrains Mono` or system mono), sans-serif (`Inter`) for labels.
- **Color encodes physics, not decoration.** DM density: `#2A1B3D → #9B7FE8`. Gas temperature: blue → cyan → orange → white. Stars: pure white with bloom.
- **Accessibility:** all text contrast ≥ AA. Color is never the only signal — pair with shape or label.
- **Responsive.** HUD collapses on narrow viewports. Touch controls for mobile (orbit, pinch).
- **No layout shift after first paint.** Reserve dimensions.
- **shadcn/ui primitives** for sliders, popovers, dialogs. Don't write custom inputs.

## 10. Testing

- **`tests/physics/`** — unit tests for every formula. Cosmology functions, growth factor, leapfrog conservation, SPH density of a Plummer sphere, etc.
- **`tests/ui/`** — light snapshot/render tests for HUD components.
- **`tests/e2e/`** — one Playwright spec: "load the app, advance to z=20, see at least one halo lit." That's it.
- **Tolerances are explicit.** Numerical tests use relative error and document why the tolerance is what it is.
- **Tests run in CI on every push.** Failed tests block merge.

## 11. Git & commits

- **Branch model:** trunk-based. `main` is always deployable. Feature work on short-lived branches off `main`.
- **Commit message format:**
  ```
  <type>(<scope>): <imperative summary>

  <optional body explaining WHY>
  ```
  Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `physics` (for changes that touch correctness).
  Scopes: `physics`, `render`, `ui`, `state`, `workers`, `shaders`, `build`, `stages`.
- **One logical change per commit.** Don't bundle a refactor with a feature.
- **No "WIP" or "fix typo" commits on `main`.** Squash before merge if needed.
- **No force-push to `main`.** Force-push on feature branches is fine.
- **Hooks (`--no-verify`) never bypassed** unless the user explicitly asks.

## 12. Build & CI

- **CI on GitHub Actions:**
  - lint (eslint)
  - typecheck (`tsc --noEmit`)
  - unit tests (vitest)
  - build (vite build)
  - one Playwright smoke test
- **Preview deploys** on every PR via Vercel.
- **Production deploy** on push to `main`.

## 13. Deployment

- **Vercel** is the target host. Static SPA, Edge for any future API routes.
- **Custom domain** later; until then `cosmic-seed.vercel.app` is fine for sharing.
- **URL state.** All simulation parameters serialize to a query string so a shared link reproduces the run. Use a stable, versioned schema (`?v=1&seed=42&...`). Bump version on breaking changes.

## 14. Security & privacy

- No telemetry without an explicit opt-in.
- No secrets in client code. The app is fully static; there's nothing to leak unless we add a backend, which we won't in v1.
- CSP headers via Vercel config: tight `script-src 'self'`, no `unsafe-eval` (means no eval'd shaders — load them as files).

## 15. Code review checklist (for self-review before commit)

- [ ] Types are tight. No `any`, no unjustified `!`.
- [ ] Physics changes have a paper reference in the docstring.
- [ ] No new comment explains "what"; only "why".
- [ ] No allocation inside hot loops.
- [ ] Tests pass locally. New formula → new test.
- [ ] Commit message follows the format.
- [ ] If architectural: `DECISIONS.md` updated.
- [ ] If stage milestone: stage doc + `STATUS.md` updated.

## 16. When the rules conflict with reality

Tell the user. Don't bend a rule silently. Either we update the rule with a written rationale or we accept the exception with a `// RULE-EXCEPTION: <ref>` comment that links to a `DECISIONS.md` entry.
