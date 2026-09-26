import { CameraError, openCamera } from './camera';
import { createHandDetector, type HandDetector } from './hand-detector';
import { HandsInterpreter, type HandsFrame } from './hands-interpreter';

export type TrackerStatus =
  | { state: 'off' }
  | { state: 'starting' }
  | { state: 'running' }
  | { state: 'error'; message: string };

/**
 * Enciende la cámara, carga el detector de manos de MediaPipe y analiza
 * cada fotograma. Todo ocurre en el navegador: el video no se envía a
 * ningún sitio.
 */
export class HandTracker {
  readonly video = document.createElement('video');
  readonly interpreter = new HandsInterpreter();
  private detectorPromise: Promise<HandDetector> | null = null;
  private detector: HandDetector | null = null;
  private stream: MediaStream | null = null;
  private running = false;
  /** Hay un fotograma analizándose; los que llegan mientras tanto se saltan. */
  private busy = false;
  private lastTimestamp = 0;
  private lastResultTime = 0;
  private loggedDetectError = false;
  private status: TrackerStatus = { state: 'off' };
  private readonly frameListeners = new Set<(frame: HandsFrame) => void>();
  private readonly statusListeners = new Set<(status: TrackerStatus) => void>();
  /** Fotogramas analizados por segundo (media móvil). */
  fps = 0;

  get isActive(): boolean {
    return this.status.state === 'starting' || this.status.state === 'running';
  }

  onFrame(listener: (frame: HandsFrame) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  onStatus(listener: (status: TrackerStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.isActive) return;
    this.setStatus({ state: 'starting' });
    // La cámara y el detector se preparan a la vez.
    const [camera, detector] = await Promise.allSettled([openCamera(this.video), this.loadDetector()]);
    const failed = camera.status === 'rejected' || detector.status === 'rejected';
    if (failed || this.status.state !== 'starting') {
      if (camera.status === 'fulfilled') stopStream(camera.value);
      this.video.srcObject = null;
      // Si se apagó mientras cargaba, no es un error.
      if (this.status.state !== 'starting') return;
      const failure: unknown = camera.status === 'rejected' ? camera.reason : (detector as PromiseRejectedResult).reason;
      console.error(failure);
      const message =
        failure instanceof CameraError ? failure.message : 'No se pudo cargar el detector de manos. Revisa tu conexión a internet.';
      this.setStatus({ state: 'error', message });
      return;
    }
    this.stream = (camera as PromiseFulfilledResult<MediaStream>).value;
    this.detector = (detector as PromiseFulfilledResult<HandDetector>).value;
    this.running = true;
    this.setStatus({ state: 'running' });
    this.scheduleNextFrame();
  }

  stop(): void {
    this.running = false;
    if (this.stream) stopStream(this.stream);
    this.stream = null;
    this.video.srcObject = null;
    this.fps = 0;
    this.lastResultTime = 0;
    this.setStatus({ state: 'off' });
  }

  private loadDetector(): Promise<HandDetector> {
    this.detectorPromise ??= createHandDetector().then(
      (detector) => {
        console.info(`Detector de manos listo (${detector.thread === 'worker' ? 'hilo aparte' : 'hilo principal'}, ${detector.delegate}).`);
        return detector;
      },
      (error) => {
        // Permite reintentar si falló la descarga.
        this.detectorPromise = null;
        throw error;
      },
    );
    return this.detectorPromise;
  }

  private scheduleNextFrame(): void {
    if (!this.running) return;
    if ('requestVideoFrameCallback' in this.video) {
      this.video.requestVideoFrameCallback(() => this.onVideoFrame());
    } else {
      requestAnimationFrame(() => this.onVideoFrame());
    }
  }

  private onVideoFrame(): void {
    if (!this.running || !this.detector) return;
    const video = this.video;
    // MediaPipe exige marcas de tiempo siempre crecientes.
    const timestamp = Math.max(performance.now(), this.lastTimestamp + 1);
    if (!this.busy && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      this.busy = true;
      this.lastTimestamp = timestamp;
      const aspect = video.videoWidth / video.videoHeight;
      this.detector
        .detect(video, timestamp)
        .then((raw) => {
          if (!this.running) return;
          this.emit(this.interpreter.process(raw, timestamp, aspect));
        })
        .catch((error) => {
          if (!this.loggedDetectError) console.error('Fallo al analizar un fotograma', error);
          this.loggedDetectError = true;
        })
        .finally(() => {
          this.busy = false;
        });
    }
    this.scheduleNextFrame();
  }

  private emit(frame: HandsFrame): void {
    const now = performance.now();
    if (this.lastResultTime > 0) {
      const instant = 1000 / (now - this.lastResultTime);
      this.fps = this.fps ? this.fps * 0.9 + instant * 0.1 : instant;
    }
    this.lastResultTime = now;
    for (const listener of this.frameListeners) listener(frame);
  }

  private setStatus(status: TrackerStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
