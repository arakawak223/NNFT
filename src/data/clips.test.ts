import { describe, expect, it } from "vitest";
import { generateClip } from "./clips";
import { WEATHER_KINDS } from "../engine/weather";

describe("generateClip()", () => {
  it("is deterministic for a given seed", () => {
    const a = generateClip(2026);
    const b = generateClip(2026);
    expect(a).toEqual(b);
  });

  it("freezeAtMs is in the 5–9s killer-pass window", () => {
    for (let s = 1; s < 50; s++) {
      const c = generateClip(s);
      expect(c.freezeAtMs).toBeGreaterThanOrEqual(5000);
      expect(c.freezeAtMs).toBeLessThan(9000);
    }
  });

  it("predictionDeltaMs is the spec-mandated 3 seconds", () => {
    expect(generateClip(0).predictionDeltaMs).toBe(3000);
  });

  it("targetEntityId points at an entity in the clip", () => {
    const c = generateClip(99);
    expect(c.entities.find((e) => e.id === c.targetEntityId)).toBeTruthy();
  });

  it("target ally has a clear forward velocity", () => {
    const c = generateClip(99);
    const target = c.entities.find((e) => e.id === c.targetEntityId)!;
    expect(target.kind).toBe("ally");
    expect(target.vel!.x).toBeGreaterThan(3.5); // strong forward run
  });

  it("attaches a valid weather kind", () => {
    const c = generateClip(99);
    expect(WEATHER_KINDS).toContain(c.weather);
  });
});
