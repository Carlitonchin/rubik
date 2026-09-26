import type { GestureState } from '../input/ninja/gesture-engine';
import { drawHand } from '../ui/hand-drawing';
import { formatTime } from '../ui/format';
import { HAND_SIDES, type HandsFrame } from '../vision/hands-interpreter';
import { FORMAT_SIZES, type VideoFormat } from './formats';

export interface FeedItem {
  symbol: string;
  label: string;
  color: string;
  time: number;
}

/** Todo lo que se ve en un fotograma del video. */
export interface CompositeFrame {
  now: number;
  /** Lienzo 3D del juego y el cuadrado que ocupa el cubo en él. */
  cube: { canvas: HTMLCanvasElement; crop: { x: number; y: number; size: number } };
  camera: { video: HTMLVideoElement; hands: HandsFrame | null; gesture: GestureState | null } | null;
  /** Tiempo del reto, o `null` en juego libre (entonces solo se muestran los movimientos). */
  timerMs: number | null;
  moves: number;
  feed: readonly FeedItem[];
  /** Tarjeta final al resolver. */
  solved: { timeMs: number; moves: number } | null;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Layout {
  cube: Rect;
  camera: Rect | null;
  /** Centro del cronómetro y si va en columna (arriba a la izquierda) o en fila (centrado). */
  timer: { x: number; y: number; align: 'left' | 'center' };
  feedY: number;
  feedX: number;
}

export const FEED_VISIBLE_MS = 1400;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const DIGITS = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/**
 * Dibuja cada fotograma del video en su propio lienzo: el cubo, la cámara
 * con las manos, el cronómetro, las fichas de combo y la tarjeta final.
 * Así el video tiene siempre el mismo encuadre, sea cual sea la ventana.
 */
export class Compositor {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;

  constructor(readonly format: VideoFormat) {
    const { width, height } = FORMAT_SIZES[format];
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
  }

  draw(frame: CompositeFrame): void {
    const { ctx } = this;
    const { width, height } = this.canvas;
    const layout = layoutFor(this.format, frame.camera !== null);

    const background = ctx.createRadialGradient(width / 2, height * 0.45, 0, width / 2, height * 0.45, Math.max(width, height) * 0.7);
    background.addColorStop(0, '#1d2140');
    background.addColorStop(1, '#0b0d18');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    if (frame.camera && layout.camera) this.drawCamera(frame.camera, layout.camera);
    this.drawCube(frame.cube, layout.cube);
    this.drawTimer(frame, layout);
    this.drawFeed(frame, layout);
    if (frame.solved) this.drawSolved(frame.solved, frame.camera !== null);
  }

  private drawCube({ canvas, crop }: CompositeFrame['cube'], rect: Rect): void {
    this.ctx.drawImage(canvas, crop.x, crop.y, crop.size, crop.size, rect.x, rect.y, rect.w, rect.h);
  }

  private drawCamera(camera: NonNullable<CompositeFrame['camera']>, rect: Rect): void {
    const { ctx } = this;
    const { video } = camera;
    if (!video.videoWidth) return;

    // Recorte centrado ("cover") de la imagen para llenar el rectángulo.
    const videoAspect = video.videoWidth / video.videoHeight;
    const rectAspect = rect.w / rect.h;
    const crop =
      videoAspect > rectAspect
        ? { x: (1 - rectAspect / videoAspect) / 2, y: 0, w: rectAspect / videoAspect, h: 1 }
        : { x: 0, y: (1 - videoAspect / rectAspect) / 2, w: 1, h: videoAspect / rectAspect };

    ctx.save();
    const radius = this.format === 'vertical' ? 0 : 18;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
    ctx.clip();
    // Espejo: el jugador se ve como en un espejo, igual que en la pantalla.
    ctx.translate(rect.x + rect.w, rect.y);
    ctx.scale(-1, 1);
    ctx.drawImage(
      video,
      crop.x * video.videoWidth,
      crop.y * video.videoHeight,
      crop.w * video.videoWidth,
      crop.h * video.videoHeight,
      0,
      0,
      rect.w,
      rect.h,
    );
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (camera.hands) {
      // Los puntos de las manos ya están en la vista espejo.
      const map = (x: number, y: number) => [rect.x + ((x - crop.x) / crop.w) * rect.w, rect.y + ((y - crop.y) / crop.h) * rect.h] as const;
      for (const side of HAND_SIDES) {
        const hand = camera.hands.hands[side];
        if (!hand) continue;
        const armed = camera.gesture?.hands[side].mode === 'armed';
        drawHand(ctx, hand, map, rect.w / 320, armed);
      }
    }

    if (this.format === 'vertical') {
      // Fundido hacia el cubo.
      const fade = ctx.createLinearGradient(0, rect.y + rect.h - 140, 0, rect.y + rect.h);
      fade.addColorStop(0, 'rgb(14 16 32 / 0)');
      fade.addColorStop(1, 'rgb(14 16 32 / 1)');
      ctx.fillStyle = fade;
      ctx.fillRect(rect.x, rect.y + rect.h - 140, rect.w, 140);
    }
    ctx.restore();

    if (this.format === 'horizontal') {
      ctx.save();
      ctx.strokeStyle = 'rgb(255 255 255 / 0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 18);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawTimer(frame: CompositeFrame, layout: Layout): void {
    const { ctx } = this;
    const time = frame.timerMs === null ? '' : formatTime(frame.timerMs);
    const moves = frame.timerMs === null ? `${frame.moves} movimientos` : `${frame.moves} mov.`;
    ctx.save();
    ctx.font = `700 44px ${DIGITS}`;
    const timeWidth = time ? ctx.measureText(time).width : 0;
    ctx.font = `600 22px ${FONT}`;
    const movesWidth = ctx.measureText(moves).width;
    const padding = 22;
    const gap = time ? 20 : 0;
    const width = padding * 2 + timeWidth + gap + movesWidth;
    const height = 72;
    const x = layout.timer.align === 'center' ? layout.timer.x - width / 2 : layout.timer.x;
    const y = layout.timer.y - height / 2;

    ctx.fillStyle = 'rgb(12 14 30 / 0.72)';
    ctx.strokeStyle = 'rgb(255 255 255 / 0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 20);
    ctx.fill();
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff8a2a';
    ctx.font = `700 44px ${DIGITS}`;
    ctx.fillText(time, x + padding, layout.timer.y + 2);
    ctx.fillStyle = '#9aa0c3';
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText(moves, x + padding + timeWidth + gap, layout.timer.y + 2);
    ctx.restore();
  }

  /** Fichas de combo: aparecen con un pequeño salto y se desvanecen. */
  private drawFeed(frame: CompositeFrame, layout: Layout): void {
    const { ctx } = this;
    const items = frame.feed.filter((item) => frame.now - item.time < FEED_VISIBLE_MS + 300).slice(-(this.format === 'vertical' ? 3 : 4));
    if (!items.length) return;

    ctx.save();
    const height = 52;
    const gap = 12;
    const widths = items.map((item) => {
      ctx.font = `28px ${FONT}`;
      const symbol = ctx.measureText(item.symbol).width;
      ctx.font = `600 20px ${FONT}`;
      return 22 + symbol + 10 + ctx.measureText(item.label).width + 22;
    });
    let x = layout.feedX - (widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1)) / 2;
    items.forEach((item, i) => {
      const age = frame.now - item.time;
      const appear = Math.min(1, age / 180);
      const fade = age > FEED_VISIBLE_MS ? Math.max(0, 1 - (age - FEED_VISIBLE_MS) / 300) : 1;
      const scale = 0.7 + 0.3 * easeOutBack(appear);
      const w = widths[i];
      const cx = x + w / 2;
      ctx.globalAlpha = Math.min(appear * 2, 1) * fade;
      ctx.translate(cx, layout.feedY);
      ctx.scale(scale, scale);

      ctx.shadowColor = item.color;
      ctx.shadowBlur = 24;
      ctx.fillStyle = mixWithDark(item.color);
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -height / 2, w, height, height / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.stroke();

      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = `28px ${FONT}`;
      ctx.fillStyle = '#fff';
      ctx.fillText(item.symbol, -w / 2 + 22, 2);
      const symbolWidth = ctx.measureText(item.symbol).width;
      ctx.font = `600 20px ${FONT}`;
      ctx.fillText(item.label, -w / 2 + 22 + symbolWidth + 10, 2);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      x += w + gap;
    });
    ctx.restore();
  }

  private drawSolved(solved: { timeMs: number; moves: number }, withHands: boolean): void {
    const { ctx } = this;
    const { width, height } = this.canvas;
    ctx.save();
    ctx.fillStyle = 'rgb(8 10 22 / 0.7)';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cy = height / 2;
    ctx.fillStyle = '#ff8a2a';
    ctx.font = `800 64px ${FONT}`;
    ctx.fillText('¡Resuelto!', width / 2, cy - 110);
    ctx.fillStyle = '#fff';
    ctx.font = `800 104px ${DIGITS}`;
    ctx.fillText(formatTime(solved.timeMs), width / 2, cy);
    ctx.fillStyle = '#c7cbe8';
    ctx.font = `600 32px ${FONT}`;
    ctx.fillText(`${solved.moves} movimientos`, width / 2, cy + 90);
    if (withHands) {
      ctx.fillStyle = '#9aa0c3';
      ctx.font = `500 26px ${FONT}`;
      ctx.fillText('sin tocar nada: solo con las manos 🤘', width / 2, cy + 145);
    }
    ctx.restore();
  }
}

function layoutFor(format: VideoFormat, withCamera: boolean): Layout {
  if (format === 'horizontal') {
    return withCamera
      ? {
          cube: { x: 220, y: 40, w: 660, h: 660 },
          camera: { x: 1280 - 400 - 28, y: 28, w: 400, h: 225 },
          timer: { x: 28, y: 64, align: 'left' },
          feedX: 550,
          feedY: 650,
        }
      : {
          cube: { x: 310, y: 40, w: 660, h: 660 },
          camera: null,
          timer: { x: 28, y: 64, align: 'left' },
          feedX: 640,
          feedY: 650,
        };
  }
  return withCamera
    ? {
        camera: { x: 0, y: 0, w: 720, h: 600 },
        cube: { x: 20, y: 580, w: 680, h: 680 },
        timer: { x: 360, y: 590, align: 'center' },
        feedX: 360,
        feedY: 1200,
      }
    : {
        camera: null,
        cube: { x: 0, y: 280, w: 720, h: 720 },
        timer: { x: 360, y: 190, align: 'center' },
        feedX: 360,
        feedY: 1080,
      };
}

function easeOutBack(t: number): number {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

/** Fondo de las fichas: el color de la mano mezclado con el fondo oscuro. */
function mixWithDark(hex: string): string {
  const value = parseInt(hex.replace('#', ''), 16);
  const mix = (channel: number, dark: number) => Math.round(channel * 0.25 + dark * 0.75);
  return `rgb(${mix((value >> 16) & 255, 14)} ${mix((value >> 8) & 255, 16)} ${mix(value & 255, 30)} / 0.9)`;
}
