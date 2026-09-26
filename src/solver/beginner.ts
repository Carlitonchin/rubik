import type { CubeState, Face } from '../core/cube';
import { mulMatVec, vecEquals, type Vec3 } from '../core/geometry';
import { parseAlgorithm, turnMatrix, type Turn } from '../core/turn';
import { Model } from './model';
import { shortestSolution } from './search';

/**
 * Método para principiantes (el de la guía oficial de Rubik), paso a paso.
 * Cada paso es corto y se explica en lenguaje llano, para que una persona
 * pueda seguirlo y aprender. No busca la solución más corta.
 */

export type StageId = 'cross' | 'corners' | 'flip' | 'middle' | 'yellowCross' | 'yellowEdges' | 'yellowCorners' | 'orientCorners';

export const STAGES: readonly { id: StageId; name: string }[] = [
  { id: 'cross', name: 'Cruz blanca' },
  { id: 'corners', name: 'Esquinas blancas' },
  { id: 'flip', name: 'Dar la vuelta al cubo' },
  { id: 'middle', name: 'Segunda capa' },
  { id: 'yellowCross', name: 'Cruz amarilla' },
  { id: 'yellowEdges', name: 'Aristas amarillas en su sitio' },
  { id: 'yellowCorners', name: 'Esquinas amarillas en su sitio' },
  { id: 'orientCorners', name: 'Girar las esquinas amarillas' },
];

export interface SolveStep {
  stage: StageId;
  /** Qué se consigue, por ejemplo «Coloca la arista blanca y verde». */
  title: string;
  /** Cómo hacerlo o qué observar, en lenguaje llano. */
  detail: string;
  /** Movimientos del paso, tal como se ve el cubo ahora (pueden incluir girar el cubo entero). */
  turns: Turn[];
  /** Posiciones de las piezas protagonistas, para resaltarlas. */
  highlight: Vec3[];
  /** Pieza en la que se está trabajando (para seguir con ella en el siguiente paso). */
  focus?: string;
}

/** Secuencias del método, con el nombre con el que se enseñan. */
export const ALGORITHMS = {
  /** Remolino de abajo: baja y sube la columna derecha girando la fila de abajo. */
  lowerWhirl: { name: 'el remolino de abajo', moves: "R' D' R D" },
  middleRight: { name: 'la entrada por la derecha', moves: "U R U' R' U' F' U F" },
  middleLeft: { name: 'la entrada por la izquierda', moves: "U' L' U L U F U' F'" },
  yellowCross: { name: 'la flecha', moves: "F R U R' U' F'" },
  yellowEdges: { name: 'el intercambio', moves: "R U R' U R U2 R' U" },
  yellowCorners: { name: 'el carrusel', moves: "U R U' L' U R' U' L" },
} as const;

const WHITE: Face = 'U';
const YELLOW: Face = 'D';
const SIDES: readonly Face[] = ['F', 'R', 'B', 'L'];
const ADJACENT: readonly [Face, Face][] = [
  ['F', 'R'],
  ['R', 'B'],
  ['B', 'L'],
  ['L', 'F'],
];
const WHITE_EDGES = SIDES.map((c): Face[] => [WHITE, c]);
const WHITE_CORNERS = ADJACENT.map(([a, b]): Face[] => [WHITE, a, b]);
const MIDDLE_EDGES = ADJACENT.map(([a, b]): Face[] => [a, b]);
const YELLOW_EDGES = SIDES.map((c): Face[] => [YELLOW, c]);
const YELLOW_CORNERS = ADJACENT.map(([a, b]): Face[] => [YELLOW, a, b]);

const UP: Vec3 = [0, 1, 0];
const DOWN: Vec3 = [0, -1, 0];
const FRONT_RIGHT_TOP: Vec3 = [1, 1, 1];
const FRONT_RIGHT_BOTTOM: Vec3 = [1, -1, 1];

const t = (moves: string) => parseAlgorithm(moves);
const algorithm = (key: keyof typeof ALGORITHMS) => t(ALGORITHMS[key].moves);
const pieceKey = (colors: readonly Face[]) => colors.join('');

// --- Nombres en lenguaje llano ------------------------------------------

const COLOR_NAMES: Record<Face, { f: string; m: string }> = {
  U: { f: 'blanca', m: 'blanco' },
  D: { f: 'amarilla', m: 'amarillo' },
  F: { f: 'verde', m: 'verde' },
  B: { f: 'azul', m: 'azul' },
  R: { f: 'roja', m: 'rojo' },
  L: { f: 'naranja', m: 'naranja' },
};

export function pieceName(colors: readonly Face[]): string {
  const names = colors.map((c) => COLOR_NAMES[c].f);
  const list = names.length === 2 ? `${names[0]} y ${names[1]}` : `${names[0]}, ${names[1]} y ${names[2]}`;
  return `la ${colors.length === 2 ? 'arista' : 'esquina'} ${list}`;
}

const centerName = (color: Face) => `el centro ${COLOR_NAMES[color].m}`;
const times = (n: number) => (n === 1 ? 'una vez' : `${n} veces`);

// --- Estado de cada etapa -----------------------------------------------

const allSolved = (m: Model, pieces: readonly (readonly Face[])[]) => pieces.every((p) => m.isSolved(p));
const crossDone = (m: Model) => allSolved(m, WHITE_EDGES);
const firstLayerDone = (m: Model) => crossDone(m) && allSolved(m, WHITE_CORNERS);
const secondLayerDone = (m: Model) => firstLayerDone(m) && allSolved(m, MIDDLE_EDGES);
const yellowCrossDone = (m: Model) => YELLOW_EDGES.every((p) => vecEquals(m.facing(p, YELLOW), m.centerOf(YELLOW)));

/** ¿Están las aristas amarillas bien, girando antes la fila de arriba si hace falta? Devuelve ese giro. */
function topAlignment(m: Model, check: (m: Model) => boolean): Turn[] | null {
  for (const turns of [[], t('U'), t("U'"), t('U2')]) {
    if (check(m.clone().apply(turns))) return turns;
  }
  return null;
}
const yellowEdgesSolved = (m: Model) => allSolved(m, YELLOW_EDGES);
const yellowCornersPlaced = (m: Model) => yellowEdgesSolved(m) && YELLOW_CORNERS.every((p) => m.isPlaced(p));

/** Etapa en la que está el cubo. */
export function currentStage(cube: CubeState): StageId | 'solved' {
  return nextStep(cube)?.stage ?? 'solved';
}

// --- Paso siguiente ------------------------------------------------------

/**
 * Siguiente paso del método para el cubo tal como está. `focus` indica la
 * pieza del paso anterior, para seguir con ella si aún no está terminada.
 */
export function nextStep(cube: CubeState, focus?: string): SolveStep | null {
  const step = rawNextStep(cube, focus);
  return step && { ...step, title: contract(step.title), detail: contract(step.detail) };
}

/** «a el centro» → «al centro», «de el centro» → «del centro». */
function contract(text: string): string {
  return text.replace(/\ba el\b/g, 'al').replace(/\bde el\b/g, 'del');
}

function rawNextStep(cube: CubeState, focus?: string): SolveStep | null {
  const m = Model.of(cube);
  if (cube.isSolved()) return null;

  const orienting = orientCornersStep(m);
  if (orienting) return orienting;

  const white = m.centerOf(WHITE);
  if (!firstLayerDone(m)) {
    const stage: StageId = crossDone(m) ? 'corners' : 'cross';
    if (!vecEquals(white, UP)) {
      return {
        stage,
        title: 'Pon el centro blanco arriba',
        detail: 'Las dos primeras etapas se hacen con la cara blanca mirando hacia arriba. Gira el cubo entero.',
        turns: rotationBringing(white, UP),
        highlight: [white],
      };
    }
    return stage === 'cross' ? crossStep(m, focus) : cornerStep(m, focus);
  }

  if (!vecEquals(white, DOWN)) {
    return {
      stage: 'flip',
      title: 'Dale la vuelta al cubo',
      detail: 'La primera capa ya está. Desde ahora se trabaja con el blanco abajo y el amarillo arriba.',
      turns: rotationBringing(white, DOWN),
      highlight: [white],
    };
  }
  if (!secondLayerDone(m)) return middleStep(m, focus);
  if (!yellowCrossDone(m)) return yellowCrossStep(m);
  if (!topAlignment(m, yellowEdgesSolved)) return yellowEdgesStep(m);
  if (!topAlignment(m, yellowCornersPlaced)) return yellowCornersStep(m);
  return orientCornersStep(m) ?? finalAlignmentStep(m);
}

/** Solución completa, paso a paso (para pruebas y para mostrar el plan entero). */
export function solve(cube: CubeState, maxSteps = 200): SolveStep[] {
  const state = cube.clone();
  const steps: SolveStep[] = [];
  let focus: string | undefined;
  for (let i = 0; i < maxSteps; i++) {
    const step = nextStep(state, focus);
    if (!step) return steps;
    steps.push(step);
    for (const turn of step.turns) {
      if (turn.layers.length === 3) state.applyRotation(turnMatrix(turn));
      else state.applyTurn(turn);
    }
    focus = step.focus;
  }
  throw new Error('El resolvedor no terminó');
}

// --- Etapa 1: cruz blanca -------------------------------------------------

function crossStep(m: Model, focus?: string): SolveStep {
  const solved = WHITE_EDGES.filter((p) => m.isSolved(p));
  const pending = WHITE_EDGES.filter((p) => !m.isSolved(p));
  const focused = pending.find((p) => pieceKey(p) === focus);
  // Se elige la arista más fácil de colocar (o la que ya se estaba colocando).
  const options = (focused ? [focused] : pending).map((edge) => ({ edge, turns: shortestSolution(m, [...solved, edge]) ?? [] }));
  const { edge, turns } = options.reduce((best, option) => (option.turns.length < best.turns.length ? option : best));
  return {
    stage: 'cross',
    title: `Coloca ${pieceName(edge)} en la cruz`,
    detail: `El blanco tiene que quedar arriba y el ${COLOR_NAMES[edge[1]].m} junto a ${centerName(edge[1])}. Las aristas blancas que ya están bien vuelven a su sitio al terminar.`,
    turns,
    highlight: [m.find(edge)],
    focus: pieceKey(edge),
  };
}

// --- Etapa 2: esquinas blancas ------------------------------------------

function cornerStep(m: Model, focus?: string): SolveStep {
  const pending = WHITE_CORNERS.filter((p) => !m.isSolved(p));
  // Mejor una que ya esté abajo; si no, la que se estaba colocando.
  const corner =
    pending.find((p) => pieceKey(p) === focus) ?? pending.find((p) => m.find(p)[1] === -1) ?? pending[0];
  const name = pieceName(corner);
  const pos = m.find(corner);
  const base = { stage: 'corners' as const, highlight: [pos], focus: pieceKey(corner) };

  if (pos[1] === 1) {
    // Está arriba pero mal: primero hay que bajarla.
    const turn = rotationAround(pos, FRONT_RIGHT_TOP);
    if (turn.length) {
      return { ...base, title: `Gira el cubo para tener ${name} delante a la derecha`, detail: 'Esta esquina está arriba pero mal colocada: primero hay que sacarla.', turns: turn };
    }
    return {
      ...base,
      title: `Saca ${name} hacia abajo`,
      detail: `Haz ${ALGORITHMS.lowerWhirl.name} una vez: la esquina baja a la fila de abajo.`,
      turns: algorithm('lowerWhirl'),
    };
  }

  const home = m.home(corner);
  const turn = rotationAround(home, FRONT_RIGHT_TOP);
  if (turn.length) {
    return { ...base, title: `Gira el cubo para tener el hueco de ${name} delante a la derecha`, detail: 'El hueco es el sitio de arriba donde tiene que ir la esquina.', turns: turn };
  }
  if (!vecEquals(pos, FRONT_RIGHT_BOTTOM)) {
    const turns = [t('D'), t("D'"), t('D2')].find((option) => vecEquals(m.clone().apply(option).find(corner), FRONT_RIGHT_BOTTOM))!;
    return { ...base, title: `Lleva ${name} justo debajo de su hueco`, detail: 'Gira la fila de abajo hasta que la esquina quede debajo del hueco (delante a la derecha).', turns };
  }
  const repeats = [1, 2, 3, 4, 5].find((n) => m.clone().apply(repeat(algorithm('lowerWhirl'), n)).isSolved(corner))!;
  return {
    ...base,
    title: `Sube ${name} a su sitio`,
    detail: `Repite ${ALGORITHMS.lowerWhirl.name} (${ALGORITHMS.lowerWhirl.moves}) ${times(repeats)}, hasta que la esquina quede bien, con el blanco arriba.`,
    turns: repeat(algorithm('lowerWhirl'), repeats),
  };
}

// --- Etapa 4: segunda capa ------------------------------------------------

function middleStep(m: Model, focus?: string): SolveStep {
  const pending = MIDDLE_EDGES.filter((p) => !m.isSolved(p));
  const inTop = pending.filter((p) => m.find(p)[1] === 1);
  const edge = inTop.find((p) => pieceKey(p) === focus) ?? inTop[0];

  if (!edge) {
    // Ninguna disponible arriba: hay una en la capa del medio pero mal. Se saca.
    const stuck = pending.find((p) => pieceKey(p) === focus) ?? pending[0];
    const pos = m.find(stuck);
    const turn = rotationAround(pos, [1, 0, 1]);
    const base = { stage: 'middle' as const, highlight: [pos], focus: pieceKey(stuck) };
    if (turn.length) {
      return { ...base, title: `Gira el cubo para tener ${pieceName(stuck)} delante a la derecha`, detail: 'Está en la segunda capa pero mal colocada: hay que sacarla.', turns: turn };
    }
    return {
      ...base,
      title: `Saca ${pieceName(stuck)} de la segunda capa`,
      detail: `Haz ${ALGORITHMS.middleRight.name}: la pieza sube a la fila de arriba y luego se coloca bien.`,
      turns: algorithm('middleRight'),
    };
  }

  const pos = m.find(edge);
  const side = edge.find((c) => !vecEquals(m.facing(edge, c), UP))!;
  const top = edge.find((c) => c !== side)!;
  const base = { stage: 'middle' as const, highlight: [pos], focus: pieceKey(edge) };
  const turn = rotationAround(m.centerOf(side), [0, 0, 1]);
  if (turn.length) {
    return { ...base, title: `Gira el cubo para tener ${centerName(side)} delante`, detail: `${capitalize(pieceName(edge))} va entre ${centerName(side)} y ${centerName(top)}.`, turns: turn };
  }
  if (!vecEquals(pos, [0, 1, 1])) {
    const turns = [t('U'), t("U'"), t('U2')].find((option) => vecEquals(m.clone().apply(option).find(edge), [0, 1, 1]))!;
    return {
      ...base,
      title: `Lleva ${pieceName(edge)} encima de ${centerName(side)}`,
      detail: `Gira la fila de arriba hasta que el ${COLOR_NAMES[side].m} de la arista quede justo encima de ${centerName(side)}.`,
      turns,
    };
  }
  const right = vecEquals(m.centerOf(top), [1, 0, 0]);
  const alg = right ? ALGORITHMS.middleRight : ALGORITHMS.middleLeft;
  return {
    ...base,
    title: `Mete ${pieceName(edge)} por la ${right ? 'derecha' : 'izquierda'}`,
    detail: `El ${COLOR_NAMES[top].m} de arriba tiene que ir hacia ${centerName(top)}, que está a la ${right ? 'derecha' : 'izquierda'}: haz ${alg.name} (${alg.moves}).`,
    turns: t(alg.moves),
  };
}

// --- Etapas 5, 6 y 7: la última capa con secuencias ---------------------

/**
 * Busca la forma de llegar a `goal` repitiendo una secuencia, con giros
 * previos de la fila de arriba o del cubo entero para "sostenerlo" bien.
 * Devuelve solo el primer paso (girar la fila, girar el cubo o la secuencia).
 */
function withAlgorithm(
  m: Model,
  moves: Turn[],
  goal: (m: Model) => boolean,
  setups: readonly Turn[][],
): { setup: Turn[]; algorithm: Turn[] } | null {
  let frontier: { model: Model; first: { setup: Turn[] } | null }[] = [{ model: m, first: null }];
  for (let depth = 0; depth < 4; depth++) {
    const next: typeof frontier = [];
    for (const { model, first } of frontier) {
      for (const setup of setups) {
        const after = model.clone().apply(setup).apply(moves);
        const origin = first ?? { setup };
        if (goal(after)) return { setup: origin.setup, algorithm: moves };
        next.push({ model: after, first: origin });
      }
    }
    frontier = next;
  }
  return null;
}

const U_SETUPS = [[], t('U'), t("U'"), t('U2')];
const Y_SETUPS = [[], t('y'), t("y'"), t('y2')];

function lastLayerStep(
  m: Model,
  stage: StageId,
  key: keyof typeof ALGORITHMS,
  goal: (m: Model) => boolean,
  setups: readonly Turn[][],
  texts: { setup: string; setupDetail: string; algorithm: string; detail: string },
): SolveStep {
  const found = withAlgorithm(m, algorithm(key), goal, setups);
  if (!found) throw new Error(`Sin solución para la etapa ${stage}`);
  const highlight = YELLOW_EDGES.map((p) => m.find(p));
  if (found.setup.length) {
    return { stage, title: texts.setup, detail: texts.setupDetail, turns: found.setup, highlight };
  }
  return { stage, title: texts.algorithm, detail: `${texts.detail} Secuencia: ${ALGORITHMS[key].moves}.`, turns: found.algorithm, highlight };
}

function yellowCrossStep(m: Model): SolveStep {
  return lastLayerStep(m, 'yellowCross', 'yellowCross', yellowCrossDone, U_SETUPS, {
    setup: 'Coloca la fila de arriba antes de la secuencia',
    setupDetail: 'Si ves una L amarilla, déjala atrás a la izquierda; si ves una línea, déjala horizontal.',
    algorithm: 'Haz la cruz amarilla',
    detail: `Haz ${ALGORITHMS.yellowCross.name}. Si todavía no sale la cruz, se repite.`,
  });
}

function yellowEdgesStep(m: Model): SolveStep {
  const aligned = (model: Model) => topAlignment(model, yellowEdgesSolved) !== null;
  const setups = [...U_SETUPS, ...Y_SETUPS.slice(1)];
  return lastLayerStep(m, 'yellowEdges', 'yellowEdges', aligned, setups, {
    setup: 'Prepara el cubo para el intercambio',
    setupDetail: 'Gira hasta que dos aristas amarillas coincidan con sus centros y queden detrás y a la derecha.',
    algorithm: 'Intercambia las aristas amarillas',
    detail: `Haz ${ALGORITHMS.yellowEdges.name}: cambia de sitio dos aristas de arriba.`,
  });
}

function yellowCornersStep(m: Model): SolveStep {
  const edgesAlign = topAlignment(m, yellowEdgesSolved)!;
  if (edgesAlign.length) {
    return {
      stage: 'yellowCorners',
      title: 'Alinea la fila de arriba',
      detail: 'Gira la fila de arriba hasta que cada arista amarilla quede junto a su centro.',
      turns: edgesAlign,
      highlight: YELLOW_EDGES.map((p) => m.find(p)),
    };
  }
  const step = lastLayerStep(m, 'yellowCorners', 'yellowCorners', yellowCornersPlaced, Y_SETUPS, {
    setup: 'Gira el cubo para dejar la esquina buena delante a la derecha',
    setupDetail: 'Busca la esquina amarilla que ya está en su sitio (aunque esté girada): esa se queda quieta.',
    algorithm: 'Mueve las esquinas amarillas a su sitio',
    detail: `Haz ${ALGORITHMS.yellowCorners.name}: tres esquinas se cambian de sitio y la de delante a la derecha se queda.`,
  });
  return { ...step, highlight: YELLOW_CORNERS.map((p) => m.find(p)) };
}

// --- Etapa 8: girar las esquinas amarillas --------------------------------

/**
 * Etapa 8: con el remolino de abajo se gira cada esquina hasta que el
 * amarillo mire arriba, girando solo la fila de arriba entre esquinas. A
 * mitad de camino las capas de abajo quedan desordenadas y se arreglan solas
 * al final, así que se reconoce ese estado para no empezar de cero.
 */
function orientCornersStep(m: Model): SolveStep | null {
  const whirl = algorithm('lowerWhirl');
  if (!vecEquals(m.centerOf(WHITE), DOWN)) return null;

  // ¿Se quedó a medias un remolino? (Tras R', R' D' o R' D' R.)
  const completions = [[], t('D'), t('R D'), t("D' R D")];
  const lastLayerReady = (model: Model) => topAlignment(model, yellowCornersPlaced) !== null;
  const completion = completions.find((suffix) =>
    [0, 1, 2, 3, 4, 5].some((n) => {
      const restored = m.clone().apply(suffix).apply(repeat(whirl, n));
      return secondLayerDone(restored) && lastLayerReady(restored);
    }),
  );
  if (!completion) return null;
  if (secondLayerDone(m) && !lastLayerReady(m)) return null;
  const base = { stage: 'orientCorners' as const, highlight: [FRONT_RIGHT_TOP] };

  if (completion.length) {
    return { ...base, title: 'Termina el remolino de abajo', detail: 'Te quedaste a mitad de la secuencia: complétala.', turns: completion };
  }
  const yellowUp = (model: Model, pos: Vec3) => YELLOW_CORNERS.some((p) => vecEquals(model.find(p), pos) && vecEquals(model.facing(p, YELLOW), UP));
  const topCorners: Vec3[] = [FRONT_RIGHT_TOP, [-1, 1, 1], [-1, 1, -1], [1, 1, -1]];
  if (topCorners.every((pos) => yellowUp(m, pos))) return null;

  if (!yellowUp(m, FRONT_RIGHT_TOP)) {
    const repeats = [2, 4, 1, 3, 5].find((n) => yellowUp(m.clone().apply(repeat(whirl, n)), FRONT_RIGHT_TOP))!;
    return {
      ...base,
      title: 'Gira la esquina de delante a la derecha',
      detail: `Repite ${ALGORITHMS.lowerWhirl.name} (${ALGORITHMS.lowerWhirl.moves}) ${times(repeats)}, hasta que el amarillo de esa esquina mire arriba. Las capas de abajo se desordenan: es normal, se arreglan solas al final. No gires el cubo entero.`,
      turns: repeat(whirl, repeats),
    };
  }
  const turns = [t('U'), t("U'"), t('U2')].find((option) => !yellowUp(m.clone().apply(option), FRONT_RIGHT_TOP))!;
  return {
    ...base,
    title: 'Trae otra esquina sin terminar',
    detail: 'Gira solo la fila de arriba (no el cubo entero) hasta que delante a la derecha haya una esquina con el amarillo sin mirar arriba.',
    turns,
  };
}

function finalAlignmentStep(m: Model): SolveStep {
  const turns = topAlignment(m, (model) => allSolved(model, [...YELLOW_EDGES, ...YELLOW_CORNERS]))!;
  return {
    stage: 'orientCorners',
    title: '¡Último giro!',
    detail: 'Gira la fila de arriba para que todo encaje.',
    turns,
    highlight: [],
  };
}

// --- Utilidades -------------------------------------------------------------

function repeat(turns: Turn[], n: number): Turn[] {
  return Array.from({ length: n }, () => turns).flat();
}

/** Giro del cubo entero (x, x', z, z' o x2) que lleva la dirección `from` a `to`. */
function rotationBringing(from: Vec3, to: Vec3): Turn[] {
  for (const option of [[], t('x'), t("x'"), t('z'), t("z'"), t('x2'), t('z2')]) {
    if (vecEquals(option.reduce((v, turn) => mulMatVec(turnMatrix(turn), v), from), to)) return option;
  }
  throw new Error('Sin giro posible');
}

/** Giro del cubo entero alrededor del eje vertical (y) que lleva `from` a `to`, o [] si ya está. */
function rotationAround(from: Vec3, to: Vec3): Turn[] {
  for (const option of Y_SETUPS) {
    if (vecEquals(option.reduce((v, turn) => mulMatVec(turnMatrix(turn), v), from), to)) return option;
  }
  throw new Error('La pieza no se puede llevar ahí girando el cubo');
}

function capitalize(text: string): string {
  return text[0].toUpperCase() + text.slice(1);
}
