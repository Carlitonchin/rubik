import { CubeState } from '../core/cube';
import { randomScramble } from '../core/scramble';
import { turnMatrix, type Turn } from '../core/turn';
import { ALGORITHMS, nextStep, STAGES, type StageId } from '../solver/beginner';

export interface StageLesson {
  id: string;
  title: string;
  /** Etapas del método que se practican (la lección termina al pasarlas). */
  stages: StageId[];
  /** Explicación corta: qué conseguir y la idea clave. */
  intro: string[];
  /** Técnicas (secuencias) que usa la etapa. */
  techniques: (keyof typeof ALGORITHMS)[];
}

export const STAGE_LESSONS: readonly StageLesson[] = [
  {
    id: 'learn-daisy',
    title: 'La margarita',
    stages: ['daisy'],
    intro: [
      'Las aristas son las piezas de dos colores. Busca las cuatro que tienen blanco.',
      'Súbelas alrededor del centro amarillo, con el blanco mirando hacia arriba: quedará como una flor de pétalos blancos.',
      'El truco: antes de subir una arista, gira la fila de arriba para que su hueco esté libre. Así nunca rompes un pétalo que ya pusiste.',
    ],
    techniques: [],
  },
  {
    id: 'learn-cross',
    title: 'Cruz blanca',
    stages: ['cross'],
    intro: [
      'Ahora cada pétalo baja a su sitio, uno a uno.',
      'Gira la fila de arriba hasta que el otro color del pétalo quede encima de su centro (se ve una línea del mismo color) y gira esa cara dos veces.',
      'Al terminar, abajo habrá una cruz blanca y cada arista junto a su centro.',
    ],
    techniques: [],
  },
  {
    id: 'learn-corners',
    title: 'Esquinas blancas',
    stages: ['corners'],
    intro: [
      'Las esquinas son las piezas de tres colores. Faltan las cuatro que tienen blanco.',
      'Pon una esquina justo encima de su hueco (delante a la derecha) y repite el remolino hasta que baje bien colocada: 1, 3 o 5 veces.',
    ],
    techniques: ['whirl'],
  },
  {
    id: 'learn-middle',
    title: 'Segunda capa',
    stages: ['middle'],
    intro: [
      'La capa blanca ya está. Ahora van las aristas de la capa del medio: las que no tienen ni blanco ni amarillo.',
      'Busca una arriba, llévala encima del centro de su color y métela hacia el lado de su otro color.',
    ],
    techniques: ['middleRight', 'middleLeft'],
  },
  {
    id: 'learn-yellow-cross',
    title: 'Cruz amarilla',
    stages: ['yellowCross'],
    intro: ['Arriba verás un punto, una L o una línea amarilla.', 'Deja la L atrás a la izquierda o la línea horizontal y haz la flecha. Repite hasta tener la cruz.'],
    techniques: ['yellowCross'],
  },
  {
    id: 'learn-yellow-edges',
    title: 'Aristas amarillas',
    stages: ['yellowEdges'],
    intro: ['Gira la fila de arriba hasta que dos aristas coincidan con sus centros.', 'Déjalas detrás y a la derecha y haz el intercambio.'],
    techniques: ['yellowEdges'],
  },
  {
    id: 'learn-yellow-corners',
    title: 'Esquinas amarillas en su sitio',
    stages: ['yellowCorners'],
    intro: [
      'Busca una esquina que ya esté en su sitio, aunque esté girada.',
      'Déjala delante a la derecha y haz el carrusel hasta que todas estén en su sitio.',
    ],
    techniques: ['yellowCorners'],
  },
  {
    id: 'learn-orient',
    title: 'Girar las esquinas amarillas',
    stages: ['orientCorners'],
    intro: [
      'Con una esquina sin terminar delante a la derecha, repite el remolino de abajo hasta que su amarillo mire arriba.',
      'Luego gira solo la fila de arriba para traer otra. No gires el cubo: las capas de abajo se desordenan y se arreglan solas al final.',
    ],
    techniques: ['lowerWhirl'],
  },
];

const stageIndex = (stage: StageId) => STAGES.findIndex((s) => s.id === stage);

/**
 * Movimientos que dejan el cubo listo para practicar una lección: se mezcla
 * y el resolvedor avanza hasta justo antes de la primera etapa de la lección.
 * Así las situaciones son naturales y las etapas anteriores ya están hechas.
 */
export function prepareLesson(lesson: StageLesson, random: () => number = Math.random): Turn[] {
  const first = stageIndex(lesson.stages[0]);
  for (let attempt = 0; attempt < 50; attempt++) {
    const cube = new CubeState();
    const turns: Turn[] = randomScramble(25, random);
    for (const turn of turns) cube.applyTurn(turn);
    let focus: string | undefined;
    for (let i = 0; i < 200; i++) {
      const step = nextStep(cube, focus);
      if (!step || stageIndex(step.stage) > first) break;
      if (stageIndex(step.stage) === first) return turns;
      for (const turn of step.turns) {
        if (turn.layers.length === 3) cube.applyRotation(turnMatrix(turn));
        else cube.applyTurn(turn);
        turns.push(turn);
      }
      focus = step.focus;
    }
    // Esta mezcla se saltó la etapa (salió hecha de casualidad): se prueba otra.
  }
  throw new Error(`No se pudo preparar la lección ${lesson.id}`);
}
