import * as THREE from "three";
import { Clip, MovingEntity } from "../../data/clips";
import { positionAt } from "../../engine/physics";
import { MockStadium } from "../../engine/stadium";
import { KIND_COLOR, PLAYER_HEIGHT_M, buildBallMesh, buildPlayerMesh } from "../../engine/meshes";

export interface ClipPlayOptions {
  onFreeze: () => void;
  onTick?: (elapsedMs: number, totalMs: number) => void;
}

/** Plays a Clip with a tactical broadcast camera (high, behind one sideline)
 *  until `clip.freezeAtMs`, then calls onFreeze. */
export class ClipPlayer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private meshes = new Map<string, THREE.Object3D>();
  private targetRing!: THREE.Mesh;
  private rafId = 0;
  private startedAt = 0;
  private running = false;

  constructor(
    private container: HTMLElement,
    private clip: Clip,
    private opts: ClipPlayOptions
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.resize();

    this.scene = new THREE.Scene();
    new MockStadium().build(this.scene);

    // Tactical broadcast angle — high above one sideline.
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 800);
    this.camera.position.set(0, 70, 60);
    this.camera.lookAt(0, 0, 0);

    for (const e of clip.entities) {
      const m = e.kind === "ball" ? buildBallMesh() : buildPlayerMesh(KIND_COLOR[e.kind]);
      m.position.set(e.pos.x, e.kind === "ball" ? 0.11 : PLAYER_HEIGHT_M / 2, e.pos.z);
      this.scene.add(m);
      this.meshes.set(e.id, m);
    }

    // Pulsing target highlight.
    this.targetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.95, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffb84a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      })
    );
    this.targetRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.targetRing);

    window.addEventListener("resize", this.resize);
  }

  start() {
    this.running = true;
    this.startedAt = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  destroy() {
    this.stop();
    window.removeEventListener("resize", this.resize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private tick = () => {
    if (!this.running) return;
    const elapsed = performance.now() - this.startedAt;

    for (const e of this.clip.entities) {
      const m = this.meshes.get(e.id);
      if (!m) continue;
      const p = positionAt(e, elapsed);
      m.position.x = p.x;
      m.position.z = p.z;
    }
    const target = this.clip.entities.find((e) => e.id === this.clip.targetEntityId)!;
    const tp = positionAt(target as MovingEntity, elapsed);
    const s = 1 + 0.18 * Math.sin(elapsed * 0.008);
    this.targetRing.position.set(tp.x, 0.05, tp.z);
    this.targetRing.scale.set(s, s, s);

    this.opts.onTick?.(elapsed, this.clip.freezeAtMs);
    this.renderer.render(this.scene, this.camera);

    if (elapsed >= this.clip.freezeAtMs) {
      this.stop();
      this.opts.onFreeze();
      return;
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  private resize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}
