// Genera src/vision/__fixtures__/hands.json: los puntos que MediaPipe detecta
// en fotos de ejemplo de manos. Las pruebas del reconocedor de sellos usan
// estos datos reales en lugar de una cámara.
//
// Uso: node scripts/generate-hand-fixtures.mjs
// Necesita conexión a internet y Google Chrome (o CHROME_PATH=/ruta/al/navegador).

import fs from 'node:fs';
import { chromium } from 'playwright-core';

const VERSION = JSON.parse(fs.readFileSync('package.json', 'utf8')).dependencies['@mediapipe/tasks-vision'];
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const ASSETS = 'https://storage.googleapis.com/mediapipe-assets';

// nombre → [foto de origen, transformación]
const IMAGES = {
  pointing_up: ['pointing_up.jpg', 'none'],
  pointing_down: ['pointing_up.jpg', 'rotate180'],
  pointing_up_rotated: ['pointing_up_rotated.jpg', 'none'],
  thumb_up: ['thumb_up.jpg', 'none'],
  victory: ['victory.jpg', 'none'],
  fist: ['fist.jpg', 'none'],
  open_hand_a: ['right_hands.jpg', 'leftHalf'],
  open_hand_b: ['right_hands.jpg', 'rightHalf'],
  right_hands: ['right_hands.jpg', 'none'],
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');

const out = {};
for (const [name, [file, transform]] of Object.entries(IMAGES)) {
  const bytes = Buffer.from(await (await fetch(`${ASSETS}/${file}`)).arrayBuffer());
  const dataUrl = `data:image/jpeg;base64,${bytes.toString('base64')}`;
  out[name] = await page.evaluate(
    async ({ dataUrl, transform, CDN, MODEL }) => {
      const vision = await import(`${CDN}/vision_bundle.mjs`);
      if (!window.landmarker) {
        const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
        window.landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
          runningMode: 'IMAGE',
          numHands: 2,
        });
      }
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const half = transform === 'leftHalf' || transform === 'rightHalf';
      const canvas = document.createElement('canvas');
      canvas.width = half ? img.naturalWidth / 2 : img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (transform === 'rotate180') {
        ctx.translate(canvas.width, canvas.height);
        ctx.rotate(Math.PI);
      }
      ctx.drawImage(img, transform === 'rightHalf' ? -canvas.width : 0, 0);

      const result = window.landmarker.detect(canvas);
      const round = (p) => ({ x: +p.x.toFixed(5), y: +p.y.toFixed(5), z: +p.z.toFixed(5) });
      return {
        width: canvas.width,
        height: canvas.height,
        hands: result.landmarks.map((points, i) => ({
          handedness: result.handedness[i][0].categoryName,
          score: +result.handedness[i][0].score.toFixed(3),
          landmarks: points.map(round),
          worldLandmarks: result.worldLandmarks[i].map(round),
        })),
      };
    },
    { dataUrl, transform, CDN, MODEL },
  );
  console.log(`${name}: ${out[name].hands.length} mano(s)`);
}

fs.writeFileSync('src/vision/__fixtures__/hands.json', JSON.stringify(out));
await browser.close();
