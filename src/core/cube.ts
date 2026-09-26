import { mulMatVec, vecEquals, type Mat3, type Vec3 } from './geometry';
import { turnMatrix, type Turn } from './turn';

export type Face = 'U' | 'D' | 'F' | 'B' | 'R' | 'L';

export const FACES: readonly Face[] = ['U', 'D', 'F', 'B', 'R', 'L'];

/** Dirección hacia la que mira cada cara del cubo resuelto. */
export const FACE_NORMALS: Record<Face, Vec3> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

export interface Sticker {
  /** Posición de la pieza que lleva la pegatina. */
  pos: Vec3;
  /** Hacia dónde mira la pegatina. */
  normal: Vec3;
  /** Color, identificado por la cara a la que pertenece en el cubo resuelto. */
  readonly color: Face;
}

/** Estado lógico del cubo: las 54 pegatinas con su posición y orientación. */
export class CubeState {
  private stickers: Sticker[] = [];

  constructor() {
    this.reset();
  }

  reset(): void {
    this.stickers = [];
    for (const face of FACES) {
      const normal = FACE_NORMALS[face];
      const axis = normal.findIndex((v) => v !== 0);
      for (const a of [-1, 0, 1]) {
        for (const b of [-1, 0, 1]) {
          const pos = [0, 0, 0];
          pos[axis] = normal[axis];
          pos[(axis + 1) % 3] = a;
          pos[(axis + 2) % 3] = b;
          this.stickers.push({ pos: pos as unknown as Vec3, normal, color: face });
        }
      }
    }
  }

  applyTurn(turn: Turn): void {
    const matrix = turnMatrix(turn);
    for (const sticker of this.stickers) {
      if (turn.layers.includes(sticker.pos[turn.axis])) this.rotateSticker(sticker, matrix);
    }
  }

  /** Rota el cubo entero (cambia desde dónde lo miras, no lo desordena). */
  applyRotation(rotation: Mat3): void {
    for (const sticker of this.stickers) this.rotateSticker(sticker, rotation);
  }

  isSolved(): boolean {
    return Object.values(FACE_NORMALS).every((normal) => {
      const colors = new Set(this.stickers.filter((s) => vecEquals(s.normal, normal)).map((s) => s.color));
      return colors.size === 1;
    });
  }

  /** Color de la pegatina que hay en `pos` mirando hacia `normal`. */
  colorAt(pos: Vec3, normal: Vec3): Face | undefined {
    return this.stickers.find((s) => vecEquals(s.pos, pos) && vecEquals(s.normal, normal))?.color;
  }

  private rotateSticker(sticker: Sticker, matrix: Mat3): void {
    sticker.pos = mulMatVec(matrix, sticker.pos);
    sticker.normal = mulMatVec(matrix, sticker.normal);
  }
}
