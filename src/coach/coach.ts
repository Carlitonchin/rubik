import type { CubeState } from '../core/cube';
import { mulMatVec, type Vec3 } from '../core/geometry';
import { turnMatrix, type Turn } from '../core/turn';
import type { CubeChange } from '../game/game';
import { nextStep, STAGES, type SolveStep } from '../solver/beginner';

/** Lo que el entrenador necesita del juego. */
export interface CoachSource {
  cubeState(): CubeState;
  onCubeChange(listener: (change: CubeChange) => void): () => void;
}

/**
 * - `correct`: el movimiento era el indicado.
 * - `stepDone`: se terminó un paso.
 * - `back`: se deshizo un movimiento del paso y se sigue desde ahí.
 * - `recalculated`: se hizo otra cosa que no estropea nada; se sigue desde el nuevo estado.
 * - `offPlan`: el movimiento estropeó lo avanzado; conviene deshacerlo.
 */
export type CoachFeedback = 'none' | 'correct' | 'stepDone' | 'back' | 'recalculated' | 'offPlan';

export interface CoachState {
  active: boolean;
  /** Paso actual, o `null` si el cubo está resuelto. */
  step: SolveStep | null;
  /** Índice del siguiente movimiento dentro del paso. */
  index: number;
  /** Etapa (1 a 8). */
  stageNumber: number;
  feedback: CoachFeedback;
  /** Posición actual de las piezas protagonistas. */
  highlight: Vec3[];
}

/**
 * Entrenador: calcula el siguiente paso del método para principiantes y
 * sigue los movimientos del jugador. Si acierta, avanza; si se equivoca a
 * mitad de una secuencia, espera a que lo deshaga; si hace otra cosa que no
 * estropea nada, recalcula desde el nuevo estado.
 */
export class Coach {
  private active = false;
  private step: SolveStep | null = null;
  private index = 0;
  /** Estado del cubo antes de cada movimiento del paso (y al terminarlo). */
  private signatures: string[] = [];
  private highlight: Vec3[] = [];
  private feedback: CoachFeedback = 'none';
  private readonly listeners = new Set<(state: CoachState) => void>();

  constructor(private readonly source: CoachSource) {
    source.onCubeChange((change) => this.onCubeChange(change));
  }

  get isActive(): boolean {
    return this.active;
  }

  subscribe(listener: (state: CoachState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state());
    return () => this.listeners.delete(listener);
  }

  state(): CoachState {
    return {
      active: this.active,
      step: this.step,
      index: this.index,
      stageNumber: this.step ? STAGES.findIndex((s) => s.id === this.step!.stage) + 1 : STAGES.length,
      feedback: this.feedback,
      highlight: this.highlight,
    };
  }

  /** El siguiente movimiento que hay que hacer, si lo hay. */
  nextTurn(): Turn | null {
    return this.step?.turns[this.index] ?? null;
  }

  start(): void {
    this.active = true;
    this.feedback = 'none';
    this.plan();
    this.emit();
  }

  stop(): void {
    this.active = false;
    this.step = null;
    this.emit();
  }

  /** Olvida el plan y calcula uno nuevo desde el estado actual. */
  recalculate(): void {
    this.plan(this.step?.focus);
    this.feedback = 'recalculated';
    this.emit();
  }

  private plan(focus?: string): void {
    const cube = this.source.cubeState();
    this.step = nextStep(cube, focus);
    this.index = 0;
    this.signatures = [cube.signature()];
    for (const turn of this.step?.turns ?? []) {
      applyTurn(cube, turn);
      this.signatures.push(cube.signature());
    }
    this.highlight = this.step?.highlight ?? [];
  }

  private onCubeChange(change: CubeChange): void {
    if (!this.active) return;
    if (change.kind === 'reset' || !this.step) {
      this.feedback = 'none';
      this.plan();
      this.emit();
      return;
    }

    this.highlight = this.highlight.map((pos) => movePosition(pos, change));
    const signature = this.source.cubeState().signature();
    if (signature === this.signatures[this.index + 1]) {
      this.index++;
      if (this.index === this.step.turns.length) {
        this.plan(this.step.focus);
        this.feedback = 'stepDone';
      } else {
        this.feedback = 'correct';
      }
    } else {
      const back = this.signatures.lastIndexOf(signature);
      if (back !== -1 && back <= this.index) {
        this.index = back;
        this.feedback = 'back';
      } else {
        // Otra cosa: si no hace retroceder a una etapa anterior, se sigue desde ahí.
        const fresh = nextStep(this.source.cubeState(), this.step.focus);
        const stageOf = (step: SolveStep | null) => (step ? STAGES.findIndex((s) => s.id === step.stage) : STAGES.length);
        if (stageOf(fresh) >= stageOf(this.step)) {
          this.plan(this.step.focus);
          this.feedback = 'recalculated';
        } else {
          this.feedback = 'offPlan';
        }
      }
    }
    this.emit();
  }

  private emit(): void {
    const state = this.state();
    for (const listener of this.listeners) listener(state);
  }
}

function applyTurn(cube: CubeState, turn: Turn): void {
  if (turn.layers.length === 3) cube.applyRotation(turnMatrix(turn));
  else cube.applyTurn(turn);
}

function movePosition(pos: Vec3, change: CubeChange): Vec3 {
  if (change.kind === 'rotate') return mulMatVec(change.rotation, pos);
  if (change.kind === 'turn' && change.turn.layers.includes(pos[change.turn.axis])) return mulMatVec(turnMatrix(change.turn), pos);
  return pos;
}
