import { MovingEntity } from "../data/clips";
import { PITCH, Vec2 } from "../data/types";
import { positionAt } from "./physics";

/** Open-space prediction for HIDETOSHI's `predictionTarget === "space"`
 *  clips. Spec: "3秒後にチームが支配する最大スペース" — find the patch of
 *  pitch that:
 *
 *    1. Is reachable by AT LEAST ONE ally within deltaMs (we approximate
 *       max ally run speed at MAX_ALLY_REACH_M/S, so reach radius =
 *       MAX_ALLY_REACH_M_S * deltaMs/1000 meters from the ally's
 *       position at the freeze moment).
 *    2. Maximizes the distance to the nearest enemy at t = freezeAt +
 *       deltaMs (so the receiver isn't immediately pressed on the ball).
 *    3. Lies within the pitch and ahead of the carrier (the ball-side
 *       attacking direction).
 *
 *  The chosen cell is the truth the user is graded against. Grid is
 *  coarse (1m) because the killer-pass tolerance is meters anyway, and
 *  exhaustive search keeps the math trivial.
 *
 *  This is deliberately NOT a probabilistic pitch-control surface
 *  (Spearman 2018 et al.). The grid heuristic is enough to produce a
 *  defensible answer for prototype training. */

/** Hard cap on how fast we assume an ally can run. ~8.5 m/s ≈ 30 km/h is
 *  generous (peak sprint of elite outfield players), so the reachability
 *  filter is permissive. */
export const MAX_ALLY_RUN_M_S = 8.5;

/** Search grid step in meters. 1m is fine for ~3m killer-pass tolerance. */
const GRID_STEP_M = 1;

/** How far ahead of the carrier we look. The receiver's run is forward;
 *  passing backward isn't a "killer pass". */
const FORWARD_REACH_M = 38;

export interface OpenSpaceCell {
  /** Cell center (x, z) in pitch coords. */
  x: number;
  z: number;
  /** min(dist to nearest enemy) at this cell in the future tick. */
  marginM: number;
}

export interface OpenSpaceResult {
  /** The optimal cell at `t = freezeAt + deltaMs`. */
  truth: Vec2;
  /** min(dist to nearest enemy) at the truth cell, in meters. Higher =
   *  more open. */
  marginM: number;
  /** Position of the ball-carrier at freeze time, used for visualization
   *  and for "forward of the carrier" filtering. */
  carrierPos: Vec2;
  /** How many candidate cells were considered after reachability + bounds
   *  filtering. Mostly diagnostic. */
  consideredCount: number;
  /** All reachable cells with their margins. Used by REVEAL to paint a
   *  heatmap so the user sees the full "pitch control" landscape behind
   *  the chosen truth cell. Unreachable cells are NOT included to keep
   *  the payload small (~1k cells in realistic scenarios). */
  cells: OpenSpaceCell[];
}

/** Find the carrier — the ally entity closest to the ball at `tMs`. */
export function findCarrier(entities: MovingEntity[], tMs: number): MovingEntity {
  const ball = entities.find((e) => e.kind === "ball")!;
  const ballPos = positionAt(ball, tMs);
  let best: MovingEntity | null = null;
  let bestDist = Infinity;
  for (const e of entities) {
    if (e.kind !== "ally") continue;
    const p = positionAt(e, tMs);
    const d = Math.hypot(p.x - ballPos.x, p.z - ballPos.z);
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best!;
}

export function computeOpenSpace(
  entities: MovingEntity[],
  freezeAtMs: number,
  deltaMs: number
): OpenSpaceResult {
  const tFuture = freezeAtMs + deltaMs;
  const carrier = findCarrier(entities, freezeAtMs);
  const carrierFreeze = positionAt(carrier, freezeAtMs);

  // Forward-sim enemies + allies to the future tick.
  const enemiesFuture = entities
    .filter((e) => e.kind === "enemy")
    .map((e) => positionAt(e, tFuture));
  const alliesFreeze = entities
    .filter((e) => e.kind === "ally")
    .map((e) => positionAt(e, freezeAtMs));

  const allyReachM = MAX_ALLY_RUN_M_S * (deltaMs / 1000);

  // Search bounds.
  const xMin = carrierFreeze.x; // forward only
  const xMax = Math.min(PITCH.length / 2, carrierFreeze.x + FORWARD_REACH_M);
  const zMin = -PITCH.width / 2;
  const zMax =  PITCH.width / 2;

  let best: Vec2 | null = null;
  let bestMargin = -Infinity;
  let considered = 0;
  const cells: OpenSpaceCell[] = [];

  for (let x = xMin; x <= xMax; x += GRID_STEP_M) {
    for (let z = zMin; z <= zMax; z += GRID_STEP_M) {
      // Reachability: any ally must be able to arrive within deltaMs.
      let reachable = false;
      for (const a of alliesFreeze) {
        if (Math.hypot(a.x - x, a.z - z) <= allyReachM) { reachable = true; break; }
      }
      if (!reachable) continue;

      // Margin: distance to closest enemy at the future tick.
      let minEnemy = Infinity;
      for (const e of enemiesFuture) {
        const d = Math.hypot(e.x - x, e.z - z);
        if (d < minEnemy) minEnemy = d;
      }
      considered++;
      cells.push({ x, z, marginM: minEnemy });
      if (minEnemy > bestMargin) {
        bestMargin = minEnemy;
        best = { x, z };
      }
    }
  }

  // Fallback if nothing was reachable (shouldn't happen on realistic
  // scenarios but cheap insurance): just put the truth at the carrier's
  // forward foot.
  if (!best) {
    best = { x: carrierFreeze.x + 1, z: carrierFreeze.z };
    bestMargin = 0;
  }

  return {
    truth: best,
    marginM: bestMargin,
    carrierPos: carrierFreeze,
    consideredCount: considered,
    cells,
  };
}

/** Visualization helper: GRID_STEP_M exposed so the renderer knows how
 *  large each heatmap rectangle should be in pitch coordinates. */
export const OPEN_SPACE_GRID_STEP_M = GRID_STEP_M;
