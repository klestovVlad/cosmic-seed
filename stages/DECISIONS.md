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
