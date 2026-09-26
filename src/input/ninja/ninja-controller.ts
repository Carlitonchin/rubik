import type { Command } from '../../game/commands';
import type { Game } from '../../game/game';
import type { CubeView, LayerHighlight } from '../../render/cube-view';
import { HAND_COLORS } from '../../ui/theme';
import type { HandTracker } from '../../vision/hand-tracker';
import { HAND_SIDES, type HandsFrame } from '../../vision/hands-interpreter';
import { GestureEngine, type GestureState, type HandMode, type NinjaEvent } from './gesture-engine';
import { sealTargets } from './seal-map';

// Mientras la capa gira (`fired`) no se ilumina: el recuadro quieto no encajaría con la capa en movimiento.
const HIGHLIGHT_STRENGTH: Record<HandMode, number> = { idle: 0, arming: 0.45, armed: 1, fired: 0 };

/**
 * Modo ninja: con la cámara encendida, los sellos de las manos mueven el
 * cubo. Además ilumina la capa que va a moverse cada mano.
 */
export class NinjaController {
  readonly engine = new GestureEngine();
  /** Si es `false`, los sellos se detectan pero no mueven el cubo (el dojo lo usa para practicar sellos sueltos). */
  movesEnabled = true;
  allowScramble = true;
  private active = false;
  private readonly eventListeners = new Set<(event: NinjaEvent) => void>();
  private readonly stateListeners = new Set<(state: GestureState, frame: HandsFrame) => void>();

  constructor(
    private readonly game: Game,
    private readonly view: CubeView,
    tracker: HandTracker,
  ) {
    tracker.onStatus((status) => {
      this.active = status.state === 'running';
      if (!this.active) {
        this.engine.reset();
        this.view.setHighlights('ninja', []);
      }
    });
    tracker.onFrame((frame) => this.handleFrame(frame));
  }

  onEvent(listener: (event: NinjaEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onState(listener: (state: GestureState, frame: HandsFrame) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  handleFrame(frame: HandsFrame): void {
    if (!this.active) return;
    for (const event of this.engine.update(frame)) {
      const command = commandFor(event);
      if (this.movesEnabled && (event.type !== 'scramble' || this.allowScramble)) this.game.dispatch(command);
      for (const listener of this.eventListeners) listener(event);
    }
    const state = this.engine.state();
    this.view.setHighlights('ninja', highlightsFor(state));
    for (const listener of this.stateListeners) listener(state, frame);
  }
}

function commandFor(event: NinjaEvent): Command {
  switch (event.type) {
    case 'turn':
      return { type: 'turn', turn: event.turn };
    case 'rotate':
      return { type: 'rotate', rotation: event.rotation };
    default:
      return { type: event.type };
  }
}

function highlightsFor(state: GestureState): LayerHighlight[] {
  const highlights: LayerHighlight[] = [];
  for (const side of HAND_SIDES) {
    const { seal, mode } = state.hands[side];
    if (!seal || HIGHLIGHT_STRENGTH[mode] === 0) continue;
    for (const target of sealTargets(side, seal)) {
      highlights.push({ ...target, color: HAND_COLORS[side], strength: HIGHLIGHT_STRENGTH[mode] });
    }
  }
  return highlights;
}
