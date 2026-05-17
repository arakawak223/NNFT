import { Entity, EntityKind, Vec2 } from "../data/types";

/** SCAN camera FOV (deg). Matches the THREE.PerspectiveCamera in scan.ts.
 *  Half of this is the "directly viewed" cone — anything beyond is peripheral. */
export const SCAN_FOV_DEG = 75;

/** Greedy nearest-neighbor assignment between user placements and ground truth.
 *  Sufficient for 11+11+1 — Hungarian would be marginally better but adds bulk. */
function assign(placed: Entity[], truth: Entity[]) {
  const remaining = truth.slice();
  const pairs: { placed: Entity; truth: Entity; errorM: number }[] = [];
  for (const p of placed) {
    let bestIdx = -1;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const t = remaining[i];
      if (t.kind !== p.kind) continue;
      const d = dist(p.pos, t.pos);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      pairs.push({ placed: p, truth: remaining[bestIdx], errorM: bestD });
      remaining.splice(bestIdx, 1);
    }
  }
  return { pairs, missing: remaining };
}

function dist(a: Vec2, b: Vec2) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export interface PeripheralInput {
  /** Yaw (rad) sampled per frame during SCAN. */
  yawSamples: number[];
  /** Observer position the yaw was measured from. */
  observer: Vec2;
  /** Override FOV (deg). Default `SCAN_FOV_DEG`. */
  fovDeg?: number;
}

export interface PeripheralBreakdown {
  /** Truth entities that were never within the directly-viewed cone. */
  peripheralCount: number;
  /** Mean placement error (m) among the peripheral pool. */
  peripheralAvgErrorM: number;
  /** Min angular offset (deg) recorded per matched truth entity. */
  offsetsDeg: { id: string; offsetDeg: number; errorM: number; peripheral: boolean }[];
}

export interface ScoreReport {
  /** Per-piece error in cm. */
  pairs: { placed: Entity; truth: Entity; errorCm: number }[];
  /** Truth pieces that the user never placed. */
  missing: Entity[];
  averageErrorCm: number;
  medianErrorCm: number;
  placedCount: number;
  totalTruthCount: number;
  /** "Your viewpoint altitude" — the showcase metric.
   *  Spec anchors: avg 10cm → 20m,  avg 1m → 2m  (logarithmic). */
  viewpointAltitudeM: number;
  /** Vision IQ components, 0..100. Some are placeholders for Phase 2/3. */
  iq: {
    coordAccuracy: number;
    infoRetention: number;
    predictionSpeed: number | null;
    peripheralReaction: number | null;
    overall: number;
  };
  /** Optional peripheral diagnostics — present iff peripheral input was given
   *  AND the pool size was meaningful (≥3 entities). */
  peripheral: PeripheralBreakdown | null;
  /** Reference benchmark — Shunsuke/Hidetoshi prime ≈ 100. */
  legendBenchmark: number;
}

/** Statistical floor for peripheral metric — below this we return null
 *  (the user "scanned everything", no peripheral test was actually administered). */
const PERIPHERAL_MIN_POOL = 3;

export function score(
  placed: Entity[],
  truth: Entity[],
  peripheral?: PeripheralInput
): ScoreReport {
  const { pairs, missing } = assign(placed, truth);
  const errorsCm = pairs.map((p) => p.errorM * 100);
  const placedCount = placed.length;
  const totalTruthCount = truth.length;

  const averageErrorCm = errorsCm.length
    ? errorsCm.reduce((s, v) => s + v, 0) / errorsCm.length
    : 9999;
  const medianErrorCm = errorsCm.length ? median(errorsCm) : 9999;

  // Spec: 10cm → 20m,  100cm → 2m.  alt = 200 / avg_cm  (clamp 0.1..20).
  const altRaw = 200 / Math.max(averageErrorCm, 1);
  const viewpointAltitudeM = Math.max(0.1, Math.min(20, altRaw));

  // Coord accuracy: smooth fall-off, 0cm→100, 200cm→~50, 600cm→~20.
  const coordAccuracy = Math.round(100 * Math.exp(-averageErrorCm / 280));
  const infoRetention = Math.round((placedCount / totalTruthCount) * 100);

  // Peripheral — only present if we got yaw samples AND enough entities
  // landed outside the viewed cone to make the score meaningful.
  let peripheralReaction: number | null = null;
  let peripheralReport: PeripheralBreakdown | null = null;
  if (peripheral && peripheral.yawSamples.length > 0) {
    peripheralReport = computePeripheralBreakdown(pairs, peripheral);
    if (peripheralReport.peripheralCount >= PERIPHERAL_MIN_POOL) {
      // 100 at 0m avg error, ~37 at 4m, ~14 at 8m. Mirrors the per-entity
      // exp(-err/4) used in HIDETOSHI for consistency.
      peripheralReaction = Math.round(
        100 * Math.exp(-peripheralReport.peripheralAvgErrorM / 4)
      );
    } else {
      // Not enough peripheral pool — report null so the radar shows it as
      // "untested" instead of misleadingly perfect. Keep the diagnostic
      // breakdown attached so callers can still inspect it.
      peripheralReport = { ...peripheralReport };
    }
  }

  // Re-weight the overall IQ when peripheral participates.
  const overall =
    peripheralReaction != null
      ? Math.round(coordAccuracy * 0.55 + infoRetention * 0.2 + peripheralReaction * 0.25)
      : Math.round(coordAccuracy * 0.7 + infoRetention * 0.3);

  const iq = {
    coordAccuracy,
    infoRetention,
    predictionSpeed: null,
    peripheralReaction,
    overall,
  };

  return {
    pairs: pairs.map((p) => ({ placed: p.placed, truth: p.truth, errorCm: p.errorM * 100 })),
    missing,
    averageErrorCm,
    medianErrorCm,
    placedCount,
    totalTruthCount,
    viewpointAltitudeM,
    iq,
    peripheral: peripheralReport,
    legendBenchmark: 100,
  };
}

function computePeripheralBreakdown(
  pairs: { placed: Entity; truth: Entity; errorM: number }[],
  input: PeripheralInput
): PeripheralBreakdown {
  const fovDeg = input.fovDeg ?? SCAN_FOV_DEG;
  const halfFovRad = (fovDeg / 2) * (Math.PI / 180);
  const obs = input.observer;
  const samples = input.yawSamples;

  const offsetsDeg: PeripheralBreakdown["offsetsDeg"] = [];
  const peripheralErrors: number[] = [];

  for (const pair of pairs) {
    const dx = pair.truth.pos.x - obs.x;
    const dz = pair.truth.pos.z - obs.z;
    // yaw=0 points +x and yaw rotates +x → -z (see scan.ts forward vector).
    const bearing = Math.atan2(-dz, dx);
    let minOffset = Infinity;
    for (const y of samples) {
      const d = Math.abs(angleDiff(y, bearing));
      if (d < minOffset) minOffset = d;
    }
    const peripheral = minOffset > halfFovRad;
    offsetsDeg.push({
      id: pair.truth.id,
      offsetDeg: (minOffset * 180) / Math.PI,
      errorM: pair.errorM,
      peripheral,
    });
    if (peripheral) peripheralErrors.push(pair.errorM);
  }

  const peripheralAvgErrorM = peripheralErrors.length
    ? peripheralErrors.reduce((s, v) => s + v, 0) / peripheralErrors.length
    : 0;

  return {
    peripheralCount: peripheralErrors.length,
    peripheralAvgErrorM,
    offsetsDeg,
  };
}

/** Wrap to (-π, π]. */
function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function classifyError(cm: number): "ok" | "warn" | "bad" {
  if (cm < 100) return "ok";
  if (cm < 400) return "warn";
  return "bad";
}

export function countByKind(entities: Entity[]): Record<EntityKind, number> {
  const r = { ally: 0, enemy: 0, ball: 0 } as Record<EntityKind, number>;
  for (const e of entities) r[e.kind]++;
  return r;
}

function median(arr: number[]) {
  const a = arr.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// ---------- HIDETOSHI ----------

/** Spec: 判断が遅い（500ms以上など）場合は「キラーパス失敗」とみなす。 */
export const KILLER_PASS_RT_MS = 500;
/** "Body length" tolerance — within ~3m the pass still finds its man. */
export const KILLER_PASS_DIST_M = 3.0;

export interface HidetoshiReport {
  /** Distance between user prediction and physics-truth, in meters. */
  errorM: number;
  /** Time from "go" signal to first tap, in ms (0.001 ms resolution). */
  reactionMs: number;
  /** Spec: RT < 500ms AND error < ~3m == killer pass success. */
  killerPassSuccess: boolean;
  iq: {
    coordAccuracy: number;
    predictionSpeed: number;
    overall: number;
  };
  legendBenchmark: number;
}

export function scoreHidetoshi(
  prediction: Vec2,
  truth: Vec2,
  reactionMs: number
): HidetoshiReport {
  const dx = prediction.x - truth.x;
  const dz = prediction.z - truth.z;
  const errorM = Math.sqrt(dx * dx + dz * dz);

  const killerPassSuccess =
    reactionMs < KILLER_PASS_RT_MS && errorM < KILLER_PASS_DIST_M;

  // 100 at 0ms, ~67 at 500ms, ~0 at 1500ms.
  const predictionSpeed = Math.max(0, Math.min(100, Math.round(100 - reactionMs / 15)));
  // 100 at 0m, ~50 at ~4m, ~20 at ~10m.
  const coordAccuracy = Math.round(100 * Math.exp(-errorM / 6));

  return {
    errorM,
    reactionMs,
    killerPassSuccess,
    iq: {
      coordAccuracy,
      predictionSpeed,
      overall: Math.round(coordAccuracy * 0.6 + predictionSpeed * 0.4),
    },
    legendBenchmark: 100,
  };
}
