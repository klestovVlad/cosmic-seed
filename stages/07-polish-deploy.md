# Stage 7: Polish & deploy

**Status:** TODO
**Estimated:** 1 week
**Depends on:** Stage 6
**Spec reference:** Phase 6 (cosmology brief §5, §3.4, §10)

## Goal

Take the working simulation and turn it into something a stranger could land on and "get". Visual polish (post-processing, typography, motion), educational copy that turns the run into a guided tour, mobile responsiveness, performance hardening, accessibility pass, and the final production deploy with a real domain.

## Deliverables

- [ ] Post-processing pipeline: bloom on stars, subtle ACES tone-mapping, vignette. No filmic-noise unless it improves clarity.
- [ ] Camera "auto-zoom" on the most massive halo as it grows (toggle in UI).
- [ ] Cosmic-web background field: a low-density coloured haze representing the smoothed density field, behind the particles, fading with distance.
- [ ] Educational walkthrough mode: a guided tour with on-screen text at each milestone (linear growth → turnaround → first halo → first ignition → cosmic web). Skippable.
- [ ] Onboarding overlay on first visit: 3 short slides, then an "Auto-run" preset that demonstrates the standard universe in 60 seconds.
- [ ] Mobile responsiveness: HUD collapses, touch controls (one-finger orbit, two-finger pan, pinch zoom), reduced default particle count if device memory < 4 GB.
- [ ] Accessibility pass: all interactive elements keyboard-reachable, focus rings visible, contrast AA, prefers-reduced-motion respected (turns off bloom, slows camera moves).
- [ ] Performance hardening: ensure all targets in `RULES.md §7` are met on representative devices.
- [ ] Final copy: a one-paragraph "what this is" on the landing screen, an "About" panel with the science references, an "FAQ" with the limitations from §0 of the brief ("this is not a science tool", etc.).
- [ ] Open Graph / Twitter Card metadata: when the URL is shared, a clean preview image.
- [ ] Custom domain (or confirmed `cosmic-seed.vercel.app`).
- [ ] Final `tests/e2e/` smoke run covering: load, advance, share URL, restore from URL, mobile viewport.
- [ ] Lighthouse: Performance ≥ 85, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 90.

**Clarity deliverables (`EXPERIENCE.md` — full audit):**

- [ ] **Cinematic intro** (3–4 s, skippable). Camera flies into the box from far out, scale bar appears, time strip animates from "today" backward to z = 100. Establishes scale and direction-of-time before the run starts.
- [ ] **Legend overlay** (toggle, default off). A bottom-right panel showing what every colour means: DM density violet ramp (with sample swatches), gas temperature ramp blue→cyan→orange→white, stars white-with-bloom, cosmic-web haze. Includes the colour-blind safe alternates.
- [ ] **Annotation pin polish** — the design (typography, anchor line, fade in/out) introduced in Stage 4 gets its visual pass here. Pins are also wired into the `aria-live="polite"` region for screen readers.
- [ ] **Expert / Explained coverage audit.** Walk every visible string in the app; ensure each has both registers. CI test (`tests/ui/expert-explained.test.ts`) asserts no orphan symbols.
- [ ] **End-of-run summary card** (`EXPERIENCE.md` §7). Slides in when the run hits z_end. Lists halo count by mass bucket, total stellar mass, first-ignition z and mass, max energy drift, JWST-context line, three buttons (Try another preset / Tweak parameters / Share this run).
- [ ] **JWST overlay** — promoted from optional extension to acceptance. A toggle in the side panel adds dots representing real JWST high-z galaxy candidates (Naidu+2022, Curtis-Lake+2023) at their (z, M_UV) on the gas phase or halo-mass-function chart. Not predictive, just a "here's where reality is" anchor. Source data committed under `data/jwst-highz.json` with citations.
- [ ] **About panel** — finalised copy: one-paragraph "what this is", citations, honest limitations (`EXPERIENCE.md` §9, §14), source code link, "Show intro again" link.
- [ ] **FAQ** — answers the questions a curious non-physicist actually asks (precomputed list; revise after first 10 user observations): "Is this what really happened?", "Why is it 3D when JWST images are 2D?", "Why are particles purple?", "What's a halo?", "What's redshift?", "What does WDM mean?", "Could I run this on real data?".
- [ ] **Camera auto-zoom toggle** in the toolbar (default on). Auto-zoom respects `prefers-reduced-motion`.
- [ ] **Compare mode** generalised from Stage 6's DM-type focus to any A/B URL pair (`EXPERIENCE.md` §8).
- [ ] **OG card generator** — Vercel OG image function that renders a current-state preview image when a share URL is linked on Twitter / Telegram / Discord. Includes the run's parameters as overlay.
- [ ] **Mass-anchor lookup** centralised — final pass to make sure every mass shown anywhere (HUD, pin, summary card, FAQ examples) uses the same anchor strings.

## Implementation steps

1. **Post-processing.** Three.js `EffectComposer` with `RenderPass` + `UnrealBloomPass` (tuned restrained) + `OutputPass`. Tone-mapping: ACES Filmic. Vignette via shader pass.
2. **Camera auto-zoom.** A controller in `rendering/` watches the halo list; smoothly interpolates camera target/distance toward the most massive halo's centre when it crosses a density threshold.
3. **Cosmic-web haze.** Sample the density field on a coarse 32³ grid, render as a volumetric raymarched haze (or, simpler, a sparse field of fog billboards). Pick the cheaper option and document.
4. **Walkthrough mode.** Scripted: at each milestone the runner pauses, an overlay text fades in with a "next" button. Skippable; the user can drop into freeform any time.
5. **Onboarding.** Three slides — "What you're seeing", "What you can change", "Try a preset". Stored in localStorage so first-time only.
6. **Mobile.** Detect viewport and DPR. Lower default `N_DM` to 5 000, disable bloom on low-end. Touch handlers via Three.js `OrbitControls` (already touch-aware) plus a small custom helper for two-finger pan.
7. **Accessibility.** Audit with axe-core in CI; keyboard tabbing through all controls; `prefers-reduced-motion` media query disables auto-zoom and bloom; aria-labels on icon buttons.
8. **Perf hardening.** Profile on a Pixel-class Android. Trim hot loops, check for accidental array allocations, audit shader complexity. Use the Performance Observer API for an in-app perf badge in dev mode.
9. **Copy.** Write the landing paragraph, About panel, FAQ. Cite Bromm & Yoshida 2011, Kulkarni+2021, Bode+2001, Springel 2005. Emphasise the limits.
10. **OG/Twitter cards.** Generate a static image (1200×630) of a representative run. Add `<meta>` tags. Use Vercel's OG image generator if we want it dynamic per-URL-state.
11. **Domain.** Either point a custom domain at the Vercel project or confirm the default subdomain. Add HTTPS, HSTS via Vercel config.
12. **Final smoke tests.** End-to-end: load → run to z = 10 → first ignition fires → share URL → reload → restored → mobile viewport renders. Run on Chromium, Firefox, WebKit via Playwright matrix.

## Acceptance criteria (Definition of Done)

- [ ] All five tests in cosmology brief §8 pass with errors < 20 %.
- [ ] Lighthouse scores meet the targets above on the deployed URL.
- [ ] App runs at target fps on iPhone 13 and a Pixel 6 (or equivalent).
- [ ] Onboarding shows on first visit and not after.
- [ ] Walkthrough mode plays through to first ignition without bugs.
- [ ] Sharing a URL on Twitter / Telegram shows the OG card preview.
- [ ] All interactive elements keyboard-reachable; axe audit zero criticals.
- [ ] README and About panel both have the live URL and the limitations section.
- [ ] **A first-time user, with no prior physics, can answer the seven questions in `EXPERIENCE.md` §1 within 60 seconds of arriving.** Validate via a friend / non-physicist test before tagging v1.0; record the test in the stage's Notes / learnings section.
- [ ] Every numbered item in `EXPERIENCE.md` (§1–§14) maps to a shipped feature. The §15 stage map is fully checked off.
- [ ] Expert/Explained coverage test green; no orphan physics symbols.
- [ ] End-of-run summary card, JWST overlay, cinematic intro, legend, FAQ, About all present and reachable from the toolbar.

## Test plan

- All earlier stage tests still green.
- New e2e suite: cross-browser + mobile viewport.
- Visual regression (Playwright screenshot diff) on the landing screen and the post-ignition state.
- Lighthouse run in CI.

## Performance budget

- Final desktop default: 60 fps with 10 k DM + 5 k gas + bloom + walkthrough overlays.
- Final mobile default: 30 fps with 5 k DM + 2 k gas + bloom off.
- Total bundle gzipped < 800 KB.

## Notes / learnings

_(filled during work)_
