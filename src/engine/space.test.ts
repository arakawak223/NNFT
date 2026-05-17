import { describe, expect, it } from "vitest";
import { MovingEntity } from "../data/clips";
import { computeOpenSpace, findCarrier, MAX_ALLY_RUN_M_S } from "./space";

/** Build a clip-shaped fixture by hand so we can reason about the answer. */
function fixture(opts: {
  ball: { x: number; z: number };
  allies: { x: number; z: number; vx?: number; vz?: number }[];
  enemies: { x: number; z: number; vx?: number; vz?: number }[];
}): MovingEntity[] {
  const entities: MovingEntity[] = [];
  opts.allies.forEach((a, i) =>
    entities.push({
      id: `A${i}`,
      kind: "ally",
      pos: { x: a.x, z: a.z },
      vel: { x: a.vx ?? 0, z: a.vz ?? 0 },
    })
  );
  opts.enemies.forEach((e, i) =>
    entities.push({
      id: `E${i}`,
      kind: "enemy",
      pos: { x: e.x, z: e.z },
      vel: { x: e.vx ?? 0, z: e.vz ?? 0 },
    })
  );
  entities.push({
    id: "BALL",
    kind: "ball",
    pos: opts.ball,
    vel: { x: 0, z: 0 },
  });
  return entities;
}

describe("findCarrier()", () => {
  it("picks the ally closest to the ball at the freeze tick", () => {
    const ents = fixture({
      ball: { x: 0, z: 0 },
      allies: [
        { x: 30, z: 0 },   // far
        { x: 1, z: 0 },    // closest
        { x: -20, z: 5 },
      ],
      enemies: [],
    });
    const c = findCarrier(ents, 0);
    expect(c.id).toBe("A1");
  });
});

describe("computeOpenSpace()", () => {
  const FREEZE = 1000;
  const DELTA  = 3000;

  it("returns a Vec2 in front of the carrier", () => {
    // Carrier at midfield, no enemies → the algorithm should still pick a
    // point forward of the carrier (xMin == carrier.x in the search).
    const ents = fixture({
      ball: { x: 0, z: 0 },
      allies: [
        { x: 0, z: 0 },
        { x: 10, z: 5 },
      ],
      enemies: [
        { x: 40, z: 0 }, // single distant enemy
      ],
    });
    const r = computeOpenSpace(ents, FREEZE, DELTA);
    expect(r.truth.x).toBeGreaterThanOrEqual(r.carrierPos.x);
    expect(r.marginM).toBeGreaterThan(0);
  });

  it("steers the truth away from a tight enemy cluster", () => {
    // Cluster of enemies at z = +15. The optimal pocket should be at the
    // opposite z side.
    const ents = fixture({
      ball: { x: 0, z: 0 },
      allies: [
        { x: 0, z: 0 },                 // carrier
        { x: 10, z: -15, vx: 4 },       // forward-left runner
        { x: 10, z:  15, vx: 4 },       // forward-right runner
      ],
      enemies: [
        { x: 20, z: 12 },
        { x: 22, z: 14 },
        { x: 24, z: 16 },
        { x: 20, z: 18 },
      ],
    });
    const r = computeOpenSpace(ents, FREEZE, DELTA);
    // The space must be much further from the enemy cluster than from
    // the open side.
    expect(r.truth.z).toBeLessThan(0); // opposite side of cluster
    expect(r.marginM).toBeGreaterThan(10);
  });

  it("respects ally reachability — unreachable cells are excluded", () => {
    // Single ally at (0,0). The optimal cell SHOULD be inside a circle of
    // radius MAX_ALLY_RUN_M_S * 3 = 25.5m around (0,0).
    const ents = fixture({
      ball:    { x: 0, z: 0 },
      allies:  [{ x: 0, z: 0 }],
      enemies: [{ x: 60, z: 0 }], // far away to push the optimum forward
    });
    const r = computeOpenSpace(ents, FREEZE, DELTA);
    const reach = MAX_ALLY_RUN_M_S * (DELTA / 1000);
    const distFromAlly = Math.hypot(r.truth.x - 0, r.truth.z - 0);
    expect(distFromAlly).toBeLessThanOrEqual(reach + 1e-6);
  });

  it("is deterministic for the same input", () => {
    const ents = fixture({
      ball:   { x: 0, z: 0 },
      allies: [{ x: 0, z: 0 }, { x: 10, z: -5, vx: 3 }],
      enemies:[{ x: 25, z: 10 }, { x: 20, z: -8 }],
    });
    const a = computeOpenSpace(ents, FREEZE, DELTA);
    const b = computeOpenSpace(ents, FREEZE, DELTA);
    expect(a).toEqual(b);
  });

  it("returns the reachable cell grid alongside the truth", () => {
    const ents = fixture({
      ball:    { x: 0, z: 0 },
      allies:  [{ x: 0, z: 0 }, { x: 10, z: 5 }],
      enemies: [{ x: 25, z: 0 }, { x: 20, z: -8 }],
    });
    const r = computeOpenSpace(ents, FREEZE, DELTA);
    // Some cells must be returned and they must agree with consideredCount.
    expect(r.cells.length).toBeGreaterThan(0);
    expect(r.cells.length).toBe(r.consideredCount);
    // Every cell should have a finite margin and lie within the search box.
    for (const c of r.cells) {
      expect(Number.isFinite(c.marginM)).toBe(true);
      expect(c.marginM).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeGreaterThanOrEqual(r.carrierPos.x - 0.5);
    }
    // The truth cell's margin must equal the max over the grid.
    const maxMargin = r.cells.reduce((m, c) => Math.max(m, c.marginM), 0);
    expect(r.marginM).toBe(maxMargin);
  });
});
