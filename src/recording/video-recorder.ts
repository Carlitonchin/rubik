import type { RecordingMime } from './formats';

export const FRAME_RATE = 30;
const BITRATE = 6_000_000;

/** Graba un lienzo como video con MediaRecorder (todo en el navegador). */
export class VideoRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private track: CanvasCaptureMediaStreamTrack | null = null;

  constructor(readonly mime: RecordingMime) {}

  start(canvas: HTMLCanvasElement): void {
    // Con 0, el navegador no toma imágenes por su cuenta: se le pide cada
    // fotograma justo después de dibujarlo (`frameReady`). Así no se duplican
    // ni se saltan fotogramas y el video sale regular.
    let stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
    if (track && typeof track.requestFrame === 'function') {
      this.track = track;
    } else {
      stopTracks(stream);
      stream = canvas.captureStream(FRAME_RATE);
      this.track = null;
    }
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, { mimeType: this.mime.mimeType, videoBitsPerSecond: BITRATE });
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    // Entrega los datos cada segundo para no acumularlo todo al final.
    this.recorder.start(1000);
  }

  /** Avisa de que hay un fotograma nuevo dibujado en el lienzo. */
  frameReady(): void {
    this.track?.requestFrame();
  }

  stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder) return Promise.reject(new Error('No se estaba grabando'));
    this.recorder = null;
    this.track = null;
    return new Promise((resolve) => {
      recorder.onstop = () => {
        stopTracks(recorder.stream);
        resolve(new Blob(this.chunks, { type: this.mime.mimeType.split(';')[0] }));
        this.chunks = [];
      };
      recorder.stop();
    });
  }

  /** Para sin guardar nada. */
  cancel(): void {
    const recorder = this.recorder;
    this.recorder = null;
    this.track = null;
    this.chunks = [];
    if (!recorder) return;
    recorder.ondataavailable = null;
    recorder.onstop = () => stopTracks(recorder.stream);
    recorder.stop();
  }
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
