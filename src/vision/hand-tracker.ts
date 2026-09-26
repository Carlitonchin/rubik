import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { HAND_MODEL_URL, VISION_WASM_URL } from './assets';
import { CameraError, openCamera } from './camera';
import { HandsInterpreter, type HandsFrame, type RawHand } from './hands-interpreter';

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
  private landmarker: Promise<HandLandmarker> | null = null;
  private detector: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private running = false;
  private lastTimestamp = 0;
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
    // La cámara y el modelo se preparan a la vez.
    const [camera, model] = await Promise.allSettled([openCamera(this.video), this.loadLandmarker()]);
    const failed = camera.status === 'rejected' || model.status === 'rejected';
    if (failed || this.status.state !== 'starting') {
      if (camera.status === 'fulfilled') stopStream(camera.value);
      this.video.srcObject = null;
      // Si se apagó mientras cargaba, no es un error.
      if (this.status.state !== 'starting') return;
      const failure: unknown = camera.status === 'rejected' ? camera.reason : (model as PromiseRejectedResult).reason;
      console.error(failure);
      const message =
        failure instanceof CameraError ? failure.message : 'No se pudo cargar el detector de manos. Revisa tu conexión a internet.';
      this.setStatus({ state: 'error', message });
      return;
    }
    this.stream = (camera as PromiseFulfilledResult<MediaStream>).value;
    this.detector = (model as PromiseFulfilledResult<HandLandmarker>).value;
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
    this.lastTimestamp = 0;
    this.setStatus({ state: 'off' });
  }

  private loadLandmarker(): Promise<HandLandmarker> {
    this.landmarker ??= (async () => {
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(VISION_WASM_URL);
      const create = (delegate: 'GPU' | 'CPU') =>
        HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      try {
        return await create('GPU');
      } catch (error) {
        console.warn('Detector de manos sin GPU; se usa el procesador.', error);
        return create('CPU');
      }
    })().catch((error) => {
      // Permite reintentar si falló la descarga.
      this.landmarker = null;
      throw error;
    });
    return this.landmarker;
  }

  private scheduleNextFrame(): void {
    if (!this.running) return;
    if ('requestVideoFrameCallback' in this.video) {
      this.video.requestVideoFrameCallback(() => this.processFrame());
    } else {
      requestAnimationFrame(() => this.processFrame());
    }
  }

  private processFrame(): void {
    if (!this.running || !this.detector) return;
    const now = performance.now();
    if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && this.video.videoWidth > 0 && now > this.lastTimestamp) {
      const result = this.detector.detectForVideo(this.video, now);
      const raw: RawHand[] = result.landmarks.map((points, i) => ({
        label: result.handedness[i]?.[0]?.categoryName ?? '',
        points,
        world: result.worldLandmarks[i],
      }));
      const frame = this.interpreter.process(raw, now, this.video.videoWidth / this.video.videoHeight);
      if (this.lastTimestamp > 0) {
        const instant = 1000 / (now - this.lastTimestamp);
        this.fps = this.fps ? this.fps * 0.9 + instant * 0.1 : instant;
      }
      this.lastTimestamp = now;
      for (const listener of this.frameListeners) listener(frame);
    }
    this.scheduleNextFrame();
  }

  private setStatus(status: TrackerStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
