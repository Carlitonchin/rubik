import { describe, expect, it } from 'vitest';
import { CubeState } from '../core/cube';
import { turnFor } from '../input/ninja/seal-map';
import type { NinjaEvent } from '../input/ninja/gesture-engine';
import type { HandsFrame, TrackedHand } from '../vision/hands-interpreter';
import { DojoSession, LESSONS, SEAL_HOLD_MS, type DojoStep } from './lessons';

const lesson = (id: string) => LESSONS.find((l) => l.id === id)!;

function eventFor(step: DojoStep): NinjaEvent {
  if (step.kind === 'move') return { type: 'turn', ...step, turn: turnFor(step.side, step.seal, step.motion) };
  if (step.kind === 'middle') return { type: 'turn', side: 'left', seal: 'horns', motion: step.motion, turn: turnFor('left', 'horns', step.motion) };
  if (step.kind === 'rotate') return { type: 'rotate', seal: step.seal, motion: step.motion, rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
  throw new Error('Los pasos de sello no se hacen con eventos');
}

function frameWith(step: Extract<DojoStep, { kind: 'seal' }>, time: number): HandsFrame {
  const hand: TrackedHand = {
    side: step.side,
    points: [],
    shape: step.shape,
    rawShape: step.shape,
    center: { x: 0.5, y: 0.5 },
    roll: 0,
    size: 0.15,
    inZone: true,
  };
  return { time, aspect: 16 / 9, hands: { left: null, right: null, [step.side]: hand } };
}

describe('lecciones del dojo', () => {
  it('la lección de movimientos pide los 12 giros, cada uno una vez', () => {
    const steps = lesson('moves').createSteps(Math.random);
    expect(steps).toHaveLength(12);
    expect(new Set(steps.map((s) => JSON.stringify(s))).size).toBe(12);
  });

  it('el remolino hecho 6 veces deja el cubo como estaba', () => {
    const cube = new CubeState();
    for (const step of lesson('whirl').createSteps(Math.random)) {
      if (step.kind !== 'move') throw new Error('paso inesperado');
      cube.applyTurn(turnFor(step.side, step.seal, step.motion));
    }
    expect(cube.isSolved()).toBe(true);
  });

  it('cuenta aciertos, errores y tiempos', () => {
    const session = new DojoSession(lesson('moves'), 0);
    const [first, second] = session.steps;
    const wrong = session.steps.find((s) => JSON.stringify(s) !== JSON.stringify(first))!;
    expect(session.handleEvent(eventFor(wrong), 500)).toBe('wrong');
    expect(session.handleEvent(eventFor(first), 1000)).toBe('correct');
    expect(session.handleEvent({ type: 'undo' }, 1200)).toBe('ignored');
    expect(session.handleEvent(eventFor(second), 3000)).toBe('correct');
    expect(session.index).toBe(2);
    const results = session.results();
    expect(results.errors).toBe(1);
    expect(results.averageMs).toBe(1500);
  });

  it(`los pasos de sello piden mantenerlo ${SEAL_HOLD_MS} ms`, () => {
    const session = new DojoSession(lesson('seals'), 0);
    const step = session.current as Extract<DojoStep, { kind: 'seal' }>;
    expect(session.handleFrame(frameWith(step, 100))).toBe('pending');
    expect(session.handleFrame(frameWith(step, 100 + SEAL_HOLD_MS - 1))).toBe('pending');
    expect(session.handleFrame(frameWith(step, 100 + SEAL_HOLD_MS))).toBe('correct');
    expect(session.index).toBe(1);
  });

  it('las capas del medio se pueden hacer con cualquier mano', () => {
    const session = new DojoSession(lesson('middle'), 0);
    expect(session.steps).toHaveLength(6);
    while (!session.done) expect(session.handleEvent(eventFor(session.current!), 100)).toBe('correct');
  });

  it('se completa al terminar todos los pasos', () => {
    const session = new DojoSession(lesson('rotations'), 0);
    let time = 0;
    while (!session.done) session.handleEvent(eventFor(session.current!), (time += 800));
    expect(session.results()).toMatchObject({ steps: 6, errors: 0, accuracy: 1, averageMs: 800, totalMs: 4800 });
  });
});
