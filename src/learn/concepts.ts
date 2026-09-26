import { CubeState } from '../core/cube';
import type { Vec3 } from '../core/geometry';
import { parseAlgorithm, turnMatrix } from '../core/turn';
import type { LayerHighlight } from '../render/cube-view';
import { Model } from '../solver/model';

/** Tarjeta de «Conoce el cubo»: una idea, con el cubo señalando lo que explica. */
export interface ConceptCard {
  title: string;
  text: string;
  /** Movimientos (desde el cubo resuelto) para dejar el cubo como se quiere enseñar. */
  setup: string;
  highlight(cube: CubeState): LayerHighlight[];
}

const PIECE = '#ffffff';
const LAYER = '#ffd54a';
const all: Vec3[] = [-1, 0, 1].flatMap((x) => [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((z): Vec3 => [x, y, z])));
const zeros = (pos: Vec3) => pos.filter((v) => v === 0).length;
const pieces = (positions: Vec3[]): LayerHighlight[] => positions.map((pos) => ({ kind: 'piece', pos, color: PIECE, pulse: true }));

// Una mezcla fija, para enseñar una pieza fuera de su sitio.
const SCRAMBLE = "R U F' L2 D B' R2 U' F D2 L' B";

export const CONCEPT_CARDS: readonly ConceptCard[] = [
  {
    title: 'Tu cubo tiene 26 piezas',
    text: 'Cuando giras una capa se mueven piezas enteras, no pegatinas sueltas. Hay tres tipos de pieza: centros, aristas y esquinas.',
    setup: '',
    highlight: () => [],
  },
  {
    title: 'Centros: un color',
    text: 'Brillan en el cubo. Están en el centro de cada cara y tienen un solo color. No cambian de sitio entre ellos: el blanco siempre está enfrente del amarillo. El centro dice de qué color tiene que ser su cara.',
    setup: SCRAMBLE,
    highlight: () => pieces(all.filter((pos) => zeros(pos) === 2)),
  },
  {
    title: 'Aristas: dos colores',
    text: 'Brillan en el cubo. Están entre dos centros y tienen dos colores. Hay 12.',
    setup: SCRAMBLE,
    highlight: () => pieces(all.filter((pos) => zeros(pos) === 1)),
  },
  {
    title: 'Esquinas: tres colores',
    text: 'Brillan en el cubo. Están en las esquinas y tienen tres colores. Hay 8.',
    setup: SCRAMBLE,
    highlight: () => pieces(all.filter((pos) => zeros(pos) === 0)),
  },
  {
    title: 'Cada pieza tiene su sitio',
    text: 'Una pieza nunca cambia de colores: la arista blanca y roja (marcada en blanco) siempre será blanca y roja. Su sitio está entre el centro blanco y el centro rojo (marcados en dorado). Armar el cubo es llevar cada pieza a su sitio.',
    setup: SCRAMBLE,
    highlight: (cube) => {
      const model = Model.of(cube);
      return [
        { kind: 'piece', pos: model.find(['U', 'R']), color: PIECE, pulse: true },
        { kind: 'piece', pos: model.centerOf('U'), color: LAYER },
        { kind: 'piece', pos: model.centerOf('R'), color: LAYER },
      ];
    },
  },
  {
    title: 'Se arma por capas',
    text: 'Primero la capa blanca (la de abajo, marcada en dorado), luego la del medio y al final la amarilla. Por eso siempre tendremos el amarillo arriba y el blanco abajo.',
    setup: 'x2',
    highlight: () => [{ axis: 1, layer: -1, color: LAYER, pulse: true }],
  },
  {
    title: 'Filas, columnas y caras',
    text: 'Hablaremos de la fila de arriba o de abajo, la columna derecha o izquierda y la cara de frente o de atrás. Por ejemplo, esta es la columna derecha. En el modo ninja cada una tiene su gesto: lo verás en cada paso.',
    setup: 'x2',
    highlight: () => [{ axis: 0, layer: 1, color: LAYER, pulse: true, preview: -1 }],
  },
];

/** Estado del cubo de una tarjeta (para calcular qué resaltar). */
export function cardCube(card: ConceptCard): CubeState {
  const cube = new CubeState();
  for (const turn of parseAlgorithm(card.setup)) {
    if (turn.layers.length === 3) cube.applyRotation(turnMatrix(turn));
    else cube.applyTurn(turn);
  }
  return cube;
}
