import * as THREE from "three";
import { Entity, PITCH } from "../../data/types";
import { Scenario } from "../../engine/scenario";
import { MockStadium, StadiumProvider } from "../../engine/stadium";
import { OrientationController } from "../../engine/orientation";
import { KIND_COLOR, PLAYER_HEIGHT_M, buildBallMesh, buildPlayerMesh } from "../../engine/meshes";

const EYE_HEIGHT_M = 1.65;

export interface ScanResult {
  /** ms the user actually saw the scene before blackout. */
  durationMs: number;
  /** Yaw (rad) sampled once per rendered frame for peripheral-vision
   *  scoring. ~60 samples over a 1s scan. */
  yawSamples: number[];
}

export interface ScanOptions {
  durationMs?: number;
  stadium?: StadiumProvider;
  onTick?: (remainingMs: number) => void;
  onComplete?: (r: ScanResult) => void;
}

/** First-person scan view. Renders the scenario for `durationMs`,
 *  lets the user yaw/pitch with drag or gyro, then resolves. */
export class ScanView {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private orient: OrientationController;
  private rafId = 0;
  private running = false;
  private startedAt = 0;
  private durationMs: number;
  private yawSamples: number[] = [];

  constructor(
    private container: HTMLElement,
    scenario: Scenario,
    private opts: ScanOptions = {}
  ) {
    this.durationMs = opts.durationMs ?? 1000;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.resize();
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    (opts.stadium ?? new MockStadium()).build(this.scene);

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 600);
    // The observer stands at scenario.observer; eye at EYE_HEIGHT_M.
    this.camera.position.set(scenario.observer.x, EYE_HEIGHT_M, scenario.observer.z);

    this.populate(scenario.entities);

    this.orient = new OrientationController(this.renderer.domElement, scenario.observerHeading);
    // Fire-and-forget — gyro permission only really matters on iOS Safari.
    this.orient.enableGyro().catch(() => {});

    window.addEventListener("resize", this.resize);
  }

  start() {
    this.running = true;
    this.startedAt = performance.now();
    const tick = () => {
      if (!this.running) return;
      const elapsed = performance.now() - this.startedAt;
      const remaining = Math.max(0, this.durationMs - elapsed);
      this.opts.onTick?.(remaining);

      // Apply orientation to camera.
      const { yaw, pitch } = this.orient.state;
      this.yawSamples.push(yaw);
      // Default forward is +x, so build a quaternion for yaw around +y.
      const dir = new THREE.Vector3(
        Math.cos(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.sin(yaw) * Math.cos(pitch)
      );
      this.camera.lookAt(this.camera.position.clone().add(dir));

      this.renderer.render(this.scene, this.camera);

      if (remaining <= 0) {
        this.stop();
        this.opts.onComplete?.({ durationMs: elapsed, yawSamples: this.yawSamples.slice() });
        return;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  destroy() {
    this.stop();
    this.orient.destroy();
    window.removeEventListener("resize", this.resize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private populate(entities: Entity[]) {
    for (const e of entities) {
      const mesh = e.kind === "ball" ? buildBallMesh() : buildPlayerMesh(KIND_COLOR[e.kind]);
      mesh.position.set(e.pos.x, e.kind === "ball" ? 0.11 : PLAYER_HEIGHT_M / 2, e.pos.z);
      this.scene.add(mesh);
    }
  }

  private resize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  };
}

export const PITCH_DIMS = PITCH;
