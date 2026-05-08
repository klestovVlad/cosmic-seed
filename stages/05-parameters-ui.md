# Stage 5: Parameters & UI

**Status:** IN PROGRESS (5a labels+toggle, 5b parameter schema + sliders + URL — shipped)
**Estimated:** 1 week
**Depends on:** Stage 4
**Spec reference:** Phase 4 (cosmology brief §2, §3)

## Goal

Promote the simulation from "runs with hard-coded parameters" to "interactive teaching artifact". Build the full parameter UI from §2 of the brief — sliders, presets, URL state, time controls, diagnostic charts. By the end, a user can change σ_8, swap CDM for WDM, dial in streaming velocity, share a URL that reproduces their run, and scrub through saved checkpoints.

## Deliverables

- [ ] `src/state/parametersStore.ts` — typed parameters, validators, schema-versioned URL serialisation.
- [ ] `src/ui/Controls/` — the slider panel from §2 of the brief, organised in collapsible groups (Cosmology / Dark matter / Baryon coupling / IC / Numerics).
- [ ] `src/ui/Presets.tsx` — four preset buttons: "Standard universe", "No dark matter", "Warm DM", "Strong LW".
- [ ] `src/ui/Timeline.tsx` — play/pause/step, speed slider 0.1×–10×, scrub-bar back to a saved checkpoint.
- [ ] Checkpoint system: store snapshots every K steps (configurable, default 50). Scrubbing replays from the nearest checkpoint forward at high speed.
- [ ] Snapshot button: copies a shareable URL with all parameters + seed + current redshift to the clipboard.
- [ ] Diagnostic side-panel:
  - δ_max(t) chart with linear-theory reference line.
  - Halo mass function snapshot.
  - Gas phase diagram (T vs ρ) for current step.
- [ ] Help overlays: hover any parameter to see a one-paragraph explanation; key events ("linear growth phase", "turnaround", "first ignition") trigger short toasts.
- [ ] Parameter changes that invalidate the run (anything affecting IC) trigger a "regenerate?" dialog rather than silently desyncing.
- [ ] `tests/ui/parameters.test.ts` — round-trip URL serialisation, validator boundaries, preset application.

**Clarity deliverables (`EXPERIENCE.md` §10, §6, §13):**

- [ ] **Expert / Explained toggle** in the toolbar. Defaults to **Explained**. Persists in the URL (`x=0|1`) and in `localStorage`.
- [ ] **Label-pair registry** (`src/ui/i18n/labels.ts`) — every physics symbol on screen has both an Expert and an Explained string, plus an optional one-line tooltip used by parameter help. The toggle just selects which key to read. Coverage is asserted by `tests/ui/labels.test.ts`: every HUD/parameter label has both registers.
- [ ] **Plain-language tooltip on every parameter**, not just the brief's §2 list. Tooltip explains _what changes when you move it_ in physical terms, not just what the symbol means.
- [ ] **Speed-of-time readout** updates live with the speed slider: "1 sec sim ≈ N Myr universe-time" (string formatter shared with Stage 2).
- [ ] **Mass-anchor + length-anchor strings** in the HUD: a halo's mass is shown both as `M_halo` (Expert) and "≈ globular-cluster mass" (Explained); the box size is `1 Mpc` (Expert) and "≈ 3.26 million light-years" (Explained).
- [ ] **Diagnostic chart captions** — each of the three charts has a one-line "what to look for" caption (e.g. "Look for the curve to bend below the dotted line — that's where the simulation goes nonlinear.").
- [ ] **Press–Schechter overlay** on the halo-mass-function chart.
- [ ] **Cooling-ineffective shading** on the gas phase diagram (T < 10⁴ K, low n).

## Implementation steps

1. **Parameter schema.** Single source of truth in `src/state/parameters/schema.ts`: name, unit, range, default, group, description, "requires regen" flag. Used by the store, the UI, and the URL serialiser.
2. **Zustand store.** `parametersStore` holds the current values. A computed `paramsHash` is what the simulation runner watches to detect "regen needed".
3. **URL serialisation.** Versioned: `?v=1&seed=…&σ8=…&...`. Use short keys but keep them human-readable. A migrator handles `v=0 → v=1` if we change schema.
4. **Slider component.** Built on shadcn/ui `Slider`. Shows label, value with unit, range, default tick. Long-press resets to default. Keyboard arrows + Shift for fine control.
5. **Preset buttons.** Each preset is a partial-parameters patch + a "this changes IC, regenerate?" confirmation if the run is in progress.
6. **Timeline.** Three controls + scrub bar. Scrub bar shows the redshift range currently checkpointed; dragging seeks to the nearest checkpoint and replays.
7. **Checkpointing.** Periodic full-state snapshot (positions, velocities, energies, halo list) into a ring buffer in memory. Compressed via `Uint16` quantisation if size becomes a concern.
8. **Diagnostic charts.** Pick uPlot (lighter, canvas-based) — written to DECISIONS. Three panels: δ_max(z), halo mass function, gas phase diagram.
9. **Help system.** Tooltips on labels via shadcn `Popover`. Toast events emitted by the simulation runner when it crosses physical milestones (linear → nonlinear, first turnaround, first ignition). Toasts are dismissable and never block.
10. **Regen dialog.** When a "requires regen" parameter changes mid-run, queue the change and show a non-blocking dialog with "Apply on next run / Apply now (resets)".

## Acceptance criteria (Definition of Done)

- [ ] All parameters from §2 of the brief are present, with correct ranges and defaults.
- [ ] Each preset, applied on a fresh page, produces the expected qualitative behaviour:
  - Standard: lights stars at z ∈ [15, 25].
  - No DM: zero halos, no stars, by z = 10.
  - WDM 2 keV: halo mass function clearly truncated at low mass.
  - Strong LW: first ignition delayed by Δz ≥ 5.
- [ ] URL share round-trips parameters without loss.
- [ ] Scrub bar seeks correctly to within one checkpoint of the requested time.
- [ ] HUD updates throttled, never causing frame drops.
- [ ] All UI tests pass.
- [ ] Expert/Explained toggle flips every label across the page; coverage test (`labels.test.ts`) is green.
- [ ] Every diagnostic chart has its "what to look for" caption (`EXPERIENCE.md` §6).
- [ ] Speed-of-time readout updates live with the speed slider (`EXPERIENCE.md` §2).

## Test plan

- **Unit:** parameter validators reject out-of-range and accept boundaries.
- **Unit:** URL serialise → deserialise → equal.
- **Unit:** preset application sets the right keys.
- **Visual:** screenshot of the full UI at default config, saved to `docs/checkpoints/stage-05.png`.

## Performance budget

- UI re-renders capped at 10 Hz for value displays; sliders update at 60 Hz only for the slider thumb.
- Bundle size after this stage < 600 KB gzipped.

## Notes / learnings

### 5a — Expert/Explained labels + toggle (2026-05-08)

- `src/ui/i18n/labels.ts`: literal-typed `LABELS` const map keyed on a
  `LabelKey` union. Each entry is `{ expert, explained, tooltip? }`.
  `getLabel(key, mode)` is a pure lookup so callers can centralise on
  this instead of inlining ad-hoc strings (the existing TimeStrip /
  ScaleBar / DeltaMaxChart use `useUiStore((s) => !s.expertMode)` and
  switch inline; the new `useLabel(key)` hook is a typed alternative
  for new components and the HUD refactor).
- `src/ui/i18n/expert-mode-url.ts`: pure URL/localStorage adapter.
  Precedence: URL `?x=0|1` (shared-link semantics) → localStorage
  `cs.expertMode` (last-visit memory) → default Explained. The
  parameter is omitted from the URL for the default register so
  shared links stay minimal.
- `src/ui/ExpertToggle.tsx`: top-left two-cell pill. Two effects sync
  the store back to URL (history.replaceState — no extra back-stack
  entries) and localStorage on every change. URL parsed on mount.
- HUD refactor: 28 hard-coded `<Stat label="...">` strings replaced
  with `<LabeledStat labelKey="..." mode={mode} />`. The toggle now
  flips: `−T/U` ↔ `virial ratio`, `ρ central` ↔ `central density`,
  `‖p‖` ↔ `total momentum`, `x_H₂ peak` ↔ `peak H₂ fraction`, etc.
  Mass-anchor strings (≈ dwarf-galaxy seed) stay always-on by design;
  they're the bit that makes a bare `10⁶ M☉` mean something.
- Tests: `tests/ui/labels.test.ts` (every key has both registers,
  cryptic Expert symbols differ from Explained, getLabel resolves
  correctly), `tests/ui/expert-mode-url.test.ts` (URL parse / write,
  default-register omission, storage round-trip, precedence in
  resolveInitialExpertMode). 16 new unit tests; 153 total + 3 e2e
  green.
- DECISIONS.md: Stage 5 split into 5a / 5b / 5c / 5d / 5e / 5f.
  Building the label registry first means every label that lands in
  5b–5f registers a pair on the way past instead of being retro-fitted.

### Acceptance status (after 5a)

- [x] Expert/Explained toggle in the toolbar (top-left pill).
- [x] URL persistence (`?x=1` for Expert, omitted for Explained).
- [x] localStorage persistence (`cs.expertMode`).
- [x] Label-pair registry; coverage asserted by `tests/ui/labels.test.ts`.
- [x] HUD reads from registry — 28 labels flip across the page.
- [ ] Plain-language tooltips on every parameter — needs the parameter
      panel from 5b.

### 5b — parameter schema + slider panel + URL hydration (2026-05-08)

- `src/state/parameters/schema.ts`: literal-typed `PARAMETER_SCHEMA`
  with 4 entries (σ_8, J_LW, v_bc, maxStars). Each spec carries the
  label key (auto-flips Expert/Explained), short URL key, group, range,
  step, default, `requiresRegen` flag. `clampValue` rounds integer
  params and snaps numbers to the step grid. Adding a parameter is one
  schema entry + one labels.ts pair + tests pass.
- `src/state/parametersStore.ts`: Zustand store with separate
  `committed` + `pending` views. Live params (`!requiresRegen`) commit
  immediately on slider drag; regen params buffer in `pending` until
  the user hits "Regenerate". `runId` increments on commitRegen so
  SimulationCanvas's mount effect tears down and rebuilds with the
  new IC.
- `src/state/parameters/url.ts`: versioned URL serialiser
  (`?v=1&s8=0.5&jlw=100&...`). Default values are _omitted_ from the
  URL so a fresh-page link stays empty. Schema-version mismatch drops
  all params back to defaults — better than silently misapplying old
  keys to new fields.
- `src/ui/controls/ParameterSlider.tsx` + `ControlsPanel.tsx`:
  collapsible left-side panel grouped by physics topic. Pending regen
  values render with an asterisk + amber colour and a "Regenerate" /
  "Cancel" button bar appears when any regen param differs from
  committed.
- `src/ui/SimulationCanvas.tsx`: hydrates parametersStore from the URL
  on mount, mirrors committed values back into the URL via
  `history.replaceState`, and subscribes to live param changes to
  mutate the runner's config in place. Effect dependency on
  `parametersStore.runId` makes commitRegen trigger a full sim
  rebuild.
- 13 new unit tests (schema label coverage, unique URL keys, default
  bounds; clampValue range / round / step; URL round-trip including
  default omission; preservation of unrelated query params; schema-
  version mismatch drop). 166 unit + 3 e2e green.
- Verified end-to-end in live preview: slider drives the runner,
  URL updates, reload hydrates, regen flow restarts the sim.

#### Acceptance status (after 5b)

- [x] σ_8 / J_LW / v_bc / maxStars sliders wired to the live runner.
- [x] URL serialisation versioned + lossless round-trip.
- [x] Regen-required parameters surface a "Regenerate" button.
- [x] All UI tests pass (`tests/ui/parameters.test.ts`).
- [ ] Full §2-brief parameter coverage (Ω_m, Ω_b, n_s, h, DM type,
      seed, gridN, dt, softening) — lands in 5c alongside presets.
- [ ] Mass / length anchors in HUD — Stage-4b mass anchors already
      ship; length anchors arrive in 5e with the chart captions.
