import type { HandShape } from './hand-shape';

/** Tiempo que un sello debe mantenerse para darlo por bueno. */
export const STABLE_MS = 100;
/** Si la mano desaparece un instante (fallo de detección), se conserva el sello este tiempo. */
export const LOST_GRACE_MS = 150;

/**
 * Evita parpadeos: un sello solo cambia cuando la nueva forma se mantiene
 * `STABLE_MS`, y una mano no desaparece por perderla un par de fotogramas.
 */
export class ShapeStabilizer {
  private stable: HandShape | null = null;
  private candidate: HandShape | null = null;
  private candidateSince = 0;
  private lastSeen = -Infinity;

  /**
   * @param shape forma detectada en este fotograma, o `null` si no hay mano.
   * @param time en milisegundos.
   * @returns el sello estable, o `null` si no hay mano (o aún no es estable).
   */
  update(shape: HandShape | null, time: number): HandShape | null {
    if (shape === null) {
      if (time - this.lastSeen > LOST_GRACE_MS) {
        this.stable = null;
        this.candidate = null;
      }
      return this.stable;
    }

    this.lastSeen = time;
    if (shape !== this.candidate) {
      this.candidate = shape;
      this.candidateSince = time;
    }
    if (this.candidate !== this.stable && time - this.candidateSince >= STABLE_MS) {
      this.stable = this.candidate;
    }
    return this.stable;
  }
}
