import { describe, it, expect } from "vitest";
import { createTrainingEngine } from "./training-engine";
import type { Challenge } from "./challenges";
import type { CommittedEvent } from "../staff/staff-engine";

function noteEvent(midi: number, worstCents = 0): CommittedEvent {
  return { kind: "note", midi, worstCents };
}

function restEvent(): CommittedEvent {
  return { kind: "rest" };
}

function makeChallenge(targets: Challenge["targets"]): Challenge {
  return { id: "t", title: "Test", group: "long-tones", targets };
}

describe("createTrainingEngine — matching", () => {
  it("advances targetIndex and records worstCents on a correct note match", () => {
    const c = makeChallenge([
      { kind: "note", midi: 60 },
      { kind: "note", midi: 62 },
    ]);
    const e = createTrainingEngine(c);
    e.onCommitted([noteEvent(60, 5)]);
    const p = e.getProgress();
    expect(p.targetIndex).toBe(1);
    expect(p.perNoteWorstCents).toEqual([5]);
    expect(p.mistakes).toBe(0);
  });

  it("counts a wrong note as a mistake and does not advance", () => {
    const c = makeChallenge([
      { kind: "note", midi: 60 },
      { kind: "note", midi: 62 },
    ]);
    const e = createTrainingEngine(c);
    e.onCommitted([noteEvent(64)]);
    const p = e.getProgress();
    expect(p.targetIndex).toBe(0);
    expect(p.mistakes).toBe(1);
    expect(p.perNoteWorstCents).toEqual([]);
  });

  it("ignores a committed rest while expecting a note (no penalty)", () => {
    const c = makeChallenge([{ kind: "note", midi: 60 }]);
    const e = createTrainingEngine(c);
    e.onCommitted([restEvent()]);
    const p = e.getProgress();
    expect(p.targetIndex).toBe(0);
    expect(p.mistakes).toBe(0);
  });

  it("advances on a matching rest", () => {
    const c = makeChallenge([
      { kind: "note", midi: 60 },
      { kind: "rest" },
      { kind: "note", midi: 60 },
    ]);
    const e = createTrainingEngine(c);
    e.onCommitted([noteEvent(60), restEvent()]);
    const p = e.getProgress();
    expect(p.targetIndex).toBe(2);
  });

  it("counts a note as a mistake when expecting a rest", () => {
    const c = makeChallenge([
      { kind: "note", midi: 60 },
      { kind: "rest" },
    ]);
    const e = createTrainingEngine(c);
    // First note matches; next a note (not the expected rest) = mistake.
    e.onCommitted([noteEvent(60), noteEvent(62)]);
    const p = e.getProgress();
    expect(p.targetIndex).toBe(1);
    expect(p.mistakes).toBe(1);
  });

  it("supports recovery: wrong note then correct note", () => {
    const c = makeChallenge([{ kind: "note", midi: 60 }]);
    const e = createTrainingEngine(c);
    e.onCommitted([noteEvent(62), noteEvent(60, 7)]);
    const p = e.getProgress();
    expect(p.targetIndex).toBe(1);
    expect(p.mistakes).toBe(1);
    expect(p.perNoteWorstCents).toEqual([7]);
  });

  it("only processes newly-appended events across calls", () => {
    const c = makeChallenge([
      { kind: "note", midi: 60 },
      { kind: "note", midi: 62 },
    ]);
    const e = createTrainingEngine(c);
    const events: CommittedEvent[] = [];
    events.push(noteEvent(60));
    e.onCommitted(events);
    expect(e.getProgress().targetIndex).toBe(1);
    events.push(noteEvent(62));
    e.onCommitted(events);
    expect(e.getProgress().targetIndex).toBe(2);
    // Calling again with no new events is a no-op.
    e.onCommitted(events);
    expect(e.getProgress().targetIndex).toBe(2);
    expect(e.getProgress().mistakes).toBe(0);
  });
});

describe("createTrainingEngine — isDone", () => {
  it("reports not done initially", () => {
    const c = makeChallenge([{ kind: "note", midi: 60 }]);
    const e = createTrainingEngine(c);
    expect(e.isDone()).toBe(false);
  });

  it("flips to done when targetIndex reaches targets.length", () => {
    const c = makeChallenge([
      { kind: "note", midi: 60 },
      { kind: "note", midi: 62 },
    ]);
    const e = createTrainingEngine(c);
    e.onCommitted([noteEvent(60), noteEvent(62)]);
    expect(e.isDone()).toBe(true);
  });

  it("ignores commits after done", () => {
    const c = makeChallenge([{ kind: "note", midi: 60 }]);
    const e = createTrainingEngine(c);
    e.onCommitted([noteEvent(60), noteEvent(62), noteEvent(64)]);
    expect(e.isDone()).toBe(true);
    expect(e.getProgress().mistakes).toBe(0);
  });
});

describe("createTrainingEngine — reset", () => {
  it("clears progress and starts processing from index 0 again", () => {
    const c = makeChallenge([
      { kind: "note", midi: 60 },
      { kind: "note", midi: 62 },
    ]);
    const e = createTrainingEngine(c);
    e.onCommitted([noteEvent(60), noteEvent(65)]); // 1 match + 1 mistake
    expect(e.getProgress().mistakes).toBe(1);

    e.reset();
    expect(e.getProgress()).toEqual({
      targetIndex: 0,
      noteTargetCount: 2,
      mistakes: 0,
      perNoteWorstCents: [],
    });
    // After reset, onCommitted should be re-called with the fresh (cleared)
    // staff-engine array — index-0 restart.
    e.onCommitted([noteEvent(60)]);
    expect(e.getProgress().targetIndex).toBe(1);
  });
});
