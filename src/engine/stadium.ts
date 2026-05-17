import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PITCH } from "../data/types";

/** Pluggable stadium provider. `build()` synchronously seeds the scene
 *  with the basics (pitch, lines, lights) so the SCAN can start instantly,
 *  and may continue to append geometry asynchronously (PLATEAU glTF load,
 *  etc.). Returns the root group so callers can dispose later if needed. */
export interface StadiumProvider {
  build(scene: THREE.Scene): THREE.Object3D;
}

export type StadiumKind = "mock" | "plateau";

/** Decoupled helper: every stadium gets the same pitch + lighting baseline.
 *  PLATEAU geometry is decorative — the pitch itself is always procedural so
 *  game logic (player positions in meters, observer Vec2) stays valid. */
function buildBasePitch(scene: THREE.Scene): THREE.Group {
  const root = new THREE.Group();

  // Sky / ambience
  scene.background = new THREE.Color("#04090f");
  scene.fog = new THREE.Fog("#04090f", 60, 240);

  // Outer grass apron
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH.length * 1.4, PITCH.width * 1.6),
    new THREE.MeshStandardMaterial({ color: "#0d3a22", roughness: 1 })
  );
  grass.rotation.x = -Math.PI / 2;
  root.add(grass);

  // Pitch turf (slightly brighter)
  const turf = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH.length, PITCH.width),
    new THREE.MeshStandardMaterial({ color: "#15633a", roughness: 1 })
  );
  turf.rotation.x = -Math.PI / 2;
  turf.position.y = 0.01;
  root.add(turf);

  root.add(buildFieldLines());

  // Lighting
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(40, 80, 30);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0x405070, 0.7);
  scene.add(ambient);

  scene.add(root);
  return root;
}

/** Tribune silhouette walls used by the mock stadium and as the PLATEAU
 *  fallback. Extracted so PlateauStadium can drop them in on load failure. */
function buildMockTribune(): THREE.Group {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: "#0a1426", roughness: 1 });
  const longWallGeom = new THREE.BoxGeometry(PITCH.length + 30, 14, 1);
  const shortWallGeom = new THREE.BoxGeometry(1, 14, PITCH.width + 24);
  const w1 = new THREE.Mesh(longWallGeom, wallMat); w1.position.set(0, 7, -PITCH.width / 2 - 12);
  const w2 = new THREE.Mesh(longWallGeom, wallMat); w2.position.set(0, 7, PITCH.width / 2 + 12);
  const w3 = new THREE.Mesh(shortWallGeom, wallMat); w3.position.set(-PITCH.length / 2 - 15, 7, 0);
  const w4 = new THREE.Mesh(shortWallGeom, wallMat); w4.position.set(PITCH.length / 2 + 15, 7, 0);
  g.add(w1, w2, w3, w4);
  return g;
}

export class MockStadium implements StadiumProvider {
  build(scene: THREE.Scene): THREE.Object3D {
    const root = buildBasePitch(scene);
    root.add(buildMockTribune());
    return root;
  }
}

export interface PlateauOptions {
  /** glTF/glb URL — typically VITE_PLATEAU_GLTF_URL. Required. */
  url: string;
  /** Max bounding box dimension after auto-scale. Defaults to 360m
   *  (enough to surround a full pitch with stadium structure). */
  targetSpanM?: number;
  /** Called once load resolves or fails, so the UI can flash a toast.
   *  `kind` is "loaded" on success or "fallback" on failure. */
  onResult?: (kind: "loaded" | "fallback", err?: unknown) => void;
}

/** Loads a glTF/glb (intended for a PLATEAU stadium-area extract) and
 *  drops it around the pitch. The pitch itself is always procedural so
 *  no coordinate-system alignment is needed — the model is auto-centered
 *  on origin and scaled to fit `targetSpanM`. On any failure (no URL,
 *  network error, parse error) the mock tribune is appended instead. */
export class PlateauStadium implements StadiumProvider {
  constructor(private opts: PlateauOptions) {}

  build(scene: THREE.Scene): THREE.Object3D {
    const root = buildBasePitch(scene);
    const url = this.opts.url;
    if (!url) {
      root.add(buildMockTribune());
      this.opts.onResult?.("fallback", new Error("VITE_PLATEAU_GLTF_URL not set"));
      return root;
    }

    const loader = new GLTFLoader();
    loader
      .loadAsync(url)
      .then((gltf) => {
        const obj = gltf.scene;
        normalizeStadiumTransform(obj, this.opts.targetSpanM ?? 360);
        root.add(obj);
        this.opts.onResult?.("loaded");
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[PlateauStadium] glTF load failed, using mock tribune:", err);
        root.add(buildMockTribune());
        this.opts.onResult?.("fallback", err);
      });

    return root;
  }
}

/** Center the model at origin, sit it on Y=0, scale so its longest
 *  horizontal axis matches `targetSpanM`. Defensive: PLATEAU exports
 *  vary in coord system & units. */
function normalizeStadiumTransform(obj: THREE.Object3D, targetSpanM: number) {
  const bbox = new THREE.Box3().setFromObject(obj);
  if (bbox.isEmpty()) return;
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const span = Math.max(size.x, size.z);
  if (span > 0 && isFinite(span)) {
    const scale = targetSpanM / span;
    obj.scale.setScalar(scale);
    bbox.setFromObject(obj);
  }
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  // Center in X/Z; lift so the model's bottom sits on Y=0.
  obj.position.x -= center.x;
  obj.position.z -= center.z;
  obj.position.y -= bbox.min.y;
}

/** Resolve a stadium provider from a string kind + env URL. Used by
 *  the top-level orchestrator so individual modes don't have to know
 *  about PLATEAU config. */
export function makeStadium(
  kind: StadiumKind,
  plateauUrl: string | undefined,
  onResult?: PlateauOptions["onResult"]
): StadiumProvider {
  if (kind === "plateau" && plateauUrl) {
    return new PlateauStadium({ url: plateauUrl, onResult });
  }
  return new MockStadium();
}

function buildFieldLines() {
  const g = new THREE.Group();
  const lineMat = new THREE.LineBasicMaterial({ color: 0xeaf3ff, transparent: true, opacity: 0.85 });
  const y = 0.02;

  const rect = (x1: number, z1: number, x2: number, z2: number) => {
    const pts = [
      new THREE.Vector3(x1, y, z1),
      new THREE.Vector3(x2, y, z1),
      new THREE.Vector3(x2, y, z2),
      new THREE.Vector3(x1, y, z2),
      new THREE.Vector3(x1, y, z1),
    ];
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  };

  // Outer
  rect(-PITCH.length / 2, -PITCH.width / 2, PITCH.length / 2, PITCH.width / 2);
  // Halfway line
  g.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, y, -PITCH.width / 2),
        new THREE.Vector3(0, y, PITCH.width / 2),
      ]),
      lineMat
    )
  );
  // Center circle
  const circle = new THREE.BufferGeometry();
  const circlePts: THREE.Vector3[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    circlePts.push(new THREE.Vector3(Math.cos(a) * 9.15, y, Math.sin(a) * 9.15));
  }
  circle.setFromPoints(circlePts);
  g.add(new THREE.Line(circle, lineMat));

  // Penalty boxes (16.5m deep, 40.32m wide)
  rect(-PITCH.length / 2, -20.16, -PITCH.length / 2 + 16.5, 20.16);
  rect(PITCH.length / 2 - 16.5, -20.16, PITCH.length / 2, 20.16);
  // Goal boxes (5.5m, 18.32m)
  rect(-PITCH.length / 2, -9.16, -PITCH.length / 2 + 5.5, 9.16);
  rect(PITCH.length / 2 - 5.5, -9.16, PITCH.length / 2, 9.16);

  return g;
}
