import { describe, expect, it } from "vitest";
import { Entity } from "../data/types";
import {
  KILLER_PASS_DIST_M,
  KILLER_PASS_RT_MS,
  SCAN_FOV_DEG,
  classifyError,
  score,
  scoreHidetoshi,
} from "./scoring";

/** Build a synthetic 23-entity ground truth on a 10m grid for tests. */
function truth23(): Entity[] {
  const e: Entity[] = [];
  for (let i = 0; i < 11; i++) {
    e.push({ id: `A${i}`, kind: "ally",  pos: { x: -20 + i * 4, z: -10 } });
    e.push({ id: `E${i}`, kind: "enemy", pos: { x: -20 + i * 4, z:  10 } });
  }
  e.push({ id: "BALL", kind: "ball", pos: { x: 0, z: 0 } });
  return e;
}

describe("score()", () => {
  it("returns 100 coord-accuracy on perfect placement", () => {
    const t = truth23();
    const r = score(t, t);
    expect(r.iq.coordAccuracy).toBe(100);
    expect(r.iq.infoRetention).toBe(100);
    expect(r.averageErrorCm).toBeLessThan(1);
    expect(r.placedCount).toBe(23);
    expect(r.totalTruthCount).toBe(23);
    expect(r.missing).toHaveLength(0);
  });

  it("reflects partial placement in infoRetention", () => {
    const t = truth23();
    const placed = t.slice(0, 10); // half the field
    const r = score(placed, t);
    expect(r.iq.infoRetention).toBe(Math.round((10 / 23) * 100));
    expect(r.placedCount).toBe(10);
    expect(r.missing.length).toBe(13);
  });

  it("decays coord-accuracy smoothly with error", () => {
    const t = truth23();
    // Shift everything 2m in x → 200cm avg error.
    const placed = t.map((e) => ({
      ...e,
      pos: { x: e.pos.x + 2, z: e.pos.z },
    }));
    const r = score(placed, t);
    expect(r.averageErrorCm).toBeCloseTo(200, 0);
    // exp(-200/280) ≈ 0.49 → ~49.
    expect(r.iq.coordAccuracy).toBeGreaterThan(40);
    expect(r.iq.coordAccuracy).toBeLessThan(60);
  });

  it("withholds peripheral when no yaw samples are given", () => {
    const r = score(truth23(), truth23());
    expect(r.iq.peripheralReaction).toBeNull();
    expect(r.peripheral).toBeNull();
  });

  it("computes peripheralReaction when the user only looked at one bearing", () => {
    const t = truth23();
    // User stared straight ahead the whole scan → most entities end up in
    // the peripheral pool (only the 0° column is "viewed").
    const yawSamples = new Array(60).fill(0);
    const r = score(t, t, { yawSamples, observer: { x: 0, z: 0 } });
    expect(r.peripheral).not.toBeNull();
    expect(r.peripheral!.peripheralCount).toBeGreaterThanOrEqual(3);
    // Perfect placement → exp(0)=1 → peripheralReaction = 100.
    expect(r.iq.peripheralReaction).toBe(100);
  });

  it("returns null peripheralReaction when the user scanned everywhere (no pool)", () => {
    const t = truth23();
    // Yaw covers the full circle → every entity falls inside the FOV cone
    // at some sample, so the peripheral pool is empty.
    const yawSamples: number[] = [];
    for (let i = 0; i < 360; i++) yawSamples.push((i / 180) * Math.PI);
    const r = score(t, t, { yawSamples, observer: { x: 0, z: 0 } });
    expect(r.iq.peripheralReaction).toBeNull();
    // The breakdown should still be available with peripheralCount near 0.
    expect(r.peripheral).not.toBeNull();
    expect(r.peripheral!.peripheralCount).toBeLessThan(3);
  });

  it("re-weights overall IQ when peripheral participates", () => {
    const t = truth23();
    const yawSamples = new Array(60).fill(0);
    // Place everything 1m off → coord ~64, retention 100, peripheral high.
    const placed = t.map((e) => ({ ...e, pos: { x: e.pos.x + 1, z: e.pos.z } }));
    const withP = score(placed, t, { yawSamples, observer: { x: 0, z: 0 } });
    const withoutP = score(placed, t);
    // Without peripheral: 0.7·coord + 0.3·retention.
    // With peripheral: 0.55·coord + 0.20·retention + 0.25·peripheral.
    // The two formulas must produce different overalls for the same coord/ret.
    expect(withP.iq.overall).not.toBe(withoutP.iq.overall);
    expect(withP.iq.peripheralReaction).not.toBeNull();
  });

  it("uses SCAN_FOV_DEG of 75°", () => {
    expect(SCAN_FOV_DEG).toBe(75);
  });
});

describe("classifyError()", () => {
  it("buckets at the spec thresholds", () => {
    expect(classifyError(50)).toBe("ok");
    expect(classifyError(99)).toBe("ok");
    expect(classifyError(100)).toBe("warn");
    expect(classifyError(399)).toBe("warn");
    expect(classifyError(400)).toBe("bad");
  });
});

describe("scoreHidetoshi()", () => {
  const pred = { x: 10, z: 0 };
  const truth = { x: 10, z: 0 };

  it("flags killer-pass success when both RT and error are within thresholds", () => {
    const r = scoreHidetoshi(pred, truth, KILLER_PASS_RT_MS - 1);
    expect(r.killerPassSuccess).toBe(true);
    expect(r.errorM).toBeCloseTo(0, 5);
  });

  it("rejects killer-pass when RT >= 500ms even with perfect prediction", () => {
    const r = scoreHidetoshi(pred, truth, KILLER_PASS_RT_MS);
    expect(r.killerPassSuccess).toBe(false);
  });

  it("rejects killer-pass when error >= 3m even with fast RT", () => {
    const r = scoreHidetoshi({ x: 0, z: 0 }, { x: KILLER_PASS_DIST_M, z: 0 }, 100);
    expect(r.killerPassSuccess).toBe(false);
  });

  it("predictionSpeed decays linearly from 100 at 0ms to 0 at 1500ms", () => {
    expect(scoreHidetoshi(pred, truth, 0).iq.predictionSpeed).toBe(100);
    expect(scoreHidetoshi(pred, truth, 750).iq.predictionSpeed).toBe(50);
    expect(scoreHidetoshi(pred, truth, 1500).iq.predictionSpeed).toBe(0);
    // Clamps below 0.
    expect(scoreHidetoshi(pred, truth, 3000).iq.predictionSpeed).toBe(0);
  });

  it("coordAccuracy decays exponentially with error", () => {
    const a = scoreHidetoshi({ x: 0, z: 0 }, { x: 0, z: 0 }, 100).iq.coordAccuracy;
    const b = scoreHidetoshi({ x: 0, z: 0 }, { x: 6, z: 0 }, 100).iq.coordAccuracy;
    expect(a).toBe(100);
    // exp(-6/6) ≈ 0.37 → ~37.
    expect(b).toBeGreaterThan(30);
    expect(b).toBeLessThan(45);
  });
});
