import * as THREE from "three";
import { PITCH } from "../data/types";

/** Pluggable stadium provider. Phase 1 returns a procedural pitch.
 *  Phase 3 can swap in a PLATEAU glTF / 3D Tiles loader without changing
 *  the calling code. */
export interface StadiumProvider {
  build(scene: THREE.Scene): THREE.Object3D;
}

export class MockStadium implements StadiumProvider {
  build(scene: THREE.Scene): THREE.Object3D {
    const root = new THREE.Group();

    // Sky / ambience
    scene.background = new THREE.Color("#04090f");
    scene.fog = new THREE.Fog("#04090f", 60, 240);

    // Ground (the pitch)
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

    // Field lines
    root.add(buildFieldLines());

    // Floodlight key light
    const sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(40, 80, 30);
    scene.add(sun);

    const ambient = new THREE.AmbientLight(0x405070, 0.7);
    scene.add(ambient);

    // Tribune silhouette — thin dark walls so the player has spatial reference.
    const wallMat = new THREE.MeshStandardMaterial({ color: "#0a1426", roughness: 1 });
    const longWallGeom = new THREE.BoxGeometry(PITCH.length + 30, 14, 1);
    const shortWallGeom = new THREE.BoxGeometry(1, 14, PITCH.width + 24);
    const w1 = new THREE.Mesh(longWallGeom, wallMat); w1.position.set(0, 7, -PITCH.width / 2 - 12);
    const w2 = new THREE.Mesh(longWallGeom, wallMat); w2.position.set(0, 7, PITCH.width / 2 + 12);
    const w3 = new THREE.Mesh(shortWallGeom, wallMat); w3.position.set(-PITCH.length / 2 - 15, 7, 0);
    const w4 = new THREE.Mesh(shortWallGeom, wallMat); w4.position.set(PITCH.length / 2 + 15, 7, 0);
    root.add(w1, w2, w3, w4);

    scene.add(root);
    return root;
  }
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
