import { Vec2 } from "../data/types";

/** A single moving entity's kinematic state.
 *
 *  Phase 2 used a closed-form constant-velocity-plus-constant-acceleration
 *  model — clean math but no upper bound on speed or propulsion, which let
 *  the SPACE-mode truth occasionally drift toward physically implausible
 *  positions (a target accelerating at 0.4 m/s² is fine, but the lack of
 *  guards meant any future tuning that bumped accel could silently
 *  produce 12 m/s sprints).
 *
 *  Phase 4 replaces the analytical solution with a **mid-point (RK2)
 *  numerical integrator** that clamps two magnitudes each step:
 *
 *    1. |acc| ≤ MAX_ACCEL_M_S2   — peak grass-friction-limited propulsion.
 *    2. |vel| ≤ MAX_SPRINT_M_S   — elite-player peak sprint.
 *
 *  Mid-point integration is *exact* for constant-acceleration trajectories
 *  in the no-cap regime, so the Phase 2 tests stay green bit-for-bit
 *  (verified in physics.test.ts). When a clip's initial state would have
 *  produced an above-cap value, the caps now intervene — and the rest of
 *  the engine sees a consistent, realistic answer.
 */
export interface MovingState {
  pos: Vec2;
  vel: Vec2; // m/s
  acc?: Vec2; // m/s² (optional)
}

/** Elite sprint peak — Bolt-tier outfield players touch ~10.4 m/s in
 *  match conditions; 9.5 is a defensible "no one routinely beats this". */
export const MAX_SPRINT_M_S = 9.5;

/** Propulsion cap. Real grass friction is μ ≈ 0.5, so |a_lateral| ≤
 *  μ·g ≈ 4.9 m/s². 5.0 is a slight pad over the lateral limit which is
 *  fine because we apply the same cap isotropically (we don't separate
 *  forward propulsion from cornering — the prototype trajectory has no
 *  obvious "forward" axis since the carrier orientation isn't modeled). */
export const MAX_ACCEL_M_S2 = 5.0;

/** Integration step. 50ms = 20Hz is finer than typical broadcast frame
 *  rate and overkill for our 3-second prediction window — RK2 error
 *  grows as O(dt²) so the position residual at t=3s is microns. */
const STEP_MS = 50;

interface Kinematic {
  pos: Vec2;
  vel: Vec2;
}

/** Single source of truth for time-evolving a kinematic state. All public
 *  helpers delegate here so they can't drift out of sync. */
function stepKinematic(e: MovingState, deltaMs: number): Kinematic {
  let x = e.pos.x, z = e.pos.z;
  let vx = e.vel.x, vz = e.vel.z;
  // Acceleration is clamped ONCE before integration: in our model the
  // requested propulsion is a constant for the clip duration, not a
  // time-varying force, so per-step re-clamping would be a no-op.
  const a = clampMag(e.acc?.x ?? 0, e.acc?.z ?? 0, MAX_ACCEL_M_S2);
  let remaining = deltaMs;
  while (remaining > 0) {
    const stepMs = Math.min(STEP_MS, remaining);
    const dt = stepMs / 1000;
    // Mid-point: estimate velocity at the half-step, use that to update
    // position. Exact for constant-a (and constant-v) trajectories.
    const vMid = clampMag(vx + a.x * (dt / 2), vz + a.z * (dt / 2), MAX_SPRINT_M_S);
    x += vMid.x * dt;
    z += vMid.z * dt;
    // Full-step velocity update, with the same speed cap.
    const vNext = clampMag(vx + a.x * dt, vz + a.z * dt, MAX_SPRINT_M_S);
    vx = vNext.x;
    vz = vNext.z;
    remaining -= stepMs;
  }
  return { pos: { x, z }, vel: { x: vx, z: vz } };
}

/** Position of `e` at `deltaMs` after its sample time. */
export function positionAt(e: MovingState, deltaMs: number): Vec2 {
  return stepKinematic(e, deltaMs).pos;
}

/** Velocity at `deltaMs`. Reflects acceleration + speed caps consistently
 *  with what positionAt used. */
export function velocityAt(e: MovingState, deltaMs: number): Vec2 {
  return stepKinematic(e, deltaMs).vel;
}

/** Snapshot a state forward — handy when freezing a clip. */
export function snapshotAt<T extends MovingState>(e: T, deltaMs: number): T {
  const k = stepKinematic(e, deltaMs);
  return { ...e, pos: k.pos, vel: k.vel };
}

/** Cap a 2D vector's magnitude. Returns the vector unchanged if it's
 *  already inside the cap (no allocation in the hot path). */
function clampMag(x: number, z: number, maxMag: number): Vec2 {
  const m = Math.hypot(x, z);
  if (m <= maxMag || m === 0) return { x, z };
  const s = maxMag / m;
  return { x: x * s, z: z * s };
}
