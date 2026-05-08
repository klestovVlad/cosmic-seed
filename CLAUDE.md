# Cosmic Seed — context for Claude

Educational 3D browser simulation: how dark-matter halos form, how gas falls in, and how the first stars (Pop III) ignite. Physically grounded, not a science tool.

## Reading order at the start of every session

1. **`RULES.md`** — engineering standards. Always.
2. **`EXPERIENCE.md`** — v1.0 user-experience target. The "north star": every stage's deliverables map back to numbered items here. If a stage doc disagrees with this file, this file wins.
3. **`stages/STATUS.md`** — at-a-glance progress across all stages.
4. **The stage the user named** — `stages/NN-<slug>.md`. It contains goal, deliverables, steps, acceptance criteria, and its own running notes.
5. **`stages/DECISIONS.md`** — accumulated architectural choices and tradeoffs. Skim before making any structural decision; append a new entry when you make one.

## How the user invokes stages

- `начни стадию N` — start a TODO stage. Confirm understanding briefly, then implement.
- `продолжи стадию N` — resume an IN PROGRESS stage. Read its Notes section first.
- `проверь стадию N` — run the stage's acceptance tests; report pass/fail.

After any work on a stage:

- update its `Status:` header (TODO / IN PROGRESS / BLOCKED / DONE)
- update its **Notes / learnings** section with what was done, what surprised, what's left
- update `stages/STATUS.md` to match
- if you made a non-trivial architectural choice, append to `stages/DECISIONS.md`

`STATUS.md` is the single source of truth for stage state. Stage docs should reflect it; never let them drift.

## Project structure (target — built up across stages)

```
cosmic-seed/
├── CLAUDE.md
├── RULES.md
├── README.md
├── stages/                    # plan & progress
│   ├── README.md
│   ├── STATUS.md              # source of truth for stage progress
│   ├── DECISIONS.md           # ADR-lite log
│   └── NN-<slug>.md           # one per stage
├── src/
│   ├── physics/               # pure, no DOM, unit-testable
│   │   ├── cosmology.ts
│   │   ├── nbody.ts
│   │   ├── cooling.ts
│   │   ├── halofinder.ts
│   │   └── initial-conditions.ts
│   ├── rendering/             # Three.js scene + GPU pipeline
│   │   ├── scene.ts
│   │   └── particles.ts
│   ├── ui/                    # React components
│   ├── state/                 # Zustand stores
│   └── workers/               # off-thread compute
├── shaders/
│   ├── compute/               # WGSL (gravity, SPH)
│   └── render/                # GLSL (point sprites, postFX)
├── public/
└── tests/
```

## Non-negotiables

- TypeScript strict mode, no `any` outside isolated escape hatches.
- Physics is pure. Never import Three.js, React, or DOM in `src/physics/`.
- Energy and momentum tests must pass for any new integrator change.
- One concern per file. One default export per file (or none + named exports).
- Latest stable libs — see `RULES.md §3`. Don't downgrade without a `DECISIONS.md` entry.

## When in doubt

Re-read `RULES.md`. If a rule is wrong for the situation, propose an exception in chat — don't silently break it. If a stage's spec is wrong or outdated, update the stage doc before coding.
