import { describe, expect, it } from 'vitest';
import { CubeState } from '../core/cube';
import { mulMatVec } from '../core/geometry';
import { randomScramble } from '../core/scramble';
import { inverseTurn, parseTurn, turnMatrix, type Turn } from '../core/turn';
import type { CubeChange } from '../game/game';
import { Coach, type CoachSource } from './coach';

/** Juego simulado: un cubo y el aviso de cada cambio. */
class FakeGame implements CoachSource {
  private readonly cube = new CubeState();
  private readonly listeners = new Set<(change: CubeChange) => void>();

  constructor(seed: number) {
    let state = seed;
    const random = () => ((state = (state * 1664525 + 1013904223) % 2 ** 32), state / 2 ** 32);
    for (const turn of randomScramble(25, random)) this.cube.applyTurn(turn);
  }

  cubeState(): CubeState {
    return this.cube.clone();
  }

  onCubeChange(listener: (change: CubeChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Giros del cubo entero hechos (no cuentan como movimientos). */
  rotations = 0;

  play(turn: Turn): void {
    let change: CubeChange;
    if (turn.layers.length === 3) {
      this.rotations++;
      const rotation = turnMatrix(turn);
      this.cube.applyRotation(rotation);
      change = { kind: 'rotate', rotation };
    } else {
      this.cube.applyTurn(turn);
      change = { kind: 'turn', turn };
    }
    for (const listener of this.listeners) listener(change);
  }

  /** Un cubo nuevo mezclado (como al preparar una lección). */
  reset(seed = 99): void {
    let state = seed;
    const random = () => ((state = (state * 1664525 + 1013904223) % 2 ** 32), state / 2 ** 32);
    this.cube.reset();
    for (const turn of randomScramble(25, random)) this.cube.applyTurn(turn);
    for (const listener of this.listeners) listener({ kind: 'reset' });
  }

  get solved(): boolean {
    return this.cube.isSolved();
  }
}

describe('entrenador', () => {
  it('siguiendo sus indicaciones se resuelve el cubo', () => {
    const game = new FakeGame(5);
    const coach = new Coach(game);
    coach.start();
    let moves = 0;
    while (coach.nextTurn() && moves < 1000) {
      game.play(coach.nextTurn()!);
      moves++;
    }
    expect(game.solved).toBe(true);
    expect(coach.state().step).toBeNull();
  });

  it('avanza con cada movimiento correcto', () => {
    const game = new FakeGame(6);
    const coach = new Coach(game);
    coach.start();
    const first = coach.state();
    game.play(coach.nextTurn()!);
    const after = coach.state();
    expect(after.feedback === 'correct' || after.feedback === 'stepDone').toBe(true);
    if (after.feedback === 'correct') expect(after.index).toBe(first.index + 1);
  });

  it('si un movimiento equivocado estropea lo avanzado, espera a que se deshaga', () => {
    const game = new FakeGame(7);
    const coach = new Coach(game);
    coach.start();
    // Avanza hasta estar a mitad de una secuencia de la segunda capa.
    while (!(coach.state().step?.stage === 'middle' && (coach.state().step?.turns.length ?? 0) >= 8)) game.play(coach.nextTurn()!);
    game.play(coach.nextTurn()!);
    game.play(coach.nextTurn()!);
    const indexBefore = coach.state().index;
    const wrong = parseTurn('F');
    game.play(wrong);
    expect(coach.state().feedback).toBe('offPlan');
    game.play(inverseTurn(wrong));
    expect(coach.state().feedback).toBe('back');
    expect(coach.state().index).toBe(indexBefore);
  });

  it('girar el cubo entero por su cuenta no estropea nada: recalcula', () => {
    const game = new FakeGame(8);
    const coach = new Coach(game);
    coach.start();
    game.play(parseTurn('y'));
    expect(['recalculated', 'correct', 'stepDone']).toContain(coach.state().feedback);
    expect(coach.state().step).not.toBeNull();
  });

  it('en una lección se para al terminar sus etapas y cuenta los movimientos', () => {
    const game = new FakeGame(10);
    const coach = new Coach(game);
    coach.startLesson(['daisy', 'cross'], false);
    let moves = 0;
    while (coach.nextTurn()) {
      expect(['daisy', 'cross']).toContain(coach.state().step?.stage);
      game.play(coach.nextTurn()!);
      moves++;
    }
    const { lesson } = coach.state();
    expect(lesson?.complete).toBe(true);
    // Girar el cubo entero no cuenta como movimiento.
    expect(lesson?.moves).toBe(moves - game.rotations);
    // La cruz está hecha pero el cubo no: la lección no pide más.
    expect(game.solved).toBe(false);
  });

  it('mientras se prepara el cubo de la lección, no la da por completada', () => {
    const game = new FakeGame(11);
    const coach = new Coach(game);
    // El cubo actual ya tiene la cruz hecha: sin esperar, la lección de la cruz saldría completada.
    coach.startLesson(['daisy', 'cross'], false);
    while (coach.nextTurn()) game.play(coach.nextTurn()!);
    coach.startLesson(['daisy', 'cross'], false, true);
    expect(coach.state().lesson).toMatchObject({ preparing: true, complete: false });
    game.reset();
    expect(coach.state().lesson).toMatchObject({ preparing: false, complete: false });
    expect(['daisy', 'cross']).toContain(coach.state().step?.stage);
  });

  it('sigue a la pieza protagonista mientras se mueve', () => {
    const game = new FakeGame(9);
    const coach = new Coach(game);
    coach.start();
    const [before] = coach.state().highlight;
    const turn = parseTurn('R');
    game.play(turn);
    const [after] = coach.state().highlight;
    const expected = before[0] === 1 ? mulMatVec(turnMatrix(turn), before) : before;
    expect(after).toEqual(expected);
  });
});
