import type { Face } from '../core/cube';
import { mulMatVec, type Axis, type Mat3, type Vec3 } from '../core/geometry';
import { turnMatrix, type Turn } from '../core/turn';
import type { Model } from './model';

/** Los 18 giros de caras (cada cara: un cuarto a cada lado y media vuelta). */
export const FACE_TURNS: readonly Turn[] = ([0, 1, 2] as const).flatMap((axis) =>
  [-1, 1].flatMap((layer) => [1, -1, 2].map((quarters): Turn => ({ axis, layers: [layer], quarters }))),
);

export interface TrackedSticker {
  pos: Vec3;
  normal: Vec3;
}

/**
 * Objetivo de una pieza: los estados (posición y hacia dónde mira su primer
 * color) que cuentan como "bien". Puede ser uno solo (su sitio) o varios
 * (por ejemplo, cualquier hueco de arriba con el blanco hacia arriba).
 */
export interface PieceGoal {
  colors: readonly Face[];
  targets: readonly TrackedSticker[];
}

interface TrackedPiece {
  targets: Set<string>;
  /** Distancia mínima (en giros) desde cada estado de la pieza hasta algún objetivo. */
  distances: Map<string, number>;
}

interface Move {
  turn: Turn;
  axis: Axis;
  layer: number;
  matrix: Mat3;
}

const toMove = (turn: Turn): Move => ({ turn, axis: turn.axis, layer: turn.layers[0], matrix: turnMatrix(turn) });

const keyOf = (s: TrackedSticker) => `${s.pos.join(',')}|${s.normal.join(',')}`;

function moveSticker(s: TrackedSticker, { axis, layer, matrix }: Move): TrackedSticker {
  if (s.pos[axis] !== layer) return s;
  return { pos: mulMatVec(matrix, s.pos), normal: mulMatVec(matrix, s.normal) };
}

/** Distancia de cada estado posible de una pieza hasta el objetivo más cercano (búsqueda en anchura sobre ≤24 estados). */
function distanceTable(targets: readonly TrackedSticker[], moves: readonly Move[]): Map<string, number> {
  const distances = new Map(targets.map((target) => [keyOf(target), 0]));
  let frontier = [...targets];
  for (let depth = 1; frontier.length; depth++) {
    const next: TrackedSticker[] = [];
    for (const state of frontier) {
      for (const move of moves) {
        const moved = moveSticker(state, move);
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
 * Busca la secuencia más corta de giros (entre `turns`) que deja cada pieza
 * en uno de sus estados objetivo (IDA* con la distancia de cada pieza como
 * estimación). Solo se siguen las pegatinas de esas piezas, así que es rápido.
 */
export function searchMoves(model: Model, goals: readonly PieceGoal[], turns: readonly Turn[] = FACE_TURNS, maxDepth = 8): Turn[] | null {
  const moves = turns.map(toMove);
  const tracked: TrackedPiece[] = goals.map((goal) => ({
    targets: new Set(goal.targets.map(keyOf)),
    distances: distanceTable(goal.targets, moves),
  }));
  const states = goals.map((goal) => ({ pos: model.find(goal.colors), normal: model.facing(goal.colors, goal.colors[0]) }));

  const heuristic = (current: TrackedSticker[]) =>
    Math.max(0, ...current.map((s, i) => tracked[i].distances.get(keyOf(s)) ?? Infinity));
  const solved = (current: TrackedSticker[]) => current.every((s, i) => tracked[i].targets.has(keyOf(s)));

  const path: Turn[] = [];
  const search = (current: TrackedSticker[], depth: number, bound: number, previous: Move | null): boolean => {
    if (solved(current)) return true;
    if (depth + heuristic(current) > bound) return false;
    for (const move of moves) {
      // Evita giros redundantes: la misma cara dos veces seguidas, o caras opuestas en los dos órdenes.
      if (previous && previous.axis === move.axis && previous.layer >= move.layer) continue;
      path.push(move.turn);
      if (search(current.map((s) => moveSticker(s, move)), depth + 1, bound, move)) return true;
      path.pop();
    }
    return false;
  };

  for (let bound = heuristic(states); bound <= maxDepth; bound++) {
    if (search(states, 0, bound, null)) return path;
  }
  return null;
}

/** Secuencia más corta que deja todas las piezas indicadas en su sitio. */
export function shortestSolution(model: Model, pieces: readonly (readonly Face[])[], maxDepth = 8): Turn[] | null {
  return searchMoves(
    model,
    pieces.map((colors) => ({ colors, targets: [{ pos: model.home(colors), normal: model.centerOf(colors[0]) }] })),
    FACE_TURNS,
    maxDepth,
  );
}
