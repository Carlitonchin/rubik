import type { NinjaEvent } from '../input/ninja/gesture-engine';
import {
  describeMove,
  describeRotation,
  MOTION_ARROWS,
  OUTER_SEALS,
  SEAL_MOTIONS,
  SEALS,
  sealTargets,
  type Motion,
  type OuterSeal,
} from '../input/ninja/seal-map';
import { SHAPE_LABELS, type HandShape } from '../vision/hand-shape';
import { HAND_SIDES, type HandsFrame, type HandSide } from '../vision/hands-interpreter';

export type DojoStep =
  | { kind: 'seal'; side: HandSide; shape: HandShape }
  | { kind: 'move'; side: HandSide; seal: OuterSeal; motion: Motion }
  | { kind: 'rotate'; seal: OuterSeal; motion: Motion }
  /** Capas del medio con 🤘: vale cualquier mano. */
  | { kind: 'middle'; motion: Motion };

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  /** Los sellos no mueven el cubo durante la lección (solo se practica la forma). */
  practiceOnly?: boolean;
  /** Los pasos forman una secuencia que se repite: se muestran todos a la vez. */
  sequenceLength?: number;
  createSteps(random: () => number): DojoStep[];
}

/** El remolino: sube la columna derecha, fila de arriba a la izquierda, baja la columna, fila a la derecha. */
const WHIRL: DojoStep[] = [
  { kind: 'move', side: 'right', seal: 'fist', motion: 'up' },
  { kind: 'move', side: 'right', seal: 'point', motion: 'left' },
  { kind: 'move', side: 'right', seal: 'fist', motion: 'down' },
  { kind: 'move', side: 'right', seal: 'point', motion: 'right' },
];

export const LESSONS: readonly Lesson[] = [
  {
    id: 'seals',
    title: 'Sellos',
    summary: 'Forma cada sello con cada mano y mantenlo un instante.',
    practiceOnly: true,
    createSteps: (random) =>
      shuffle(
        [
          ...HAND_SIDES.flatMap((side) => SEALS.map((shape): DojoStep => ({ kind: 'seal', side, shape }))),
          ...HAND_SIDES.map((side): DojoStep => ({ kind: 'seal', side, shape: 'two' })),
        ],
        random,
      ),
  },
  {
    id: 'moves',
    title: 'Movimientos',
    summary: 'Forma el sello, quédate quieto un instante y da el golpe. Luego vuelve al centro.',
    createSteps: (random) =>
      shuffle(
        HAND_SIDES.flatMap((side) =>
          OUTER_SEALS.flatMap((seal) => SEAL_MOTIONS[seal].map((motion): DojoStep => ({ kind: 'move', side, seal, motion }))),
        ),
        random,
      ),
  },
  {
    id: 'middle',
    title: 'Capas del medio',
    summary: 'Con 🤘 (índice y meñique) y cualquier mano: arriba o abajo la columna del medio, a los lados la fila del medio, girando la capa del medio.',
    createSteps: (random) => shuffle(SEAL_MOTIONS.horns.map((motion): DojoStep => ({ kind: 'middle', motion })), random),
  },
  {
    id: 'rotations',
    title: 'Girar el cubo',
    summary: 'El mismo sello con las dos manos, moviéndolas a la vez, gira el cubo entero.',
    createSteps: (random) =>
      shuffle(
        OUTER_SEALS.flatMap((seal) => SEAL_MOTIONS[seal].map((motion): DojoStep => ({ kind: 'rotate', seal, motion }))),
        random,
      ),
  },
  {
    id: 'whirl',
    title: 'Técnica: el remolino',
    summary: 'La secuencia que más se usa para armar el cubo. Hazla 6 veces seguidas y el cubo volverá a quedar como estaba.',
    sequenceLength: WHIRL.length,
    createSteps: () => Array.from({ length: 6 }, () => WHIRL).flat(),
  },
];

const SHAPE_ARTICLES: Partial<Record<HandShape, string>> = {
  fist: 'el puño',
  point: 'el índice',
  palm: 'la palma',
  horns: 'los cuernos (índice y meñique)',
  two: 'los dos dedos (✌️)',
};

/** Qué mano(s) pide el paso. */
export type StepHands = HandSide | 'both' | 'any';

export function describeStep(step: DojoStep): { hands: StepHands; symbol: string; text: string } {
  switch (step.kind) {
    case 'seal':
      return {
        hands: step.side,
        symbol: SHAPE_LABELS[step.shape].emoji,
        text: `Forma ${SHAPE_ARTICLES[step.shape]} con la mano ${step.side === 'right' ? 'derecha' : 'izquierda'}`,
      };
    case 'move':
      return {
        hands: step.side,
        symbol: `${SHAPE_LABELS[step.seal].emoji} ${MOTION_ARROWS[step.motion]}`,
        text: describeMove(step.side, step.seal, step.motion),
      };
    case 'middle':
      return {
        hands: 'any',
        symbol: `${SHAPE_LABELS.horns.emoji} ${MOTION_ARROWS[step.motion]}`,
        text: describeMove('right', 'horns', step.motion),
      };
    case 'rotate': {
      const emoji = SHAPE_LABELS[step.seal].emoji;
      const how = step.seal === 'palm' ? 'gira las dos palmas a la vez, como un volante' : 'las dos manos a la vez';
      return { hands: 'both', symbol: `${emoji}${emoji} ${MOTION_ARROWS[step.motion]}`, text: `${describeRotation(step.motion)}: ${how}` };
    }
  }
}

/** Capas que se iluminan para indicar el paso. */
export function stepTargets(step: DojoStep): { axis: 0 | 1 | 2; layer: number }[] {
  switch (step.kind) {
    case 'seal':
      return [];
    case 'move':
      return sealTargets(step.side, step.seal, step.motion);
    case 'middle':
      return sealTargets('right', 'horns', step.motion);
    case 'rotate':
      return HAND_SIDES.flatMap((side) => sealTargets(side, step.seal, step.motion));
  }
}

/** Tiempo que hay que mantener el sello en los pasos de tipo sello. */
export const SEAL_HOLD_MS = 300;

export interface DojoResults {
  steps: number;
  errors: number;
  /** De 0 a 1. */
  accuracy: number;
  averageMs: number;
  totalMs: number;
}

/** Una lección en curso: qué paso toca, aciertos, errores y tiempos. */
export class DojoSession {
  readonly steps: DojoStep[];
  index = 0;
  errors = 0;
  private readonly startTime: number;
  private stepStart: number;
  private endTime = 0;
  private readonly times: number[] = [];
  private sealHeldSince: number | null = null;

  constructor(
    readonly lesson: Lesson,
    now: number,
    random: () => number = Math.random,
  ) {
    this.steps = lesson.createSteps(random);
    this.startTime = this.stepStart = now;
  }

  get current(): DojoStep | null {
    return this.steps[this.index] ?? null;
  }

  get done(): boolean {
    return this.index >= this.steps.length;
  }

  /** Evalúa un movimiento del modo ninja contra el paso actual. */
  handleEvent(event: NinjaEvent, now: number): 'correct' | 'wrong' | 'ignored' {
    const step = this.current;
    if (!step || step.kind === 'seal' || event.type === 'undo' || event.type === 'scramble') return 'ignored';
    const correct =
      step.kind === 'move'
        ? event.type === 'turn' && event.side === step.side && event.seal === step.seal && event.motion === step.motion
        : step.kind === 'middle'
          ? event.type === 'turn' && event.seal === 'horns' && event.motion === step.motion
          : event.type === 'rotate' && event.seal === step.seal && event.motion === step.motion;
    if (!correct) {
      this.errors++;
      return 'wrong';
    }
    this.advance(now);
    return 'correct';
  }

  /** En los pasos de sello, comprueba en cada fotograma si se mantiene el sello pedido. */
  handleFrame(frame: HandsFrame): 'correct' | 'pending' {
    const step = this.current;
    if (!step || step.kind !== 'seal') return 'pending';
    const hand = frame.hands[step.side];
    if (!hand || !hand.inZone || hand.shape !== step.shape) {
      this.sealHeldSince = null;
      return 'pending';
    }
    this.sealHeldSince ??= frame.time;
    if (frame.time - this.sealHeldSince < SEAL_HOLD_MS) return 'pending';
    this.advance(frame.time);
    return 'correct';
  }

  results(): DojoResults {
    const steps = this.steps.length;
    const totalMs = (this.endTime || this.stepStart) - this.startTime;
    return {
      steps,
      errors: this.errors,
      accuracy: steps / (steps + this.errors),
      averageMs: this.times.length ? this.times.reduce((a, b) => a + b, 0) / this.times.length : 0,
      totalMs,
    };
  }

  private advance(now: number): void {
    this.times.push(now - this.stepStart);
    this.stepStart = now;
    this.sealHeldSince = null;
    this.index++;
    if (this.done) this.endTime = now;
  }
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
