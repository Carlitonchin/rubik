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
  | { type: 'reset' };
