// Geometría exacta con enteros. El cubo vive en coordenadas donde
// x = derecha, y = arriba, z = hacia el jugador. Cada pieza tiene
// coordenadas -1, 0 o 1 en cada eje.

export type Axis = 0 | 1 | 2;
export type Vec3 = readonly [number, number, number];
/** Matriz 3x3 guardada por filas. Solo se usan rotaciones exactas (entradas -1, 0, 1). */
export type Mat3 = readonly [Vec3, Vec3, Vec3];

export const IDENTITY: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export function mulMatVec(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function mulMat(a: Mat3, b: Mat3): Mat3 {
  const row = (i: number): Vec3 => [
    a[i][0] * b[0][0] + a[i][1] * b[1][0] + a[i][2] * b[2][0],
    a[i][0] * b[0][1] + a[i][1] * b[1][1] + a[i][2] * b[2][1],
    a[i][0] * b[0][2] + a[i][1] * b[1][2] + a[i][2] * b[2][2],
  ];
  return [row(0), row(1), row(2)];
}

/** Para rotaciones, la traspuesta es la inversa. */
export function transpose(m: Mat3): Mat3 {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

export function matEquals(a: Mat3, b: Mat3): boolean {
  return a.every((row, i) => row.every((value, j) => value === b[i][j]));
}

export function vecEquals(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Lleva un número de cuartos de vuelta a -1, 0, 1 o 2. */
export function normalizeQuarters(quarters: number): number {
  const q = ((quarters % 4) + 4) % 4;
  return q === 3 ? -1 : q;
}

/**
 * Rotación de `quarters` cuartos de vuelta alrededor del eje positivo
 * (regla de la mano derecha: positivo = antihorario mirando desde la punta del eje).
 */
export function quarterRotation(axis: Axis, quarters: number): Mat3 {
  const q = normalizeQuarters(quarters);
  const c = q === 0 ? 1 : q === 2 ? -1 : 0;
  const s = q === 1 ? 1 : q === -1 ? -1 : 0;
  switch (axis) {
    case 0:
      return [
        [1, 0, 0],
        [0, c, -s],
        [0, s, c],
      ];
    case 1:
      return [
        [c, 0, s],
        [0, 1, 0],
        [-s, 0, c],
      ];
    case 2:
      return [
        [c, -s, 0],
        [s, c, 0],
        [0, 0, 1],
      ];
  }
}

/** Devuelve el eje y el signo de un vector unitario alineado con un eje. */
export function axisOf(v: Vec3): { axis: Axis; sign: 1 | -1 } {
  for (const axis of [0, 1, 2] as const) {
    if (v[axis] !== 0) return { axis, sign: v[axis] > 0 ? 1 : -1 };
  }
  throw new Error(`Vector nulo: ${v.join(',')}`);
}

export function unitVector(axis: Axis, sign: 1 | -1 = 1): Vec3 {
  return [axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0];
}

/** Las 24 orientaciones posibles de un cubo (matrices de permutación con signo y determinante +1). */
export const CUBE_ROTATIONS: readonly Mat3[] = (() => {
  const permutations: [Axis, Axis, Axis][] = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  const result: Mat3[] = [];
  for (const perm of permutations) {
    for (let signs = 0; signs < 8; signs++) {
      const rows = perm.map((col, i) => unitVector(col, signs & (1 << i) ? -1 : 1)) as [Vec3, Vec3, Vec3];
      if (determinant(rows) === 1) result.push(rows);
    }
  }
  return result;
})();

function determinant(m: Mat3): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}
