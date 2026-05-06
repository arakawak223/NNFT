import { Vec2 } from "../data/types";

/** A single moving entity's kinematic state. Phase 2 uses constant
 *  velocity (with optional uniform acceleration) — a deliberately simple
 *  closed-form model that matches the spec's "速度ベクトルから3秒後を算出".
 *  Phase 3 can swap this for grass-friction + COM models without changing
 *  the calling code. */
export interface MovingState {
  pos: Vec2;
  vel: Vec2; // m/s
  acc?: Vec2; // m/s² (optional)
}

/** Position of `e` at `deltaMs` after its sample time. */
export function positionAt(e: MovingState, deltaMs: number): Vec2 {
  const dt = deltaMs / 1000;
  const ax = e.acc?.x ?? 0;
  const az = e.acc?.z ?? 0;
  return {
    x: e.pos.x + e.vel.x * dt + 0.5 * ax * dt * dt,
    z: e.pos.z + e.vel.z * dt + 0.5 * az * dt * dt,
  };
}

/** Velocity at `deltaMs`. */
export function velocityAt(e: MovingState, deltaMs: number): Vec2 {
  const dt = deltaMs / 1000;
  return {
    x: e.vel.x + (e.acc?.x ?? 0) * dt,
    z: e.vel.z + (e.acc?.z ?? 0) * dt,
  };
}

/** Snapshot a state forward — handy when freezing a clip. */
export function snapshotAt<T extends MovingState>(e: T, deltaMs: number): T {
  return { ...e, pos: positionAt(e, deltaMs), vel: velocityAt(e, deltaMs) };
}
