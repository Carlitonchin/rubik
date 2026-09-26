import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { HAND_MODEL_URL, VISION_WASM_URL } from './assets';
import type { RawHand } from './hands-interpreter';

/**
 * Crea el detector de manos de MediaPipe. Intenta usar la tarjeta gráfica y,
 * si no puede, usa el procesador.
 * @param useModuleLoader cargar el WASM como módulo ES (necesario dentro de un worker de tipo módulo).
 */
export async function createLandmarker(useModuleLoader: boolean): Promise<{ landmarker: HandLandmarker; delegate: 'GPU' | 'CPU' }> {
  const fileset = await FilesetResolver.forVisionTasks(VISION_WASM_URL, useModuleLoader);
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
    return { landmarker: await create('GPU'), delegate: 'GPU' };
  } catch (error) {
    console.warn('Detector de manos sin tarjeta gráfica; se usa el procesador.', error);
    return { landmarker: await create('CPU'), delegate: 'CPU' };
  }
}

export function toRawHands(result: HandLandmarkerResult): RawHand[] {
  return result.landmarks.map((points, i) => ({
    label: result.handedness[i]?.[0]?.categoryName ?? '',
    points: points.map(({ x, y, z }) => ({ x, y, z })),
    world: result.worldLandmarks[i].map(({ x, y, z }) => ({ x, y, z })),
  }));
}
