import { describe, expect, it } from 'vitest';
import { Model } from '../solver/model';
import { cardCube, CONCEPT_CARDS } from './concepts';

const card = (title: string) => CONCEPT_CARDS.find((c) => c.title.startsWith(title))!;
const count = (title: string) => card(title).highlight(cardCube(card(title))).length;

describe('Conoce el cubo', () => {
  it('señala 6 centros, 12 aristas y 8 esquinas', () => {
    expect(count('Centros')).toBe(6);
    expect(count('Aristas')).toBe(12);
    expect(count('Esquinas')).toBe(8);
  });

  it('la arista blanca y roja del ejemplo está fuera de su sitio', () => {
    const model = Model.of(cardCube(card('Cada pieza')));
    expect(model.isSolved(['U', 'R'])).toBe(false);
  });

  it('las capas se enseñan con el amarillo arriba', () => {
    expect(Model.of(cardCube(card('Se arma por capas'))).centerOf('D')).toEqual([0, 1, 0]);
  });
});
