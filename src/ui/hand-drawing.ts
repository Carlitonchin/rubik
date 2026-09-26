import { SHAPE_LABELS } from '../vision/hand-shape';
import type { TrackedHand } from '../vision/hands-interpreter';
import { HAND_CONNECTIONS } from '../vision/landmarks';
import { HAND_COLORS } from './theme';

/** Convierte un punto normalizado (0–1) de la vista espejo en píxeles del lienzo. */
export type PointMapper = (x: number, y: number) => readonly [number, number];

/**
 * Dibuja el esqueleto de una mano con su sello encima. Con `glow`, la mano
 * brilla con su color (sello armado, listo para mover el cubo).
 */
export function drawHand(ctx: CanvasRenderingContext2D, hand: TrackedHand, map: PointMapper, scale: number, glow = false): void {
  const color = HAND_COLORS[hand.side];
  const point = (i: number) => map(hand.points[i].x, hand.points[i].y);

  ctx.save();
  ctx.globalAlpha = hand.inZone ? 1 : 0.35;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5 * scale;
  ctx.lineCap = 'round';
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 14 * scale;
    ctx.lineWidth = 3.5 * scale;
  }
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.moveTo(...point(a));
    ctx.lineTo(...point(b));
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#fff';
  for (let i = 0; i < hand.points.length; i++) {
    const [x, y] = point(i);
    ctx.beginPath();
    ctx.arc(x, y, 2.2 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  if (hand.shape && hand.shape !== 'unknown' && hand.inZone) {
    const top = Math.min(...hand.points.map((p) => map(p.x, p.y)[1]));
    const [centerX] = map(hand.center.x, hand.center.y);
    ctx.font = `${Math.round(26 * scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(SHAPE_LABELS[hand.shape].emoji, centerX, Math.max(28 * scale, top - 6 * scale));
  }
  ctx.restore();
}
