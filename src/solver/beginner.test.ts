import { describe, expect, it } from 'vitest';
import { CubeState } from '../core/cube';
import { randomScramble } from '../core/scramble';
import { parseAlgorithm, turnMatrix, type Turn } from '../core/turn';
import { nextStep, solve, STAGES, type SolveStep } from './beginner';

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

function applyTurns(cube: CubeState, turns: readonly Turn[]): void {
  for (const turn of turns) {
    if (turn.layers.length === 3) cube.applyRotation(turnMatrix(turn));
    else cube.applyTurn(turn);
  }
}

function scrambled(seed: number): CubeState {
  const cube = new CubeState();
  applyTurns(cube, randomScramble(25, seededRandom(seed)));
  return cube;
}

const stageIndex = (step: SolveStep) => STAGES.findIndex((s) => s.id === step.stage);

describe('resolvedor del método para principiantes', () => {
  it('resuelve 300 mezclas aleatorias', () => {
    const started = performance.now();
    let maxSteps = 0;
    let totalMoves = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const cube = scrambled(seed);
      const steps = solve(cube);
      const check = cube.clone();
      for (const step of steps) {
        expect(step.turns.length, `paso vacío: ${step.title}`).toBeGreaterThan(0);
        applyTurns(check, step.turns);
      }
      expect(check.isSolved(), `mezcla ${seed}`).toBe(true);
      maxSteps = Math.max(maxSteps, steps.length);
      totalMoves += steps.reduce((sum, step) => sum + step.turns.filter((t) => t.layers.length < 3).length, 0);
    }
    const perSolveMs = (performance.now() - started) / 300;
    console.info(`pasos máximos: ${maxSteps} · movimientos de media: ${(totalMoves / 300).toFixed(0)} · ${perSolveMs.toFixed(1)} ms por resolución`);
    // Cada pista tiene que calcularse al instante.
    expect(perSolveMs).toBeLessThan(250);
  }, 60_000);

  it('las etapas avanzan en orden', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const stages = solve(scrambled(seed)).map(stageIndex);
      for (let i = 1; i < stages.length; i++) expect(stages[i]).toBeGreaterThanOrEqual(stages[i - 1]);
    }
  }, 60_000);

  it('un cubo resuelto no necesita pasos', () => {
    expect(nextStep(new CubeState())).toBeNull();
  });

  it('sin el blanco arriba, lo primero es girar el cubo', () => {
    const cube = scrambled(3);
    cube.applyRotation(turnMatrix(parseAlgorithm('x')[0]));
    const step = nextStep(cube)!;
    expect(step.turns.every((turn) => turn.layers.length === 3)).toBe(true);
  });

  describe('etapa 8: capas de abajo desordenadas a propósito', () => {
    /** Estado justo antes del primer remolino de la etapa 8. */
    function beforeOrienting(): { cube: CubeState; step: SolveStep } {
      for (let seed = 1; seed < 200; seed++) {
        const cube = scrambled(seed);
        let focus: string | undefined;
        for (let i = 0; i < 200; i++) {
          const step = nextStep(cube, focus);
          if (!step) break;
          if (step.stage === 'orientCorners' && step.turns.length >= 4) return { cube, step };
          applyTurns(cube, step.turns);
          focus = step.focus;
        }
      }
      throw new Error('No se encontró una etapa 8 con esquinas por girar');
    }

    it('a mitad de un remolino, pide terminarlo', () => {
      const { cube } = beforeOrienting();
      applyTurns(cube, parseAlgorithm("R'"));
      const step = nextStep(cube)!;
      expect(step.stage).toBe('orientCorners');
      expect(step.turns).toEqual(parseAlgorithm("D' R D"));
    });

    it('con las capas de abajo desordenadas por los remolinos, sigue en la etapa 8 y termina', () => {
      const { cube, step } = beforeOrienting();
      applyTurns(cube, step.turns.slice(0, 4));
      const next = nextStep(cube)!;
      expect(next.stage).toBe('orientCorners');
      const steps = solve(cube);
      expect(steps.every((s) => s.stage === 'orientCorners')).toBe(true);
      steps.forEach((s) => applyTurns(cube, s.turns));
      expect(cube.isSolved()).toBe(true);
    });
  });
});
