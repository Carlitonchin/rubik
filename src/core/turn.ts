import { axisOf, mulMatVec, normalizeQuarters, quarterRotation, unitVector, type Axis, type Mat3 } from './geometry';

/**
 * Un giro de una o varias capas. Es la orden común que producen todos los
 * modos de control (teclado, táctil, gestos).
 */
export interface Turn {
  readonly axis: Axis;
  /** Capas que giran, por su coordenada en el eje (-1, 0, 1). */
  readonly layers: readonly number[];
  /** Ángulo en cuartos de vuelta alrededor del eje positivo (regla de la mano derecha). */
  readonly quarters: number;
}

export const ALL_LAYERS: readonly number[] = [-1, 0, 1];

export function turnMatrix(turn: Turn): Mat3 {
  return quarterRotation(turn.axis, turn.quarters);
}

export function inverseTurn(turn: Turn): Turn {
  return { ...turn, quarters: normalizeQuarters(-turn.quarters) };
}

export function isWholeCube(turn: Turn): boolean {
  return turn.layers.length === 3;
}

/**
 * Expresa un giro en las nuevas coordenadas después de rotar el cubo entero
 * con `rotation`. Así el historial (para deshacer) sigue apuntando a las
 * mismas capas físicas aunque el jugador haya girado el cubo.
 */
export function transformTurn(turn: Turn, rotation: Mat3): Turn {
  const { axis, sign } = axisOf(mulMatVec(rotation, unitVector(turn.axis)));
  return {
    axis,
    layers: turn.layers.map((layer) => layer * sign).sort((a, b) => a - b),
    quarters: normalizeQuarters(turn.quarters * sign),
  };
}

// Notación estándar. Solo la ven los expertos; el juego enseña sin ella.
const NOTATION: Record<string, Turn> = {
  R: { axis: 0, layers: [1], quarters: -1 },
  L: { axis: 0, layers: [-1], quarters: 1 },
  M: { axis: 0, layers: [0], quarters: 1 },
  U: { axis: 1, layers: [1], quarters: -1 },
  D: { axis: 1, layers: [-1], quarters: 1 },
  E: { axis: 1, layers: [0], quarters: 1 },
  F: { axis: 2, layers: [1], quarters: -1 },
  B: { axis: 2, layers: [-1], quarters: 1 },
  S: { axis: 2, layers: [0], quarters: -1 },
  r: { axis: 0, layers: [0, 1], quarters: -1 },
  l: { axis: 0, layers: [-1, 0], quarters: 1 },
  u: { axis: 1, layers: [0, 1], quarters: -1 },
  d: { axis: 1, layers: [-1, 0], quarters: 1 },
  f: { axis: 2, layers: [0, 1], quarters: -1 },
  b: { axis: 2, layers: [-1, 0], quarters: 1 },
  x: { axis: 0, layers: ALL_LAYERS, quarters: -1 },
  y: { axis: 1, layers: ALL_LAYERS, quarters: -1 },
  z: { axis: 2, layers: ALL_LAYERS, quarters: -1 },
};

const NOTATION_PATTERN = /^([RLUDFB]w|[RLUDFBMESrludfbxyz])(2?)('?)$/;

export function parseTurn(text: string): Turn {
  const match = NOTATION_PATTERN.exec(text.trim());
  if (!match) throw new Error(`Movimiento no válido: "${text}"`);
  const [, name, double, prime] = match;
  const base = NOTATION[name.length === 2 ? name[0].toLowerCase() : name];
  const amount = (double ? 2 : 1) * (prime ? -1 : 1);
  return { ...base, quarters: normalizeQuarters(base.quarters * amount) };
}

export function parseAlgorithm(text: string): Turn[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map(parseTurn);
}

export function formatTurn(turn: Turn): string {
  const layers = [...turn.layers].sort((a, b) => a - b).join(',');
  for (const [name, base] of Object.entries(NOTATION)) {
    if (base.axis !== turn.axis || base.layers.join(',') !== layers) continue;
    const amount = normalizeQuarters(turn.quarters * base.quarters);
    return name + (amount === 2 ? '2' : amount === -1 ? "'" : '');
  }
  return `[${turn.axis}:${layers}:${turn.quarters}]`;
}

export function formatAlgorithm(turns: readonly Turn[]): string {
  return turns.map(formatTurn).join(' ');
}
