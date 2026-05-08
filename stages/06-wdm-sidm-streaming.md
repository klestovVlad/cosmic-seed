# Stage 6: WDM, SIDM, streaming velocity

**Status:** TODO
**Estimated:** 3–5 days
**Depends on:** Stage 5
**Spec reference:** Phase 5 (cosmology brief §1.3, §1.8, §1.9, §2)

## Goal

Add the three "alternative dark matter / coupling" knobs that give the project its pedagogical punch: warm dark matter (free-streaming cutoff in the power spectrum), self-interacting dark matter (cusp-core softening via collisional scattering), and streaming velocity (suprasonic relative motion of baryons vs DM after recombination). With these, the user can answer the qualitative questions Stern leaves open.

## Deliverables

- [ ] `src/physics/transfer-wdm.ts` — Bode+2001 transfer function `T_WDM²(k) = (1 + (αk)^(2ν))^(−10/ν)`, ν = 1.12, α = α(m_WDM, Ω_DM, h).
- [ ] WDM toggle wires through to `power-spectrum.ts`: `P_used(k) = P_CDM(k) · T_WDM²(k)` when enabled.
- [ ] WDM thermal velocities optionally added at IC (free-streaming velocity dispersion).
- [ ] `src/physics/sidm.ts` — local-rate scattering: each step, for each DM particle, probability `p = ρ · σ/m · v_rel · dt` of an isotropic momentum exchange with a random neighbour. Vectorised in a compute shader.
- [ ] Streaming velocity in baryon IC: scalar field `V_bc` (long-coherence Gaussian) added to gas particle velocities at z_init. Decays as `1/(1+z)` automatically through comoving evolution.
- [ ] UI: "Dark matter type" dropdown (CDM / WDM / SIDM), `m_WDM` slider, `σ/m` slider, `v_bc` slider.
- [ ] **Compare mode** (firm, not stretch — `EXPERIENCE.md` §8). Two viewports side-by-side, same seed, two parameter sets, synchronised playback. Both viewports share the time strip, scale bar, and walkthrough state. The simulation runner is doubled (one per side) but each only runs at half perf budget.
- [ ] Built-in comparison presets accessible from the Compare panel:
  - "Standard universe" vs "No dark matter" (Stern's central claim).
  - "CDM" vs "WDM 2 keV" (cutoff in halo mass function).
  - "v_bc = 0" vs "v_bc = 60 km/s" (streaming-velocity delay).
  - "User-defined A/B" — two URL-shareable runs.
- [ ] `tests/physics/wdm-transfer.test.ts` — T_WDM at sample k matches Bode+2001 table.
- [ ] `tests/physics/sidm-conservation.test.ts` — SIDM scattering conserves momentum and energy.

## Implementation steps

1. **WDM transfer function.** Implement Bode+2001 formula. Compute α from `α = 0.049 · (m_WDM / 1 keV)^(−1.11) · (Ω_DM / 0.25)^0.11 · (h / 0.7)^1.22 Mpc/h`.
2. **Plug into IC.** In `power-spectrum.ts`, multiply by `T_WDM²(k)` when `params.dmType === 'WDM'`. Document the choice in the function docstring.
3. **WDM thermal velocities (optional).** Add per-particle isotropic Gaussian velocity with σ from Bode+2001 thermal-relic formula. Default off behind a checkbox — slows things visually.
4. **SIDM scattering.** GPU compute pass: for each DM particle, look up nearest neighbour from the SPH grid, compute relative velocity, apply scattering probability. If accepted, draw a random isotropic direction in the centre-of-mass frame and rotate `v_rel` accordingly. Conservation by construction.
5. **Streaming velocity.** Add a `V_bc` 3-vector to the IC parameters. Apply a single coherent shift to gas particle velocities at start. (We're not modelling the spatial coherence pattern in v1 — single-bulk-flow approximation, documented.)
6. **UI.** Group all three under "Dark matter & coupling". Show derived quantities live: WDM cut-off mass `M_fs`, SIDM scattering rate at virial, suprasonic Mach number for v_bc.
7. **Compare mode** — firm (`EXPERIENCE.md` §8). Split-canvas, two `SimulationRunner` instances, synchronised time and camera. Each side reads its own slice of `parametersStore` (the store grows a second slot for "B"). Mobile collapses to stacked vertical viewports. The top of each viewport gets a small badge with the parameter difference ("CDM" / "WDM 2 keV").
8. **Tests.** Integration: WDM with m = 1 keV produces visibly fewer small halos than CDM at z = 10 (count halos < 10⁵ M_sun, expect drop > 50 %). SIDM with σ/m = 1 cm²/g produces visibly cored halos (central density profile flattens vs NFW within 0.2 R_vir).

## Acceptance criteria (Definition of Done)

- [ ] WDM at m = 2 keV reproduces a noticeably suppressed halo count at z = 10 vs CDM (quantitatively: at least 30 % fewer halos below 10⁶ M_sun).
- [ ] SIDM at σ/m = 1 cm²/g produces a flatter central density profile vs CDM at the same seed.
- [ ] v_bc = 60 km/s delays first ignition by Δz ≥ 3 vs v_bc = 0.
- [ ] All four cells of the truth table (CDM/WDM × low/high v_bc) run without errors.
- [ ] Compare mode runs two viewports synchronously at the budget below.
- [ ] All four built-in compare presets work end-to-end and produce the qualitative differences described above.
- [ ] No frame-rate regression beyond Stage 5 in the CDM path.

## Test plan

- **Unit:** WDM transfer function reproduces Bode+2001 at sample k values.
- **Unit:** SIDM scattering conserves momentum/energy to floating-point error.
- **Integration:** halo count comparison, CDM vs WDM-2keV at fixed seed.
- **Integration:** central density profile, CDM vs SIDM-1.0 at fixed seed.
- **Visual checkpoint:** A/B screenshot at z = 10, saved to `docs/checkpoints/stage-06.png`.

## Performance budget

- SIDM pass < 1 ms/step.
- Compare-runs view: each side ≥ 30 fps with 5 k DM + 2.5 k gas.

## Notes / learnings

_(filled during work)_
