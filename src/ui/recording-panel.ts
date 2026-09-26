import { FORMAT_NAMES, type VideoFormat } from '../recording/formats';
import type { RecordingController, RecordingResult } from '../recording/recording-controller';
import { formatTime } from './format';

export interface RecordingPanelHandle {
  /** Botón «Grabar»: abre las opciones o, si ya se está grabando, para. */
  toggle(): void;
}

/** Opciones de grabación, indicador «REC» y panel del video terminado (vista previa, descargar y compartir). */
export function mountRecordingPanel(
  container: HTMLElement,
  recording: RecordingController,
  hooks: { onRecordingChange(active: boolean): void; onResultShown(): void },
): RecordingPanelHandle {
  container.insertAdjacentHTML(
    'beforeend',
    `
    <section class="panel record-setup" hidden aria-label="Grabar partida">
      <button type="button" class="panel-close" data-action="close-setup" aria-label="Cerrar">×</button>
      <h2>Grabar partida</h2>
      <p class="record-unsupported" data-unsupported hidden>Este navegador no puede grabar video. Prueba con Chrome o Safari actualizados.</p>
      <div data-supported>
        <h3>Formato</h3>
        <div class="record-formats">
          ${(['horizontal', 'vertical'] as const)
            .map(
              (format) => `
            <button type="button" class="record-format" data-format="${format}">
              <span class="record-format-shape ${format}"></span>
              <span>${FORMAT_NAMES[format]}</span>
            </button>`,
            )
            .join('')}
        </div>
        <label class="record-auto">
          <input type="checkbox" data-auto />
          <span>Grabar cada resolución automáticamente: desde que se mezcla hasta que lo resuelves.</span>
        </label>
        <p class="record-note">Se graba el cubo, tu cámara (si el modo ninja está encendido), el tiempo y los movimientos. Todo se queda en tu equipo hasta que decidas compartirlo.</p>
        <button type="button" class="primary" data-action="record-now">● Empezar a grabar ahora</button>
      </div>
    </section>

    <button type="button" class="rec-indicator" data-rec hidden aria-label="Parar la grabación">
      <span class="rec-dot"></span><span data-rec-text>REC</span><span class="rec-stop">Parar</span>
    </button>

    <section class="panel record-result" hidden aria-label="Video grabado">
      <button type="button" class="panel-close" data-action="close-result" aria-label="Cerrar">×</button>
      <h2 data-result-title></h2>
      <p class="record-result-info" data-result-info></p>
      <video class="record-preview" data-preview playsinline muted loop autoplay controls></video>
      <div class="record-actions">
        <button type="button" class="primary" data-action="share" hidden>Compartir</button>
        <button type="button" class="primary" data-action="download">Descargar</button>
      </div>
    </section>
    `,
  );

  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
  const setup = $('.record-setup');
  const indicator = $('[data-rec]');
  const indicatorText = $('[data-rec-text]');
  const result = $('.record-result');
  const preview = $<HTMLVideoElement>('[data-preview]');
  const autoCheckbox = $<HTMLInputElement>('[data-auto]');
  const shareButton = $<HTMLButtonElement>('[data-action="share"]');
  let current: RecordingResult | null = null;
  let tick = 0;

  $('[data-unsupported]').hidden = recording.supported;
  $('[data-supported]').hidden = !recording.supported;

  const renderSettings = () => {
    for (const button of setup.querySelectorAll<HTMLElement>('[data-format]')) {
      button.classList.toggle('selected', button.dataset.format === recording.settings.format);
    }
    autoCheckbox.checked = recording.settings.auto;
  };

  const closeResult = () => {
    result.hidden = true;
    preview.removeAttribute('src');
    preview.load();
    if (current) URL.revokeObjectURL(current.url);
    current = null;
  };

  recording.onState((state) => {
    const active = state.state === 'recording';
    indicator.hidden = state.state === 'idle';
    container.classList.toggle('is-recording', state.state !== 'idle');
    indicator.classList.toggle('saving', state.state === 'saving');
    hooks.onRecordingChange(active);
    cancelAnimationFrame(tick);
    if (state.state === 'saving') indicatorText.textContent = 'Guardando video…';
    if (active) {
      setup.hidden = true;
      const update = () => {
        indicatorText.textContent = `REC ${formatTime(performance.now() - state.startedAt).slice(0, -3)}`;
        tick = requestAnimationFrame(update);
      };
      update();
    }
  });

  recording.onResult((recorded) => {
    closeResult();
    current = recorded;
    $('[data-result-title]').textContent = recorded.solve ? `¡Resuelto en ${formatTime(recorded.solve.timeMs)}!` : 'Tu video está listo';
    const size = `${(recorded.blob.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
    const details = [recorded.solve ? `${recorded.solve.moves} movimientos` : null, recorded.format === 'vertical' ? 'Vertical' : 'Horizontal', size];
    $('[data-result-info]').textContent = details.filter(Boolean).join(' · ');
    preview.src = recorded.url;
    shareButton.hidden = !canShareFile(fileOf(recorded));
    result.hidden = false;
    hooks.onResultShown();
  });

  const onClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const format = target.closest<HTMLElement>('[data-format]')?.dataset.format as VideoFormat | undefined;
    if (format) {
      recording.updateSettings({ format });
      renderSettings();
      return;
    }
    switch (target.closest<HTMLElement>('[data-action]')?.dataset.action) {
      case 'close-setup':
        setup.hidden = true;
        break;
      case 'record-now':
        recording.start('manual');
        break;
      case 'close-result':
        closeResult();
        break;
      case 'download':
        if (current) download(current);
        break;
      case 'share':
        if (current) void share(current);
        break;
    }
    if (target.closest('[data-rec]')) void recording.stop();
  };
  for (const element of [setup, indicator, result]) element.addEventListener('click', onClick);

  autoCheckbox.addEventListener('change', () => recording.updateSettings({ auto: autoCheckbox.checked }));

  return {
    toggle() {
      if (recording.state.state === 'recording') {
        void recording.stop();
        return;
      }
      renderSettings();
      setup.hidden = !setup.hidden;
    },
  };
}

function fileOf(recorded: RecordingResult): File {
  return new File([recorded.blob], recorded.fileName, { type: recorded.blob.type });
}

function canShareFile(file: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
}

async function share(recorded: RecordingResult): Promise<void> {
  const text = recorded.solve
    ? `Resolví el cubo Rubik en ${formatTime(recorded.solve.timeMs)} solo con las manos 🤘`
    : 'Cubo Rubik solo con las manos 🤘';
  try {
    await navigator.share({ files: [fileOf(recorded)], text });
  } catch (error) {
    // Cerrar el menú de compartir no es un error.
    if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
  }
}

function download(recorded: RecordingResult): void {
  const link = document.createElement('a');
  link.href = recorded.url;
  link.download = recorded.fileName;
  document.body.append(link);
  link.click();
  link.remove();
}
