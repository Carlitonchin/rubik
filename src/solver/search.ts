import type { Face } from '../core/cube';
import { mulMatVec, vecEquals, type Axis, type Mat3, type Vec3 } from '../core/geometry';
import { turnMatrix, type Turn } from '../core/turn';
import type { Model } from './model';

/** Los 18 giros de caras (cada cara: un cuarto a cada lado y media vuelta). */
export const FACE_TURNS: readonly Turn[] = ([0, 1, 2] as const).flatMap((axis) =>
  [-1, 1].flatMap((layer) => [1, -1, 2].map((quarters): Turn => ({ axis, layers: [layer], quarters }))),
);

interface TrackedSticker {
  pos: Vec3;
  normal: Vec3;
}

interface TrackedPiece {
  /** Pegatina de referencia de la pieza (la del primer color). */
  sticker: TrackedSticker;
  target: TrackedSticker;
  /** Distancia mínima (en giros) desde cada estado de la pieza hasta su sitio. */
  distances: Map<string, number>;
}

const MATRICES: readonly { turn: Turn; axis: Axis; layer: number; matrix: Mat3 }[] = FACE_TURNS.map((turn) => ({
  turn,
  axis: turn.axis,
  layer: turn.layers[0],
  matrix: turnMatrix(turn),
}));

const keyOf = (s: TrackedSticker) => `${s.pos.join(',')}|${s.normal.join(',')}`;

function moveSticker(s: TrackedSticker, axis: Axis, layer: number, matrix: Mat3): TrackedSticker {
  if (s.pos[axis] !== layer) return s;
  return { pos: mulMatVec(matrix, s.pos), normal: mulMatVec(matrix, s.normal) };
}

/** Distancia de cada estado posible de una pieza hasta su sitio (búsqueda en anchura sobre ≤24 estados). */
function distanceTable(target: TrackedSticker): Map<string, number> {
  const distances = new Map([[keyOf(target), 0]]);
  let frontier = [target];
  for (let depth = 1; frontier.length; depth++) {
    const next: TrackedSticker[] = [];
    for (const state of frontier) {
      for (const { axis, layer, matrix } of MATRICES) {
        const moved = moveSticker(state, axis, layer, matrix);
        const key = keyOf(moved);
        if (!distances.has(key)) {
          distances.set(key, depth);
          next.push(moved);
        }
      }
    }
    frontier = next;
  }
  return distances;
}

/**
 * Busca la secuencia más corta de giros de caras que deja todas las piezas
 * indicadas resueltas (IDA* con la distancia de cada pieza como estimación).
 * Solo se siguen las pegatinas de esas piezas, así que es rápido.
 */
export function shortestSolution(model: Model, pieces: readonly (readonly Face[])[], maxDepth = 8): Turn[] | null {
  const tracked: TrackedPiece[] = pieces.map((colors) => {
    const target = { pos: model.home(colors), normal: model.centerOf(colors[0]) };
    return {
      sticker: { pos: model.find(colors), normal: model.facing(colors, colors[0]) },
      target,
      distances: distanceTable(target),
    };
  });

  const states = tracked.map((piece) => piece.sticker);
  const heuristic = (current: TrackedSticker[]) =>
    Math.max(...current.map((s, i) => tracked[i].distances.get(keyOf(s)) ?? Infinity));
  const solved = (current: TrackedSticker[]) =>
    current.every((s, i) => vecEquals(s.pos, tracked[i].target.pos) && vecEquals(s.normal, tracked[i].target.normal));

  const path: Turn[] = [];
  const search = (current: TrackedSticker[], depth: number, bound: number, previous: (typeof MATRICES)[number] | null): boolean => {
    if (solved(current)) return true;
    if (depth + heuristic(current) > bound) return false;
    for (const move of MATRICES) {
      // Evita giros redundantes: la misma cara dos veces seguidas, o caras opuestas en los dos órdenes.
      if (previous && previous.axis === move.axis && previous.layer >= move.layer) continue;
      path.push(move.turn);
      if (search(current.map((s) => moveSticker(s, move.axis, move.layer, move.matrix)), depth + 1, bound, move)) return true;
      path.pop();
    }
    return false;
  };

  for (let bound = heuristic(states); bound <= maxDepth; bound++) {
    if (search(states, 0, bound, null)) return path;
  }
  return null;
}
