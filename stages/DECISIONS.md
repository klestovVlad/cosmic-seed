# Decisions log

Append-only. Each entry is a small ADR. New entries at the top. Don't edit old entries — supersede them with a new one and link.

Format:

```
## YYYY-MM-DD — short title
**Status:** accepted | superseded by #N | rejected
**Context:** what forced the decision
**Decision:** what we chose
**Alternatives considered:** what we rejected and why
**Consequences:** what this locks in / costs us
```

---

## 2026-05-08 — Stage 4 splits into 4a / 4b / 4c / 4d

**Status:** accepted
**Context:** Stage 4 covers H₂ cooling (table + Saslaw-Zipoy fraction network + LW background dependence), the FoF halo finder, the Kulkarni+2021 critical-mass formula and ignition logic, star particle rendering with bloom, and an event bus + in-scene annotation pins from `EXPERIENCE.md` §3 + §5. That's the largest stage still ahead — physics, rendering, and copy/UI all in one. Splitting it follows the 3a/3b/3c/3d precedent.
**Decision:**

- **4a** (already shipped): FoF + Kulkarni+2021 ignition + star cloud + HUD halos-and-stars card + amber first-ignition banner. Physics (`halo-finder.ts`, `star-ignition.ts`) and the bare-bones star renderer.
- **4b** (this push): UnrealBloomPass (selective high-threshold) on the star cloud so the white sprites read as actual luminous sources; in-scene annotation pins for the largest halo and the first ignition with mass-anchor strings from `EXPERIENCE.md` §3; pure pin builder + projection helper extracted into `src/ui/annotation-pin-builder.ts` so the surface is unit-testable independently from React.
- **4c**: H₂ cooling table + simplified Saslaw–Zipoy fraction network + Lyman-Werner background coupling + cooling integration in the SPH energy step (with subcycling cap). Affects M_crit via `f_LW`. Cooling-table interpolation regression test + LW=100 ignition-delay regression test.
- **4d**: event bus for milestone toasts (linear-to-nonlinear, first-turnaround, first-halo, cosmic-web-visible, first-ignition, nth-ignition), "no DM" regression test (Ω_DM = 0 → zero halos by z = 10), updated visual checkpoint at `docs/checkpoints/stage-04.png`. Stage 4 closes.

**Alternatives considered:**

- _Land 4 in one push._ Rejected — the same pattern as 3a/3b/3c/3d. Cooling has its own numerical-stability footguns (negative T after a too-aggressive subcycle, runaway H₂ formation in dense clumps); shipping the FoF-and-ignition layer first means we can verify halos and stars are sane before the cooling channel introduces more knobs.
- _Skip the bloom pass and just brighten the star sprites._ Rejected — the educational beat is "first stars in the universe lit up", which needs an actual luminous-source feel. A point sprite at intensity 1.0 reads as a sticker; a bloomed sprite reads as a star. UnrealBloomPass at threshold ≥ 0.78 keeps the bloom selective so DM/gas don't smear.

**Consequences:** Four pushes for Stage 4 instead of one, each visually progressive. 4a is the "halo finder works, here are the white star points" beat; 4b is the "they actually glow and the universe explains itself" beat; 4c is the "the gas can cool" mechanic; 4d is the certification + event-bus surface that Stage 5/7 will subscribe to for walkthrough cues.

---

## 2026-05-08 — Stage 3 splits into 3a / 3b / 3c / 3d

**Status:** accepted
**Context:** Stage 3 in the brief covers an entire SPH layer — kernel, density estimator, pressure-gradient force, artificial viscosity, energy equation with adiabatic / shock heating, two-species particle layout, gas IC offset by half-grid, gas particle rendering coloured by temperature, plus the Sod-shock-tube test and a free-fall isothermal-collapse check. That's the brief's full week of work, similar in scope to Stage 2.
**Decision:**

- **3a** (this session): pure SPH math — cubic-spline kernel `W(r, h)` and gradient, density estimator using the Stage 1b spatial hash grid, tests for kernel normalisation, gradient continuity, density on uniform and Plummer distributions.
- **3b**: two-species particle layout (DM + gas), gas IC (same Zeldovich field offset by half-grid to avoid the pairing instability), pressure equation `P = (γ−1) ρ u`, symmetrised pressure-gradient force, Monaghan artificial viscosity, adiabatic energy update + viscous heating, modified leapfrog with the new force terms, gas particle rendering with a temperature ramp (blue → cyan → orange → white-hot), HUD additions for gas mass / mean T / max T.
- **3c**: WGSL compute kernels for SPH density and SPH force, GPU-side spatial hash, gas-particle staging buffers in the GPU runner.
- **3d**: Sod-shock-tube regression test (1-D periodic setup projected onto 3-D), isothermal-collapse self-similar check, refreshed visual checkpoint, Stage 3 closes.

**Alternatives considered:**

- _Land it all in one push._ Rejected — same risk pattern as Stage 1c / 2c2; SPH has more numerical-stability footguns (kernel pairing, viscosity tuning, energy-conservation drift) than gravity, and rushing the math layer makes the whole stage flaky.
- _Use an off-the-shelf SPH library._ Rejected — keeps us dependent on a 3-D hydro lib we'd have to learn; the kernel + force pass is a few hundred lines of straightforward code we can review ourselves.

**Consequences:** four pushes for Stage 3 instead of one, each visually progressive: 3a no UI change (foundations); 3b switches the visual to two-species coloured-by-temperature gas (the big reveal — halos stop pulsing); 3c lifts particle counts back; 3d certifies physics with the standard tests.

## 2026-05-08 — Stage 2 split into 2a / 2b / 2c

**Status:** accepted
**Context:** Stage 2 in the brief covers comoving coordinates, Eisenstein–Hu power spectrum, Zeldovich IC with off-thread FFT, adaptive timestep, comoving leapfrog, plus the time strip / scale bar / speed-of-time UI from `EXPERIENCE.md §2`. That's a 3–5 day stage; ship it in three sessions instead of one bloated push.
**Decision:**

- **2a** (this session): pure cosmology math (`H(z)`, `D(a)`, `aOfT`, `tOfA`, `f`) with branded units (`Mpc`, `Msun`, `Myr`, `Redshift`, `ScaleFactor`) and full unit-test coverage. Plus the on-screen **time strip** (z + Myr + progress) and **scale bar** (Mpc + Mly), reading from the cosmology module. Simulation physics stays in code units — the UI is the cosmological wrapper, not yet the physics. This is acceptable because Stage 1's spherical-collapse demo doesn't need cosmology to run; the time/scale UI is real for whatever Stage 2b will produce.
- **2b**: Eisenstein–Hu fit, in-house Cooley–Tukey FFT in a Web Worker, Zeldovich displacement field replacing `sphericalPerturbation` as the IC.
- **2c**: comoving leapfrog (`dx/dt = v/a²`, `dv/dt = −∇Φ/a`, mean-density subtraction), adaptive timestep based on local dynamical time + Hubble rate, δ_max(t) chart with linear-theory reference, linear-growth regression test.

**Alternatives considered:**

- _Land 2 in one push._ Rejected — the same risk pattern as 1b/1c, and the FFT + worker layer is sensitive code that needs its own attention.
- _Do UI last._ Rejected — `EXPERIENCE.md §15` puts time strip + scale bar in Stage 2; shipping them with the cosmology math means subsequent stages always render against meaningful axes.

**Consequences:** the user sees cosmological time/scale on screen after 2a even though the simulation isn't cosmological yet. Honest "live now in v0 / cosmological IC arrives in 2b" framing in the time strip's tooltip; promotes to the real value once 2b lands.

## 2026-05-08 — Educational clarity is acceptance, not polish

**Status:** accepted
**Context:** After Stage 1b the demo is a beautiful purple blob with cryptic stat labels. The current plan eventually addresses readability (Stage 5 charts + parameter help, Stage 7 walkthrough/onboarding/copy), but the level of detail there isn't enough to guarantee a non-physicist can grok what's happening within 60 seconds of arriving on the page. The user explicitly asked for "точно, наглядно, понятно" by v1.0, not as a polish-pass nice-to-have.
**Decision:** Add a top-level `EXPERIENCE.md` that defines the v1.0 user experience as concrete, numbered requirements (60-second story, persistent on-screen elements, scene annotations, onboarding, walkthrough, summary card, compare mode, About/FAQ, expert/explained toggle, mobile, accessibility, URL share, "what this is not"). `CLAUDE.md` loads it every session alongside `RULES.md`. Stages 2/4/5/6/7 add deliverables that satisfy specific items in the document. Before any stage is marked DONE, its row in `EXPERIENCE.md` §15 must be shipped — otherwise the stage is a regression on v1.0.
**Alternatives considered:**

- _Keep clarity items as a vague "Stage 7 polish" line._ Rejected — that's how educational tools end up shipping with no on-screen scale anchor and physics symbols nobody but the author understands.
- _Pull all clarity work into Stage 7 only._ Rejected — too much surface area for one stage; better to spread it (Stage 2: scale bar + time conversion; Stage 4: scene-event pins; Stage 5: expert/explained labels + plain-language tooltips + mass anchors; Stage 6: firm compare-mode; Stage 7: onboarding/walkthrough/end-card/JWST-overlay/cinematic-intro).
- _Build a separate "kid mode."_ Rejected — better to make the default Explained register and let physicists opt into Expert.
  **Consequences:** Several stage docs grow new deliverables and acceptance criteria. Some items (legend, annotation pin design) appear in two stages — the earlier stage lands the data path, the later stage polishes the surface. The Expert/Explained toggle becomes a structural commitment: every label exists in both registers from Stage 5 forward. Things previously marked "optional" — JWST overlay, compare mode generalisation, onboarding — are now required.

## 2026-05-08 — Stage 1 splits again: 1b is density visuals, 1c is WebGPU compute

**Status:** accepted (supersedes the 1a/1b breakdown above for the 1b boundary)
**Context:** The original 1b scope (full WebGPU compute pipeline + density + 10k particles + cross-validation test + capability fallback + visual checkpoint) is genuinely a 3–5 day chunk and trying to land it in one session compresses the WebGPU work and risks shallow tests. We want a visible upgrade to ship every session.
**Decision:** Stage 1b ships the visual half of the brief without touching compute: spatial-grid density estimation (CPU, O(N) per particle for a constant-density box), density-coloured particle rendering with a violet ramp, WebGPU capability detection + a UI banner, and a visual checkpoint test. Stage 1c follows with the actual WebGPU compute pipeline: force kernel (direct N² with workgroup tiling), leapfrog kernels (kick-drift, kick), GPU-side density, async runner, 10k particles at ≥ 60 fps desktop, and the CPU↔GPU cross-validation regression test.
**Alternatives considered:**

- _Push WebGPU compute through 1b regardless._ Rejected — high risk of half-baked compute pipeline and shallow tests.
- _Skip density colouring until 1c._ Rejected — the visual is the most impactful change a user notices.
- _CPU-only with Barnes–Hut for 10k._ Rejected — diverges from the spec ("direct N² on GPU") and we'd have to re-do it for Stage 3 anyway.
  **Consequences:** Stage 1's "10k @ 60 fps" acceptance moves to the end of 1c. Stage 1 stays IN PROGRESS until 1c lands. The CPU reference path becomes the permanent fallback for browsers without WebGPU, which is what we want.

## 2026-05-08 — Two-track gravity: CPU reference + WebGPU runtime

**Status:** accepted
**Context:** Stage 1 needs (a) unit tests for the physics in Node, where there's no GPU; (b) ≥ 60 fps with 10 000 particles, which only the GPU can deliver; (c) a graceful path for browsers without WebGPU.
**Decision:** Maintain two implementations of direct-N² gravity. A CPU reference in `src/physics/gravity-cpu.ts` is the source of truth — it's pure, testable in Node, and used as a runtime fallback when WebGPU is unavailable. A WebGPU compute kernel in `shaders/compute/gravity.wgsl` is the production path for the runtime. The leapfrog integrator orchestrates whichever force evaluator is plugged in via a small interface.
**Alternatives considered:**

- _GPU only, no CPU reference._ Rejected — the unit tests required by `RULES §6` cannot run, and a non-WebGPU browser shows nothing.
- _GLSL transform feedback as the only path._ Rejected as primary — WebGPU compute is cleaner, more correct for arbitrary buffer reads, and is the technology we want to invest in. We may still add a WebGL2 path in Stage 7 if telemetry shows the WebGPU-unsupported share is non-trivial.
- _Skip the CPU implementation, mock physics in tests._ Rejected — mocked physics tests give false confidence; we want the CPU reference itself to be the thing we trust.
  **Consequences:** Two implementations to keep aligned. Cross-validation test: same IC + same dt → CPU and GPU positions diverge by < 1e-4 over 100 steps. Non-WebGPU browsers run the CPU path with a reduced default particle count and a banner saying so.

## 2026-05-08 — Stage 1 split into 1a (CPU + render) and 1b (WebGPU)

**Status:** accepted
**Context:** Stage 1 acceptance is broad (10k particles at 60 fps + tests + visual collapse + density colouring). Trying to land it in one push compresses the GPU compute work and risks the unit tests being shallow.
**Decision:** Stage 1a delivers the CPU reference, the unit tests, the Three.js scene, the simulation store, and the HUD — with 1500–2000 particles rendering CPU-driven. Stage 1b adds the WebGPU compute path, density estimation, density-coloured rendering, and bumps the default particle count to 10k to hit the perf budget. Both substages share the same stage doc; `STATUS.md` notes which is current.
**Alternatives considered:**

- _One big push._ Rejected — too much surface area in one commit, harder to review, harder to roll back.
- _Skip CPU, do WebGPU first._ Rejected — see the previous decision; without CPU reference, the tests have nothing real to validate against.
  **Consequences:** Stage 1a has a visible but slow demo; Stage 1b is the perf payoff. Both must keep the same physics behaviour — the cross-validation test pins this.

## 2026-05-08 — Code units (G = 1) for Stage 1; SI/cosmological units arrive in Stage 2

**Status:** accepted
**Context:** Stage 1 is non-cosmological. Picking real units (Mpc, Msun, Gyr) now adds friction without payoff.
**Decision:** Use code units where G = 1, the IC sphere has radius 1, and total mass = 1. Branded numeric types `CodeLength`, `CodeMass`, `CodeTime`, `CodeVelocity` enforce unit hygiene at function boundaries even in code units. Stage 2 will introduce cosmological units (`Mpc`, `Msun`, `Myr`, `Redshift`, `ScaleFactor`) as additional brands and convert at IC time.
**Alternatives considered:**

- _Use Mpc/Msun/Myr now._ Rejected — Stage 1 is a static-frame demo, those units have no meaning yet.
- _Plain `number` in Stage 1, brand later._ Rejected — bolting brands onto existing code is tedious; do it once up-front. `RULES §1` requires it anyway.
  **Consequences:** A small upfront tax (constructors `codeLength(0.5)` instead of `0.5`). Pays back when we add real units in Stage 2 — the type system catches every implicit conversion.

**Status:** accepted
**Context:** Need a default stack before Stage 0 install.
**Decision:** Vite + React 19 + TypeScript + Three.js (raw, not r3f) + Tailwind 4 + Zustand 5 + pnpm + Vitest + Playwright. Deploy to Vercel.
**Alternatives considered:**

- _react-three-fiber_ — rejected for v1 because the simulation loop runs on GPU and we want raw control over render order, transform feedback, and compute pipelines. Reconsider in Stage 5+ if scene complexity demands it.
- _Svelte_ — rejected; React 19's compiler + Zustand is enough, and the team familiarity is in React.
- _Cloudflare Pages / Netlify_ — viable, but Vercel has the smoothest preview-deploy story for PRs.
  **Consequences:** Direct Three.js means more boilerplate but full control. We commit to writing our own particle system rather than leaning on `<points>` from r3f.

## 2026-05-08 — Stage layout in `stages/`

**Status:** accepted
**Context:** Need a way for the user to invoke "продолжи стадию N" with consistent context recall.
**Decision:** Eight numbered files (`00`–`07`) in `stages/`, plus `STATUS.md` (source of truth) and `DECISIONS.md` (this file). Each stage has a fixed shape (Goal / Deliverables / Steps / Acceptance / Tests / Notes).
**Alternatives considered:**

- One big `PLAN.md` — rejected, doesn't scale and merges concerns.
- GitHub issues — rejected, the user wants the plan checked into the repo so Claude can read it without network.
  **Consequences:** A bit of file sprawl, but each stage is self-contained and resumable.
