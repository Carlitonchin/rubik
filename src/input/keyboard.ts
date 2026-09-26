import { quarterRotation } from '../core/geometry';
import { parseTurn } from '../core/turn';
import type { Command } from '../game/commands';

const TURN_KEYS = new Set(['r', 'l', 'u', 'd', 'f', 'b', 'm', 'e', 's', 'x', 'y', 'z']);

/** Las flechas mueven el cubo entero hacia donde apuntan. */
const ARROW_ROTATIONS: Record<string, Command> = {
  ArrowLeft: { type: 'rotate', rotation: quarterRotation(1, -1) },
  ArrowRight: { type: 'rotate', rotation: quarterRotation(1, 1) },
  ArrowUp: { type: 'rotate', rotation: quarterRotation(0, -1) },
  ArrowDown: { type: 'rotate', rotation: quarterRotation(0, 1) },
};

/** Traduce una tecla a una orden del juego, o `null` si no hace nada. */
export function commandForKey(event: KeyboardEvent): Command | null {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') return { type: 'undo' };
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === 'Backspace') return { type: 'undo' };
  if (event.key in ARROW_ROTATIONS) return ARROW_ROTATIONS[event.key];

  const key = event.key.toLowerCase();
  if (!TURN_KEYS.has(key)) return null;
  const name = ['x', 'y', 'z'].includes(key) ? key : key.toUpperCase();
  return { type: 'turn', turn: parseTurn(name + (event.shiftKey ? "'" : '')) };
}

export function attachKeyboardInput(target: Window, dispatch: (command: Command) => void): void {
  target.addEventListener('keydown', (event) => {
    if (event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const command = commandForKey(event);
    if (!command) return;
    event.preventDefault();
    dispatch(command);
  });
}
