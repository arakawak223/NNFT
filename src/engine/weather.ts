import * as THREE from "three";

/** Difficulty filter applied on top of the stadium scene. Seeded per
 *  scenario/clip so a given seed always replays under the same conditions.
 *
 *  - `clear`     : nominal lighting + light haze.
 *  - `fog`       : exponential fog dropping visibility to ~50m. Tests
 *                  memory rather than acuity since distant entities fade.
 *  - `rain`      : moderate linear fog + falling rain particles. Visual
 *                  noise; pitch turf is darker to simulate wet grass.
 *  - `backlight` : low-angle warm sun shining ~toward the camera. Silhouette
 *                  conditions — colors are harder to read at distance. */
export type WeatherKind = "clear" | "fog" | "rain" | "backlight";

export const WEATHER_KINDS: WeatherKind[] = ["clear", "fog", "rain", "backlight"];

export const WEATHER_LABEL_JA: Record<WeatherKind, string> = {
  clear:     "晴天",
  fog:       "濃霧",
  rain:      "降雨",
  backlight: "逆光",
};

export interface WeatherHandle {
  /** Per-frame tick — moves particles, etc. Receives elapsed-since-start
   *  in ms so behaviour is independent of frame rate. */
  update(elapsedMs: number): void;
  dispose(): void;
}

/** Mutates `scene` to reflect `kind`. Caller has already built the
 *  stadium with default fog/lights; we override them. Returns a handle
 *  whose `update` must be called from the render loop and whose
 *  `dispose` removes any particle systems / extra lights. */
export function applyWeather(scene: THREE.Scene, kind: WeatherKind): WeatherHandle {
  switch (kind) {
    case "clear":     return applyClear(scene);
    case "fog":       return applyFog(scene);
    case "rain":      return applyRain(scene);
    case "backlight": return applyBacklight(scene);
  }
}

function applyClear(scene: THREE.Scene): WeatherHandle {
  scene.background = new THREE.Color("#04090f");
  scene.fog = new THREE.Fog("#04090f", 60, 240);
  return noopHandle();
}

function applyFog(scene: THREE.Scene): WeatherHandle {
  scene.background = new THREE.Color("#1a232e");
  // density 0.022 → ~25% visibility at 50m, near-total occlusion past 120m.
  scene.fog = new THREE.FogExp2("#2a3744", 0.022);
  // Boost ambient so the close-by pitch is still readable; cool gray tint.
  const ambient = new THREE.AmbientLight(0x8090a0, 0.55);
  scene.add(ambient);
  return {
    update: () => {},
    dispose: () => { scene.remove(ambient); ambient.dispose?.(); },
  };
}

function applyRain(scene: THREE.Scene): WeatherHandle {
  scene.background = new THREE.Color("#0d141c");
  scene.fog = new THREE.Fog("#1c2530", 40, 180);

  // Rain rig: ~600 short vertical segments cycling top→bottom inside a
  // cylindrical volume centered above origin. Cheap, frame-rate stable.
  const RAIN_COUNT = 600;
  const VOLUME_R = 80;
  const VOLUME_TOP = 60;
  const VOLUME_BOTTOM = 0;
  const STREAK_LEN = 1.2;

  const positions = new Float32Array(RAIN_COUNT * 6); // 2 vertices per streak
  const speeds = new Float32Array(RAIN_COUNT);        // m/s
  const seeds = new Float32Array(RAIN_COUNT);         // initial Y offset
  for (let i = 0; i < RAIN_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * VOLUME_R;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y0 = VOLUME_BOTTOM + Math.random() * (VOLUME_TOP - VOLUME_BOTTOM);
    positions[i * 6 + 0] = x;
    positions[i * 6 + 1] = y0;
    positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x;
    positions[i * 6 + 4] = y0 - STREAK_LEN;
    positions[i * 6 + 5] = z;
    speeds[i] = 38 + Math.random() * 14; // 38–52 m/s
    seeds[i] = y0;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0x9fb3c8,
    transparent: true,
    opacity: 0.55,
  });
  const rain = new THREE.LineSegments(geom, mat);
  rain.frustumCulled = false;
  scene.add(rain);

  // Wet ambient — slightly darker, cool.
  const ambient = new THREE.AmbientLight(0x3a4a5e, 0.45);
  scene.add(ambient);

  const update = (elapsedMs: number) => {
    const tSec = elapsedMs / 1000;
    const arr = positions;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const span = VOLUME_TOP - VOLUME_BOTTOM;
      // Cycle Y between TOP and BOTTOM at this streak's speed.
      const yTop = ((seeds[i] - tSec * speeds[i]) % span + span) % span + VOLUME_BOTTOM;
      arr[i * 6 + 1] = yTop;
      arr[i * 6 + 4] = yTop - STREAK_LEN;
    }
    geom.attributes.position.needsUpdate = true;
  };

  return {
    update,
    dispose: () => {
      scene.remove(rain);
      scene.remove(ambient);
      geom.dispose();
      mat.dispose();
    },
  };
}

function applyBacklight(scene: THREE.Scene): WeatherHandle {
  // Warm dawn/dusk look. Sun is low and ahead, so distant players become
  // silhouettes that are harder to color-classify.
  scene.background = new THREE.Color("#1a0e08");
  scene.fog = new THREE.Fog("#2a1a10", 50, 220);

  const sun = new THREE.DirectionalLight(0xffd58a, 1.9);
  sun.position.set(120, 18, 0); // low and ahead from the observer
  scene.add(sun);

  const warmAmbient = new THREE.AmbientLight(0xff8a4a, 0.45);
  scene.add(warmAmbient);

  // A subtle hemisphere fill so the upward-facing surfaces don't crush.
  const hemi = new THREE.HemisphereLight(0xffa86b, 0x1a0e08, 0.35);
  scene.add(hemi);

  return {
    update: () => {},
    dispose: () => {
      scene.remove(sun); scene.remove(warmAmbient); scene.remove(hemi);
    },
  };
}

function noopHandle(): WeatherHandle {
  return { update: () => {}, dispose: () => {} };
}
