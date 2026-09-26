import { SHAPE_LABELS } from '../../vision/hand-shape';
import type { HandSide } from '../../vision/hands-interpreter';
import type { NinjaEvent } from './gesture-engine';
import { layerName, MOTION_ARROWS } from './seal-map';

/** Resumen corto de un evento ninja para mostrarlo en pantalla, por ejemplo «✊ ↑ · Columna derecha». */
export function summarizeEvent(event: NinjaEvent): { symbol: string; label: string; side?: HandSide } {
  switch (event.type) {
    case 'turn':
      return {
        symbol: `${SHAPE_LABELS[event.seal].emoji} ${MOTION_ARROWS[event.motion]}`,
        label: layerName(event.side, event.seal, event.motion),
        side: event.side,
      };
    case 'rotate': {
      const emoji = SHAPE_LABELS[event.seal].emoji;
      return { symbol: `${emoji}${emoji} ${MOTION_ARROWS[event.motion]}`, label: 'Cubo entero' };
    }
    case 'undo':
      return { symbol: '✌️', label: 'Deshacer' };
    case 'scramble':
      return { symbol: '✌️✌️', label: 'Mezclar' };
  }
}
