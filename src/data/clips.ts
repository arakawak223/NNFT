import { EntityKind, PITCH, Vec2 } from "./types";
import { MovingState } from "../engine/physics";
import { WeatherKind } from "../engine/weather";
import { pickWeather } from "../engine/scenario";

export interface MovingEntity extends MovingState {
  id: string;
  kind: EntityKind;
}

export interface Clip {
  seed: number;
  /** When the clip freezes — the user starts predicting at this moment. */
  freezeAtMs: number;
  /** How far ahead to predict (spec: 3000ms = 3 seconds). */
  predictionDeltaMs: number;
  /** Initial state at t=0. */
  entities: MovingEntity[];
  /** id of the player to predict — highlighted with a ring during playback. */
  targetEntityId: string;
  /** Weather filter applied during CLIP. */
  weather: WeatherKind;
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate a procedural ~6s match-like clip with one ally making a
 *  diagonal forward run that the user must predict. Constant velocity
 *  (mostly) so the answer is analytically computable. */
export function generateClip(seed = Math.floor(Math.random() * 2 ** 31)): Clip {
  const rand = mulberry32(seed);
  const j = (m: number) => (rand() * 2 - 1) * m;

  const allyXp = [-0.42, -0.22, -0.22, -0.22, -0.22, -0.02, -0.02, -0.02, 0.22, 0.28, 0.22];
  const enemyXp = allyXp.map((v) => -v);
  const zp = [0, -0.30, -0.10, 0.10, 0.30, -0.20, 0, 0.20, -0.20, 0, 0.20];

  const entities: MovingEntity[] = [];

  for (let i = 0; i < 11; i++) {
    entities.push({
      id: `A${i}`,
      kind: "ally",
      pos: { x: allyXp[i] * PITCH.length + j(2), z: zp[i] * PITCH.width + j(2) },
      vel: { x: 0.4 + rand() * 1.2, z: j(0.8) }, // mild forward push
    });
    entities.push({
      id: `E${i}`,
      kind: "enemy",
      pos: { x: enemyXp[i] * PITCH.length + j(2), z: -zp[i] * PITCH.width + j(2) },
      vel: { x: -0.3 - rand() * 0.9, z: j(0.8) }, // mild defensive shift
    });
  }

  // Pick one of the front three (A8, A9, A10 → indices 16, 18, 20) as the target.
  const targetIdx = [16, 18, 20][Math.floor(rand() * 3)];
  const target = entities[targetIdx];
  // Strong diagonal forward run — 4–6 m/s with lateral component.
  const lateralSign = rand() < 0.5 ? -1 : 1;
  target.vel = {
    x: 4.0 + rand() * 2.0,
    z: lateralSign * (1.5 + rand() * 2.0),
  };
  // Slight inward curl to make extrapolation nontrivial.
  target.acc = { x: 0, z: -lateralSign * 0.4 };

  // Have one nearby enemy track the target — adds visual context.
  const trackingEnemyIdx = [17, 19, 21][Math.floor(rand() * 3)];
  entities[trackingEnemyIdx].vel = {
    x: target.vel.x * 0.6,
    z: target.vel.z * 0.7,
  };

  // Ball: with the carrier (a midfielder), drifting forward.
  const carrier = entities[10]; // A5 (a CM)
  const ballPos: Vec2 = { x: carrier.pos.x + j(1.5), z: carrier.pos.z + j(1.5) };
  entities.push({
    id: "BALL",
    kind: "ball",
    pos: ballPos,
    vel: { x: 1.2 + rand() * 1.5, z: j(0.5) },
  });

  // Freeze 5–9s in. Most realistic killer-pass moment.
  const freezeAtMs = 5000 + Math.floor(rand() * 4000);
  const weather = pickWeather(rand);

  return {
    seed,
    freezeAtMs,
    predictionDeltaMs: 3000,
    entities,
    targetEntityId: target.id,
    weather,
  };
}
