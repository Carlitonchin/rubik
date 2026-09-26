import { axisOf, cross, unitVector, type Axis } from '../core/geometry';
import type { Game } from '../game/game';
import type { CubeView, PickResult, ScreenVector } from '../render/cube-view';

/** Píxeles que hay que mover antes de decidir qué capa gira. */
const DIRECTION_THRESHOLD_PX = 10;
/** Distancia (en piezas) que hay que arrastrar por cada radián de giro. */
const TURN_RADIUS = 1;
/** Al soltar pasado este ángulo, el giro se completa aunque no llegue a la mitad. */
const COMMIT_ANGLE = Math.PI / 7;

type DragState =
  | { mode: 'idle' }
  | { mode: 'pending'; startX: number; startY: number; pick: PickResult }
  | {
      mode: 'layer';
      startX: number;
      startY: number;
      axis: Axis;
      layer: number;
      /** Dirección en pantalla en la que avanzan las pegatinas al girar en positivo. */
      screenUnit: ScreenVector;
      pxPerUnit: number;
      angleSign: 1 | -1;
      angle: number;
    }
  | { mode: 'rotate'; lastX: number; lastY: number };

/**
 * Convierte un arrastre en pantalla en giros: sobre una pieza gira su capa,
 * fuera del cubo gira el cubo entero. Recibe coordenadas de pantalla, así
 * que sirve igual para el dedo, el ratón o (más adelante) la mano.
 */
export class DragController {
  private state: DragState = { mode: 'idle' };

  constructor(
    private readonly game: Game,
    private readonly view: CubeView,
  ) {}

  /** Devuelve `false` si el arrastre no se puede empezar ahora. */
  press(x: number, y: number): boolean {
    if (this.state.mode !== 'idle' || !this.game.canInteract()) return false;
    const pick = this.view.pick(x, y);
    if (pick) {
      this.state = { mode: 'pending', startX: x, startY: y, pick };
    } else {
      this.game.beginFreeRotation();
      this.state = { mode: 'rotate', lastX: x, lastY: y };
    }
    return true;
  }

  move(x: number, y: number): void {
    const state = this.state;
    switch (state.mode) {
      case 'pending':
        if (Math.hypot(x - state.startX, y - state.startY) < DIRECTION_THRESHOLD_PX) return;
        // Mientras tanto pudo empezar otra animación (por ejemplo, una tecla).
        if (!this.game.canInteract()) {
          this.state = { mode: 'idle' };
          return;
        }
        this.startLayerDrag(state, x, y);
        this.move(x, y);
        break;
      case 'layer': {
        const along = (x - state.startX) * state.screenUnit.x + (y - state.startY) * state.screenUnit.y;
        const angle = (state.angleSign * along) / state.pxPerUnit / TURN_RADIUS;
        state.angle = Math.max(-Math.PI, Math.min(Math.PI, angle));
        this.game.updateLayerDrag(state.angle);
        break;
      }
      case 'rotate':
        this.game.updateFreeRotation(x - state.lastX, y - state.lastY);
        state.lastX = x;
        state.lastY = y;
        break;
    }
  }

  release(): void {
    const state = this.state;
    this.state = { mode: 'idle' };
    if (state.mode === 'layer') {
      void this.game.endLayerDrag(state.axis, state.layer, quartersFor(state.angle));
    } else if (state.mode === 'rotate') {
      void this.game.endFreeRotation();
    }
  }

  /**
   * Decide qué capa gira según hacia dónde se arrastra sobre la cara tocada:
   * de los dos ejes de esa cara se elige el que mejor coincide con el arrastre.
   */
  private startLayerDrag(state: Extract<DragState, { mode: 'pending' }>, x: number, y: number): void {
    const { pick } = state;
    const drag = { x: x - state.startX, y: y - state.startY };
    const faceAxis = axisOf(pick.normal).axis;

    let best: { axis: Axis; screen: ScreenVector; score: number } | null = null;
    for (const axis of [0, 1, 2] as const) {
      if (axis === faceAxis) continue;
      const screen = this.view.screenDirection(pick.point, unitVector(axis));
      const length = Math.hypot(screen.x, screen.y);
      if (length < 1e-6) continue;
      const score = Math.abs(screen.x * drag.x + screen.y * drag.y) / length;
      if (!best || score > best.score) best = { axis, screen, score };
    }
    if (!best) {
      this.state = { mode: 'idle' };
      return;
    }

    const pxPerUnit = Math.hypot(best.screen.x, best.screen.y);
    const sign = best.screen.x * drag.x + best.screen.y * drag.y >= 0 ? 1 : -1;
    // Girar alrededor de (normal × dirección del arrastre) mueve las pegatinas hacia donde arrastras.
    const rotationAxis = axisOf(cross(pick.normal, unitVector(best.axis, sign)));
    const layer = pick.cubiePos[rotationAxis.axis];

    this.game.beginLayerDrag(rotationAxis.axis, layer);
    this.state = {
      mode: 'layer',
      startX: state.startX,
      startY: state.startY,
      axis: rotationAxis.axis,
      layer,
      screenUnit: { x: (best.screen.x / pxPerUnit) * sign, y: (best.screen.y / pxPerUnit) * sign },
      pxPerUnit,
      angleSign: rotationAxis.sign,
      angle: 0,
    };
  }
}

function quartersFor(angle: number): number {
  const quarters = Math.round(angle / (Math.PI / 2));
  if (quarters === 0 && Math.abs(angle) > COMMIT_ANGLE) return Math.sign(angle);
  return quarters;
}

/** Conecta ratón y pantalla táctil (Pointer Events) al controlador de arrastre. */
export function attachPointerInput(element: HTMLElement, drag: DragController): void {
  let activePointer: number | null = null;

  element.addEventListener('pointerdown', (event) => {
    if (activePointer !== null || event.button !== 0) return;
    if (!drag.press(event.clientX, event.clientY)) return;
    activePointer = event.pointerId;
    element.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  element.addEventListener('pointermove', (event) => {
    if (event.pointerId === activePointer) drag.move(event.clientX, event.clientY);
  });

  const end = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    drag.release();
  };
  element.addEventListener('pointerup', end);
  element.addEventListener('pointercancel', end);
}
