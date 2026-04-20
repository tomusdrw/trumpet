import type { CommittedEvent } from "../staff/staff-engine";
import type { Challenge } from "./challenges";
import { noteTargetCount } from "./challenges";

export interface TrainingProgress {
  targetIndex: number;
  noteTargetCount: number;
  mistakes: number;
  perNoteWorstCents: readonly number[];
}

export interface TrainingEngine {
  onCommitted(events: readonly CommittedEvent[]): void;
  getProgress(): TrainingProgress;
  isDone(): boolean;
  reset(): void;
}

export function createTrainingEngine(challenge: Challenge): TrainingEngine {
  const total = challenge.targets.length;
  const nNotes = noteTargetCount(challenge);

  let targetIndex = 0;
  let mistakes = 0;
  const perNoteWorstCents: number[] = [];
  let processedCount = 0;

  function process(event: CommittedEvent): void {
    if (targetIndex >= total) return;
    const t = challenge.targets[targetIndex];
    if (t.kind === "note") {
      if (event.kind === "note" && event.midi === t.midi) {
        perNoteWorstCents.push(event.worstCents);
        targetIndex += 1;
      } else if (event.kind === "note") {
        mistakes += 1;
      }
      // Committed rest while expecting a note: ignore.
    } else {
      // expecting rest
      if (event.kind === "rest") {
        targetIndex += 1;
      } else {
        mistakes += 1;
      }
    }
  }

  return {
    onCommitted(events) {
      // Only process newly-appended events. Callers may hand the full
      // snapshot each frame; we keep our own cursor.
      if (events.length < processedCount) {
        // Upstream reset — caller should have called reset() first, but
        // tolerate shrinkage by restarting from 0.
        processedCount = 0;
      }
      for (let i = processedCount; i < events.length; i++) {
        process(events[i]);
      }
      processedCount = events.length;
    },
    getProgress() {
      return {
        targetIndex,
        noteTargetCount: nNotes,
        mistakes,
        perNoteWorstCents: perNoteWorstCents.slice(),
      };
    },
    isDone() {
      return targetIndex >= total;
    },
    reset() {
      targetIndex = 0;
      mistakes = 0;
      perNoteWorstCents.length = 0;
      processedCount = 0;
    },
  };
}
