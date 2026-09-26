// Archivos del detector de manos. Se descargan una vez y el navegador los
// guarda en caché; el video de la cámara nunca sale del equipo.

/** Debe coincidir exactamente con la versión de `@mediapipe/tasks-vision` en package.json. */
export const MEDIAPIPE_VERSION = '1.0.1';
export const VISION_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
export const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
