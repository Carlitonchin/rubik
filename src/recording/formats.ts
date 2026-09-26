export type VideoFormat = 'horizontal' | 'vertical';

/** 720p: lo aceptan todas las redes y el navegador lo codifica sin esfuerzo. */
export const FORMAT_SIZES: Record<VideoFormat, { width: number; height: number }> = {
  horizontal: { width: 1280, height: 720 },
  vertical: { width: 720, height: 1280 },
};

export const FORMAT_NAMES: Record<VideoFormat, string> = {
  horizontal: 'Horizontal (tipo stream)',
  vertical: 'Vertical (reels y TikTok)',
};

// MP4 primero: es lo que aceptan Instagram y TikTok. H.264 nivel 3.1 cubre 1280×720 y 720×1280 a 30 fps.
const MIME_CANDIDATES = [
  { mimeType: 'video/mp4;codecs=avc1.42E01F', extension: 'mp4' },
  { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
] as const;

export type RecordingMime = (typeof MIME_CANDIDATES)[number];

/** El mejor formato de archivo que puede grabar este navegador, o `null` si no puede grabar. */
export function pickRecordingMime(): RecordingMime | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate.mimeType)) ?? null;
}
