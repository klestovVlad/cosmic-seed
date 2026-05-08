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
