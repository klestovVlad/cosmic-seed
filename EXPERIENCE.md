# v1.0 user-experience target

This is the north star. By the time all stages land, a stranger on a phone or laptop must be able to answer the questions in §1 within ~60 seconds of arriving on the page, without any prior physics background. Every stage's deliverables and acceptance criteria map back to numbered items below.

This file is loaded with `RULES.md` at the start of every session. If a stage doc and this doc disagree, this doc wins; update the stage doc to align. If reality forces a change here, propose it in chat and add a `DECISIONS.md` entry.

---

## 1. The 60-second story

A first-time visitor must answer these in ~60 seconds:

1. **What is this?** Educational simulation of how the early universe formed dark-matter halos, gas, and the first stars.
2. **What am I looking at?** Halos / gas / first stars; cosmic-web context; the densest region zoomed in.
3. **When is this in the universe's history?** Redshift z, age in Myr after Big Bang, with a progress bar.
4. **How big is the box?** In Mpc and in millions of light-years, both shown.
5. **How fast is time passing?** "1 second of sim ≈ N Myr universe-time" at the current speed.
6. **What can I change?** Sliders + presets, with plain-language labels.
7. **What's the limit?** Honest "this is not a science instrument" framing in the About panel.

---

## 2. Persistent on-screen elements

These are visible (or toggleable) at all times, not buried in side panels:

- **Scale bar.** Bottom-left widget. "1 Mpc · 3.26 million ly". Like a NASA visualisation. Updates if the user changes box size.
- **Time strip.** Top: `z` (redshift), `t` (Myr after Big Bang), and a thin progress bar from `z_init` to `z_end`.
- **Speed-of-time readout.** "1 sec sim ≈ 30 Myr universe-time" updates when the speed slider changes.
- **Run state.** Small badge: running / paused. FPS hidden behind a dev-mode toggle (not a default-on metric).
- **Bottom HUD.** Collapsible cards: simulation, energy, density, halos. **Every physics symbol carries a plain-language secondary label** (controlled by the Expert/Explained toggle, see §10).
- **Legend toggle.** A single button (bottom-right) opens a colour/symbol key: DM density violet ramp, gas-temperature ramp blue→cyan→orange→white, stars = white-with-bloom, etc.

---

## 3. In-scene annotations (pins)

Physical events trigger short on-screen pins (3-second fade) with a quantity _and_ a relatable anchor:

- "← largest halo · 10⁶ M☉ (≈ dwarf-galaxy seed)"
- "← cosmic-web filament"
- "first star ignited · z = 18, M_halo = 8×10⁵ M☉"
- "shock-heated gas at virial radius · T ≈ 10⁵ K"

The anchor (the bit in parentheses) is required. A bare `10⁶ M☉` is meaningless to a non-physicist; "≈ dwarf-galaxy seed" gives them a hook.

---

## 4. Onboarding (first visit only, dismissable)

Three slides, ~5 seconds each:

1. "You're watching how the universe formed its first stars — running live in your browser."
2. "Time runs from the past forward: redshift 100 ≈ 18 Myr after Big Bang, redshift 6 ≈ 1 Gyr after. The bar at the top shows where you are."
3. "Use the sliders to change physics. Start with a preset, then experiment."

On dismiss, the **Standard universe** preset auto-starts. Camera auto-zooms onto the largest halo as it grows. After first dismissal, onboarding stays in localStorage as "seen"; a "Show intro again" link in About brings it back.

---

## 5. Walkthrough mode

A toggle in the toolbar enters a guided tour. The run pauses at each milestone and shows a 1-paragraph explanation. Skippable at any point.

Milestones (with the text it should fade in):

1. **Linear growth.** "Tiny seeds in matter grow at a constant rate everywhere — δ ∝ a, the textbook prediction."
2. **Turnaround.** "A region just stopped expanding with the universe. From here it starts to collapse under its own gravity."
3. **First halo.** "A bound clump of dark matter has formed. It's now massive enough to pull in gas."
4. **Cosmic web.** "Filaments connecting halos, voids in between — the large-scale structure of the universe."
5. **First ignition.** "First-generation stars (Population III) just lit up in this halo. The gas got cold and dense enough."
6. **End of run.** "We've stopped at z = 6, about 1 billion years after the Big Bang. JWST is observing galaxies near this era today."

---

## 6. Diagnostic side panel

Toggleable, collapses on mobile. Three live charts:

- **δ_max(t)** — log-log, with the linear-theory reference line. Shows where the run goes nonlinear (the line bends away from the reference).
- **Halo mass function** — current snapshot, log-log, with a Press–Schechter reference curve.
- **Gas phase diagram** — T vs ρ, with the cooling-ineffective region (T < 10⁴ K, low n) shaded.

Each chart has a one-line caption explaining what to look for.

---

## 7. End-of-run summary card

When a run reaches its end (z_end or user stop), a card slides in:

- Number of halos by mass bucket
- Total stellar mass produced
- Redshift and mass of the first ignition
- Numerical-error indicator: max energy drift over the run
- One-line context line: e.g. "JWST has observed galaxies up to z ≈ 13. Your run lit its first stars at z = 18 — consistent with theoretical expectations for Pop III."
- Three buttons: **Try another preset**, **Tweak parameters**, **Share this run** (URL).

---

## 8. Compare mode

Side-by-side two viewports, same seed, two parameter sets. Synchronised playback. Built-in comparisons:

- **Standard universe** vs **No dark matter** — Stern's central claim: without DM, no stars form.
- **CDM** vs **WDM 2 keV** — cutoff in the halo mass function.
- **v_bc = 0** vs **v_bc = 60 km/s** — streaming-velocity delay.
- **User-defined A/B** — two URL-shareable runs side by side.

---

## 9. About + FAQ

Modal panel. Mandatory contents:

- One-paragraph "what this is" — educational, browser-native, physically grounded but not a research tool.
- Citations: Bromm & Yoshida 2011, Kulkarni+2021, Bode+2001, Springel 2005, Eisenstein & Hu 1998.
- **Limitations** — must be honest:
  - Particle count: ~10k here vs 10⁸–10¹⁰ in production codes.
  - No full radiative transfer.
  - No metal-line cooling, no Pop III feedback.
  - Box too small for a real halo-mass-function comparison.
  - Cosmic-web visual is qualitative, not predictive.
- "Show intro again" link.
- Source code link.

---

## 10. Expert / Explained toggle

A single switch in the toolbar flips **every** on-screen label between two registers:

| Expert  | Explained                |
| ------- | ------------------------ |
| `−T/U`  | virial ratio             |
| `δ`     | density contrast         |
| `σ_8`   | initial-fluctuation amp. |
| `Ω_m`   | matter fraction          |
| `M_h`   | halo mass                |
| `R_vir` | virial radius            |
| `J_LW`  | Lyman–Werner background  |
| `v_bc`  | baryon-DM streaming vel. |
| `z`     | redshift (cosmic time)   |
| `Mpc`   | mega-parsec (≈ 3.26 Mly) |
| `M☉`    | solar mass               |

**Defaults to Explained.** Power users opt into Expert; that flag also goes into the URL.

---

## 11. Mobile

- HUD collapses to a swipeable bottom sheet (one tap to expand, swipe down to collapse).
- Sliders behind a "tweak" floating-action button.
- Touch: 1-finger orbit, 2-finger pinch + pan.
- Auto-quality: ≤ 5 k particles on devices reporting < 4 GB memory, otherwise 10 k.
- Bloom off by default on mobile (toggle in About → Settings).

---

## 12. Accessibility

- `prefers-reduced-motion`: disables auto-zoom, bloom, walkthrough animations.
- Colour-blind safe palettes (deuteranopia + protanopia variants), opt-in in About → Settings.
- All controls keyboard-reachable; visible focus rings.
- Text contrast ≥ AA throughout.
- Plain-language labels (Explained mode) are the default.
- All annotation pins also speak through `aria-live="polite"` so screen readers get the same milestone cues.

---

## 13. URL share

Every parameter, seed, redshift cursor, Expert/Explained flag, and Compare-mode pair serialises to a URL. The URL reproduces the exact run. Versioned (`?v=1&...`); migrators for breaking changes. Sharing on Twitter/Telegram shows a generated OG card with the run's signature view.

---

## 14. What this is **not** (must be clear from About + FAQ)

- Not a research tool. Doesn't replace GADGET / AREPO.
- Not a JWST predictor.
- Not a settled answer on dark-matter type or first-star physics.
- An education-grade, browser-native artifact whose value is **intuition**, not numerical accuracy. Numbers shown are physically motivated but not science-grade.

---

## 15. Stage map

Each stage carries some of this responsibility. The acceptance criteria in the stage docs must include the items below; if they don't, update the stage doc.

| §   | Lives in stage | Notes                                                                                     |
| --- | -------------- | ----------------------------------------------------------------------------------------- |
| 1   | Stage 7        | Onboarding answers most of the 60-second story.                                           |
| 2   | Stage 2 + 7    | Stage 2 lands z, t, scale bar, speed conversion. Stage 7 polishes them.                   |
| 3   | Stage 4 + 7    | Stage 4 wires events; Stage 7 designs the pin look + anchor copy.                         |
| 4   | Stage 7        | First-visit slides + auto-start preset.                                                   |
| 5   | Stage 7        | Walkthrough orchestration; milestone hooks come from the physics in 2/3/4.                |
| 6   | Stage 5        | Charts + Press-Schechter reference + cooling-region shading.                              |
| 7   | Stage 7        | End-of-run card; data populated by the runner, copy by Stage 7.                           |
| 8   | Stage 6 + 7    | Stage 6 implements compare for DM types. Stage 7 generalises to any A/B and adds presets. |
| 9   | Stage 7        | About + FAQ, citations.                                                                   |
| 10  | Stage 5 + 7    | Stage 5 lands the toggle + label pairs. Stage 7 audits coverage.                          |
| 11  | Stage 7        | Mobile pass.                                                                              |
| 12  | Stage 7        | Accessibility audit.                                                                      |
| 13  | Stage 5        | URL state (already planned). Stage 7 adds OG card.                                        |
| 14  | Stage 7        | Copy + framing.                                                                           |

---

## How to use this file

- Every session, read `EXPERIENCE.md` after `RULES.md`.
- Before marking a stage DONE, re-read §15 — anything in this stage's row that isn't shipped is a regression on v1.0.
- When making a UI/copy decision mid-stage, check this file before improvising. If it's silent, update it.
- If a stage doc disagrees with this file, this file wins. Update the stage doc.
