// Direct N² gravity + leapfrog Kick–Drift–Kick on the GPU.
// Three entry points share one bind group:
//
//   forceMain      — direct N² with workgroup tiling and Plummer softening
//                    (Aarseth 1963; Springel 2005 §2.1). 64-thread tiles
//                    are loaded into workgroup memory once per outer step
//                    so each force evaluation is N²/(64) global reads.
//   kickDriftMain  — half kick + drift in one dispatch.
//   kickMain       — half kick (the closing K of K-D-K).
//
// Convention: positions / velocities / accelerations stored as vec4<f32>
// (xyz + pad) so each lane is 16-byte aligned. Pad component is unused.

struct SimParams {
  count: u32,
  dt: f32,
  softening_sq: f32,
  G: f32,
  // Stage 2c2: periodic min-image gravity + comoving drift factor.
  //   boxSize  > 0 enables periodic min-image distance for the force loop
  //              and wraps positions back into [-L/2, L/2) after drift.
  //   driftScale = 1 / a²  (1 in non-cosmological mode). Multiplies the
  //              per-step displacement during kickDrift to reflect the
  //              cosmic expansion.
  boxSize: f32,
  driftScale: f32,
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read_write> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> accelerations: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> masses: array<f32>;

const WG: u32 = 64u;
// vec4 (not vec3) in workgroup memory: WGSL aligns vec3 to 16 bytes anyway,
// and some Metal backends mis-handle vec3 workgroup arrays. Storing vec4
// keeps everyone happy at no cost.
var<workgroup> tilePos: array<vec4<f32>, WG>;
var<workgroup> tileMass: array<f32, WG>;

@compute @workgroup_size(WG)
fn forceMain(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let i = gid.x;
  let n = params.count;

  // Loading our own particle even for out-of-range threads keeps the
  // workgroup-shared loads coherent — the early return must happen *after*
  // the tiled loop so every thread participates in the workgroupBarriers.
  let posI = positions[i].xyz;
  var acc = vec3<f32>(0.0, 0.0, 0.0);

  let numTiles = (n + WG - 1u) / WG;
  for (var t: u32 = 0u; t < numTiles; t = t + 1u) {
    let jGlobal = t * WG + lid.x;
    if (jGlobal < n) {
      tilePos[lid.x] = positions[jGlobal];
      tileMass[lid.x] = masses[jGlobal];
    } else {
      tilePos[lid.x] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
      tileMass[lid.x] = 0.0;
    }
    workgroupBarrier();

    let tileSize = min(WG, n - t * WG);
    let L = params.boxSize;
    let halfL = 0.5 * L;
    let periodic = L > 0.0;
    for (var k: u32 = 0u; k < tileSize; k = k + 1u) {
      var dx = tilePos[k].xyz - posI;
      // Periodic min-image: branch-free per component using `select`.
      if (periodic) {
        dx = dx - L * vec3<f32>(
          select(0.0, 1.0, dx.x > halfL) - select(0.0, 1.0, dx.x < -halfL),
          select(0.0, 1.0, dx.y > halfL) - select(0.0, 1.0, dx.y < -halfL),
          select(0.0, 1.0, dx.z > halfL) - select(0.0, 1.0, dx.z < -halfL),
        );
      }
      let r2 = dot(dx, dx) + params.softening_sq;
      let invR = inverseSqrt(r2);
      let invR3 = invR * invR * invR;
      let globalJ = t * WG + k;
      // Self-interaction is masked rather than skipped to keep the inner
      // loop branch-free on most ISAs.
      let mask = select(1.0, 0.0, i == globalJ);
      acc = acc + params.G * tileMass[k] * invR3 * dx * mask;
    }
    workgroupBarrier();
  }

  if (i < n) {
    accelerations[i] = vec4<f32>(acc, 0.0);
  }
}

@compute @workgroup_size(WG)
fn kickDriftMain(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.count) { return; }
  let halfDt = 0.5 * params.dt;
  let v = velocities[i] + accelerations[i] * halfDt;
  velocities[i] = v;
  var pos = positions[i] + v * params.dt * params.driftScale;
  // Periodic wrap into [-L/2, L/2).
  let L = params.boxSize;
  if (L > 0.0) {
    let halfL = 0.5 * L;
    pos.x = pos.x - L * floor((pos.x + halfL) / L);
    pos.y = pos.y - L * floor((pos.y + halfL) / L);
    pos.z = pos.z - L * floor((pos.z + halfL) / L);
  }
  positions[i] = pos;
}

@compute @workgroup_size(WG)
fn kickMain(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.count) { return; }
  let halfDt = 0.5 * params.dt;
  velocities[i] = velocities[i] + accelerations[i] * halfDt;
}
