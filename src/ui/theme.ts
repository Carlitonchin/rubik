import type { HandSide } from '../vision/hands-interpreter';

export const HAND_COLORS: Record<HandSide, string> = {
  right: '#ff8a2a',
  left: '#3fd0ff',
};

/** Color de la capa que pide el dojo. */
export const DOJO_TARGET_COLOR = '#ffd54a';

/** Color para un gesto según la mano: derecha, izquierda, o dorado si vale cualquiera o hacen falta las dos. */
export function handColor(hands: HandSide | 'any' | 'both'): string {
  return hands === 'left' || hands === 'right' ? HAND_COLORS[hands] : DOJO_TARGET_COLOR;
}
