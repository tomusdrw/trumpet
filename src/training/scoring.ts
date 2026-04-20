export const INTONATION_CAP_CENTS = 30;
export const MISTAKE_WEIGHT = 0.5;
export const STAR_3_THRESHOLD = 90;
export const STAR_2_THRESHOLD = 70;

export interface RunProgress {
  perNoteWorstCents: readonly number[];
  mistakes: number;
  noteTargetCount: number;
}

export interface RunScore {
  score: number;
  stars: 1 | 2 | 3;
  avgCents: number;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function computeScore(p: RunProgress): RunScore {
  const avgCents =
    p.perNoteWorstCents.length === 0
      ? 0
      : p.perNoteWorstCents.reduce((s, c) => s + c, 0) /
        p.perNoteWorstCents.length;

  const intonationFactor = clamp01(1 - avgCents / INTONATION_CAP_CENTS);
  const mistakeRatio =
    p.noteTargetCount === 0 ? 0 : p.mistakes / p.noteTargetCount;
  const mistakePenalty = clamp01(1 - mistakeRatio * MISTAKE_WEIGHT);

  const rawScore = 100 * intonationFactor * mistakePenalty;
  const score = Math.round(rawScore);
  const stars: 1 | 2 | 3 =
    score >= STAR_3_THRESHOLD ? 3 : score >= STAR_2_THRESHOLD ? 2 : 1;

  return { score, stars, avgCents };
}
