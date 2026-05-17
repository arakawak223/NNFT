import { describe, expect, it } from "vitest";
import { positionAt, snapshotAt, velocityAt } from "./physics";

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
