import { describe, expect, it } from "vitest";
import { generateScenario, pickWeather } from "./scenario";
import { WEATHER_KINDS } from "./weather";

describe("generateScenario()", () => {
  it("is deterministic for a given seed", () => {
    const a = generateScenario(12345);
    const b = generateScenario(12345);
    expect(a).toEqual(b);
  });

  it("produces 11 allies + 11 enemies + 1 ball", () => {
    const s = generateScenario(7);
    expect(s.entities.filter((e) => e.kind === "ally")).toHaveLength(11);
    expect(s.entities.filter((e) => e.kind === "enemy")).toHaveLength(11);
    expect(s.entities.filter((e) => e.kind === "ball")).toHaveLength(1);
  });

  it("attaches a valid weather kind", () => {
    const s = generateScenario(7);
    expect(WEATHER_KINDS).toContain(s.weather);
  });

  it("places the ball within the central third of the pitch", () => {
    const s = generateScenario(7);
    const ball = s.entities.find((e) => e.kind === "ball")!;
    expect(Math.abs(ball.pos.x)).toBeLessThan(40);
    expect(Math.abs(ball.pos.z)).toBeLessThan(30);
  });
});

describe("pickWeather()", () => {
  it("returns a WeatherKind for any rand value", () => {
    for (let i = 0; i < 100; i++) {
      const r = i / 100;
      const w = pickWeather(() => r);
      expect(WEATHER_KINDS).toContain(w);
    }
  });

  it("hits 'clear' below 0.5 and the alts above", () => {
    expect(pickWeather(() => 0)).toBe("clear");
    expect(pickWeather(() => 0.49)).toBe("clear");
    expect(pickWeather(() => 0.5)).toBe("fog");
    expect(pickWeather(() => 0.66)).toBe("rain");
    expect(pickWeather(() => 0.99)).toBe("backlight");
  });
});
