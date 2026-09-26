import { distance3, LM, type Point3 } from './landmarks';

/** Los sellos que el juego reconoce. */
export type HandShape = 'fist' | 'point' | 'palm' | 'two' | 'unknown';

export const SHAPE_LABELS: Record<HandShape, { emoji: string; name: string }> = {
  fist: { emoji: '✊', name: 'Puño' },
  point: { emoji: '☝️', name: 'Índice' },
  palm: { emoji: '✋', name: 'Palma' },
  two: { emoji: '✌️', name: 'Dos dedos' },
  unknown: { emoji: '·', name: 'Sin sello' },
};

export type FingerState = 'extended' | 'curled' | 'unsure';
type Finger = 'index' | 'middle' | 'ring' | 'pinky';

const FINGERS: Record<Finger, { pip: number; tip: number }> = {
  index: { pip: LM.INDEX_PIP, tip: LM.INDEX_TIP },
  middle: { pip: LM.MIDDLE_PIP, tip: LM.MIDDLE_TIP },
  ring: { pip: LM.RING_PIP, tip: LM.RING_TIP },
  pinky: { pip: LM.PINKY_PIP, tip: LM.PINKY_TIP },
};

// Alcance de un dedo = distancia muñeca→punta / distancia muñeca→segundo nudillo del mismo dedo.
// Medido con fotos reales: estirado ≈ 1,3–1,5 · doblado ≈ 0,6–0,85.
const EXTENDED_REACH = 1.1;
const CURLED_REACH = 0.95;

/** Clasifica cada dedo (sin contar el pulgar) usando los puntos 3D de la mano. */
export function fingerStates(world: readonly Point3[]): Record<Finger, FingerState> {
  const wrist = world[LM.WRIST];
  const state = (finger: Finger): FingerState => {
    const { pip, tip } = FINGERS[finger];
    const reach = distance3(wrist, world[tip]) / distance3(wrist, world[pip]);
    if (reach >= EXTENDED_REACH) return 'extended';
    if (reach <= CURLED_REACH) return 'curled';
    return 'unsure';
  };
  return { index: state('index'), middle: state('middle'), ring: state('ring'), pinky: state('pinky') };
}

/**
 * Reconoce el sello de una mano. El pulgar se ignora a propósito: cada
 * persona lo coloca distinto al cerrar el puño o al señalar. El índice vale
 * apunte hacia donde apunte, para que cada uno elija la postura más cómoda.
 * @param world puntos 3D de MediaPipe (en metros).
 */
export function classifyHand(world: readonly Point3[]): HandShape {
  const f = fingerStates(world);
  const curled = (finger: Finger) => f[finger] === 'curled';
  const extended = (finger: Finger) => f[finger] === 'extended';

  if (curled('index') && curled('middle') && curled('ring') && curled('pinky')) return 'fist';
  if (extended('index') && extended('middle') && extended('ring') && extended('pinky')) return 'palm';
  if (extended('index') && extended('middle') && curled('ring') && curled('pinky')) return 'two';
  if (extended('index') && curled('middle') && curled('ring') && curled('pinky')) return 'point';
  return 'unknown';
}
