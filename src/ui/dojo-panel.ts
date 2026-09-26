import { describeStep, DojoSession, LESSONS, stepTargets, type DojoResults, type Lesson, type StepHands } from '../dojo/lessons';
import type { Game } from '../game/game';
import { summarizeEvent } from '../input/ninja/describe';
import type { NinjaController } from '../input/ninja/ninja-controller';
import type { CubeView } from '../render/cube-view';
import type { HandTracker } from '../vision/hand-tracker';
import { DOJO_TARGET_COLOR, HAND_COLORS } from './theme';

interface DojoDeps {
  tracker: HandTracker;
  ninja: NinjaController;
  game: Game;
  view: CubeView;
}

const RECORD_KEY = (lessonId: string) => `rubik.dojo.${lessonId}`;

const HAND_LABELS: Record<StepHands, string> = {
  right: 'Mano derecha',
  left: 'Mano izquierda',
  both: 'Las dos manos',
  any: 'Cualquier mano',
};

/** Dojo: lecciones para entrenar los sellos, con precisión, tiempos y récords. */
export function mountDojo(
  container: HTMLElement,
  { tracker, ninja, game, view }: DojoDeps,
  hooks: { onOpen(): void },
): { open(): void; close(): void } {
  container.insertAdjacentHTML(
    'beforeend',
    `
    <section class="panel dojo" hidden aria-label="Dojo">
      <button type="button" class="dojo-close" data-action="close" aria-label="Salir del dojo">×</button>

      <div data-view="menu">
        <h2>Dojo</h2>
        <p class="dojo-intro">Entrena los sellos del modo ninja. Cada lección mide tu precisión y tu velocidad.</p>
        <p class="dojo-camera-note" data-camera-note hidden></p>
        <div class="dojo-lessons">
          ${LESSONS.map(
            (lesson, i) => `
            <button type="button" class="dojo-lesson" data-lesson="${lesson.id}">
              <span class="dojo-lesson-title">${i + 1}. ${lesson.title}</span>
              <span class="dojo-lesson-summary">${lesson.summary}</span>
              <span class="dojo-lesson-best" data-best="${lesson.id}"></span>
            </button>`,
          ).join('')}
        </div>
      </div>

      <div data-view="lesson" hidden>
        <header class="dojo-header">
          <span class="dojo-lesson-name" data-lesson-name></span>
          <span class="dojo-count" data-count></span>
        </header>
        <div class="dojo-progress"><div class="dojo-progress-bar" data-progress-bar></div></div>
        <div class="dojo-sequence" data-sequence hidden></div>
        <div class="dojo-prompt" data-prompt>
          <span class="dojo-hand" data-hand></span>
          <span class="dojo-symbol" data-symbol></span>
          <p class="dojo-text" data-text></p>
        </div>
        <p class="dojo-feedback" data-feedback></p>
        <button type="button" class="secondary" data-action="menu">Otras lecciones</button>
      </div>

      <div data-view="results" hidden>
        <h2>¡Lección completada!</h2>
        <div class="dojo-stats">
          <div><span class="dojo-stat-value" data-stat="accuracy"></span><span class="dojo-stat-label">precisión</span></div>
          <div><span class="dojo-stat-value" data-stat="average"></span><span class="dojo-stat-label">por paso</span></div>
          <div><span class="dojo-stat-value" data-stat="total"></span><span class="dojo-stat-label">en total</span></div>
        </div>
        <p class="dojo-record" data-record></p>
        <button type="button" class="primary" data-action="repeat">Repetir</button>
        <button type="button" class="secondary" data-action="menu">Otras lecciones</button>
      </div>
    </section>
    `,
  );

  const panel = container.querySelector<HTMLElement>('.dojo')!;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const views = panel.querySelectorAll<HTMLElement>('[data-view]');
  const feedback = $('[data-feedback]');
  let session: DojoSession | null = null;
  let lastLesson: Lesson | null = null;
  let flashTimer = 0;

  const showView = (name: 'menu' | 'lesson' | 'results') => {
    for (const element of views) element.hidden = element.dataset.view !== name;
  };

  const open = () => {
    hooks.onOpen();
    panel.hidden = false;
    ninja.allowScramble = false;
    showMenu();
    if (!tracker.isActive) void tracker.start();
  };

  const close = () => {
    session = null;
    panel.hidden = true;
    ninja.movesEnabled = true;
    ninja.allowScramble = true;
    view.setHighlights('dojo', []);
  };

  const showMenu = () => {
    session = null;
    ninja.movesEnabled = true;
    view.setHighlights('dojo', []);
    for (const lesson of LESSONS) {
      const record = loadRecord(lesson.id);
      $(`[data-best="${lesson.id}"]`).textContent = record ? `Tu récord: ${seconds(record.averageMs)} por paso` : '';
    }
    showView('menu');
  };

  const startLesson = (lesson: Lesson) => {
    lastLesson = lesson;
    game.dispatch({ type: 'reset' });
    session = new DojoSession(lesson, performance.now());
    ninja.movesEnabled = !lesson.practiceOnly;
    $('[data-lesson-name]').textContent = lesson.title;
    feedback.textContent = '';
    showView('lesson');
    renderStep();
  };

  const renderStep = () => {
    if (!session) return;
    const step = session.current;
    if (!step) return finish();
    const { hands, symbol, text } = describeStep(step);
    const hand = $('[data-hand]');
    hand.textContent = HAND_LABELS[hands];
    hand.style.color = hands === 'left' || hands === 'right' ? HAND_COLORS[hands] : 'var(--accent)';
    $('[data-symbol]').textContent = symbol;
    $('[data-text]').textContent = text;
    $('[data-count]').textContent = `${session.index + 1} / ${session.steps.length}`;
    $('[data-progress-bar]').style.width = `${(session.index / session.steps.length) * 100}%`;
    view.setHighlights(
      'dojo',
      stepTargets(step).map((target) => ({ ...target, color: DOJO_TARGET_COLOR, pulse: true })),
    );
    renderSequence();
  };

  /** En las técnicas se ve la secuencia completa y el paso en el que vas. */
  const renderSequence = () => {
    const sequence = $('[data-sequence]');
    const length = session?.lesson.sequenceLength;
    sequence.hidden = !length;
    if (!session || !length) return;
    const round = Math.floor(session.index / length);
    const rounds = session.steps.length / length;
    const chips = session.steps.slice(round * length, (round + 1) * length).map((step, i) => {
      const state = round * length + i < session!.index ? 'done' : round * length + i === session!.index ? 'current' : '';
      return `<span class="dojo-chip ${state}">${describeStep(step).symbol}</span>`;
    });
    sequence.innerHTML = `<span class="dojo-round">Ronda ${round + 1} de ${rounds}</span>${chips.join('')}`;
  };

  const finish = () => {
    if (!session) return;
    const results = session.results();
    const lessonId = session.lesson.id;
    session = null;
    ninja.movesEnabled = true;
    view.setHighlights('dojo', []);
    const previous = loadRecord(lessonId);
    const isRecord = !previous || results.averageMs < previous.averageMs;
    if (isRecord) localStorage.setItem(RECORD_KEY(lessonId), JSON.stringify({ averageMs: results.averageMs, accuracy: results.accuracy }));
    $('[data-stat="accuracy"]').textContent = `${Math.round(results.accuracy * 100)}%`;
    $('[data-stat="average"]').textContent = seconds(results.averageMs);
    $('[data-stat="total"]').textContent = seconds(results.totalMs);
    $('[data-record]').textContent = isRecord
      ? previous
        ? '¡Nuevo récord!'
        : 'Primer récord guardado.'
      : `Tu récord: ${seconds(previous.averageMs)} por paso`;
    showView('results');
  };

  const flash = (kind: 'correct' | 'wrong') => {
    panel.classList.remove('flash-correct', 'flash-wrong');
    void panel.offsetWidth;
    panel.classList.add(`flash-${kind}`);
    clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => panel.classList.remove(`flash-${kind}`), 400);
  };

  ninja.onEvent((event) => {
    if (!session) return;
    const result = session.handleEvent(event, performance.now());
    if (result === 'correct') {
      feedback.textContent = '✓ ¡Bien!';
      flash('correct');
      renderStep();
    } else if (result === 'wrong') {
      const { symbol, label } = summarizeEvent(event);
      feedback.textContent = `✗ Eso fue: ${symbol} ${label}`;
      flash('wrong');
    }
  });

  ninja.onState((_, frame) => {
    if (session?.handleFrame(frame) === 'correct') {
      feedback.textContent = '✓ ¡Bien!';
      flash('correct');
      renderStep();
    }
  });

  tracker.onStatus((status) => {
    const note = $('[data-camera-note]');
    note.hidden = status.state === 'running';
    if (status.state === 'starting') note.textContent = 'Encendiendo la cámara…';
    else if (status.state === 'error') note.textContent = `El dojo necesita la cámara. ${status.message}`;
    else if (status.state === 'off') note.textContent = 'El dojo necesita la cámara: pulsa «Ninja» para encenderla.';
  });

  panel.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const lessonButton = target.closest<HTMLElement>('[data-lesson]');
    if (lessonButton) {
      startLesson(LESSONS.find((lesson) => lesson.id === lessonButton.dataset.lesson)!);
      return;
    }
    switch (target.closest<HTMLElement>('[data-action]')?.dataset.action) {
      case 'close':
        close();
        break;
      case 'menu':
        showMenu();
        break;
      case 'repeat':
        if (lastLesson) startLesson(lastLesson);
        break;
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) close();
  });

  return { open, close };
}

function loadRecord(lessonId: string): Pick<DojoResults, 'averageMs' | 'accuracy'> | null {
  try {
    return JSON.parse(localStorage.getItem(RECORD_KEY(lessonId)) ?? 'null');
  } catch {
    return null;
  }
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}
