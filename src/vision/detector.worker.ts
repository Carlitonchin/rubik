// Detector de manos en un hilo aparte: así analizar la cámara no le quita
// tiempo al dibujo del cubo.

import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { DetectorRequest, DetectorResponse } from './detector-protocol';
import { createLandmarker, toRawHands } from './landmarker';

let landmarker: HandLandmarker | null = null;

const reply = (message: DetectorResponse) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<DetectorRequest>) => {
  const request = event.data;
  if (request.type === 'init') {
    try {
      const created = await createLandmarker(true);
      landmarker = created.landmarker;
      reply({ type: 'ready', delegate: created.delegate });
    } catch (error) {
      reply({ type: 'init-error', message: String(error) });
    }
    return;
  }

  try {
    const result = landmarker!.detectForVideo(request.frame, request.timestamp);
    reply({ type: 'result', hands: toRawHands(result) });
  } catch (error) {
    reply({ type: 'detect-error', message: String(error) });
  } finally {
    request.frame.close();
  }
};
