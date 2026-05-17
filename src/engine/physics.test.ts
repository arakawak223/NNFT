import { describe, expect, it } from "vitest";
import {
  MAX_ACCEL_M_S2,
  MAX_SPRINT_M_S,
  positionAt,
  snapshotAt,
  velocityAt,
} from "./physics";

describe("positionAt()", () => {
  it("returns the starting position at dt=0", () => {
    const p = positionAt({ pos: { x: 5, z: -3 }, vel: { x: 4, z: 0 } }, 0);
    expect(p).toEqual({ x: 5, z: -3 });
  });

  it("integrates constant velocity over 3 seconds", () => {
    const p = positionAt({ pos: { x: 0, z: 0 }, vel: { x: 5, z: 0 } }, 3000);
    expect(p.x).toBeCloseTo(15, 5);
    expect(p.z).toBeCloseTo(0, 5);
  });

  it("applies uniform acceleration with the 1/2·a·t² term", () => {
    const p = positionAt(
      { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, acc: { x: 2, z: 0 } },
      2000
    );
    // x = 0 + 0·2 + 0.5·2·4 = 4
    expect(p.x).toBeCloseTo(4, 5);
  });
});

describe("velocityAt()", () => {
  it("returns initial velocity when no acceleration", () => {
    expect(velocityAt({ pos: { x: 0, z: 0 }, vel: { x: 6, z: -1 } }, 2000))
      .toEqual({ x: 6, z: -1 });
  });

  it("applies a·t under uniform acceleration", () => {
    const v = velocityAt(
      { pos: { x: 0, z: 0 }, vel: { x: 1, z: 0 }, acc: { x: 2, z: -1 } },
      3000
    );
    expect(v.x).toBeCloseTo(7, 5);
    expect(v.z).toBeCloseTo(-3, 5);
  });
});

describe("snapshotAt()", () => {
  it("returns a new state forwarded by deltaMs", () => {
    const e = { pos: { x: 0, z: 0 }, vel: { x: 5, z: 0 } };
    const s = snapshotAt(e, 1000);
    expect(s.pos).toEqual({ x: 5, z: 0 });
    expect(s.vel).toEqual({ x: 5, z: 0 });
    // Original untouched.
    expect(e.pos).toEqual({ x: 0, z: 0 });
  });
});

describe("realism caps", () => {
  it("caps initial velocity magnitude to MAX_SPRINT_M_S", () => {
    // Initial 2D vel = (12, 5) → magnitude 13 → should be scaled to 9.5 m/s.
    const v = velocityAt({ pos: { x: 0, z: 0 }, vel: { x: 12, z: 5 } }, 0);
    // dt=0 → no integration ticks, returns initial vel unchanged.
    // Drive a tiny step to surface the cap.
    const v1 = velocityAt({ pos: { x: 0, z: 0 }, vel: { x: 12, z: 5 } }, 50);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(13, 5); // dt=0 path: untouched
    expect(Math.hypot(v1.x, v1.z)).toBeCloseTo(MAX_SPRINT_M_S, 5);
  });

  it("caps |acc| so a 100 m/s² request behaves like MAX_ACCEL_M_S2", () => {
    // Requested acc = (100, 0). Should be clamped to (5, 0).
    // After 1s, vel should be (0+5*1, 0) = (5, 0), well below sprint cap.
    const v = velocityAt(
      { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, acc: { x: 100, z: 0 } },
      1000
    );
    expect(v.x).toBeCloseTo(MAX_ACCEL_M_S2, 4);
    expect(v.z).toBeCloseTo(0, 5);
  });

  it("speed cap holds across a long horizon under aggressive acc", () => {
    // 5 m/s² applied for 5s would give 25 m/s analytically — caps must
    // stop velocity at MAX_SPRINT_M_S no matter how long we integrate.
    const v = velocityAt(
      { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, acc: { x: MAX_ACCEL_M_S2, z: 0 } },
      5000
    );
    expect(v.x).toBeCloseTo(MAX_SPRINT_M_S, 4);
  });

  it("position respects the speed cap (no super-linear growth)", () => {
    // At MAX_ACCEL_M_S2 from rest, the runner hits MAX_SPRINT_M_S after
    // MAX_SPRINT / MAX_ACCEL = 1.9s. From there, distance grows linearly.
    // After 3s: dist = 0.5·5·1.9² + 9.5·1.1 ≈ 9.025 + 10.45 = 19.475 m.
    const p = positionAt(
      { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, acc: { x: MAX_ACCEL_M_S2, z: 0 } },
      3000
    );
    // Allow modest numerical wiggle from the discretized cap kick-in.
    expect(p.x).toBeGreaterThan(18.5);
    expect(p.x).toBeLessThan(20);
    // Compare against the un-capped analytical answer: 0.5·5·9 = 22.5 m.
    expect(p.x).toBeLessThan(22.5);
  });

  it("preserves below-cap trajectories exactly (Phase 2 compatibility)", () => {
    // 4 m/s with 0.4 lateral curl over 3s — matches the HIDETOSHI target
    // distribution. Caps must NOT engage; result must equal the
    // closed-form analytical answer.
    const p = positionAt(
      { pos: { x: 10, z: 0 }, vel: { x: 4, z: 0 }, acc: { x: 0, z: 0.4 } },
      3000
    );
    expect(p.x).toBeCloseTo(10 + 4 * 3, 5);
    expect(p.z).toBeCloseTo(0.5 * 0.4 * 9, 5);
  });
});
