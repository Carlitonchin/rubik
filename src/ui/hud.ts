import type { Command } from '../game/commands';
import type { Game, GameSnapshot } from '../game/game';

const STATUS_HINTS: Record<GameSnapshot['status'], string> = {
  free: 'Juego libre · pulsa «Mezclar» para empezar un reto',
  ready: '¡Mezclado! El tiempo empieza con tu primer movimiento',
  solving: '',
  solved: '',
};

const ICONS = {
  scramble:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  reset:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/></svg>',
};

/** Interfaz sobre el cubo: cronómetro, contador, botones, ayuda y aviso de cubo resuelto. */
export function mountHud(container: HTMLElement, game: Game, dispatch: (command: Command) => void): void {
  container.insertAdjacentHTML(
    'beforeend',
    `
    <div class="hud">
      <header class="hud-stats">
        <div class="stat"><span class="stat-label">Tiempo</span><span class="stat-value" data-time>0:00.00</span></div>
        <div class="stat"><span class="stat-label">Movimientos</span><span class="stat-value" data-moves>0</span></div>
      </header>
      <p class="hud-hint" data-hint></p>
      <nav class="hud-actions">
        <button type="button" data-action="scramble">${ICONS.scramble}<span>Mezclar</span></button>
        <button type="button" data-action="undo">${ICONS.undo}<span>Deshacer</span></button>
        <button type="button" data-action="reset">${ICONS.reset}<span>Reiniciar</span></button>
        <button type="button" data-action="help">${ICONS.help}<span>Ayuda</span></button>
      </nav>
      <section class="panel solved" data-solved hidden>
        <h2>¡Resuelto!</h2>
        <p class="solved-time" data-solved-time></p>
        <p class="solved-moves" data-solved-moves></p>
        <button type="button" class="primary" data-action="scramble">Otro reto</button>
      </section>
      <section class="panel help" data-help hidden>
        <h2>Cómo se juega</h2>
        <h3>Con el dedo o el ratón</h3>
        <ul>
          <li><b>Arrastra sobre el cubo</b> para girar la fila o columna que tocas, en la dirección en que arrastras.</li>
          <li><b>Arrastra fuera del cubo</b> para girarlo entero y ver las otras caras.</li>
        </ul>
        <h3>Con el teclado</h3>
        <ul>
          <li><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> giran el cubo entero.</li>
          <li><kbd>R</kbd> <kbd>L</kbd> <kbd>U</kbd> <kbd>D</kbd> <kbd>F</kbd> <kbd>B</kbd> giran la cara derecha, izquierda, de arriba, de abajo, de frente y de atrás. Con <kbd>Mayús</kbd> giran al revés.</li>
          <li><kbd>M</kbd> <kbd>E</kbd> <kbd>S</kbd> giran las capas del medio.</li>
          <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> o <kbd>Retroceso</kbd> deshacen.</li>
        </ul>
        <button type="button" class="primary" data-action="close-help">Entendido</button>
      </section>
    </div>
    `,
  );

  const hud = container.querySelector<HTMLElement>('.hud')!;
  const find = <T extends HTMLElement>(selector: string) => hud.querySelector<T>(selector)!;
  const time = find('[data-time]');
  const moves = find('[data-moves]');
  const hint = find('[data-hint]');
  const solved = find('[data-solved]');
  const solvedTime = find('[data-solved-time]');
  const solvedMoves = find('[data-solved-moves]');
  const help = find('[data-help]');
  const undoButton = find<HTMLButtonElement>('[data-action="undo"]');
  const scrambleButtons = hud.querySelectorAll<HTMLButtonElement>('[data-action="scramble"]');

  hud.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!button) return;
    // Quitar el foco evita que el teclado vuelva a pulsar el botón.
    button.blur();
    switch (button.dataset.action) {
      case 'scramble':
        solved.hidden = true;
        dispatch({ type: 'scramble' });
        break;
      case 'undo':
        dispatch({ type: 'undo' });
        break;
      case 'reset':
        solved.hidden = true;
        dispatch({ type: 'reset' });
        break;
      case 'help':
        help.hidden = !help.hidden;
        if (!help.hidden) solved.hidden = true;
        break;
      case 'close-help':
        help.hidden = true;
        break;
    }
  });

  let status: GameSnapshot['status'] = 'free';
  game.subscribe((snapshot) => {
    if (snapshot.status === 'solved' && status !== 'solved') {
      solvedTime.textContent = formatTime(game.elapsedMs());
      solvedMoves.textContent = `${snapshot.moves} movimientos`;
      solved.hidden = false;
    } else if (snapshot.status !== 'solved') {
      solved.hidden = true;
    }
    status = snapshot.status;
    moves.textContent = String(snapshot.moves);
    hint.textContent = snapshot.scrambling ? 'Mezclando…' : STATUS_HINTS[snapshot.status];
    undoButton.disabled = !snapshot.canUndo;
    for (const button of scrambleButtons) button.disabled = snapshot.scrambling;
  });

  const tick = () => {
    time.textContent = formatTime(game.elapsedMs());
    time.classList.toggle('running', status === 'solving');
    requestAnimationFrame(tick);
  };
  tick();
}

function formatTime(ms: number): string {
  const totalCentis = Math.floor(ms / 10);
  const minutes = Math.floor(totalCentis / 6000);
  const seconds = Math.floor((totalCentis % 6000) / 100);
  const centis = totalCentis % 100;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}
