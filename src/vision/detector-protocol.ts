import type { RawHand } from './hands-interpreter';

/** Mensajes del juego al worker del detector. */
export type DetectorRequest = { type: 'init' } | { type: 'detect'; frame: ImageBitmap; timestamp: number };

/** Mensajes del worker del detector al juego. */
export type DetectorResponse =
  | { type: 'ready'; delegate: 'GPU' | 'CPU' }
  | { type: 'init-error'; message: string }
  | { type: 'result'; hands: RawHand[] }
  | { type: 'detect-error'; message: string };
