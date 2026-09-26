import type { Game, GameStatus } from '../game/game';
import { summarizeEvent } from '../input/ninja/describe';
import type { GestureState } from '../input/ninja/gesture-engine';
import type { NinjaController } from '../input/ninja/ninja-controller';
import type { CubeView } from '../render/cube-view';
import { formatTime } from '../ui/format';
import { HAND_COLORS } from '../ui/theme';
import type { HandTracker } from '../vision/hand-tracker';
import type { HandsFrame } from '../vision/hands-interpreter';
import { Compositor, FEED_VISIBLE_MS, type FeedItem } from './compositor';
import { pickRecordingMime, type VideoFormat } from './formats';
import { VideoRecorder } from './video-recorder';

export interface RecordingSettings {
  format: VideoFormat;
  /** Grabar cada resolución: desde que termina la mezcla hasta que se resuelve. */
  auto: boolean;
}

export type RecordingState =
  | { state: 'idle' }
  | { state: 'recording'; mode: 'auto' | 'manual'; startedAt: number }
  | { state: 'saving' };

export interface RecordingResult {
  blob: Blob;
  url: string;
  fileName: string;
  format: VideoFormat;
  durationMs: number;
  solve: { timeMs: number; moves: number } | null;
}

const SETTINGS_KEY = 'rubik.recording';
/** Tras resolver, se sigue grabando la tarjeta final este tiempo. */
export const END_CARD_MS = 2500;
const MAX_DURATION_MS = 10 * 60 * 1000;

/**
 * Graba la partida como video: automáticamente cada resolución, o cuando el
 * jugador lo pide. Compone cada fotograma justo después de que se dibuje el cubo.
 */
export class RecordingController {
  readonly mime = pickRecordingMime();
  settings: RecordingSettings = loadSettings();
  private compositor: Compositor | null = null;
  private recorder: VideoRecorder | null = null;
  private recordingState: RecordingState = { state: 'idle' };
  private feed: FeedItem[] = [];
  private hands: HandsFrame | null = null;
  private gesture: GestureState | null = null;
  private lastStatus: GameStatus = 'free';
  private solve: { timeMs: number; moves: number } | null = null;
  private stopTimer = 0;
  private readonly stateListeners = new Set<(state: RecordingState) => void>();
  private readonly resultListeners = new Set<(result: RecordingResult) => void>();

  constructor(
    private readonly game: Game,
    private readonly view: CubeView,
    private readonly tracker: HandTracker,
    ninja: NinjaController,
  ) {
    view.onAfterRender(() => this.compose());
    ninja.onEvent((event) => {
      const { symbol, label, side } = summarizeEvent(event);
      const now = performance.now();
      this.feed = [...this.feed.filter((item) => now - item.time < FEED_VISIBLE_MS + 400), { symbol, label, color: side ? HAND_COLORS[side] : '#ff8a2a', time: now }];
    });
    ninja.onState((state, frame) => {
      this.gesture = state;
      this.hands = frame;
    });
    tracker.onStatus((status) => {
      if (status.state !== 'running') this.hands = this.gesture = null;
    });
    game.subscribe((snapshot) => this.onGameChange(snapshot.status, snapshot.scrambling, snapshot.moves));
  }

  get supported(): boolean {
    return this.mime !== null;
  }

  get state(): RecordingState {
    return this.recordingState;
  }

  onState(listener: (state: RecordingState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.recordingState);
    return () => this.stateListeners.delete(listener);
  }

  onResult(listener: (result: RecordingResult) => void): () => void {
    this.resultListeners.add(listener);
    return () => this.resultListeners.delete(listener);
  }

  updateSettings(settings: Partial<RecordingSettings>): void {
    this.settings = { ...this.settings, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
  }

  start(mode: 'auto' | 'manual'): void {
    if (!this.mime || this.recordingState.state !== 'idle') return;
    this.compositor = new Compositor(this.settings.format);
    // Algunos navegadores solo capturan lienzos que están en la página.
    this.compositor.canvas.className = 'recording-canvas';
    document.body.append(this.compositor.canvas);
    this.solve = null;
    this.compose();
    this.recorder = new VideoRecorder(this.mime);
    this.recorder.start(this.compositor.canvas);
    this.setState({ state: 'recording', mode, startedAt: performance.now() });
  }

  async stop(): Promise<void> {
    if (this.recordingState.state !== 'recording' || !this.recorder || !this.compositor) return;
    clearTimeout(this.stopTimer);
    const { startedAt } = this.recordingState;
    const format = this.compositor.format;
    const recorder = this.recorder;
    this.setState({ state: 'saving' });
    const blob = await recorder.stop();
    this.cleanup();
    const solve = this.solve;
    const result: RecordingResult = {
      blob,
      url: URL.createObjectURL(blob),
      fileName: fileNameFor(solve, this.mime!.extension),
      format,
      durationMs: performance.now() - startedAt,
      solve,
    };
    this.setState({ state: 'idle' });
    for (const listener of this.resultListeners) listener(result);
  }

  /** Para sin guardar (por ejemplo, si se abandona el intento). */
  cancel(): void {
    clearTimeout(this.stopTimer);
    this.recorder?.cancel();
    this.cleanup();
    this.setState({ state: 'idle' });
  }

  private onGameChange(status: GameStatus, scrambling: boolean, moves: number): void {
    const previous = this.lastStatus;
    this.lastStatus = status;
    const recording = this.recordingState.state === 'recording' ? this.recordingState : null;

    // Una mezcla nueva o reiniciar abandona el intento grabado automáticamente.
    if (recording?.mode === 'auto' && !this.solve && (scrambling || (status === 'free' && previous !== 'free'))) {
      this.cancel();
      return;
    }
    if (status === 'ready' && previous !== 'ready' && this.settings.auto && this.recordingState.state === 'idle') {
      this.start('auto');
      return;
    }
    if (status === 'solved' && previous !== 'solved' && recording) {
      this.solve = { timeMs: this.game.elapsedMs(), moves };
      if (recording.mode === 'auto') this.stopTimer = window.setTimeout(() => void this.stop(), END_CARD_MS);
    }
  }

  private compose(): void {
    if (!this.compositor || this.recordingState.state !== 'recording') return;
    const now = performance.now();
    if (now - this.recordingState.startedAt > MAX_DURATION_MS) {
      void this.stop();
      return;
    }
    const snapshot = this.game.snapshot();
    const cameraOn = this.tracker.isActive && this.tracker.video.videoWidth > 0;
    this.compositor.draw({
      now,
      cube: { canvas: this.view.canvas, crop: this.view.cubeCrop() },
      camera: cameraOn ? { video: this.tracker.video, hands: this.hands, gesture: this.gesture } : null,
      timerMs: snapshot.status === 'free' ? null : this.game.elapsedMs(),
      moves: snapshot.moves,
      feed: this.feed,
      solved: snapshot.status === 'solved' ? (this.solve ?? { timeMs: this.game.elapsedMs(), moves: snapshot.moves }) : null,
    });
  }

  private cleanup(): void {
    this.compositor?.canvas.remove();
    this.compositor = null;
    this.recorder = null;
  }

  private setState(state: RecordingState): void {
    this.recordingState = state;
    for (const listener of this.stateListeners) listener(state);
  }
}

function loadSettings(): RecordingSettings {
  const defaults: RecordingSettings = { format: 'horizontal', auto: true };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

function fileNameFor(solve: { timeMs: number } | null, extension: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const time = solve ? `-${formatTime(solve.timeMs).replace(':', 'm').replace('.', 's')}` : '';
  return `cubo-ninja${time}-${stamp}.${extension}`;
}
