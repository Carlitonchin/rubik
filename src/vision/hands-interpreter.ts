import { classifyHand, type HandShape } from './hand-shape';
import { LM, type Point3 } from './landmarks';
import { PointsFilter } from './one-euro';
import { ShapeStabilizer } from './shape-stabilizer';

export type HandSide = 'left' | 'right';
export const HAND_SIDES: readonly HandSide[] = ['left', 'right'];

/** Una mano tal como la entrega MediaPipe. */
export interface RawHand {
  /** Etiqueta de MediaPipe: 'Left' o 'Right'. */
  label: string;
  /** Puntos normalizados (0–1) sobre la imagen de la cámara, sin espejo. */
  points: readonly Point3[];
  /** Puntos 3D en metros, centrados en la mano. */
  world: readonly Point3[];
}

export interface TrackedHand {
  side: HandSide;
  /** Puntos normalizados (0–1) en la vista espejo que ve el jugador, suavizados. */
  points: Point3[];
  /** Sello estable, o `null` mientras aún no se ha mantenido lo suficiente. */
  shape: HandShape | null;
  /** Sello detectado en este fotograma, sin estabilizar. */
  rawShape: HandShape;
  /** Centro de la palma, normalizado. */
  center: { x: number; y: number };
  /** Inclinación de la mano en radianes: 0 = recta, positivo = girada en sentido horario. */
  roll: number;
  /** Tamaño de la mano (muñeca → nudillo del dedo medio) en fracción del alto de la imagen. */
  size: number;
  /** ¿Está dentro de la zona activa? */
  inZone: boolean;
}

export interface HandsFrame {
  /** Milisegundos (reloj de `performance.now()`). */
  time: number;
  /** Ancho / alto de la imagen de la cámara. */
  aspect: number;
  hands: Record<HandSide, TrackedHand | null>;
}

/** Rectángulo normalizado (0–1) de la vista espejo. */
export interface Zone {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Zona activa por defecto: todo menos la franja de abajo, donde se apoyan las manos para descansar. */
export const DEFAULT_ZONE: Zone = { left: 0.03, top: 0.03, right: 0.97, bottom: 0.8 };

// Suavizado de los puntos (unidades normalizadas por segundo).
const FILTER_MIN_CUTOFF = 1.7;
const FILTER_BETA = 12;

const PALM_POINTS = [LM.WRIST, LM.INDEX_MCP, LM.MIDDLE_MCP, LM.RING_MCP, LM.PINKY_MCP];

/**
 * Convierte la salida cruda de MediaPipe en información útil para el juego:
 * qué mano es cuál, puntos suavizados en la vista espejo, sello estable y
 * medidas como el centro o la inclinación. No toca la cámara ni el modelo,
 * así que se puede probar con datos grabados.
 */
export class HandsInterpreter {
  zone: Zone = DEFAULT_ZONE;
  private readonly filters = { left: new PointsFilter(FILTER_MIN_CUTOFF, FILTER_BETA), right: new PointsFilter(FILTER_MIN_CUTOFF, FILTER_BETA) };
  private readonly stabilizers = { left: new ShapeStabilizer(), right: new ShapeStabilizer() };
  private readonly last: Record<HandSide, TrackedHand | null> = { left: null, right: null };

  process(raw: readonly RawHand[], time: number, aspect: number): HandsFrame {
    const bySide = assignSides(raw);
    const hands: Record<HandSide, TrackedHand | null> = { left: null, right: null };

    for (const side of HAND_SIDES) {
      const hand = bySide[side];
      if (!hand) {
        this.filters[side].reset();
        // Si la mano se pierde un instante, se mantiene la última posición conocida.
        hands[side] = this.stabilizers[side].update(null, time) ? this.last[side] : null;
        this.last[side] = hands[side];
        continue;
      }

      const mirrored = hand.points.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
      const points = this.filters[side].filter(mirrored, time / 1000);
      const screen = points.map((p) => ({ x: p.x * aspect, y: p.y, z: p.z }));
      const rawShape = classifyHand(hand.world, screen);
      const center = average(PALM_POINTS.map((i) => points[i]));
      const wrist = screen[LM.WRIST];
      const middle = screen[LM.MIDDLE_MCP];

      hands[side] = this.last[side] = {
        side,
        points,
        shape: this.stabilizers[side].update(rawShape, time),
        rawShape,
        center,
        roll: Math.atan2(middle.x - wrist.x, -(middle.y - wrist.y)),
        size: Math.hypot(middle.x - wrist.x, middle.y - wrist.y),
        inZone: center.x >= this.zone.left && center.x <= this.zone.right && center.y >= this.zone.top && center.y <= this.zone.bottom,
      };
    }
    return { time, aspect, hands };
  }
}

/**
 * Decide qué mano es la derecha y cuál la izquierda del jugador.
 * Con la imagen original de la cámara (sin espejo), las etiquetas de
 * MediaPipe ya corresponden a la mano real del jugador (comprobado con una
 * webcam). Si las dos manos reciben la misma etiqueta, decide la posición en pantalla.
 */
export function assignSides(raw: readonly RawHand[]): Record<HandSide, RawHand | undefined> {
  const sideOf = (hand: RawHand): HandSide => (hand.label === 'Left' ? 'left' : 'right');
  if (raw.length === 2 && sideOf(raw[0]) === sideOf(raw[1])) {
    // En la vista espejo la mano derecha aparece a la derecha (x original menor).
    const [a, b] = raw;
    const aIsRight = meanX(a.points) < meanX(b.points);
    return { right: aIsRight ? a : b, left: aIsRight ? b : a };
  }
  const result: Record<HandSide, RawHand | undefined> = { left: undefined, right: undefined };
  for (const hand of raw) result[sideOf(hand)] ??= hand;
  return result;
}

function meanX(points: readonly Point3[]): number {
  return points.reduce((sum, p) => sum + p.x, 0) / points.length;
}

function average(points: readonly Point3[]): { x: number; y: number } {
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };
}
