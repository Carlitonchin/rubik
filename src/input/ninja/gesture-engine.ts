import type { Mat3 } from '../../core/geometry';
import type { Turn } from '../../core/turn';
import { HAND_SIDES, type HandsFrame, type HandSide, type TrackedHand } from '../../vision/hands-interpreter';
import { isSeal, rotationFor, SEAL_MOTIONS, turnFor, type Motion, type Seal } from './seal-map';

export type NinjaEvent =
  | { type: 'turn'; side: HandSide; seal: Seal; motion: Motion; turn: Turn }
  | { type: 'rotate'; seal: Seal; motion: Motion; rotation: Mat3 }
  | { type: 'undo' }
  | { type: 'scramble' };

export type HoldAction = 'undo' | 'scramble';

export interface GestureState {
  hands: Record<HandSide, { seal: Seal | null; mode: HandMode }>;
  /** Sello ✌️ que se está manteniendo, con su progreso de 0 a 1. */
  hold: { action: HoldAction; progress: number } | null;
}

/**
 * - `idle`: sin sello válido (no hay mano, está en la zona de descanso o no hace un sello).
 * - `arming`: sello formado, esperando a que la mano se quede quieta un instante.
 * - `armed`: listo; el siguiente golpe de la mano gira la capa.
 * - `fired`: acaba de girar; la mano tiene que volver hacia el centro y pararse para recargar.
 */
export type HandMode = 'idle' | 'arming' | 'armed' | 'fired';

// Distancias medidas en "tamaños de mano" (muñeca → nudillo del medio, unos 9 cm):
// así da igual lo cerca o lejos que esté la mano de la cámara.
export const FLICK_DISTANCE = 0.7;
const FLICK_RETURN = 0.25;
// 30° y no más: la muñeca derecha se dobla poco hacia el pulgar (y la izquierda igual), así que girar la palma "hacia dentro" cuesta.
export const TWIST_ANGLE = (30 * Math.PI) / 180;
const TWIST_RETURN = (12 * Math.PI) / 180;
/** El movimiento tiene que ir claramente en su eje (no en diagonal). */
const AXIS_DOMINANCE = 1.2;
/**
 * El punto de partida sigue muy despacio a la mano: una deriva lenta no gira
 * nada, y un gesto a medias que se sostiene y se devuelve tampoco dispara el
 * giro contrario (el punto de partida no llega a desplazarse hasta él).
 */
const ANCHOR_FOLLOW_MS = 1500;
/**
 * El sello se arma (y se recarga) solo con la mano quieta este tiempo. Así,
 * subir la mano desde la zona de descanso o cambiar de sello en pleno
 * movimiento no gira nada, y la vuelta al centro no dispara el giro contrario.
 */
const STILL_MS = 100;
const STILL_DISTANCE = 0.15;
const STILL_ANGLE = (6 * Math.PI) / 180;
/**
 * Un salto mayor que esto entre dos fotogramas no es un gesto, es un fallo
 * del seguimiento (o una mano confundida con la otra): no gira nada.
 */
const GLITCH_DISTANCE = 1.2;
const GLITCH_ANGLE = (60 * Math.PI) / 180;
/** Tiempo para esperar a la otra mano cuando las dos tienen el mismo sello. */
export const PAIR_WINDOW_MS = 180;
/**
 * Con las dos manos, si una completa el gesto y la otra va al menos por esta
 * fracción del recorrido en la misma dirección, gira el cubo entero. Las dos
 * muñecas no giran igual de fácil hacia cada lado.
 */
const PAIR_ASSIST = 0.5;
/** Con 🤘 valen golpes y giros: un golpe no cuenta si la mano gira mucho, ni un giro si la mano se desplaza. */
const HORNS_MAX_ROLL_IN_FLICK = (20 * Math.PI) / 180;
const HORNS_MAX_SHIFT_IN_TWIST = 0.4;
export const UNDO_HOLD_MS = 800;
export const SCRAMBLE_HOLD_MS = 1500;

interface Pose {
  /** Centro de la palma, en unidades del alto de la imagen. */
  x: number;
  y: number;
  roll: number;
  size: number;
}

interface Fire {
  side: HandSide;
  seal: Seal;
  motion: Motion;
  time: number;
}

/** Desplazamiento de la mano desde su punto de partida: en tamaños de mano y en radianes. */
interface Displacement {
  dx: number;
  dy: number;
  droll: number;
}

/** Sigue una mano: detecta el sello armado, el golpe que gira la capa y la recarga. */
class HandGesture {
  seal: Seal | null = null;
  mode: HandMode = 'idle';
  private anchor: Pose = { x: 0, y: 0, roll: 0, size: 1 };
  private lastTime = 0;
  private lastPose: Pose | null = null;
  private firedMotion: Motion = 'up';
  private peak = 0;
  private history: { time: number; pose: Pose }[] = [];

  update(hand: TrackedHand | null, aspect: number, time: number): Motion | null {
    const seal = hand && hand.inZone && isSeal(hand.shape) ? hand.shape : null;
    const dt = time - this.lastTime;
    this.lastTime = time;
    if (seal !== this.seal) {
      this.seal = seal;
      this.mode = seal ? 'arming' : 'idle';
      this.history = [];
    }
    if (!hand || !seal) return null;

    const pose = poseOf(hand, aspect);
    this.lastPose = pose;
    const previous = this.history[this.history.length - 1]?.pose;
    this.history.push({ time, pose });
    this.history = this.history.filter((sample) => time - sample.time <= STILL_MS);

    // El sello estable tarda un instante en cambiar. Si en este fotograma ya se
    // ve otra forma (no solo una imagen borrosa), la mano está cambiando de
    // sello: no se dispara y hay que volver a quedarse quieto.
    const changingShape = hand.rawShape !== seal && hand.rawShape !== 'unknown';
    if (changingShape || (previous && isGlitch(previous, pose))) {
      if (this.mode !== 'arming') this.history = [{ time, pose }];
      this.mode = 'arming';
      return null;
    }

    switch (this.mode) {
      case 'arming':
        if (this.isStill(time)) this.arm(pose);
        return null;

      case 'armed': {
        const motion = detectMotion(seal, this.displacement(pose));
        if (motion) {
          this.mode = 'fired';
          this.firedMotion = motion;
          this.peak = progressAlong(motion, this.displacement(pose));
          return motion;
        }
        this.followAnchor(pose, dt);
        return null;
      }

      case 'fired': {
        // Recarga cuando la mano vuelve (al centro o al menos a medio camino) y se para.
        const progress = progressAlong(this.firedMotion, this.displacement(pose));
        this.peak = Math.max(this.peak, progress);
        const returned = Math.abs(progress) <= returnBandFor(this.firedMotion) || this.peak - progress >= this.peak / 2;
        if (returned && this.isStill(time)) this.arm(pose);
        return null;
      }

      default:
        return null;
    }
  }

  /** Qué fracción del gesto `motion` lleva hecha la mano (0 si no está armada). */
  progressToward(motion: Motion): number {
    if (this.mode !== 'armed' || !this.seal || !this.lastPose || !SEAL_MOTIONS[this.seal].includes(motion)) return 0;
    return progressAlong(motion, this.displacement(this.lastPose)) / thresholdFor(motion);
  }

  /** Da por hecho el gesto `motion` (lo completó la otra mano al girar el cubo entero). */
  markFired(motion: Motion): void {
    if (!this.seal || !this.lastPose) return;
    this.mode = 'fired';
    this.firedMotion = motion;
    this.peak = Math.max(0, progressAlong(motion, this.displacement(this.lastPose)));
  }

  private displacement(pose: Pose): Displacement {
    return {
      dx: (pose.x - this.anchor.x) / this.anchor.size,
      dy: (pose.y - this.anchor.y) / this.anchor.size,
      droll: angleDiff(pose.roll, this.anchor.roll),
    };
  }

  private isStill(time: number): boolean {
    const first = this.history[0];
    if (!first || time - first.time < STILL_MS * 0.8) return false;
    const poses = this.history.map((sample) => sample.pose);
    const size = poses[poses.length - 1].size;
    const range = (values: number[]) => Math.max(...values) - Math.min(...values);
    const rolls = poses.map((p) => angleDiff(p.roll, first.pose.roll));
    return (
      range(poses.map((p) => p.x)) / size <= STILL_DISTANCE &&
      range(poses.map((p) => p.y)) / size <= STILL_DISTANCE &&
      range(rolls) <= STILL_ANGLE
    );
  }

  private followAnchor(pose: Pose, dt: number): void {
    const k = 1 - Math.exp(-Math.max(0, dt) / ANCHOR_FOLLOW_MS);
    this.anchor = {
      x: this.anchor.x + (pose.x - this.anchor.x) * k,
      y: this.anchor.y + (pose.y - this.anchor.y) * k,
      roll: this.anchor.roll + angleDiff(pose.roll, this.anchor.roll) * k,
      size: this.anchor.size + (pose.size - this.anchor.size) * k,
    };
  }

  private arm(pose: Pose): void {
    this.anchor = pose;
    this.mode = 'armed';
  }
}

/** ¿Completó la mano el gesto de su sello? Cada sello responde solo a sus movimientos. */
function detectMotion(seal: Seal, { dx, dy, droll }: Displacement): Motion | null {
  const vertical = Math.abs(dy) >= FLICK_DISTANCE && Math.abs(dy) >= AXIS_DOMINANCE * Math.abs(dx);
  const horizontal = Math.abs(dx) >= FLICK_DISTANCE && Math.abs(dx) >= AXIS_DOMINANCE * Math.abs(dy);
  const twist = Math.abs(droll) >= TWIST_ANGLE;
  const flick = vertical ? (dy < 0 ? 'up' : 'down') : horizontal ? (dx < 0 ? 'left' : 'right') : null;
  const turn = twist ? (droll > 0 ? 'cw' : 'ccw') : null;
  switch (seal) {
    case 'fist':
      return vertical ? flick : null;
    case 'point':
      return horizontal ? flick : null;
    case 'palm':
      return turn;
    case 'horns':
      if (flick && Math.abs(droll) < HORNS_MAX_ROLL_IN_FLICK) return flick;
      if (turn && Math.hypot(dx, dy) < HORNS_MAX_SHIFT_IN_TWIST) return turn;
      return null;
  }
}

/** Cuánto ha avanzado la mano en la dirección de `motion` (positivo = hacia ese lado). */
function progressAlong(motion: Motion, { dx, dy, droll }: Displacement): number {
  switch (motion) {
    case 'up':
      return -dy;
    case 'down':
      return dy;
    case 'left':
      return -dx;
    case 'right':
      return dx;
    case 'cw':
      return droll;
    case 'ccw':
      return -droll;
  }
}

function thresholdFor(motion: Motion): number {
  return motion === 'cw' || motion === 'ccw' ? TWIST_ANGLE : FLICK_DISTANCE;
}

function returnBandFor(motion: Motion): number {
  return motion === 'cw' || motion === 'ccw' ? TWIST_RETURN : FLICK_RETURN;
}

/**
 * Traduce lo que hacen las manos en órdenes para el cubo. Recibe los
 * fotogramas ya interpretados (sellos estables, posiciones suavizadas), así
 * que se puede probar con manos simuladas.
 */
export class GestureEngine {
  private readonly hands: Record<HandSide, HandGesture> = { left: new HandGesture(), right: new HandGesture() };
  private pending: Fire | null = null;
  private singleHoldStart: number | null = null;
  private bothHoldStart: number | null = null;
  private holdLatched = false;
  private hold: GestureState['hold'] = null;

  update(frame: HandsFrame): NinjaEvent[] {
    const events: NinjaEvent[] = [];
    const fires: Fire[] = [];
    for (const side of HAND_SIDES) {
      const gesture = this.hands[side];
      const motion = gesture.update(frame.hands[side], frame.aspect, frame.time);
      if (motion && gesture.seal) fires.push({ side, seal: gesture.seal, motion, time: frame.time });
    }

    for (const fire of fires) {
      if (!this.sameSealOnBothHands()) {
        events.push(...this.flushPending(), turnEvent(fire));
      } else if (this.pending && this.pending.side !== fire.side) {
        // Las dos manos se movieron casi a la vez: igual = cubo entero; distinto = dos giros.
        if (this.pending.motion === fire.motion) events.push(rotateEvent(fire));
        else events.push(turnEvent(this.pending), turnEvent(fire));
        this.pending = null;
      } else {
        // Esperar un instante por si la otra mano también se mueve.
        events.push(...this.flushPending());
        this.pending = fire;
      }
    }

    if (this.pending) {
      const other = this.hands[this.pending.side === 'left' ? 'right' : 'left'];
      if (this.sameSealOnBothHands() && other.progressToward(this.pending.motion) >= PAIR_ASSIST) {
        other.markFired(this.pending.motion);
        events.push(rotateEvent(this.pending));
        this.pending = null;
      } else if (!this.sameSealOnBothHands() || frame.time - this.pending.time >= PAIR_WINDOW_MS) {
        events.push(...this.flushPending());
      }
    }

    events.push(...this.updateHolds(frame));
    return events;
  }

  state(): GestureState {
    return {
      hands: {
        left: { seal: this.hands.left.seal, mode: this.hands.left.mode },
        right: { seal: this.hands.right.seal, mode: this.hands.right.mode },
      },
      hold: this.hold,
    };
  }

  reset(): void {
    this.hands.left = new HandGesture();
    this.hands.right = new HandGesture();
    this.pending = null;
    this.singleHoldStart = this.bothHoldStart = null;
    this.holdLatched = false;
    this.hold = null;
  }

  /** Mismo sello exterior en las dos manos (🤘 no gira el cubo entero: cada mano mueve la capa del medio). */
  private sameSealOnBothHands(): boolean {
    const seal = this.hands.left.seal;
    return seal !== null && seal !== 'horns' && seal === this.hands.right.seal;
  }

  private flushPending(): NinjaEvent[] {
    const pending = this.pending;
    this.pending = null;
    return pending ? [turnEvent(pending)] : [];
  }

  /** ✌️ mantenido: con una mano deshace, con las dos mezcla. */
  private updateHolds(frame: HandsFrame): NinjaEvent[] {
    const two = (side: HandSide) => {
      const hand = frame.hands[side];
      return Boolean(hand && hand.inZone && hand.shape === 'two');
    };
    const left = two('left');
    const right = two('right');
    if (!left && !right) {
      this.singleHoldStart = this.bothHoldStart = null;
      this.holdLatched = false;
      this.hold = null;
      return [];
    }
    // Tras disparar, hay que soltar el sello antes de repetir.
    if (this.holdLatched) {
      this.hold = null;
      return [];
    }

    const action: HoldAction = left && right ? 'scramble' : 'undo';
    let start: number;
    if (action === 'scramble') {
      start = this.bothHoldStart ??= frame.time;
      this.singleHoldStart = null;
    } else {
      start = this.singleHoldStart ??= frame.time;
      this.bothHoldStart = null;
    }
    const progress = (frame.time - start) / (action === 'scramble' ? SCRAMBLE_HOLD_MS : UNDO_HOLD_MS);
    if (progress >= 1) {
      this.holdLatched = true;
      this.hold = null;
      return [{ type: action }];
    }
    this.hold = { action, progress };
    return [];
  }
}

function turnEvent(fire: Fire): NinjaEvent {
  return { type: 'turn', side: fire.side, seal: fire.seal, motion: fire.motion, turn: turnFor(fire.side, fire.seal, fire.motion) };
}

function rotateEvent(fire: Fire): NinjaEvent {
  return { type: 'rotate', seal: fire.seal, motion: fire.motion, rotation: rotationFor(fire.motion) };
}

function isGlitch(previous: Pose, pose: Pose): boolean {
  const jump = Math.hypot(pose.x - previous.x, pose.y - previous.y) / previous.size;
  return jump > GLITCH_DISTANCE || Math.abs(angleDiff(pose.roll, previous.roll)) > GLITCH_ANGLE;
}

function poseOf(hand: TrackedHand, aspect: number): Pose {
  return { x: hand.center.x * aspect, y: hand.center.y, roll: hand.roll, size: Math.max(hand.size, 1e-3) };
}

function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
