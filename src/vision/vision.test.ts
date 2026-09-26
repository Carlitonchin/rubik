import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';
import fixtures from './__fixtures__/hands.json';
import { MEDIAPIPE_VERSION } from './assets';
import { classifyHand, type HandShape } from './hand-shape';
import { assignSides, HandsInterpreter, type RawHand } from './hands-interpreter';
import { OneEuroFilter } from './one-euro';
import { LOST_GRACE_MS, ShapeStabilizer, STABLE_MS } from './shape-stabilizer';

// Puntos reales que devolvió MediaPipe con fotos de ejemplo (se regeneran con scripts/generate-hand-fixtures.mjs).
type FixtureName = keyof typeof fixtures;
const fixture = (name: FixtureName, hand = 0) => {
  const image = fixtures[name];
  const h = image.hands[hand];
  const aspect = image.width / image.height;
  return {
    aspect,
    raw: { label: h.handedness, points: h.landmarks, world: h.worldLandmarks } satisfies RawHand,
  };
};

describe('reconocimiento de sellos con fotos reales', () => {
  const cases: [FixtureName, number, HandShape][] = [
    ['pointing_up', 0, 'point'],
    ['pointing_down', 0, 'point'],
    ['pointing_up_rotated', 0, 'point'],
    ['fist', 0, 'fist'],
    ['thumb_up', 0, 'fist'],
    ['victory', 0, 'two'],
    ['open_hand_a', 0, 'palm'],
    ['open_hand_b', 0, 'palm'],
    ['right_hands', 0, 'palm'],
    ['right_hands', 1, 'palm'],
  ];
  it.each(cases)('%s (mano %i) → %s', (name, hand, expected) => {
    const { raw } = fixture(name, hand);
    expect(classifyHand(raw.world)).toBe(expected);
  });
});

describe('qué mano es cuál', () => {
  const hand = (label: string, x: number): RawHand => ({
    label,
    points: Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0 })),
    world: [],
  });

  it('usa las etiquetas de MediaPipe tal cual', () => {
    expect(assignSides([hand('Left', 0.3)])).toEqual({ left: expect.anything(), right: undefined });
    expect(assignSides([hand('Right', 0.3)])).toEqual({ left: undefined, right: expect.anything() });
  });

  it('con una mano de cada, respeta las etiquetas aunque estén cruzadas en pantalla', () => {
    const left = hand('Left', 0.2);
    const right = hand('Right', 0.8);
    expect(assignSides([left, right])).toEqual({ left, right });
  });

  it('si ambas manos reciben la misma etiqueta, decide la posición', () => {
    const a = hand('Right', 0.2);
    const b = hand('Right', 0.8);
    // x original menor = más a la derecha en la vista espejo.
    expect(assignSides([a, b])).toEqual({ right: a, left: b });
    expect(assignSides([b, a])).toEqual({ right: a, left: b });
  });
});

describe('estabilizador de sellos', () => {
  it(`solo acepta un sello tras mantenerlo ${STABLE_MS} ms`, () => {
    const s = new ShapeStabilizer();
    expect(s.update('fist', 0)).toBeNull();
    expect(s.update('fist', STABLE_MS - 1)).toBeNull();
    expect(s.update('fist', STABLE_MS)).toBe('fist');
  });

  it('ignora un fotograma suelto con otra forma', () => {
    const s = new ShapeStabilizer();
    s.update('fist', 0);
    s.update('fist', 200);
    expect(s.update('palm', 233)).toBe('fist');
    expect(s.update('fist', 266)).toBe('fist');
    expect(s.update('fist', 400)).toBe('fist');
  });

  it('conserva el sello si la mano se pierde un instante, y lo suelta después', () => {
    const s = new ShapeStabilizer();
    s.update('palm', 0);
    s.update('palm', 150);
    expect(s.update(null, 150 + LOST_GRACE_MS - 1)).toBe('palm');
    expect(s.update(null, 150 + LOST_GRACE_MS + 1)).toBeNull();
  });
});

describe('filtro One Euro', () => {
  it('reduce el temblor de una mano quieta', () => {
    const filter = new OneEuroFilter(1.7, 12);
    const noise = [0.004, -0.003, 0.005, -0.004, 0.002, -0.005, 0.003, -0.002];
    const outputs = Array.from({ length: 60 }, (_, i) => filter.filter(0.5 + noise[i % noise.length], i / 30));
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
    expect(spread(outputs.slice(30))).toBeLessThan(spread(noise) / 2);
  });

  it('sigue rápido a un movimiento grande', () => {
    const filter = new OneEuroFilter(1.7, 12);
    for (let i = 0; i < 10; i++) filter.filter(0.2, i / 30);
    let value = 0;
    for (let i = 10; i < 16; i++) value = filter.filter(0.8, i / 30);
    // En 6 fotogramas (0,2 s) ya recorrió casi todo el camino.
    expect(value).toBeGreaterThan(0.75);
  });
});

describe('intérprete de manos', () => {
  it('pone los puntos en espejo, mide la mano y estabiliza el sello', () => {
    const { raw, aspect } = fixture('pointing_up');
    const interpreter = new HandsInterpreter();
    let frame = interpreter.process([raw], 0, aspect);
    const hand = frame.hands[raw.label === 'Left' ? 'left' : 'right']!;
    expect(hand.rawShape).toBe('point');
    expect(hand.shape).toBeNull();
    expect(hand.points[0].x).toBeCloseTo(1 - raw.points[0].x);
    expect(Math.abs(hand.roll)).toBeLessThan(0.35);
    expect(hand.size).toBeGreaterThan(0.1);
    expect(hand.inZone).toBe(true);

    for (let t = 33; t <= 133; t += 33) frame = interpreter.process([raw], t, aspect);
    expect(frame.hands[hand.side]!.shape).toBe('point');
  });
});

describe('recursos', () => {
  it('los archivos WASM corresponden a la versión instalada de MediaPipe', () => {
    expect(packageJson.dependencies['@mediapipe/tasks-vision']).toBe(MEDIAPIPE_VERSION);
  });
});
