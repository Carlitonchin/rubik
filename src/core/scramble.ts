import { parseTurn, type Turn } from './turn';

const FACES = ['R', 'L', 'U', 'D', 'F', 'B'] as const;
const AXIS_OF_FACE: Record<(typeof FACES)[number], number> = { R: 0, L: 0, U: 1, D: 1, F: 2, B: 2 };
const SUFFIXES = ['', "'", '2'] as const;

/**
 * Mezcla aleatoria de giros de caras. Evita repetir la misma cara seguida
 * y tres giros seguidos en el mismo eje, que se cancelarían entre sí.
 */
export function randomScramble(length = 25, random: () => number = Math.random): Turn[] {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const faces: (typeof FACES)[number][] = [];
  while (faces.length < length) {
    const face = pick(FACES);
    const prev = faces[faces.length - 1];
    const prevPrev = faces[faces.length - 2];
    if (face === prev) continue;
    if (prev && prevPrev && AXIS_OF_FACE[face] === AXIS_OF_FACE[prev] && AXIS_OF_FACE[prev] === AXIS_OF_FACE[prevPrev]) {
      continue;
    }
    faces.push(face);
  }
  return faces.map((face) => parseTurn(face + pick(SUFFIXES)));
}
