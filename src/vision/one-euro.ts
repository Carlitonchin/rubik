import type { Point3 } from './landmarks';

/**
 * Filtro "One Euro" (Casiez et al., 2012): suaviza mucho cuando la mano está
 * quieta (quita el temblor) y poco cuando se mueve rápido (no añade retraso).
 */
export class OneEuroFilter {
  private prevTime: number | null = null;
  private prevValue = 0;
  private prevDerivative = 0;

  constructor(
    private readonly minCutoff: number,
    private readonly beta: number,
    private readonly derivativeCutoff = 1,
  ) {}

  /** @param time en segundos */
  filter(value: number, time: number): number {
    if (this.prevTime === null) {
      this.prevTime = time;
      this.prevValue = value;
      return value;
    }
    const dt = time - this.prevTime;
    if (dt <= 0) return this.prevValue;

    const derivative = (value - this.prevValue) / dt;
    this.prevDerivative = lerp(this.prevDerivative, derivative, alpha(this.derivativeCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(this.prevDerivative);
    this.prevValue = lerp(this.prevValue, value, alpha(cutoff, dt));
    this.prevTime = time;
    return this.prevValue;
  }

  reset(): void {
    this.prevTime = null;
  }
}

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

function lerp(from: number, to: number, k: number): number {
  return from + (to - from) * k;
}

/** Aplica un filtro One Euro a cada coordenada de una lista de puntos. */
export class PointsFilter {
  private filters: OneEuroFilter[] = [];

  constructor(
    private readonly minCutoff: number,
    private readonly beta: number,
  ) {}

  filter(points: readonly Point3[], time: number): Point3[] {
    if (this.filters.length !== points.length * 3) {
      this.filters = Array.from({ length: points.length * 3 }, () => new OneEuroFilter(this.minCutoff, this.beta));
    }
    return points.map((p, i) => ({
      x: this.filters[i * 3].filter(p.x, time),
      y: this.filters[i * 3 + 1].filter(p.y, time),
      z: this.filters[i * 3 + 2].filter(p.z, time),
    }));
  }

  reset(): void {
    for (const filter of this.filters) filter.reset();
  }
}
