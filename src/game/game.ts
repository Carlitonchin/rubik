import { CubeState } from '../core/cube';
import { matEquals, IDENTITY, type Axis, type Mat3 } from '../core/geometry';
import { randomScramble } from '../core/scramble';
import { inverseTurn, isWholeCube, transformTurn, turnMatrix, type Turn } from '../core/turn';
import type { CubeView } from '../render/cube-view';
import type { Command } from './commands';

/**
 * - `free`: juego libre, sin reto.
 * - `ready`: cubo mezclado, esperando el primer movimiento.
 * - `solving`: el cronómetro corre.
 * - `solved`: reto terminado.
 */
export type GameStatus = 'free' | 'ready' | 'solving' | 'solved';

export interface GameSnapshot {
  status: GameStatus;
  moves: number;
  canUndo: boolean;
  scrambling: boolean;
}

/** Qué cambió en el cubo: un giro, girar el cubo entero, o todo de golpe (reiniciar o mezclar). */
export type CubeChange = { kind: 'turn'; turn: Turn } | { kind: 'rotate'; rotation: Mat3 } | { kind: 'reset' };

type Action =
  | { kind: 'turn'; turn: Turn }
  | { kind: 'rotate'; rotation: Mat3 }
  | { kind: 'undo' }
  | { kind: 'scramble' }
  | { kind: 'reset' };

const TURN_MS = 150;
/** Si se acumulan órdenes (teclear rápido), se animan más deprisa para no quedarse atrás. */
const QUEUED_TURN_MS = 70;
const SCRAMBLE_TURN_MS = 45;
const ROTATE_MS = 200;
const SNAP_MS = 150;

/**
 * Reglas del juego: recibe órdenes de los controles, las anima en orden,
 * mantiene el estado lógico, el historial para deshacer y el cronómetro.
 */
export class Game {
  private readonly cube = new CubeState();
  private readonly listeners = new Set<(snapshot: GameSnapshot) => void>();
  private readonly cubeListeners = new Set<(change: CubeChange) => void>();
  private queue: Action[] = [];
  private busy = false;
  /** El jugador está arrastrando una capa o el cubo. */
  private interacting = false;
  private history: Turn[] = [];
  private status: GameStatus = 'free';
  private moves = 0;
  private scrambling = false;
  private startTime = 0;
  private finalTimeMs = 0;

  constructor(private readonly view: CubeView) {}

  dispatch(command: Command): void {
    switch (command.type) {
      case 'turn':
        this.enqueue(isWholeCube(command.turn) ? { kind: 'rotate', rotation: turnMatrix(command.turn) } : { kind: 'turn', turn: command.turn });
        break;
      case 'rotate':
        this.enqueue({ kind: 'rotate', rotation: command.rotation });
        break;
      default:
        this.enqueue({ kind: command.type });
    }
  }

  subscribe(listener: (snapshot: GameSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  /** Se llama cada vez que cambia el cubo (tras terminar la animación). */
  onCubeChange(listener: (change: CubeChange) => void): () => void {
    this.cubeListeners.add(listener);
    return () => this.cubeListeners.delete(listener);
  }

  /** Copia del estado actual del cubo, tal como se ve. */
  cubeState(): CubeState {
    return this.cube.clone();
  }

  snapshot(): GameSnapshot {
    return { status: this.status, moves: this.moves, canUndo: this.history.length > 0, scrambling: this.scrambling };
  }

  elapsedMs(): number {
    if (this.status === 'solving') return performance.now() - this.startTime;
    if (this.status === 'solved') return this.finalTimeMs;
    return 0;
  }

  /** ¿Se puede empezar a arrastrar ahora mismo? */
  canInteract(): boolean {
    return !this.busy && !this.interacting;
  }

  // --- Arrastre de una capa (táctil, ratón y, más adelante, modo medio) --

  beginLayerDrag(axis: Axis, layer: number): void {
    this.interacting = true;
    this.view.beginManualTurn(axis, layer);
  }

  updateLayerDrag(radians: number): void {
    this.view.setManualAngle(radians);
  }

  async endLayerDrag(axis: Axis, layer: number, quarters: number): Promise<void> {
    await this.view.finishManualTurn(quarters);
    if (quarters !== 0) this.commitTurn({ axis, layers: [layer], quarters }, true);
    this.interacting = false;
    this.pump();
  }

  // --- Arrastre del cubo entero -----------------------------------------

  beginFreeRotation(): void {
    this.interacting = true;
  }

  updateFreeRotation(dx: number, dy: number): void {
    this.view.rotateByScreenDelta(dx, dy);
  }

  async endFreeRotation(): Promise<void> {
    const rotation = this.view.nearestRotation();
    await this.view.animateRotation(rotation, SNAP_MS);
    this.commitRotation(rotation);
    this.interacting = false;
    this.pump();
  }

  // --- Internos ---------------------------------------------------------

  private enqueue(action: Action): void {
    this.queue.push(action);
    this.pump();
  }

  private async pump(): Promise<void> {
    if (this.busy || this.interacting) return;
    this.busy = true;
    while (this.queue.length > 0 && !this.interacting) {
      const action = this.queue.shift()!;
      await this.run(action);
    }
    this.busy = false;
    this.emit();
  }

  private async run(action: Action): Promise<void> {
    const turnMs = this.queue.length > 0 ? QUEUED_TURN_MS : TURN_MS;
    switch (action.kind) {
      case 'turn':
        await this.view.animateTurn(action.turn, turnMs);
        this.commitTurn(action.turn, true);
        break;
      case 'rotate':
        await this.view.animateRotation(action.rotation, ROTATE_MS);
        this.commitRotation(action.rotation);
        break;
      case 'undo': {
        const last = this.history.pop();
        if (!last) break;
        const turn = inverseTurn(last);
        await this.view.animateTurn(turn, turnMs);
        this.commitTurn(turn, false);
        break;
      }
      case 'scramble':
        await this.scramble();
        break;
      case 'reset':
        this.cube.reset();
        this.view.reset();
        this.history = [];
        this.moves = 0;
        this.status = 'free';
        this.emit();
        this.emitCube({ kind: 'reset' });
        break;
    }
  }

  private async scramble(): Promise<void> {
    this.scrambling = true;
    this.status = 'free';
    this.emit();
    let turns = randomScramble();
    for (const turn of turns) {
      await this.view.animateTurn(turn, SCRAMBLE_TURN_MS);
      this.cube.applyTurn(turn);
    }
    // Muy improbable, pero una mezcla nunca debe dejar el cubo resuelto.
    while (this.cube.isSolved()) {
      turns = randomScramble(3);
      for (const turn of turns) {
        await this.view.animateTurn(turn, SCRAMBLE_TURN_MS);
        this.cube.applyTurn(turn);
      }
    }
    this.scrambling = false;
    this.history = [];
    this.moves = 0;
    this.status = 'ready';
    this.emit();
    this.emitCube({ kind: 'reset' });
  }

  private commitTurn(turn: Turn, record: boolean): void {
    this.cube.applyTurn(turn);
    this.emitCube({ kind: 'turn', turn });
    if (record) this.history.push(turn);

    if (this.status === 'ready') {
      this.status = 'solving';
      this.startTime = performance.now();
    } else if (this.status === 'solved') {
      // Seguir girando después de resolver vuelve al juego libre.
      this.status = 'free';
      this.moves = 0;
    }
    this.moves++;
    if (this.status === 'solving' && this.cube.isSolved()) {
      this.finalTimeMs = performance.now() - this.startTime;
      this.status = 'solved';
    }
    this.emit();
  }

  /** Girar el cubo entero no cuenta como movimiento, pero el historial debe seguir a las piezas. */
  private commitRotation(rotation: Mat3): void {
    if (matEquals(rotation, IDENTITY)) return;
    this.cube.applyRotation(rotation);
    this.history = this.history.map((turn) => transformTurn(turn, rotation));
    this.emitCube({ kind: 'rotate', rotation });
  }

  private emitCube(change: CubeChange): void {
    for (const listener of this.cubeListeners) listener(change);
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
