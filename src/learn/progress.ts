/** Progreso de las lecciones por etapa, guardado en el navegador. */
export interface LessonProgress {
  completed: number;
  /** Menos movimientos con que se ha completado. */
  bestMoves: number | null;
}

const key = (lessonId: string) => `rubik.learn.${lessonId}`;

export function lessonProgress(lessonId: string): LessonProgress {
  try {
    return { completed: 0, bestMoves: null, ...JSON.parse(localStorage.getItem(key(lessonId)) ?? '{}') };
  } catch {
    return { completed: 0, bestMoves: null };
  }
}

export function recordLessonDone(lessonId: string, moves: number): LessonProgress {
  const previous = lessonProgress(lessonId);
  const progress: LessonProgress = {
    completed: previous.completed + 1,
    bestMoves: previous.bestMoves === null ? moves : Math.min(previous.bestMoves, moves),
  };
  localStorage.setItem(key(lessonId), JSON.stringify(progress));
  return progress;
}
