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

## 2026-05-08 — Stack baseline

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
