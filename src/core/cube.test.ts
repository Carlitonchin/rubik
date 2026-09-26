import { describe, expect, it } from 'vitest';
import { CubeState } from './cube';
import { CUBE_ROTATIONS, IDENTITY, matEquals, mulMat, quarterRotation, transpose } from './geometry';
import { randomScramble } from './scramble';
import { formatAlgorithm, inverseTurn, parseAlgorithm, parseTurn, transformTurn, turnMatrix, type Turn } from './turn';

function apply(cube: CubeState, turns: readonly Turn[]): CubeState {
  for (const turn of turns) cube.applyTurn(turn);
  return cube;
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

describe('geometría', () => {
  it('hay exactamente 24 orientaciones distintas del cubo', () => {
    expect(CUBE_ROTATIONS).toHaveLength(24);
    const unique = new Set(CUBE_ROTATIONS.map((m) => JSON.stringify(m)));
    expect(unique.size).toBe(24);
  });

  it('cuatro cuartos de vuelta vuelven a la identidad', () => {
    for (const axis of [0, 1, 2] as const) {
      const q = quarterRotation(axis, 1);
      expect(matEquals(mulMat(mulMat(q, q), mulMat(q, q)), IDENTITY)).toBe(true);
      expect(matEquals(mulMat(q, transpose(q)), IDENTITY)).toBe(true);
    }
  });
});

describe('notación', () => {
  it('lee y escribe algoritmos', () => {
    const text = "R U R' U' F2 M' x y' Rw";
    expect(formatAlgorithm(parseAlgorithm(text))).toBe("R U R' U' F2 M' x y' r");
  });

  it('R sube la columna derecha del frente', () => {
    const cube = new CubeState();
    cube.applyTurn(parseTurn('R'));
    // Una pegatina del frente termina en la cara de arriba.
    expect(cube.colorAt([1, 1, 1], [0, 1, 0])).toBe('F');
  });

  it('U lleva la fila de arriba del frente hacia la izquierda', () => {
    const cube = new CubeState();
    cube.applyTurn(parseTurn('U'));
    expect(cube.colorAt([-1, 1, 1], [-1, 0, 0])).toBe('F');
  });

  it('F gira el frente en sentido horario', () => {
    const cube = new CubeState();
    cube.applyTurn(parseTurn('F'));
    expect(cube.colorAt([1, 1, 1], [1, 0, 0])).toBe('U');
  });
});

describe('estado del cubo', () => {
  it('empieza resuelto', () => {
    expect(new CubeState().isSolved()).toBe(true);
  });

  it('cualquier cara girada 4 veces vuelve al estado resuelto', () => {
    for (const move of ['R', 'L', 'U', 'D', 'F', 'B', 'M', 'E', 'S']) {
      const cube = new CubeState();
      apply(cube, [parseTurn(move)]);
      expect(cube.isSolved()).toBe(false);
      apply(cube, parseAlgorithm(`${move} ${move} ${move}`));
      expect(cube.isSolved()).toBe(true);
    }
  });

  it("R U R' U' repetido 6 veces vuelve al estado resuelto", () => {
    const sexy = parseAlgorithm("R U R' U'");
    const cube = new CubeState();
    for (let i = 0; i < 5; i++) apply(cube, sexy);
    expect(cube.isSolved()).toBe(false);
    apply(cube, sexy);
    expect(cube.isSolved()).toBe(true);
  });

  it('una mezcla seguida de su inversa deja el cubo resuelto', () => {
    const scramble = randomScramble(25, seededRandom(42));
    const cube = apply(new CubeState(), scramble);
    expect(cube.isSolved()).toBe(false);
    apply(cube, [...scramble].reverse().map(inverseTurn));
    expect(cube.isSolved()).toBe(true);
  });

  it('girar el cubo entero no lo desordena', () => {
    const cube = new CubeState();
    for (const rotation of CUBE_ROTATIONS) {
      cube.applyRotation(rotation);
      expect(cube.isSolved()).toBe(true);
    }
  });

  it('deshacer sigue funcionando después de girar el cubo entero', () => {
    const scramble = randomScramble(20, seededRandom(7));
    const cube = apply(new CubeState(), scramble);
    let history = [...scramble];
    for (const rotation of [CUBE_ROTATIONS[5], CUBE_ROTATIONS[17], turnMatrix(parseTurn('x'))]) {
      cube.applyRotation(rotation);
      history = history.map((turn) => transformTurn(turn, rotation));
    }
    apply(cube, history.reverse().map(inverseTurn));
    expect(cube.isSolved()).toBe(true);
  });
});

describe('mezcla', () => {
  it('no repite la misma cara dos veces seguidas', () => {
    const turns = formatAlgorithm(randomScramble(200, seededRandom(1))).split(' ');
    for (let i = 1; i < turns.length; i++) expect(turns[i][0]).not.toBe(turns[i - 1][0]);
  });
});
