# Stage 4: Cooling, halos, first stars

**Status:** IN PROGRESS (4a in flight)
**Estimated:** 4–5 days
**Depends on:** Stage 3
**Spec reference:** Phase 3 (cosmology brief §1.6, §1.7)

## Goal

Make the gas able to cool, find halos, and ignite the first stars. Add primordial H₂ cooling (the only effective channel below 10⁴ K with no metals), a friends-of-friends halo finder running every N steps, and the Kulkarni+2021 critical-mass criterion that flips a halo from dark to "lit" when conditions are met. By the end, a default run shows a few halos lighting up at z ≈ 15–20, each rendered as a glowing star particle.

## Deliverables

- [ ] `src/physics/cooling.ts` — H₂ cooling rate Λ_H₂(T, n) from Galli & Palla (1998) or Glover (2015) fit.
- [ ] Energy update extended in SPH to subtract `Λ / n` per step. CMB Compton heating (only z > 100, optional flag).
- [ ] H₂ fraction track per gas particle: `x_H₂` integrated alongside `u`. Simplified Saslaw–Zipoy network (3 reactions) — document the simplifications.
- [ ] `src/physics/halofinder.ts` — friends-of-friends (FoF) on DM particles, linking length `b · l_mean` with `b = 0.2`. Runs on a configurable cadence (every K steps, default 100).
- [ ] Per halo: M_halo, R_vir, v_circ, central T_gas, central ρ_gas, redshift of formation.
- [ ] `src/physics/star-ignition.ts` — implements `M_crit(z, J_LW, v_bc)` from Kulkarni+2021. When a halo crosses M_crit AND has cold dense gas, spawn a star particle.
- [ ] Star particles rendered as bright white points with bloom (PostProcessing pass added).
- [ ] HUD: halo count, lit-halo count, "first ignition" event banner with z and M_halo.
- [ ] `tests/physics/cooling.test.ts` — Λ(T) values match published table at sample points.
- [ ] `tests/physics/halofinder.test.ts` — synthetic distribution with known clusters returns the right FoF groups.

**Clarity deliverables (`EXPERIENCE.md` §3, §10):**

- [ ] **Event bus** in the simulation runner that emits typed events when physics milestones happen: `linear-to-nonlinear`, `first-turnaround`, `first-halo`, `cosmic-web-visible`, `first-ignition`, `nth-ignition`, etc. The bus is what Stages 5 and 7 read for toasts and walkthrough cues.
- [ ] **In-scene annotation pins** for the first halo formation, first ignition, and (toggle-controlled) the largest halo. Each pin renders a 3-second fading label in screen space pointing to a 3D anchor:
  - "← largest halo · ~10⁶ M☉ (≈ dwarf-galaxy seed)"
  - "first star ignited · z = X, M_halo = Y M☉"
  - "← cosmic-web filament" (heuristic: long-axis-aligned over-density)
- [ ] **Mass-anchor strings.** A small lookup table maps a mass range to a relatable anchor (`10⁵ M☉ → "globular-cluster mass"`, `10⁶ → "dwarf-galaxy seed"`, `10⁷ → "early dwarf galaxy"`, etc.) and is reused by pins, the HUD halo card, and the end-of-run summary in Stage 7.
- [ ] HUD halo card lists the top-3 halos with mass + anchor + R_vir, rather than a bare count.
- [ ] All HUD labels in this stage exist in **both** Expert and Explained registers (the toggle infrastructure lands in Stage 5; this stage just files the strings).

## Implementation steps

1. **Cooling table.** Tabulate Λ_H₂(T, n) on a 2D log–log grid for `T ∈ [10, 10^5] K`, `n ∈ [10⁻², 10⁶] cm⁻³`. Bilinear interpolation. Reference: Glover & Abel (2008) compendium.
2. **H₂ fraction evolution.** Three-channel network: H + e⁻ → H⁻ → H₂; H + H⁺ → H₂⁺ → H₂; collisional dissociation. Update `x_H₂` each step. For v1, use a simplified analytic estimate vs density and temperature (see Tegmark+1997) and document the approximation.
3. **Lyman–Werner background.** A scalar `J_LW` (in 10⁻²¹ erg/s/cm²/Hz/sr units) — for now just a UI parameter, not radiative-transferred. Affects M_crit and the H₂ dissociation rate.
4. **Cooling integration.** In the SPH energy step, after the adiabatic update, subtract `dT = (γ−1) Λ(T, n) / (k_B n) · dt` with subcycling if the cooling time is shorter than the dynamical step.
5. **FoF.**
   - Build the same neighbour grid used by SPH.
   - Union-find over particle pairs within `b · l_mean`.
   - Group filter: halos must have ≥ 32 particles (else discard as numerical noise).
   - Runs on the GPU? — start CPU, profile, move to GPU only if needed (typical halo finder budget is tiny vs SPH).
6. **Halo properties.** For each halo, compute M_halo (Σ particle masses, including any gas particles inside R_200), R_vir from spherical-overdensity Δ = 200, v_circ from `√(GM/R_vir)`. Cache central gas T and ρ.
7. **M_crit.** Implement the Kulkarni+2021 fit:
   ```
   M_crit(z, J_LW, v_bc) = 1.69e6 M_sun · ((1+z)/20)^(-1.58) · f_LW · f_vbc
   ```
   with `f_LW = 1 + 4·J_LW^0.47`, `f_vbc = 1 + 0.6 · (v_bc / σ_vbc)^1.8`.
8. **Ignition.** Each halo-finder pass: for halos that cross M_crit AND have central gas at T < 10⁴ K and ρ_gas > 10·ρ̄_b, spawn a star particle at the halo centre with mass `1e-3 · M_halo`. Mark halo as "lit". Stars don't influence dynamics in v1 (no feedback).
9. **Rendering.** Stars as `THREE.Points` with a glow shader; UnrealBloomPass added in the post-processing chain. Limit bloom intensity so it doesn't drown the cosmic web.
10. **Event log.** Append-only list in the store of `{ z, M_halo, x }` for each ignition. HUD shows the latest 5; a side panel shows the full log.

## Acceptance criteria (Definition of Done)

- [ ] At default parameters, the first star ignites at z ∈ [15, 25] in a halo of mass `[10⁵, 10⁷] M_sun`.
- [ ] Cooling test reproduces Λ at 5 sample (T, n) points within 20 %.
- [ ] FoF test groups a synthetic distribution correctly for `b = 0.2`.
- [ ] Disabling Ω_DM (set to 0) yields zero halos by z = 10 — confirms Stern's "void without DM" claim.
- [ ] Setting `J_LW = 100` delays first ignition by Δz ≥ 5 vs default.
- [ ] No frame-rate regression beyond Stage 3.
- [ ] Annotation pins fire on the right events; first-ignition pin includes the mass-anchor string (`EXPERIENCE.md` §3).
- [ ] Event bus has > 95 % coverage of the milestones listed in `EXPERIENCE.md` §5 (the rest land in Stage 5/7 where the surrounding physics exists).

## Test plan

- **Unit:** cooling table interpolation reproduces published values at fiducial points.
- **Unit:** FoF on a planted set of two clusters of 40 particles each — finds exactly two groups.
- **Unit:** M_crit at z = 20, J_LW = 0, v_bc = 0 returns ≈ 1.69e6 M_sun (sanity).
- **Integration:** A fiducial run from z = 100 to z = 6 produces 1–10 lit halos; numbers stable across reasonable seeds.
- **Visual checkpoint:** screenshot of the first-ignition moment, saved to `docs/checkpoints/stage-04.png`.

## Performance budget

- Halo finder runs every 100 steps; budget < 30 ms/run on CPU at 10 k particles. If exceeded, port to GPU.
- Cooling subcycling must not blow the per-step budget — cap at 8 substeps; warn if hit.

## Notes / learnings

### 4a — FoF + ignition + star cloud (2026-05-08)

- `src/physics/halo-finder.ts`: friends-of-friends with min-image periodic
  distances and a mass-weighted halo centre that unwraps via a per-halo
  reference particle (boxes that straddle a face still report a sane
  centre). Linking length `b · ⟨l⟩` with `b = 0.2`; halos < `minMembers`
  are dropped as numerical noise. R_vir from spherical-overdensity Δ = 200.
- `src/physics/star-ignition.ts`: Kulkarni+2021 critical-mass formula with
  the `f_LW` and `f_vbc` corrections. `igniteEligibleHalos` walks the halo
  list and marks each one that crosses `M_crit` AND hasn't been lit
  before; we currently use spatial proximity (`r < R_vir`) as the "is this
  halo already lit" check rather than persistent FoF identifiers, since
  FoF root indices aren't stable across passes.
- `src/state/controllers/simulation-runner.ts`: halo finder runs every K
  physics steps (default 50). New diagnostics: `haloCount`,
  `largestHaloMass`, `starCount`, `firstIgnition`. Stars accumulate in a
  list owned by the runner; the frame runner forwards a read-only handle.
- `src/rendering/star-cloud.ts`: a sparse `THREE.Points` with per-star
  luminosity + position attributes. `aLuminosity = 0` collapses unused
  slots. White additive blending until 4b drops a bloom pass on top.
- HUD: new "halos & stars" card with halo count, largest M, star count,
  first-ignition z + M_halo (with mass-anchor hint). Amber banner appears
  when first ignition fires.
- 100 unit tests + 2 e2e green. Visual on CPU: violet DM + temperature-
  ramped gas + white star points at the centres of halos that crossed
  M_crit. GPU still DM-only (Stage 3c will lift gas to GPU, then 4 will
  port the halo finder if the budget needs it).

### 4b — bloom + in-scene annotation pins (2026-05-08)

- `src/rendering/scene.ts`: postprocessing pipeline now goes
  RenderPass → UnrealBloomPass → OutputPass via an `EffectComposer`. The
  bloom threshold (0.78) is tuned high enough that DM violet sprites and
  most gas don't bloom; the white star core (additive, intensity → 1.0)
  crosses the threshold and gets a soft halo. `loop.ts` now renders
  through `composer.render()` and gained an `onRender(scene)` hook so the
  DOM overlay can sync to the latest camera each frame.
- `src/ui/mass-anchor.ts`: pulled the "≈ dwarf-galaxy seed" lookup out of
  the HUD so the pins, the HUD, and the future end-of-run summary all
  share one source of truth (EXPERIENCE.md §3).
- `src/ui/annotation-pin-builder.ts`: pure helpers `buildPins` +
  `projectWorldToViewport`. Splitting the pure surface from the React
  component keeps fast-refresh happy and makes the projection contract
  unit-testable (it's just `THREE.Vector3.project()` plus an NDC→viewport
  flip — but a regression here would silently mis-place every pin).
- `src/ui/AnnotationPins.tsx`: the overlay component. React renders a
  `<div>` per pin and exposes an imperative `updatePinScreenPositions`
  handle that the render loop calls every frame to set
  `style.transform = translate3d(u·W, v·H, 0)`. No React state in the hot
  path; the only renders happen when `pins[]` itself changes (label
  mass anchor changes when the largest halo shifts buckets, or the
  ignition window flips visible→hidden).
- Snapshot extension: `largestHaloCentre: {x, y, z} | null` and
  `firstIgnition.{x, y, z}` so the pin overlay has a 3D anchor without
  reaching back into the runner. GPU snapshot keeps both null until 4
  ports the halo finder GPU-side.
- Ignition window lifecycle: a `useEffect` listens for
  `diagnostics.firstIgnition` becoming non-null, schedules a
  3-second `setTimeout` that flips `visible: false`, and is keyed off the
  ignition reference so it survives sim re-render flutter. Wall-clock
  timer is intentional — pin lifetime shouldn't stretch when the user
  changes sim speed.
- Tests: 4 new (mass-anchor buckets + formatter; buildPins; projection
  axis/centre/behind). 112 unit + 2 e2e green.

#### Acceptance status

- [x] Stars look like glowing sources (UnrealBloomPass at threshold 0.78,
      strength 0.85, radius 0.55 — selective on the bright star core).
- [x] In-scene "← largest halo · M☉ · ≈ dwarf-galaxy seed" pin tracks the
      most massive halo's centre live (updated each frame via the camera
      projection; React only re-renders when the label changes bucket).
- [x] First-ignition pin appears at the ignition position with z and
      M_halo + mass-anchor, fades after 3 seconds.
- [x] Existing visual paths (DM violet, gas temperature ramp, box frame)
      unchanged. Bloom threshold high enough that DM/gas don't smear.
- [ ] Cooling, H₂ network, J_LW dependence, FoF cooling test, halo-mass
      fn, no-DM regression — still TODO; come in 4c (cooling) and 4d
      (acceptance suite + visual checkpoint).

### 4c — H₂ cooling channel (2026-05-08)

- `src/physics/cooling.ts`: low-density H₂ cooling rate Λ_LD(T) using
  the Galli & Palla 1998 polynomial fit (eq. 26) — clamped at 100 K and
  1.2×10⁴ K so the integrator can't read off the fit window. Returned in
  proper CGS (erg cm³ s⁻¹) so the function is testable against literature
  values without unit gymnastics. `applyCoolingStep` is a forward-Euler
  step that converts code-u → K, evaluates Λ, applies dT/dt = −(γ−1) Λ
  n_H x_H₂ / k_B, and returns code-u with a CMB floor at 2.7 K so
  finite-precision drift can't push gas into negative pressure.
  `subcycleCooling` caps substeps at 8 with a 0.1 t_cool CFL — runaway
  cooling in dense halo cores otherwise destabilises the macro step.
- Code↔physical unit adapter: `GasCoolingUnits` carries kelvinPerCodeU,
  nHCgsPerCodeRho, secondsPerCodeTime. Defaults are calibrated for the
  cosmological-mode IC: u₀ = 5×10⁻⁴ → T ≈ 150 K, mean SPH density →
  cosmic-baryon n_H at z = 50, dt = 1.2×10⁻³ → 0.2 Myr. 4c2 will derive
  these from box-size + cosmology config rather than treating them as
  free.
- Stand-in H₂ fraction: `approximateH2Fraction(J_LW, baseline)` uses the
  Kulkarni+2021 LW-suppression shape `1 + 4·J_LW^0.47` to scale the
  baseline (default 10⁻³). Holds steady per-particle for v1; the full
  Saslaw-Zipoy network is deferred to 4c2.
- Simulation runner: gas internal-energy update grew a cooling pass after
  the adiabatic step. New config knobs (`coolingEnabled`, gas unit
  conversions, `gasH2BaselineFraction`) are wired to typed defaults.
  Snapshot adds `gasMinInternalEnergy`, `gasMinTemperatureK`,
  `coolingMaxSubsteps`, `coolingCappedThisStep` so the HUD can show
  whether anything actually got cold (and the developer can see when the
  subcycler hit the cap).
- HUD: gas card now shows `T_min` in Kelvin alongside u_max / u_0.
- 22 new unit tests (Λ monotonicity, fit window, x_H₂ ↘ as J_LW ↗, code↔K
  round-trip, Euler step monotonic descent, x_H₂=0 no-op, ρ=0 no-op, CMB
  floor on aggressive overstep, subcycle ≈ Euler in slow regime). 128
  total + 2 e2e green.

#### Acceptance status (after 4c)

- [x] Λ_H₂ at sample T = {100, 1000, 5000} K reproduces published Galli-
      Palla values within the literature-fit tolerance.
- [x] Cooling integration in the SPH energy step with subcycling cap.
- [x] LW background suppresses x_H₂ via the same `1 + 4 J_LW^0.47` factor
      that governs M_crit — keeps the "more LW → harder to form stars"
      story coherent across modules.
- [ ] J_LW = 100 ignition-delay regression (Δz ≥ 5) — needs a longer
      integration test; deferred to 4d.
- [ ] No-DM regression (Ω_DM = 0 → no halos by z = 10) — also 4d.
- [ ] Saslaw-Zipoy H₂ tracker with formation/dissociation channels — 4c2.
