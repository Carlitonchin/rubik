import type { Command } from '../game/commands';
import type { Game, GameSnapshot } from '../game/game';
import { formatTime } from './format';

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
  camera:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 10l5-3v10l-5-3"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>',
  dojo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5c6 1.6 12 1.6 18 0M5 9.5h14M7.5 6.3V20M16.5 6.3V20"/></svg>',
  record: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/></svg>',
};

export interface HudOptions {
  onToggleCamera: () => void;
  onOpenDojo: () => void;
  onRecord: () => void;
  onHint: () => void;
}

export interface HudHandle {
  setCameraActive(active: boolean): void;
  setRecording(active: boolean): void;
  hideSolved(): void;
}

/** Interfaz sobre el cubo: cronómetro, contador, botones, ayuda y aviso de cubo resuelto. */
export function mountHud(container: HTMLElement, game: Game, dispatch: (command: Command) => void, options: HudOptions): HudHandle {
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
        <button type="button" data-action="camera" aria-pressed="false">${ICONS.camera}<span>Ninja</span></button>
        <button type="button" data-action="dojo">${ICONS.dojo}<span>Dojo</span></button>
        <button type="button" data-action="record">${ICONS.record}<span>Grabar</span></button>
      </nav>
      <button type="button" class="help-button" data-action="help" aria-label="Ayuda">?</button>
      <button type="button" class="hint-button" data-action="hint">💡 Pista</button>
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
        <h3>Modo ninja (con la cámara)</h3>
        <ul>
          <li>Pulsa <b>Ninja</b> y pon las manos frente a la cámara. ¿Primera vez? Entra al <b>Dojo</b>.</li>
          <li>La <b>mano derecha</b> mueve la columna derecha con ✊, la fila de arriba con ☝️ y la cara de frente con ✋. La <b>izquierda</b> hace lo mismo con la columna izquierda, la fila de abajo y la cara de atrás.</li>
          <li>Forma el sello, quédate quieto un instante y da un golpe: la capa va hacia donde mueves la mano. ✊ arriba o abajo, ☝️ a los lados, ✋ girando como un volante. Luego vuelve al centro.</li>
          <li><b>🤘 (índice y meñique)</b> con cualquier mano mueve las capas del medio: arriba o abajo la columna del medio, a los lados la fila del medio, y girando la capa del medio entre frente y atrás.</li>
          <li>El mismo sello con las dos manos, moviéndolas a la vez, gira el cubo entero.</li>
          <li>✌️ mantenido con una mano deshace; con las dos, mezcla.</li>
          <li>Baja las manos a la <b>zona de descanso</b> (la franja de abajo) para que no cuenten.</li>
        </ul>
        <h3>Aprender a armarlo</h3>
        <ul>
          <li>Pulsa <b>💡 Pista</b> cuando quieras: te dice en qué etapa estás, qué conseguir y cuál es el siguiente movimiento. En el cubo se ilumina la capa a mover, balanceándose hacia donde va el giro, y la pieza protagonista.</li>
          <li>Si te equivocas a mitad de una secuencia, deshaz el movimiento y seguirás donde ibas.</li>
        </ul>
        <h3>Grabar y compartir</h3>
        <ul>
          <li>Pulsa <b>Grabar</b> para elegir el formato: horizontal (tipo stream) o vertical (reels y TikTok).</li>
          <li>Por defecto se graba cada resolución sola: desde que se mezcla el cubo hasta que lo resuelves. También puedes grabar cuando quieras.</li>
          <li>Al terminar puedes ver el video, descargarlo o compartirlo. Nada sale de tu equipo hasta que lo compartes.</li>
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
  const cameraButton = find<HTMLButtonElement>('[data-action="camera"]');
  const recordButton = find<HTMLButtonElement>('[data-action="record"]');
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
      case 'camera':
        options.onToggleCamera();
        break;
      case 'dojo':
        help.hidden = true;
        options.onOpenDojo();
        break;
      case 'record':
        help.hidden = true;
        options.onRecord();
        break;
      case 'hint':
        help.hidden = true;
        solved.hidden = true;
        options.onHint();
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

  return {
    setCameraActive(active) {
      cameraButton.setAttribute('aria-pressed', String(active));
    },
    setRecording(active) {
      recordButton.classList.toggle('recording', active);
      recordButton.innerHTML = active ? `${ICONS.stop}<span>Parar</span>` : `${ICONS.record}<span>Grabar</span>`;
    },
    hideSolved() {
      solved.hidden = true;
    },
  };
}
