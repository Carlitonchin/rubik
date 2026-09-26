import type { Coach, CoachFeedback, CoachState } from '../coach/coach';
import { formatTurn } from '../core/turn';
import { describeGesture, gestureForTurn, gestureSymbol, type TurnGesture } from '../input/ninja/seal-map';
import { recordLessonDone } from '../learn/progress';
import { STAGE_LESSONS, type StageLesson } from '../learn/stage-lessons';
import type { CubeView, LayerHighlight } from '../render/cube-view';
import { STAGES } from '../solver/beginner';
import { DOJO_TARGET_COLOR, handColor } from './theme';

const FEEDBACK_TEXTS: Record<CoachFeedback, string> = {
  none: '',
  correct: '✓ ¡Bien!',
  stepDone: '✓ ¡Paso completado!',
  back: '↩ Perfecto, seguimos desde aquí.',
  recalculated: 'Hiciste otro movimiento, pero no pasa nada: sigue desde aquí.',
  offPlan: '✗ Ese movimiento deshizo parte de lo avanzado. Pulsa «Deshacer» (o ✌️) para volver, o sigue desde aquí.',
};

const HAND_NAMES: Record<TurnGesture['hands'], string> = {
  right: 'Mano derecha',
  left: 'Mano izquierda',
  any: 'Cualquier mano',
  both: 'Las dos manos',
};

const PIECE_COLOR = '#ffffff';

export type LessonAction = 'repeat' | 'repeatHidden' | 'next' | 'dojo';

export interface CoachPanelHandle {
  open(): void;
  /** Abre el panel en modo lección (el cubo ya debe estar preparado o en camino). */
  openLesson(lesson: StageLesson, hintsHidden: boolean): void;
  close(): void;
  toggle(): void;
}

/**
 * Panel del entrenador («¿Qué hago ahora?»): etapa, objetivo del paso y
 * siguiente movimiento con su gesto. En el cubo se ilumina la capa a mover
 * (balanceándose hacia donde va el giro) y la pieza protagonista. También
 * guía las lecciones por etapa.
 */
export function mountCoachPanel(
  container: HTMLElement,
  coach: Coach,
  view: CubeView,
  hooks: { onOpen(): void; onLessonAction(action: LessonAction): void },
): CoachPanelHandle {
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
        <span class="coach-hand" data-hand></span>
        <span class="coach-symbol" data-symbol></span>
        <span class="coach-move-text" data-move-text></span>
        <span class="coach-notation" data-notation></span>
      </div>
      <div class="coach-sequence" data-sequence></div>
      <button type="button" class="secondary" data-action="reveal" hidden>💡 Ver el siguiente movimiento</button>
      <p class="coach-feedback" data-feedback></p>
      <button type="button" class="secondary" data-action="recalculate" hidden>Seguir desde aquí</button>
      <div class="coach-complete" data-complete hidden>
        <button type="button" class="primary" data-action="next">Siguiente lección</button>
        <button type="button" class="secondary" data-action="repeat">Otra vez</button>
        <button type="button" class="secondary" data-action="repeatHidden">Otra vez sin pistas</button>
        <button type="button" class="secondary" data-action="dojo">Volver al dojo</button>
      </div>
    </section>
    `,
  );

  const panel = container.querySelector<HTMLElement>('.coach')!;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const stageBars = panel.querySelectorAll<HTMLElement>('.coach-stages span');
  let lesson: StageLesson | null = null;
  let recordedCompletion = false;

  const showNext = (visible: boolean) => {
    $('[data-next]').hidden = !visible;
    $('[data-sequence]').hidden = !visible;
  };

  const render = (state: CoachState) => {
    if (!state.active) {
      view.setHighlights('coach', []);
      return;
    }
    const step = state.step;
    // Etapas terminadas: las anteriores a la actual; al completar una lección, hasta la suya.
    const lessonEnd = lesson ? Math.max(...lesson.stages.map((id) => STAGES.findIndex((s) => s.id === id))) + 1 : STAGES.length;
    const done = step ? state.stageNumber - 1 : state.lesson?.complete ? lessonEnd : STAGES.length;
    stageBars.forEach((bar, i) => {
      bar.classList.toggle('done', i < done);
      bar.classList.toggle('current', i + 1 === state.stageNumber && Boolean(step));
    });
    $('[data-feedback]').textContent = state.lesson?.complete ? '' : FEEDBACK_TEXTS[state.feedback];
    $('[data-feedback]').className = `coach-feedback ${state.feedback}`;
    $('[data-action="recalculate"]').hidden = state.feedback !== 'offPlan';
    $('[data-complete]').hidden = !state.lesson?.complete;
    $('[data-action="next"]').hidden = !nextLesson();
    $('[data-action="reveal"]').hidden = !(state.lesson?.hintsHidden && step);

    const label = lesson ? `Lección · ${lesson.title}` : step ? `Etapa ${state.stageNumber} de ${STAGES.length}` : '';
    $('[data-stage-label]').textContent = label;
    const stageName = step ? STAGES[state.stageNumber - 1].name : '';
    // En una lección de una sola etapa, el nombre de la etapa repetiría el de la lección.
    $('[data-stage-name]').textContent = stageName === lesson?.title ? '' : stageName;

    if (state.lesson?.preparing) {
      $('[data-title]').textContent = 'Preparando el cubo…';
      $('[data-detail]').textContent = lesson ? lesson.intro.join(' ') : '';
      showNext(false);
      view.setHighlights('coach', []);
      return;
    }

    if (state.lesson?.complete) {
      if (!recordedCompletion && lesson) {
        recordedCompletion = true;
        const progress = recordLessonDone(lesson.id, state.lesson.moves);
        $('[data-detail]').textContent = `En ${state.lesson.moves} movimientos. ${
          progress.completed === 1 ? '¡Primera vez!' : `La has completado ${progress.completed} veces (récord: ${progress.bestMoves} movimientos).`
        }`;
      }
      $('[data-title]').textContent = '¡Lección completada! 🎉';
      showNext(false);
      view.setHighlights('coach', []);
      return;
    }
    if (!step) {
      $('[data-title]').textContent = '¡Cubo resuelto! 🎉';
      $('[data-detail]').textContent = 'Mezcla otra vez para seguir practicando: las pistas te acompañan en cada paso.';
      showNext(false);
      view.setHighlights('coach', []);
      return;
    }
    if (state.lesson?.hintsHidden && lesson) {
      // Sin pistas: solo el objetivo de la lección.
      $('[data-title]').textContent = lesson.title;
      $('[data-detail]').textContent = lesson.intro.join(' ');
      showNext(false);
      view.setHighlights('coach', []);
      return;
    }

    $('[data-title]').textContent = step.title;
    $('[data-detail]').textContent = step.detail;
    const turn = step.turns[state.index];
    const gesture = gestureForTurn(turn);
    showNext(true);
    $('[data-count]').textContent = step.turns.length > 1 ? `(${state.index + 1} de ${step.turns.length})` : '';
    $('[data-hand]').textContent = gesture ? HAND_NAMES[gesture.hands] : '';
    $('[data-hand]').style.color = gesture ? handColor(gesture.hands) : '';
    $('[data-symbol]').textContent = gesture ? gestureSymbol(gesture) : formatTurn(turn);
    $('[data-move-text]').textContent = gesture ? describeGesture(gesture) : '';
    $('[data-notation]').textContent = `Notación: ${formatTurn(turn)}`;

    const sequence = $('[data-sequence]');
    sequence.hidden = step.turns.length < 2;
    sequence.innerHTML = step.turns
      .map((move, i) => {
        const g = gestureForTurn(move);
        const cls = i < state.index ? 'done' : i === state.index ? 'current' : '';
        const color = g ? `style="--hand-color: ${handColor(g.hands)}"` : '';
        return `<span class="coach-chip ${cls}" ${color} title="${formatTurn(move)}">${g ? gestureSymbol(g) : formatTurn(move)}</span>`;
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

  const nextLesson = () => {
    if (!lesson) return null;
    return STAGE_LESSONS[STAGE_LESSONS.indexOf(lesson) + 1] ?? null;
  };

  coach.subscribe(render);

  const open = () => {
    hooks.onOpen();
    lesson = null;
    panel.hidden = false;
    coach.start();
  };
  const close = () => {
    panel.hidden = true;
    lesson = null;
    coach.stop();
  };

  panel.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    switch (action) {
      case 'close':
        close();
        break;
      case 'recalculate':
        coach.recalculate();
        break;
      case 'reveal':
        coach.setHintsHidden(false);
        break;
      case 'repeat':
      case 'repeatHidden':
      case 'next':
      case 'dojo':
        hooks.onLessonAction(action);
        break;
    }
  });

  return {
    open,
    openLesson(next, hintsHidden) {
      hooks.onOpen();
      lesson = next;
      recordedCompletion = false;
      panel.hidden = false;
      coach.startLesson(next.stages, hintsHidden, true);
    },
    close,
    toggle: () => (panel.hidden ? open() : close()),
  };
}
