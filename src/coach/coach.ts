import type { CubeState } from '../core/cube';
import { mulMatVec, type Vec3 } from '../core/geometry';
import { turnMatrix, type Turn } from '../core/turn';
import type { CubeChange } from '../game/game';
import { nextStep, STAGES, type SolveStep, type StageId } from '../solver/beginner';

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

/** Lección por etapas: el entrenador se para al terminar sus etapas. */
export interface CoachLesson {
  stages: readonly StageId[];
  /** Practicar sin ver el siguiente movimiento (se puede pedir una pista). */
  hintsHidden: boolean;
  complete: boolean;
  /** Esperando a que el juego coloque el cubo de la lección. */
  preparing: boolean;
  /** Movimientos hechos durante la lección. */
  moves: number;
}

export interface CoachState {
  active: boolean;
  lesson: CoachLesson | null;
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
  private lesson: CoachLesson | null = null;
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
      lesson: this.lesson && { ...this.lesson },
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
    this.lesson = null;
    this.feedback = 'none';
    this.plan();
    this.emit();
  }

  /**
   * Empieza una lección: el entrenador se para cuando se terminan esas
   * etapas. Con `awaitSetup`, espera a que el juego coloque el cubo de la
   * lección (el siguiente cubo nuevo) antes de mirar nada: el cubo de antes
   * podría tener ya la etapa hecha.
   */
  startLesson(stages: readonly StageId[], hintsHidden: boolean, awaitSetup = false): void {
    this.active = true;
    this.lesson = { stages, hintsHidden, complete: false, preparing: awaitSetup, moves: 0 };
    this.feedback = 'none';
    if (awaitSetup) this.step = null;
    else this.plan();
    this.emit();
  }

  /** Muestra u oculta el siguiente movimiento en una lección. */
  setHintsHidden(hidden: boolean): void {
    if (!this.lesson) return;
    this.lesson.hintsHidden = hidden;
    this.emit();
  }

  stop(): void {
    this.active = false;
    this.lesson = null;
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
    if (this.lesson && this.beyondLesson(this.step)) {
      this.lesson.complete = true;
      this.step = null;
    }
  }

  /** ¿El paso es de una etapa posterior a las de la lección (o ya no queda nada)? */
  private beyondLesson(step: SolveStep | null): boolean {
    if (!this.lesson) return false;
    if (!step) return true;
    const last = Math.max(...this.lesson.stages.map((stage) => STAGES.findIndex((s) => s.id === stage)));
    return STAGES.findIndex((s) => s.id === step.stage) > last;
  }

  private onCubeChange(change: CubeChange): void {
    if (!this.active) return;
    if (change.kind === 'reset') {
      // Cubo nuevo (mezcla, reinicio o una lección preparada): se empieza de cero.
      if (this.lesson) Object.assign(this.lesson, { complete: false, preparing: false, moves: 0 });
      this.feedback = 'none';
      this.plan();
      this.emit();
      return;
    }
    if (this.lesson?.complete || this.lesson?.preparing) return;
    if (change.kind === 'turn' && this.lesson) this.lesson.moves++;
    if (!this.step) {
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
