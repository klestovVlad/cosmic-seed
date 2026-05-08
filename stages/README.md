# Stages

Eight stages, each in its own file. Numbered 00–07. Each stage is a self-contained plan with status, deliverables, implementation steps, and acceptance criteria.

## Files

- **[STATUS.md](STATUS.md)** — single source of truth for stage progress. Read first.
- **[DECISIONS.md](DECISIONS.md)** — architectural decisions log (ADR-lite).
- **NN-\<slug\>.md** — one file per stage.

## Conventions

Every stage doc has the same shape:

```
# Stage N: Title

**Status:** TODO | IN PROGRESS | BLOCKED | DONE
**Estimated:** X days
**Depends on:** Stage N-1
**Spec reference:** Phase X (cosmology brief §5)

## Goal
One paragraph.

## Deliverables
- [ ] checklist of artifacts produced

## Implementation steps
1. concrete numbered steps

## Acceptance criteria (Definition of Done)
- [ ] testable conditions

## Test plan
What must run green.

## Performance budget
fps targets if applicable.

## Notes / learnings
(filled during/after work — append, don't rewrite)
```

## Updating status

When a stage is touched:
1. Update its `Status:` header.
2. Update the row in `STATUS.md`.
3. Append a dated line to its **Notes / learnings** section.
4. If you made an architectural call, append a new entry to `DECISIONS.md`.

`STATUS.md` is the canonical view. Stage docs reflect it. Don't let them drift.
