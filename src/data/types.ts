/** Pitch-local coordinates in meters. Origin at the center mark.
 *  +x toward the opponent goal, +z toward the right sideline (player POV). */
export interface Vec2 {
  x: number;
  z: number;
}

export type EntityKind = "ally" | "enemy" | "ball";

export interface Entity {
  id: string;
  kind: EntityKind;
  pos: Vec2;
}

/** Standard FIFA-spec pitch: 105m x 68m. */
export const PITCH = {
  length: 105, // along x
  width: 68, // along z
} as const;

export type AppRoute =
  | { name: "title" }
  | { name: "shunsuke" }
  | { name: "hidetoshi" };
