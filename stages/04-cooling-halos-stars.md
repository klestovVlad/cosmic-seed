# Stage 4: Cooling, halos, first stars

**Status:** TODO
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

_(filled during work)_
