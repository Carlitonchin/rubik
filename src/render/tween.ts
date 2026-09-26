export type Easing = (t: number) => number;

export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;
export const easeOutQuad: Easing = (t) => 1 - (1 - t) ** 2;

/** Llama a `update` con un progreso de 0 a 1 durante `durationMs`. */
export function tween(durationMs: number, easing: Easing, update: (k: number) => void): Promise<void> {
  if (durationMs <= 0) {
    update(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      update(easing(t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}
