import { SHAPE_LABELS } from '../vision/hand-shape';
import type { HandTracker } from '../vision/hand-tracker';
import { HAND_SIDES, type HandsFrame, type HandSide, type TrackedHand, type Zone } from '../vision/hands-interpreter';
import { HAND_CONNECTIONS } from '../vision/landmarks';

export const HAND_COLORS: Record<HandSide, string> = {
  right: '#ff8a2a',
  left: '#3fd0ff',
};

/**
 * Imagen de la cámara en una esquina (en espejo), con el esqueleto de las
 * manos dibujado encima y el sello que el juego reconoce en cada una.
 */
export function mountCameraPanel(container: HTMLElement, tracker: HandTracker): void {
  container.insertAdjacentHTML(
    'beforeend',
    `
    <section class="camera-panel" hidden>
      <div class="camera-frame">
        <canvas class="camera-overlay"></canvas>
        <p class="camera-message" data-message></p>
        <span class="camera-fps" data-fps></span>
        <button type="button" class="camera-close" aria-label="Apagar la cámara">×</button>
      </div>
      <div class="camera-hands" data-chips>
        ${HAND_SIDES.map(
          (side) => `
          <div class="hand-chip" data-side="${side}" style="--hand-color: ${HAND_COLORS[side]}">
            <span class="hand-chip-side"><span class="long">${side === 'left' ? 'Izquierda' : 'Derecha'}</span><span class="short">${side === 'left' ? 'Izq.' : 'Der.'}</span></span>
            <span class="hand-chip-shape" data-shape>—</span>
          </div>`,
        ).join('')}
      </div>
    </section>
    `,
  );

  const panel = container.querySelector<HTMLElement>('.camera-panel')!;
  const frame = panel.querySelector<HTMLElement>('.camera-frame')!;
  const canvas = panel.querySelector<HTMLCanvasElement>('.camera-overlay')!;
  const message = panel.querySelector<HTMLElement>('[data-message]')!;
  const fps = panel.querySelector<HTMLElement>('[data-fps]')!;
  const chipsRow = panel.querySelector<HTMLElement>('[data-chips]')!;
  const chips = Object.fromEntries(
    HAND_SIDES.map((side) => [side, panel.querySelector<HTMLElement>(`.hand-chip[data-side="${side}"]`)!]),
  ) as Record<HandSide, HTMLElement>;
  const ctx = canvas.getContext('2d')!;

  tracker.video.className = 'camera-video';
  frame.prepend(tracker.video);
  panel.querySelector('.camera-close')!.addEventListener('click', () => tracker.stop());

  tracker.onStatus((status) => {
    panel.hidden = status.state === 'off';
    panel.classList.toggle('error', status.state === 'error');
    chipsRow.hidden = status.state !== 'running';
    message.hidden = status.state === 'running';
    fps.textContent = '';
    if (status.state === 'starting') message.textContent = 'Encendiendo la cámara y cargando el detector de manos…';
    if (status.state === 'error') message.textContent = status.message;
    if (status.state === 'running') {
      frame.style.aspectRatio = `${tracker.video.videoWidth} / ${tracker.video.videoHeight}`;
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  });

  tracker.onFrame((handsFrame) => {
    draw(ctx, canvas, handsFrame, tracker.interpreter.zone);
    for (const side of HAND_SIDES) updateChip(chips[side], handsFrame.hands[side]);
    fps.textContent = `${Math.round(tracker.fps)} fps`;
  });
}

function updateChip(chip: HTMLElement, hand: TrackedHand | null): void {
  const shape = chip.querySelector<HTMLElement>('[data-shape]')!;
  const recognized = hand?.shape && hand.shape !== 'unknown' && hand.inZone;
  chip.classList.toggle('active', Boolean(recognized));
  if (!hand) shape.textContent = '—';
  else if (!hand.inZone) shape.textContent = 'descansando';
  else if (!hand.shape) shape.textContent = '…';
  else shape.textContent = `${SHAPE_LABELS[hand.shape].emoji} ${SHAPE_LABELS[hand.shape].name}`;
}

function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, frame: HandsFrame, zone: Zone): void {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // Franja de descanso: fuera de la zona activa.
  ctx.fillStyle = 'rgb(0 0 0 / 0.35)';
  ctx.fillRect(0, zone.bottom * height, width, (1 - zone.bottom) * height);
  ctx.strokeStyle = 'rgb(255 255 255 / 0.35)';
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, zone.bottom * height);
  ctx.lineTo(width, zone.bottom * height);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgb(255 255 255 / 0.6)';
  ctx.font = `${Math.max(9, Math.round(height * 0.05))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('zona de descanso', width / 2, ((1 + zone.bottom) / 2) * height);

  for (const side of HAND_SIDES) {
    const hand = frame.hands[side];
    if (hand) drawHand(ctx, hand, width, height);
  }
}

function drawHand(ctx: CanvasRenderingContext2D, hand: TrackedHand, width: number, height: number): void {
  const color = HAND_COLORS[hand.side];
  const point = (i: number) => [hand.points[i].x * width, hand.points[i].y * height] as const;
  const scale = Math.max(1, width / 320);

  ctx.globalAlpha = hand.inZone ? 1 : 0.35;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.moveTo(...point(a));
    ctx.lineTo(...point(b));
  }
  ctx.stroke();

  ctx.fillStyle = '#fff';
  for (let i = 0; i < hand.points.length; i++) {
    const [x, y] = point(i);
    ctx.beginPath();
    ctx.arc(x, y, 2.2 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  if (hand.shape && hand.shape !== 'unknown' && hand.inZone) {
    const top = Math.min(...hand.points.map((p) => p.y)) * height;
    ctx.font = `${Math.round(26 * scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(SHAPE_LABELS[hand.shape].emoji, hand.center.x * width, Math.max(28 * scale, top - 6));
  }
  ctx.globalAlpha = 1;
}
