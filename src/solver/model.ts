import type { CubeState, Face } from '../core/cube';
import { mulMatVec, vecEquals, type Vec3 } from '../core/geometry';
import { parseAlgorithm, turnMatrix, type Turn } from '../core/turn';

interface ModelSticker {
  pos: Vec3;
  normal: Vec3;
  color: Face;
}

/**
 * Copia del cubo sobre la que el resolvedor puede probar movimientos. Las
 * piezas se identifican por sus colores; "resuelta" significa que cada
 * color mira hacia el centro de su mismo color (esté donde esté ese centro).
 */
export class Model {
  private constructor(private stickers: ModelSticker[]) {}

  static of(cube: CubeState): Model {
    return new Model(cube.stickerList());
  }

  clone(): Model {
    return new Model(this.stickers.map((s) => ({ ...s })));
  }

  apply(turns: Turn | readonly Turn[] | string): this {
    const list = typeof turns === 'string' ? parseAlgorithm(turns) : Array.isArray(turns) ? turns : [turns as Turn];
    for (const turn of list) {
      const matrix = turnMatrix(turn);
      for (const s of this.stickers) {
        if (!turn.layers.includes(s.pos[turn.axis])) continue;
        s.pos = mulMatVec(matrix, s.pos);
        s.normal = mulMatVec(matrix, s.normal);
      }
    }
    return this;
  }

  /** Hacia dónde mira el centro de un color. */
  centerOf(color: Face): Vec3 {
    const center = this.stickers.find((s) => s.color === color && s.pos.filter((v) => v === 0).length === 2)!;
    return center.normal;
  }

  /** Posición actual de la pieza con exactamente estos colores. */
  find(colors: readonly Face[]): Vec3 {
    const byPos = new Map<string, ModelSticker[]>();
    for (const s of this.stickers) {
      const key = s.pos.join(',');
      byPos.set(key, [...(byPos.get(key) ?? []), s]);
    }
    for (const stickers of byPos.values()) {
      if (stickers.length === colors.length && colors.every((c) => stickers.some((s) => s.color === c))) return stickers[0].pos;
    }
    throw new Error(`No existe la pieza ${colors.join('')}`);
  }

  /** Hacia dónde mira el color `color` de la pieza con colores `colors`. */
  facing(colors: readonly Face[], color: Face): Vec3 {
    const pos = this.find(colors);
    return this.stickers.find((s) => vecEquals(s.pos, pos) && s.color === color)!.normal;
  }

  /** ¿Está la pieza en su sitio y bien orientada? */
  isSolved(colors: readonly Face[]): boolean {
    return colors.every((color) => vecEquals(this.facing(colors, color), this.centerOf(color)));
  }

  /** ¿Está la pieza en su sitio, aunque esté girada? */
  isPlaced(colors: readonly Face[]): boolean {
    return vecEquals(this.find(colors), this.home(colors));
  }

  /** Posición que le corresponde a una pieza según los centros. */
  home(colors: readonly Face[]): Vec3 {
    return colors.map((c) => this.centerOf(c)).reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]] as Vec3);
  }

  signature(): string {
    const key = (s: ModelSticker) => [...s.pos, ...s.normal].join(',');
    return [...this.stickers]
      .sort((a, b) => (key(a) < key(b) ? -1 : 1))
      .map((s) => s.color)
      .join('');
  }
}
