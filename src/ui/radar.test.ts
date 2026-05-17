import { describe, expect, it } from "vitest";
import { loadBests, updateBests } from "./radar";

describe("loadBests / updateBests", () => {
  it("returns all-null when nothing is stored", () => {
    expect(loadBests()).toEqual({
      coordAccuracy: null,
      predictionSpeed: null,
      infoRetention: null,
      peripheralReaction: null,
    });
  });

  it("records new bests when nothing is stored yet", () => {
    const after = updateBests({ coordAccuracy: 80, infoRetention: 60 });
    expect(after.coordAccuracy).toBe(80);
    expect(after.infoRetention).toBe(60);
    expect(after.predictionSpeed).toBeNull();
    expect(after.peripheralReaction).toBeNull();
  });

  it("only overwrites when the new value exceeds the existing best", () => {
    updateBests({ coordAccuracy: 80 });
    updateBests({ coordAccuracy: 75 });        // lower — should be ignored
    expect(loadBests().coordAccuracy).toBe(80);
    updateBests({ coordAccuracy: 90 });        // higher — should win
    expect(loadBests().coordAccuracy).toBe(90);
  });

  it("ignores null entries in the partial update", () => {
    updateBests({ coordAccuracy: 70, predictionSpeed: 50 });
    updateBests({ coordAccuracy: null, predictionSpeed: 60 });
    const r = loadBests();
    expect(r.coordAccuracy).toBe(70);    // untouched
    expect(r.predictionSpeed).toBe(60);  // raised
  });

  it("persists across loadBests calls (round-trip via storage)", () => {
    updateBests({ peripheralReaction: 42 });
    const a = loadBests();
    const b = loadBests();
    expect(a).toEqual(b);
    expect(b.peripheralReaction).toBe(42);
  });
});
