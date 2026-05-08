# Stage 5: Parameters & UI

**Status:** TODO
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

_(filled during work)_
