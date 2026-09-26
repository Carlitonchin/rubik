import type { Mat3 } from '../core/geometry';
import type { Turn } from '../core/turn';

/**
 * Órdenes discretas que puede enviar cualquier modo de control
 * (teclado, botones y, más adelante, sellos del modo ninja).
 */
export type Command =
  | { type: 'turn'; turn: Turn }
  | { type: 'rotate'; rotation: Mat3 }
  | { type: 'undo' }
  | { type: 'scramble' }
  | { type: 'reset' }
  /** Deja el cubo en el estado que resulta de aplicar `turns` a un cubo resuelto, sin animación (lecciones). */
  | { type: 'setup'; turns: readonly Turn[] };
