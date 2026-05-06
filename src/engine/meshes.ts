import * as THREE from "three";

export const PLAYER_HEIGHT_M = 1.78;

export const KIND_COLOR = {
  ally: 0x38e1ff,
  enemy: 0xff3a6e,
  ball: 0xffe066,
} as const;

/** Player mesh — centered at y = 0; caller positions the group with
 *  `mesh.position.y = PLAYER_HEIGHT_M / 2`. */
export function buildPlayerMesh(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, PLAYER_HEIGHT_M - 0.4, 12, 1),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      emissive: color,
      emissiveIntensity: 0.18,
    })
  );
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xffd6b5, roughness: 0.9 })
  );
  head.position.y = PLAYER_HEIGHT_M / 2 - 0.05;
  g.add(body, head);
  return g;
}

export function buildBallMesh(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 16, 12),
    new THREE.MeshStandardMaterial({
      color: 0xffe066,
      roughness: 0.5,
      emissive: 0x664a00,
      emissiveIntensity: 0.4,
    })
  );
}
