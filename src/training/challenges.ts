export type Target =
  | { kind: "note"; midi: number } // concert MIDI
  | { kind: "rest" };

export type ChallengeGroup = "long-tones" | "scales" | "melodies";

export interface Challenge {
  id: string;
  title: string;
  group: ChallengeGroup;
  targets: readonly Target[];
}

export const CHALLENGES: readonly Challenge[] = [];

export function noteTargetCount(c: Challenge): number {
  return c.targets.filter((t) => t.kind === "note").length;
}
