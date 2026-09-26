import { quarterRotation, type Axis, type Mat3 } from '../../core/geometry';
import type { Turn } from '../../core/turn';
import type { HandShape } from '../../vision/hand-shape';
import type { HandSide } from '../../vision/hands-interpreter';

/** Sellos que mueven el cubo. (✌️ es especial: deshacer y mezclar.) */
export type Seal = 'fist' | 'point' | 'palm' | 'horns';
/** Sellos de las capas exteriores: cada mano mueve las de su lado. */
export type OuterSeal = Exclude<Seal, 'horns'>;
export type Motion = 'up' | 'down' | 'left' | 'right' | 'cw' | 'ccw';

export const OUTER_SEALS: readonly OuterSeal[] = ['fist', 'point', 'palm'];
export const SEALS: readonly Seal[] = [...OUTER_SEALS, 'horns'];

export function isSeal(shape: HandShape | null | undefined): shape is Seal {
  return shape === 'fist' || shape === 'point' || shape === 'palm' || shape === 'horns';
}

/**
 * Movimientos que acepta cada sello: el puño sube y baja, el índice va a los
 * lados y la palma gira como un volante. 🤘 acepta los tres, y el movimiento
 * decide cuál de las capas del medio gira.
 */
export const SEAL_MOTIONS: Record<Seal, readonly Motion[]> = {
  fist: ['up', 'down'],
  point: ['left', 'right'],
  palm: ['cw', 'ccw'],
  horns: ['up', 'down', 'left', 'right', 'cw', 'ccw'],
};

// Arriba/abajo → columnas (eje x) · a los lados → filas (eje y) · girar → caras de frente y atrás (eje z).
const MOTION_AXIS: Record<Motion, Axis> = { up: 0, down: 0, left: 1, right: 1, cw: 2, ccw: 2 };

// La capa se mueve hacia donde se mueve la mano. Con los ejes del cubo eso
// da el mismo sentido de giro para las dos manos: subir es R o L', ir a la
// izquierda es U o D', girar a la derecha es F o B'.
const MOTION_QUARTERS: Record<Motion, number> = { up: -1, down: 1, left: -1, right: 1, cw: -1, ccw: 1 };

/**
 * La mano derecha controla derecha, arriba y frente; la izquierda, izquierda,
 * abajo y atrás. 🤘 mueve las capas del medio con cualquiera de las dos.
 */
export function layerFor(side: HandSide, seal: Seal): number {
  if (seal === 'horns') return 0;
  return side === 'right' ? 1 : -1;
}

export function turnFor(side: HandSide, seal: Seal, motion: Motion): Turn {
  return { axis: MOTION_AXIS[motion], layers: [layerFor(side, seal)], quarters: MOTION_QUARTERS[motion] };
}

/** Mismo sello con las dos manos, moviéndose igual: gira el cubo entero. */
export function rotationFor(motion: Motion): Mat3 {
  return quarterRotation(MOTION_AXIS[motion], MOTION_QUARTERS[motion]);
}

/** Capas que se iluminan con el sello armado (con 🤘 aún no se sabe cuál de las del medio, así que se marcan la columna y la fila). */
export function sealTargets(side: HandSide, seal: Seal, motion?: Motion): { axis: Axis; layer: number }[] {
  const motions = motion ? [motion] : seal === 'horns' ? (['up', 'left'] as const) : [SEAL_MOTIONS[seal][0]];
  return motions.map((m) => ({ axis: MOTION_AXIS[m], layer: layerFor(side, seal) }));
}

const LAYER_NAMES: Record<HandSide, Record<OuterSeal, string>> = {
  right: { fist: 'Columna derecha', point: 'Fila de arriba', palm: 'Cara de frente' },
  left: { fist: 'Columna izquierda', point: 'Fila de abajo', palm: 'Cara de atrás' },
};

const MIDDLE_NAMES: Record<Axis, string> = { 0: 'Columna del medio', 1: 'Fila del medio', 2: 'Capa del medio' };

/** Nombre de la capa que mueve un sello, por ejemplo «Columna derecha». Con 🤘 depende del movimiento. */
export function layerName(side: HandSide, seal: Seal, motion?: Motion): string {
  if (seal !== 'horns') return LAYER_NAMES[side][seal];
  return motion ? MIDDLE_NAMES[MOTION_AXIS[motion]] : 'Capas del medio';
}

export const MOTION_ARROWS: Record<Motion, string> = { up: '↑', down: '↓', left: '←', right: '→', cw: '↻', ccw: '↺' };

const MOTION_PHRASES: Record<Motion, (layer: string) => string> = {
  up: (layer) => `Sube la ${layer}`,
  down: (layer) => `Baja la ${layer}`,
  left: (layer) => `Lleva la ${layer} a la izquierda`,
  right: (layer) => `Lleva la ${layer} a la derecha`,
  cw: (layer) => `Gira la ${layer} hacia la derecha`,
  ccw: (layer) => `Gira la ${layer} hacia la izquierda`,
};

/** Instrucción en lenguaje llano, por ejemplo «Sube la columna derecha». */
export function describeMove(side: HandSide, seal: Seal, motion: Motion): string {
  return MOTION_PHRASES[motion](layerName(side, seal, motion).toLowerCase());
}

const ROTATION_PHRASES: Record<Motion, string> = {
  up: 'Inclina el cubo hacia arriba',
  down: 'Inclina el cubo hacia abajo',
  left: 'Gira el cubo hacia la izquierda',
  right: 'Gira el cubo hacia la derecha',
  cw: 'Rueda el cubo hacia la derecha',
  ccw: 'Rueda el cubo hacia la izquierda',
};

export function describeRotation(motion: Motion): string {
  return ROTATION_PHRASES[motion];
}
