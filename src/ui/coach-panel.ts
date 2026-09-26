import type { Coach, CoachFeedback, CoachState } from '../coach/coach';
import { formatTurn } from '../core/turn';
import { describeGesture, gestureForTurn, gestureSymbol } from '../input/ninja/seal-map';
import type { CubeView, LayerHighlight } from '../render/cube-view';
import { STAGES } from '../solver/beginner';
import { DOJO_TARGET_COLOR } from './theme';

const FEEDBACK_TEXTS: Record<CoachFeedback, string> = {
  none: '',
  correct: '✓ ¡Bien!',
  stepDone: '✓ ¡Paso completado!',
  back: '↩ Perfecto, seguimos desde aquí.',
  recalculated: 'Hiciste otro movimiento, pero no pasa nada: sigue desde aquí.',
  offPlan: '✗ Ese movimiento deshizo parte de lo avanzado. Pulsa «Deshacer» (o ✌️) para volver, o sigue desde aquí.',
};

const PIECE_COLOR = '#ffffff';

export interface CoachPanelHandle {
  open(): void;
  close(): void;
  toggle(): void;
}

/**
 * Panel del entrenador («¿Qué hago ahora?»): etapa, objetivo del paso y
 * siguiente movimiento con su gesto. En el cubo se ilumina la capa a mover
 * (balanceándose hacia donde va el giro) y la pieza protagonista.
 */
export function mountCoachPanel(container: HTMLElement, coach: Coach, view: CubeView, hooks: { onOpen(): void }): CoachPanelHandle {
  container.insertAdjacentHTML(
    'beforeend',
    `
    <section class="panel coach" hidden aria-label="Pistas para armar el cubo">
      <button type="button" class="panel-close" data-action="close" aria-label="Cerrar">×</button>
      <header class="coach-header">
        <span class="coach-stage-label" data-stage-label></span>
        <span class="coach-stage-name" data-stage-name></span>
      </header>
      <div class="coach-stages">${STAGES.map(() => '<span></span>').join('')}</div>
      <h2 class="coach-title" data-title></h2>
      <p class="coach-detail" data-detail></p>
      <div class="coach-next" data-next>
        <span class="coach-next-label">Siguiente movimiento <span data-count></span></span>
        <span class="coach-symbol" data-symbol></span>
        <span class="coach-move-text" data-move-text></span>
        <span class="coach-notation" data-notation></span>
      </div>
      <div class="coach-sequence" data-sequence></div>
      <p class="coach-feedback" data-feedback></p>
      <button type="button" class="secondary" data-action="recalculate" hidden>Seguir desde aquí</button>
    </section>
    `,
  );

  const panel = container.querySelector<HTMLElement>('.coach')!;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const stageBars = panel.querySelectorAll<HTMLElement>('.coach-stages span');

  const render = (state: CoachState) => {
    if (!state.active) {
      view.setHighlights('coach', []);
      return;
    }
    const step = state.step;
    stageBars.forEach((bar, i) => {
      bar.classList.toggle('done', i + 1 < state.stageNumber || !step);
      bar.classList.toggle('current', i + 1 === state.stageNumber && Boolean(step));
    });
    $('[data-feedback]').textContent = FEEDBACK_TEXTS[state.feedback];
    $('[data-feedback]').className = `coach-feedback ${state.feedback}`;
    $('[data-action="recalculate"]').hidden = state.feedback !== 'offPlan';

    if (!step) {
      $('[data-stage-label]').textContent = '';
      $('[data-stage-name]').textContent = '';
      $('[data-title]').textContent = '¡Cubo resuelto! 🎉';
      $('[data-detail]').textContent = 'Mezcla otra vez para seguir practicando: las pistas te acompañan en cada paso.';
      $('[data-next]').hidden = true;
      $('[data-sequence]').hidden = true;
      view.setHighlights('coach', []);
      return;
    }

    $('[data-stage-label]').textContent = `Etapa ${state.stageNumber} de ${STAGES.length}`;
    $('[data-stage-name]').textContent = STAGES[state.stageNumber - 1].name;
    $('[data-title]').textContent = step.title;
    $('[data-detail]').textContent = step.detail;

    const turn = step.turns[state.index];
    const gesture = gestureForTurn(turn);
    $('[data-next]').hidden = false;
    $('[data-count]').textContent = step.turns.length > 1 ? `(${state.index + 1} de ${step.turns.length})` : '';
    $('[data-symbol]').textContent = gesture ? gestureSymbol(gesture) : formatTurn(turn);
    $('[data-move-text]').textContent = gesture ? describeGesture(gesture) : '';
    $('[data-notation]').textContent = `Notación: ${formatTurn(turn)}`;

    const sequence = $('[data-sequence]');
    sequence.hidden = step.turns.length < 2;
    sequence.innerHTML = step.turns
      .map((move, i) => {
        const g = gestureForTurn(move);
        const cls = i < state.index ? 'done' : i === state.index ? 'current' : '';
        return `<span class="coach-chip ${cls}" title="${formatTurn(move)}">${g ? gestureSymbol(g) : formatTurn(move)}</span>`;
      })
      .join('');

    // La capa del siguiente movimiento (o el cubo entero) se balancea hacia donde va el giro.
    const layers = turn.layers.length === 3 ? [-1, 0, 1] : turn.layers;
    const highlights: LayerHighlight[] = layers.map((layer) => ({
      axis: turn.axis,
      layer,
      color: DOJO_TARGET_COLOR,
      strength: turn.layers.length === 3 ? 0.5 : 1,
      preview: turn.quarters,
    }));
    for (const pos of state.highlight) highlights.push({ kind: 'piece', pos, color: PIECE_COLOR, strength: 0.8, pulse: true });
    view.setHighlights('coach', highlights);
  };

  coach.subscribe(render);

  const open = () => {
    hooks.onOpen();
    panel.hidden = false;
    coach.start();
  };
  const close = () => {
    panel.hidden = true;
    coach.stop();
  };

  panel.addEventListener('click', (event) => {
    switch ((event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action) {
      case 'close':
        close();
        break;
      case 'recalculate':
        coach.recalculate();
        break;
    }
  });

  return {
    open,
    close,
    toggle: () => (panel.hidden ? open() : close()),
  };
}
