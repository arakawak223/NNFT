import { Entity, PITCH, Vec2 } from "../data/types";
import { WeatherKind } from "./weather";

/** Mulberry32 PRNG so we can replay/share scenarios via a seed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Scenario {
  seed: number;
  /** Where the player (the trainee) stands during the scan. */
  observer: Vec2;
  /** Which way the observer is facing initially (radians, 0 = +x). */
  observerHeading: number;
  /** All 23 entities — 11 allies, 11 enemies, 1 ball. */
  entities: Entity[];
  /** Weather filter applied during SCAN. Seeded so a given seed always
   *  replays under the same conditions. */
  weather: WeatherKind;
}

/** Weighted selection from a 0..1 rand sample. `clear` at 50% so the
 *  default look isn't bombarded with FX every run; the other three split
 *  the remainder equally. */
export function pickWeather(rand: () => number): WeatherKind {
  const r = rand();
  if (r < 0.5)  return "clear";
  if (r < 0.66) return "fog";
  if (r < 0.83) return "rain";
  return "backlight";
}

/** Loose 4-3-3 vs 4-3-3 placement with jitter so each scenario looks
 *  match-realistic but distinct. Allies attack toward +x. */
export function generateScenario(seed = Math.floor(Math.random() * 2 ** 31)): Scenario {
  const rand = rng(seed);
  const jitter = (m: number) => (rand() * 2 - 1) * m;

  // Formation x-percentages for ally (positive direction) and enemy (mirrored).
  const allyXp = [-0.45, -0.18, -0.18, -0.18, -0.18, 0.05, 0.05, 0.05, 0.28, 0.28, 0.28];
  const enemyXp = allyXp.map((v) => -v);
  // Spread across width — these are z-percentages (-0.5 .. 0.5).
  const fourBack = [-0.32, -0.1, 0.1, 0.32];
  const threeMid = [-0.22, 0, 0.22];
  const threeFwd = [-0.22, 0, 0.22];
  const lineupZp = [
    0, // GK (centered)
    fourBack[0],
    fourBack[1],
    fourBack[2],
    fourBack[3],
    threeMid[0],
    threeMid[1],
    threeMid[2],
    threeFwd[0],
    threeFwd[1],
    threeFwd[2],
  ];

  const entities: Entity[] = [];
  for (let i = 0; i < 11; i++) {
    entities.push({
      id: `A${i}`,
      kind: "ally",
      pos: {
        x: allyXp[i] * PITCH.length + jitter(2.5),
        z: lineupZp[i] * PITCH.width + jitter(2.0),
      },
    });
    entities.push({
      id: `E${i}`,
      kind: "enemy",
      pos: {
        x: enemyXp[i] * PITCH.length + jitter(2.5),
        z: -lineupZp[i] * PITCH.width + jitter(2.0),
      },
    });
  }
  // Ball: somewhere in the central third.
  entities.push({
    id: "BALL",
    kind: "ball",
    pos: { x: jitter(20), z: jitter(15) },
  });

  // Observer: pick the most-central ally so the scene is full of action.
  const observer: Vec2 = { x: -5 + jitter(4), z: jitter(8) };
  const observerHeading = 0; // facing +x (forward)
  const weather = pickWeather(rand);

  return { seed, observer, observerHeading, entities, weather };
}
