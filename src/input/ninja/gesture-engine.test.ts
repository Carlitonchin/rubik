import { describe, expect, it } from 'vitest';
import { formatTurn, parseTurn, turnMatrix } from '../../core/turn';
import type { HandShape } from '../../vision/hand-shape';
import type { HandsFrame, HandSide, TrackedHand } from '../../vision/hands-interpreter';
import { GestureEngine, PAIR_WINDOW_MS, SCRAMBLE_HOLD_MS, UNDO_HOLD_MS, type NinjaEvent } from './gesture-engine';

// Manos simuladas. La imagen es de 16:9 y la mano mide 0,15 del alto,
// así que un "tamaño de mano" en horizontal son 0,15 / (16/9) de ancho.
const ASPECT = 16 / 9;
const SIZE = 0.15;
const FRAME_MS = 33;

interface HandPose {
  shape: HandShape | null;
  /** Forma detectada en el fotograma (por defecto, la misma que el sello estable). */
  raw?: HandShape;
  /** Desplazamiento desde el punto de partida, en tamaños de mano. */
  dx?: number;
  dy?: number;
  /** Inclinación en grados. */
  roll?: number;
  inZone?: boolean;
}

const HOME: Record<HandSide, { x: number; y: number }> = { left: { x: 0.3, y: 0.45 }, right: { x: 0.7, y: 0.45 } };

function hand(side: HandSide, pose: HandPose): TrackedHand {
  return {
    side,
    points: [],
    shape: pose.shape,
    rawShape: pose.raw ?? pose.shape ?? 'unknown',
    center: { x: HOME[side].x + ((pose.dx ?? 0) * SIZE) / ASPECT, y: HOME[side].y + (pose.dy ?? 0) * SIZE },
    roll: ((pose.roll ?? 0) * Math.PI) / 180,
    size: SIZE,
    inZone: pose.inZone ?? true,
  };
}

/** Simula fotogramas a 30 fps y acumula los eventos. */
class Simulator {
  readonly engine = new GestureEngine();
  readonly events: NinjaEvent[] = [];
  time = 0;

  frame(poses: Partial<Record<HandSide, HandPose>>): void {
    const frame: HandsFrame = {
      time: this.time,
      aspect: ASPECT,
      hands: {
        left: poses.left ? hand('left', poses.left) : null,
        right: poses.right ? hand('right', poses.right) : null,
      },
    };
    this.events.push(...this.engine.update(frame));
    this.time += FRAME_MS;
  }

  /** Mantiene una postura durante `ms`. */
  hold(poses: Partial<Record<HandSide, HandPose>>, ms: number): void {
    for (let t = 0; t < ms; t += FRAME_MS) this.frame(poses);
  }

  /** Mueve las manos de una postura a otra en `ms`. */
  move(from: Partial<Record<HandSide, HandPose>>, to: Partial<Record<HandSide, HandPose>>, ms: number): void {
    const steps = Math.max(1, Math.round(ms / FRAME_MS));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const mix = (side: HandSide): HandPose | undefined => {
        const a = from[side];
        const b = to[side];
        if (!a || !b) return b ?? a;
        const lerp = (p = 0, q = 0) => p + (q - p) * k;
        return { ...b, dx: lerp(a.dx, b.dx), dy: lerp(a.dy, b.dy), roll: lerp(a.roll, b.roll) };
      };
      this.frame({ left: mix('left'), right: mix('right') });
    }
  }

  moves(): string[] {
    return this.events.map((event) => {
      switch (event.type) {
        case 'turn':
          return formatTurn(event.turn);
        case 'rotate':
          return formatTurn({ ...rotationAsTurn(event.rotation) });
        default:
          return event.type;
      }
    });
  }
}

function rotationAsTurn(rotation: ReturnType<typeof turnMatrix>) {
  for (const name of ['x', "x'", 'y', "y'", 'z', "z'"]) {
    const turn = parseTurn(name);
    if (JSON.stringify(turnMatrix(turn)) === JSON.stringify(rotation)) return turn;
  }
  throw new Error('Rotación inesperada');
}

/** Un golpe de ida y vuelta con una mano. */
function flick(
  sim: Simulator,
  side: HandSide,
  shape: HandShape,
  to: Omit<HandPose, 'shape'>,
  others: Partial<Record<HandSide, HandPose>> = {},
): void {
  const rest = { shape };
  const peak = { ...to, shape };
  sim.move({ ...others, [side]: rest }, { ...others, [side]: peak }, 130);
  sim.move({ ...others, [side]: peak }, { ...others, [side]: rest }, 200);
  sim.hold({ ...others, [side]: rest }, 150);
}

describe('un sello y un golpe giran una capa', () => {
  it.each([
    ['right', 'fist', { dy: -1 }, 'R'],
    ['right', 'fist', { dy: 1 }, "R'"],
    ['left', 'fist', { dy: -1 }, "L'"],
    ['left', 'fist', { dy: 1 }, 'L'],
    ['right', 'point', { dx: -1 }, 'U'],
    ['right', 'point', { dx: 1 }, "U'"],
    ['left', 'point', { dx: -1 }, "D'"],
    ['left', 'point', { dx: 1 }, 'D'],
    ['right', 'palm', { roll: 50 }, 'F'],
    ['right', 'palm', { roll: -50 }, "F'"],
    ['left', 'palm', { roll: 50 }, "B'"],
    ['left', 'palm', { roll: -50 }, 'B'],
  ] as const)('mano %s, %s %o → %s', (side, shape, to, expected) => {
    const sim = new Simulator();
    sim.hold({ [side]: { shape } }, 200);
    flick(sim, side, shape, to);
    expect(sim.moves()).toEqual([expected]);
  });
});

describe('🤘 mueve las capas del medio con cualquier mano', () => {
  it.each([
    ['right', { dy: -1 }, "M'"],
    ['left', { dy: -1 }, "M'"],
    ['right', { dy: 1 }, 'M'],
    ['left', { dx: -1 }, "E'"],
    ['right', { dx: 1 }, 'E'],
    ['right', { roll: 45 }, 'S'],
    ['left', { roll: -45 }, "S'"],
  ] as const)('mano %s, %o → %s', (side, to, expected) => {
    const sim = new Simulator();
    sim.hold({ [side]: { shape: 'horns' } }, 200);
    flick(sim, side, 'horns', to);
    expect(sim.moves()).toEqual([expected]);
  });

  it('un golpe con la mano muy girada no cuenta (ni como golpe ni como giro)', () => {
    const sim = new Simulator();
    sim.hold({ right: { shape: 'horns' } }, 200);
    flick(sim, 'right', 'horns', { dy: -1, roll: 40 });
    expect(sim.moves()).toEqual([]);
  });

  it('con 🤘 en las dos manos no gira el cubo entero: cada una mueve la capa del medio', () => {
    const sim = new Simulator();
    const both = (dy: number) => ({ left: { shape: 'horns' as const, dy }, right: { shape: 'horns' as const, dy } });
    sim.hold(both(0), 200);
    sim.move(both(0), both(-1), 130);
    sim.hold(both(-1), 300);
    expect(sim.moves()).toEqual(["M'", "M'"]);
  });
});

describe('recarga', () => {
  it('volver al centro no gira nada, y se puede repetir el golpe', () => {
    const sim = new Simulator();
    sim.hold({ right: { shape: 'fist' } }, 200);
    flick(sim, 'right', 'fist', { dy: -1 });
    flick(sim, 'right', 'fist', { dy: -1 });
    flick(sim, 'right', 'fist', { dy: 1 });
    expect(sim.moves()).toEqual(['R', 'R', "R'"]);
  });

  it('al volver al centro se rearma al instante, sin esperar a que la mano se pare', () => {
    const sim = new Simulator();
    sim.hold({ right: { shape: 'fist' } }, 200);
    sim.move({ right: { shape: 'fist' } }, { right: { shape: 'fist', dy: -1 } }, 130);
    expect(sim.engine.state().hands.right.mode).toBe('fired');
    sim.move({ right: { shape: 'fist', dy: -1 } }, { right: { shape: 'fist' } }, 200);
    expect(sim.engine.state().hands.right.mode).toBe('armed');
  });

  it('el rebote al volver no dispara el giro contrario', () => {
    const sim = new Simulator();
    sim.hold({ right: { shape: 'fist' } }, 200);
    sim.move({ right: { shape: 'fist' } }, { right: { shape: 'fist', dy: -1 } }, 130);
    // Vuelve con fuerza y se pasa del centro 0,9 tamaños de mano.
    sim.move({ right: { shape: 'fist', dy: -1 } }, { right: { shape: 'fist', dy: 0.9 } }, 200);
    sim.move({ right: { shape: 'fist', dy: 0.9 } }, { right: { shape: 'fist' } }, 150);
    sim.hold({ right: { shape: 'fist' } }, 300);
    expect(sim.moves()).toEqual(['R']);
    // Pasado el rebote, un golpe hacia abajo sí cuenta.
    flick(sim, 'right', 'fist', { dy: 1 });
    expect(sim.moves()).toEqual(['R', "R'"]);
  });

  it('recarga aunque la vuelta no llegue exactamente al centro', () => {
    const sim = new Simulator();
    sim.hold({ right: { shape: 'fist' } }, 200);
    sim.move({ right: { shape: 'fist' } }, { right: { shape: 'fist', dy: -1 } }, 130);
    sim.move({ right: { shape: 'fist', dy: -1 } }, { right: { shape: 'fist', dy: -0.4 } }, 200);
    sim.hold({ right: { shape: 'fist', dy: -0.4 } }, 300);
    sim.move({ right: { shape: 'fist', dy: -0.4 } }, { right: { shape: 'fist', dy: -1.4 } }, 130);
    expect(sim.moves()).toEqual(['R', 'R']);
  });

  it('una deriva lenta no gira nada', () => {
    const sim = new Simulator();
    sim.hold({ right: { shape: 'fist' } }, 200);
    sim.move({ right: { shape: 'fist' } }, { right: { shape: 'fist', dy: -2 } }, 8000);
    expect(sim.moves()).toEqual([]);
  });

  it('un gesto a medias, sostenido y devuelto, no dispara el contrario', () => {
    const sim = new Simulator();
    sim.hold({ right: { shape: 'palm' } }, 200);
    // Gira 25° (no llega a 30°), lo sostiene y vuelve pasándose del centro.
    sim.move({ right: { shape: 'palm' } }, { right: { shape: 'palm', roll: -25 } }, 150);
    sim.hold({ right: { shape: 'palm', roll: -25 } }, 800);
    sim.move({ right: { shape: 'palm', roll: -25 } }, { right: { shape: 'palm', roll: 15 } }, 150);
    sim.hold({ right: { shape: 'palm', roll: 15 } }, 300);
    expect(sim.moves()).toEqual([]);
  });

  it('un movimiento en diagonal no cuenta', () => {
    const sim = new Simulator();
    sim.hold({ right: { shape: 'fist' } }, 200);
    flick(sim, 'right', 'fist', { dx: 1, dy: -1 });
    expect(sim.moves()).toEqual([]);
  });

  it('cada sello solo responde a su movimiento', () => {
    const sim = new Simulator();
    sim.hold({ right: { shape: 'point' } }, 200);
    flick(sim, 'right', 'point', { dy: -1.2 });
    expect(sim.moves()).toEqual([]);
  });

  it('en la zona de descanso no cuenta nada', () => {
    const sim = new Simulator();
    sim.hold({ right: { shape: 'fist', inZone: false } }, 200);
    sim.move({ right: { shape: 'fist', inZone: false } }, { right: { shape: 'fist', dy: -1, inZone: false } }, 130);
    expect(sim.moves()).toEqual([]);
  });

  it('subir la mano desde la zona de descanso no gira nada', () => {
    const sim = new Simulator();
    sim.hold({ right: { shape: 'fist', dy: 2, inZone: false } }, 200);
    // Entra en la zona a mitad de camino y sigue subiendo.
    sim.move({ right: { shape: 'fist', dy: 2, inZone: false } }, { right: { shape: 'fist', dy: 1.2, inZone: false } }, 100);
    sim.move({ right: { shape: 'fist', dy: 1.2 } }, { right: { shape: 'fist', dy: 0 } }, 150);
    sim.hold({ right: { shape: 'fist' } }, 200);
    expect(sim.moves()).toEqual([]);
    // Y ya parada, el golpe sí cuenta.
    flick(sim, 'right', 'fist', { dy: -1 });
    expect(sim.moves()).toEqual(['R']);
  });

  it('cambiar de sello en pleno movimiento no gira nada', () => {
    const sim = new Simulator();
    sim.hold({ right: { shape: 'palm' } }, 200);
    sim.frame({ right: { shape: 'fist' } });
    sim.move({ right: { shape: 'fist' } }, { right: { shape: 'fist', dy: -1.2 } }, 130);
    expect(sim.moves()).toEqual([]);
  });
});

describe('falsos giros', () => {
  it('cambiar de sello mientras la mano gira no dispara el sello anterior', () => {
    const sim = new Simulator();
    sim.hold({ right: { shape: 'palm' } }, 200);
    // La mano ya es un índice, pero el sello estable sigue siendo la palma un instante.
    sim.move({ right: { shape: 'palm', raw: 'point' } }, { right: { shape: 'palm', raw: 'point', roll: 90 } }, 99);
    sim.hold({ right: { shape: 'point', roll: 90 } }, 300);
    expect(sim.moves()).toEqual([]);
  });

  it('una imagen borrosa durante el golpe no lo bloquea', () => {
    const sim = new Simulator();
    sim.hold({ right: { shape: 'fist' } }, 200);
    sim.move({ right: { shape: 'fist', raw: 'unknown' } }, { right: { shape: 'fist', raw: 'unknown', dy: -1 } }, 130);
    expect(sim.moves()).toEqual(['R']);
  });

  it('un salto brusco (fallo del seguimiento) no gira nada', () => {
    const sim = new Simulator();
    sim.hold({ right: { shape: 'fist' } }, 200);
    sim.frame({ right: { shape: 'fist', dy: -2 } });
    sim.hold({ right: { shape: 'fist', dy: -2 } }, 300);
    expect(sim.moves()).toEqual([]);
  });
});

describe('las dos manos', () => {
  it('mismo sello y mismo movimiento a la vez: gira el cubo entero', () => {
    const sim = new Simulator();
    sim.hold({ left: { shape: 'fist' }, right: { shape: 'fist' } }, 200);
    sim.move({ left: { shape: 'fist' }, right: { shape: 'fist' } }, { left: { shape: 'fist', dy: -1 }, right: { shape: 'fist', dy: -1 } }, 130);
    sim.hold({ left: { shape: 'fist', dy: -1 }, right: { shape: 'fist', dy: -1 } }, 300);
    expect(sim.moves()).toEqual(['x']);
  });

  it('también si una mano llega un poco después', () => {
    const sim = new Simulator();
    sim.hold({ left: { shape: 'point' }, right: { shape: 'point' } }, 200);
    sim.move({ left: { shape: 'point' }, right: { shape: 'point' } }, { left: { shape: 'point' }, right: { shape: 'point', dx: -1 } }, 130);
    sim.move({ left: { shape: 'point' }, right: { shape: 'point', dx: -1 } }, { left: { shape: 'point', dx: -1 }, right: { shape: 'point', dx: -1 } }, 100);
    sim.hold({ left: { shape: 'point', dx: -1 }, right: { shape: 'point', dx: -1 } }, 300);
    expect(sim.moves()).toEqual(['y']);
  });

  it('si una mano completa el giro y la otra va a medio camino, gira el cubo entero', () => {
    const sim = new Simulator();
    const both = (left: number, right: number) => ({ left: { shape: 'palm' as const, roll: left }, right: { shape: 'palm' as const, roll: right } });
    sim.hold(both(0, 0), 200);
    // La izquierda gira 45° hacia la izquierda; la derecha, que lo tiene más difícil, solo 18°.
    sim.move(both(0, 0), both(-45, -18), 150);
    sim.hold(both(-45, -18), 300);
    sim.move(both(-45, -18), both(0, 0), 200);
    sim.hold(both(0, 0), 300);
    expect(sim.moves()).toEqual(["z'"]);
  });

  it('mismo sello, movimientos opuestos: dos giros', () => {
    const sim = new Simulator();
    sim.hold({ left: { shape: 'fist' }, right: { shape: 'fist' } }, 200);
    sim.move({ left: { shape: 'fist' }, right: { shape: 'fist' } }, { left: { shape: 'fist', dy: 1 }, right: { shape: 'fist', dy: -1 } }, 130);
    sim.hold({ left: { shape: 'fist', dy: 1 }, right: { shape: 'fist', dy: -1 } }, 300);
    expect(sim.moves().sort()).toEqual(['L', 'R']);
  });

  it(`si solo se mueve una, gira su capa tras esperar ${PAIR_WINDOW_MS} ms`, () => {
    const sim = new Simulator();
    const left = { shape: 'palm' } as const;
    sim.hold({ left, right: { shape: 'palm' } }, 200);
    flick(sim, 'right', 'palm', { roll: 50 }, { left });
    expect(sim.moves()).toEqual(['F']);
  });

  it('con sellos distintos, cada mano gira su capa sin esperar', () => {
    const sim = new Simulator();
    sim.hold({ left: { shape: 'point' }, right: { shape: 'fist' } }, 200);
    sim.move({ left: { shape: 'point' }, right: { shape: 'fist' } }, { left: { shape: 'point' }, right: { shape: 'fist', dy: -1 } }, 130);
    expect(sim.moves()).toEqual(['R']);
  });
});

describe('sellos especiales ✌️', () => {
  it(`✌️ con una mano durante ${UNDO_HOLD_MS} ms deshace (una sola vez)`, () => {
    const sim = new Simulator();
    sim.hold({ right: { shape: 'two' } }, UNDO_HOLD_MS - 100);
    expect(sim.moves()).toEqual([]);
    expect(sim.engine.state().hold?.action).toBe('undo');
    sim.hold({ right: { shape: 'two' } }, 2000);
    expect(sim.moves()).toEqual(['undo']);
    sim.hold({ right: { shape: 'fist' } }, 100);
    sim.hold({ right: { shape: 'two' } }, UNDO_HOLD_MS + 100);
    expect(sim.moves()).toEqual(['undo', 'undo']);
  });

  it(`✌️ con las dos manos durante ${SCRAMBLE_HOLD_MS} ms mezcla, sin deshacer`, () => {
    const sim = new Simulator();
    sim.hold({ left: { shape: 'two' }, right: { shape: 'two' } }, SCRAMBLE_HOLD_MS + 200);
    expect(sim.moves()).toEqual(['scramble']);
  });
});
