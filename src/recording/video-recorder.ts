import type { RecordingMime } from './formats';

const FRAME_RATE = 30;
const BITRATE = 6_000_000;

/** Graba un lienzo como video con MediaRecorder (todo en el navegador). */
export class VideoRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  constructor(readonly mime: RecordingMime) {}

  start(canvas: HTMLCanvasElement): void {
    const stream = canvas.captureStream(FRAME_RATE);
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, { mimeType: this.mime.mimeType, videoBitsPerSecond: BITRATE });
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    // Entrega los datos cada segundo para no acumularlo todo al final.
    this.recorder.start(1000);
  }

  stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder) return Promise.reject(new Error('No se estaba grabando'));
    this.recorder = null;
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
