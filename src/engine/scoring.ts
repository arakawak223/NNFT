import { Entity, EntityKind, Vec2 } from "../data/types";

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
  /** Reference benchmark — Shunsuke/Hidetoshi prime ≈ 100. */
  legendBenchmark: number;
}

export function score(placed: Entity[], truth: Entity[]): ScoreReport {
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

  const iq = {
    coordAccuracy,
    infoRetention,
    predictionSpeed: null,
    peripheralReaction: null,
    overall: Math.round((coordAccuracy * 0.7 + infoRetention * 0.3)),
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
    legendBenchmark: 100,
  };
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
