import { describe, expect, it } from 'vitest';
import { CubeState } from '../core/cube';
import { turnMatrix } from '../core/turn';
import { nextStep } from '../solver/beginner';
import { prepareLesson, STAGE_LESSONS } from './stage-lessons';

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

describe('lecciones por etapa', () => {
  it.each(STAGE_LESSONS.map((lesson) => [lesson.title, lesson] as const))('%s: el cubo llega listo para practicar esa etapa', (_, lesson) => {
    for (let seed = 1; seed <= 10; seed++) {
      const cube = new CubeState();
      for (const turn of prepareLesson(lesson, seededRandom(seed))) {
        if (turn.layers.length === 3) cube.applyRotation(turnMatrix(turn));
        else cube.applyTurn(turn);
      }
      expect(nextStep(cube)?.stage).toBe(lesson.stages[0]);
    }
  }, 60_000);

  it('cubren todas las etapas del método, en orden', () => {
    expect(STAGE_LESSONS.flatMap((lesson) => lesson.stages)).toEqual([
      'daisy',
      'cross',
      'corners',
      'middle',
      'yellowCross',
      'yellowEdges',
      'yellowCorners',
      'orientCorners',
    ]);
  });
});
