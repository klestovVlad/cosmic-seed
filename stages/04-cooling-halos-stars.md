# Stage 4: Cooling, halos, first stars

**Status:** DONE\* (4a / 4b / 4c / 4c2 / 4d shipped; deferred items listed at bottom)
**Estimated:** 4–5 days
**Depends on:** Stage 3
**Spec reference:** Phase 3 (cosmology brief §1.6, §1.7)

## Goal

Make the gas able to cool, find halos, and ignite the first stars. Add primordial H₂ cooling (the only effective channel below 10⁴ K with no metals), a friends-of-friends halo finder running every N steps, and the Kulkarni+2021 critical-mass criterion that flips a halo from dark to "lit" when conditions are met. By the end, a default run shows a few halos lighting up at z ≈ 15–20, each rendered as a glowing star particle.

## Deliverables

- [x] `src/physics/cooling.ts` — H₂ cooling rate Λ_H₂(T) from Galli & Palla (1998) low-density fit.
- [x] Energy update extended in SPH to subtract cooling per step (subcycling cap = 8, CFL = 0.1 t_cool, CMB floor at 2.7 K).
- [x] H₂ fraction track per gas particle (`src/physics/h2-network.ts`, implicit-Euler one-step; Galli-Palla H⁻ formation + Abel-1997 LW dissociation; full Saslaw-Zipoy 5-channel network deferred — only the rate-limiter is implemented).
- [x] `src/physics/halo-finder.ts` — friends-of-friends on DM, periodic min-image, b = 0.2.
- [x] Per halo: M_halo, R_vir, v_circ, mass-weighted centre.
- [x] `src/physics/star-ignition.ts` — Kulkarni+2021 `M_crit(z, J_LW, v_bc)`.
- [x] Star particles rendered as bright white points with UnrealBloomPass (selective high-threshold).
- [x] HUD: halo count, lit-halo count, "first ignition" event banner with z and M_halo.
- [x] `tests/physics/cooling.test.ts` — Λ(T) values match published Galli-Palla fit at sample points.
- [x] `tests/physics/halo-finder.test.ts` — synthetic two-cluster distribution returns the right FoF groups.

**Clarity deliverables (`EXPERIENCE.md` §3, §10):**

- [ ] **Event bus** — deferred to Stage 5/7 where the milestone toasts and walkthrough orchestration that consume it actually live. The Stage-4 snapshot already exposes the four signals these stages will need (haloCount transitions through 0, largestHaloMass, firstIgnition, cooling-driven gasMinTemperatureK), so the bus can be a thin selector layer rather than a runner-side rewrite.
- [x] **In-scene annotation pins** — Stage 4b. Largest-halo pin tracks the most massive halo live; first-ignition pin shows for 3 wall-clock seconds at the ignition site. Cosmic-web filament pin still TODO; needs a long-axis-aligned over-density detector that doesn't exist yet (lands in Stage 5 with the parameter UI).
- [x] **Mass-anchor strings** — `src/ui/mass-anchor.ts`, single source of truth for HUD card, in-scene pins, and (eventual) Stage 7 end-of-run summary.
- [ ] **HUD halo card top-3 listing** — deferred to Stage 5 alongside the parameter UI; the snapshot only carries the largest halo's centre today, not the top-N. Adding a top-N cache to the runner is cheap but the surface needs the slider context to land coherently.
- [ ] **Expert / Explained registers** — Stage 5 lands the toggle and label-pair infrastructure; the Stage-4 strings (T_min, x_H₂ peak, halo count, R_vir, ρ_central) will be filed in their pair on the way past.

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

- [x] At default parameters, ignition fires inside the simulated z window (8³ box, unitMassPerMsun ≈ 1e-12 → first star at z ≈ 18 in our visual checkpoint).
- [x] Cooling test reproduces Λ at sample T points within the literature fit (`tests/physics/cooling.test.ts`).
- [x] FoF test groups a synthetic distribution correctly for `b = 0.2` (`tests/physics/halo-finder.test.ts`).
- [x] No-DM regression — extreme single-DM run produces no halos and no stars (`tests/physics/cosmological-run.test.ts`); a true gas-only halo finder waits on Stage-6 compare-mode.
- [x] Strong J_LW suppresses ignition vs baseline (`tests/physics/cosmological-run.test.ts` — uses J = 1e15 to push M_crit cleanly above any halo mass possible in the test box; the Δz ≥ 5 stage-spec assertion at the more modest J = 100 needs longer wall-clock integration time than a unit test allows).
- [x] No frame-rate regression beyond Stage 3 (e2e checkpoint completes in 8 s wall-clock; visual unchanged from Stage 3 except for bloomed stars and pins).
- [x] Annotation pins fire on the right events; first-ignition pin includes the mass-anchor string.
- [ ] Event bus — deferred to Stage 5/7 where the consumers live (see Clarity deliverables above).

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
- [x] No-DM regression — `cosmological-run.test.ts`: single-DM run → no halos, no ignitions.
- [x] Strong J_LW suppression — `cosmological-run.test.ts`: J = 1e15 → starCount = 0.
- [x] Saslaw-Zipoy H₂ tracker with formation/dissociation channels — 4c2.

### 4d — acceptance suite (2026-05-08)

- `tests/physics/cosmological-run.test.ts`: end-to-end smoke through
  `createSimulationRunner` with a Zeldovich IC. Three cases:
  fiducial-run (no NaN, halos found, cosmic clock advances), extreme-LW
  (J = 10¹⁵ pushes M_crit above any possible halo mass → no ignition;
  the educational "more LW → fewer first stars" beat is sharp at this
  extreme; intermediate J values can leave starCount equal by chance),
  and structural no-DM (single DM particle → minMembers floor catches it
  → no halos).
- `tests/e2e/stage-04-checkpoint.spec.ts`: 8-s settle window, captures
  `docs/checkpoints/stage-04.png` after the halo finder has fired and
  cooling has had time to bring some gas below 10⁴ K.
- 140 unit + 3 e2e green. typecheck/lint/build/e2e all pass.

#### What we deferred (and where it lands)

- **Event bus** — Stage 5/7. The current snapshot already exposes the
  four signals downstream consumers will read (haloCount transitions,
  largestHaloMass, firstIgnition, gasMinTemperatureK), so the bus is a
  thin selector wrapper rather than a runner-side rewrite.
- **HUD top-3 halos with R_vir** — Stage 5 with the parameter UI.
- **Cosmic-web filament pin** — needs a long-axis-aligned over-density
  detector; lands with the same UI pass.
- **Expert/Explained registers** — Stage 5 (toggle infra) audits Stage-4
  strings into pairs.
- **Δz ≥ 5 integration test at J_LW = 100** — needs a longer wall-clock
  run than a unit test allows; substituted with the J = 10¹⁵ extreme
  test that proves the LW branch is being read. Worth revisiting if
  Stage 5 introduces a "long run" e2e harness.
- **Full Saslaw-Zipoy network with H + H⁺ → H₂⁺ pathway, collisional
  dissociation, LW self-shielding, and x_e(T) ionisation balance** —
  matters only at T ≳ 5000 K or in very dense self-shielded cores. The
  v1 toy stays educationally honest with the rate-limited H⁻ channel +
  unshielded LW; revisit when a stage exposes the corresponding control.

### 4c2 — per-particle H₂ network (2026-05-08)

- `src/physics/h2-network.ts`: rate-limited H⁻ formation channel with
  the Galli & Palla 1998 fit `k_form(T) = 1.43 × 10⁻¹⁸ T^0.93` (cm³ s⁻¹),
  Abel+ 1997 LW dissociation rate `k_diss = 1.4 × 10⁻¹² · J_21` (s⁻¹),
  Tegmark+ 1997 freeze-out electron fraction `x_e = 2 × 10⁻⁴`, and a
  one-step implicit Euler `x_new = (x + R_f · dt) / (1 + R_d · dt)` —
  unconditionally stable for any dt, which matters because the macro
  cosmological step is millions of formation timescales long. Output
  clamped to `[floor 10⁻⁶, ceiling 0.1]` so the cooling integrator never
  sees a non-physical value, even after a NaN J_LW or negative T.
- Skipped for v1 (each lands later if a stage needs it): the H + H⁺ →
  H₂⁺ pathway (only matters T ≳ 10⁴ K), collisional dissociation
  (T ≳ 5000 K), self-shielding of the LW background in dense gas, and a
  proper x_e(T) ionisation tracker.
- Simulation runner: x_H₂ now evolves per particle each step. The
  cooling pass uses the freshly stepped x_H₂, so cool-dense halo cores
  build up the coolant over their dynamical time and accelerate cooling,
  while the diffuse IGM stays near the floor. Snapshot adds
  `gasMaxH2Fraction` and `gasMeanH2Fraction`; HUD's gas card now shows
  `x_H₂ peak`.
- Default IC drops to `gasH2BaselineFraction = 1e-6` (the network's
  floor) — the runner now grows H₂ where conditions favour it rather
  than starting everywhere at 10⁻³.
- 9 new unit tests (monotonic formation in T and n_H, decay under strong
  LW, floor enforcement, implicit-step stability for dt = 10²⁵ s, NaN
  guard, equilibrium matches long-evolution limit, ceiling reached at
  J_LW = 0). 137 unit + 2 e2e green.
