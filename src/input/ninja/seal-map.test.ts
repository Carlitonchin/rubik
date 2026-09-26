import { describe, expect, it } from 'vitest';
import { parseTurn } from '../../core/turn';
import { HAND_SIDES } from '../../vision/hands-interpreter';
import { describeGesture, gestureForTurn, gestureSymbol, SEAL_MOTIONS, SEALS, turnFor } from './seal-map';

describe('gesto de cada giro', () => {
  it('es lo contrario de turnFor para todos los sellos y movimientos', () => {
    for (const side of HAND_SIDES) {
      for (const seal of SEALS) {
        for (const motion of SEAL_MOTIONS[seal]) {
          const gesture = gestureForTurn(turnFor(side, seal, motion))!;
          expect(gesture).toMatchObject({ seal, motion, count: 1, hands: seal === 'horns' ? 'any' : side });
        }
      }
    }
  });

  it.each([
    ['R', '✊ ↑', 'Sube la columna derecha'],
    ["L'", '✊ ↑', 'Sube la columna izquierda'],
    ["D'", '☝️ ←', 'Lleva la fila de abajo a la izquierda'],
    ['F2', '✋ ↻ ×2', 'Gira la cara de frente hacia la derecha (dos veces)'],
    ["M'", '🤘 ↑', 'Sube la columna del medio'],
    ['y', '☝️☝️ ←', 'Gira el cubo hacia la izquierda'],
    ['x2', '✊✊ ↑ ×2', 'Inclina el cubo hacia arriba (dos veces)'],
  ])('%s → %s «%s»', (notation, symbol, text) => {
    const gesture = gestureForTurn(parseTurn(notation))!;
    expect(gestureSymbol(gesture)).toBe(symbol);
    expect(describeGesture(gesture)).toBe(text);
  });
});
