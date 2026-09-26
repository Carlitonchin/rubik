import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { DetectorRequest, DetectorResponse } from './detector-protocol';
import type { RawHand } from './hands-interpreter';

export interface HandDetector {
  /** Dónde se analiza: en un hilo aparte (worker) o en el hilo principal. */
  readonly thread: 'worker' | 'main';
  readonly delegate: 'GPU' | 'CPU';
  detect(video: HTMLVideoElement, timestamp: number): Promise<RawHand[]>;
}

/**
 * Crea el detector en un hilo aparte para que el cubo no pierda fluidez. Si
 * el navegador no lo permite, lo crea en el hilo principal.
 */
export async function createHandDetector(): Promise<HandDetector> {
  try {
    return await WorkerDetector.create();
  } catch (error) {
    console.warn('El detector de manos no pudo ir en un hilo aparte; se usa el principal.', error);
    return MainThreadDetector.create();
  }
}

/**
 * Ancho al que se reduce cada fotograma antes de enviarlo al worker. MediaPipe
 * trabaja internamente con imágenes de ~224 px, así que no se pierde precisión
 * y se copia mucho menos.
 */
const ANALYSIS_WIDTH = 640;

class WorkerDetector implements HandDetector {
  readonly thread = 'worker';
  private pending: { resolve: (hands: RawHand[]) => void; reject: (error: Error) => void } | null = null;
  private canResize = true;

  private constructor(
    private readonly worker: Worker,
    readonly delegate: 'GPU' | 'CPU',
  ) {
    worker.onmessage = (event: MessageEvent<DetectorResponse>) => {
      const message = event.data;
      const pending = this.pending;
      this.pending = null;
      if (message.type === 'result') pending?.resolve(message.hands);
      else if (message.type === 'detect-error') pending?.reject(new Error(message.message));
    };
  }

  static create(): Promise<WorkerDetector> {
    const worker = new Worker(new URL('./detector.worker.ts', import.meta.url), { type: 'module' });
    const send = (request: DetectorRequest) => worker.postMessage(request);
    return new Promise((resolve, reject) => {
      const fail = (error: Error) => {
        worker.terminate();
        reject(error);
      };
      worker.onerror = (event) => fail(new Error(event.message || 'Error al arrancar el worker del detector'));
      worker.onmessage = (event: MessageEvent<DetectorResponse>) => {
        if (event.data.type === 'ready') resolve(new WorkerDetector(worker, event.data.delegate));
        else if (event.data.type === 'init-error') fail(new Error(event.data.message));
      };
      send({ type: 'init' });
    });
  }

  async detect(video: HTMLVideoElement, timestamp: number): Promise<RawHand[]> {
    const frame = await this.grabFrame(video);
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      const request: DetectorRequest = { type: 'detect', frame, timestamp };
      this.worker.postMessage(request, [frame]);
    });
  }

  private async grabFrame(video: HTMLVideoElement): Promise<ImageBitmap> {
    if (this.canResize) {
      try {
        const resizeHeight = Math.round((ANALYSIS_WIDTH * video.videoHeight) / video.videoWidth);
        return await createImageBitmap(video, { resizeWidth: ANALYSIS_WIDTH, resizeHeight, resizeQuality: 'low' });
      } catch {
        // Algunos navegadores no aceptan redimensionar aquí; se envía a tamaño completo.
        this.canResize = false;
      }
    }
    return createImageBitmap(video);
  }
}

class MainThreadDetector implements HandDetector {
  readonly thread = 'main';

  private constructor(
    private readonly landmarker: HandLandmarker,
    readonly delegate: 'GPU' | 'CPU',
    private readonly toRawHands: typeof import('./landmarker').toRawHands,
  ) {}

  static async create(): Promise<MainThreadDetector> {
    const { createLandmarker, toRawHands } = await import('./landmarker');
    const { landmarker, delegate } = await createLandmarker(false);
    return new MainThreadDetector(landmarker, delegate, toRawHands);
  }

  async detect(video: HTMLVideoElement, timestamp: number): Promise<RawHand[]> {
    return this.toRawHands(this.landmarker.detectForVideo(video, timestamp));
  }
}
