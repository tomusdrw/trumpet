import { describe, it, expect } from "vitest";
import {
  createStaffEngine,
  type Detection,
  type CommittedEvent,
  type GhostState,
} from "./staff-engine";

function rest(): Detection {
  return { kind: "rest" };
}

function note(midi: number, cents = 0): Detection {
  return { kind: "note", midi, cents };
}

describe("createStaffEngine — initial state", () => {
  it("starts with no committed events", () => {
    const e = createStaffEngine();
    expect(e.getCommitted()).toEqual([] satisfies readonly CommittedEvent[]);
  });

  it("starts with an empty ghost state", () => {
    const e = createStaffEngine();
    expect(e.getGhost()).toEqual<GhostState>({
      candidate: null,
      progress: 0,
    });
  });

  it("accepts a single tick without committing anything yet", () => {
    const e = createStaffEngine();
    e.tick(note(72), 0);
    expect(e.getCommitted()).toEqual([]);
    // Ghost reflects the single-frame leader.
    expect(e.getGhost().candidate).toEqual<CommittedEvent>({
      kind: "note",
      midi: 72,
      worstCents: 0,
    });
  });

  it("a single rest tick makes the ghost a rest", () => {
    const e = createStaffEngine();
    e.tick(rest(), 0);
    expect(e.getGhost().candidate).toEqual<CommittedEvent>({ kind: "rest" });
  });

  it("clear() on an empty engine is a no-op", () => {
    const e = createStaffEngine();
    e.clear();
    expect(e.getCommitted()).toEqual([]);
    expect(e.getGhost()).toEqual<GhostState>({
      candidate: null,
      progress: 0,
    });
  });
});

describe("createStaffEngine — majority-vote commit", () => {
  it("commits the winning note after 250 ms of the same input", () => {
    const e = createStaffEngine({ windowMs: 250 });
    e.tick(note(72), 0);
    e.tick(note(72), 50);
    e.tick(note(72), 100);
    e.tick(note(72), 200);
    e.tick(note(72), 250); // window closes here
    expect(e.getCommitted()).toEqual<CommittedEvent[]>([
      { kind: "note", midi: 72, worstCents: 0 },
    ]);
  });

  it("commits the majority winner when votes split", () => {
    const e = createStaffEngine({ windowMs: 250 });
    // 4 × C5 then 2 × D5 — C5 wins 4-2.
    e.tick(note(72), 0);
    e.tick(note(72), 50);
    e.tick(note(72), 100);
    e.tick(note(72), 150);
    e.tick(note(74), 200);
    e.tick(note(74), 250); // window closes
    const c = e.getCommitted();
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "note", midi: 72 });
  });

  it("breaks ties in favor of the most-recently-detected candidate", () => {
    const e = createStaffEngine({ windowMs: 250 });
    // 3 × C5 then 3 × D5 — tie, D5 was most recent → D5 wins.
    e.tick(note(72), 0);
    e.tick(note(72), 50);
    e.tick(note(72), 100);
    e.tick(note(74), 150);
    e.tick(note(74), 200);
    e.tick(note(74), 250);
    const c = e.getCommitted();
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "note", midi: 74 });
  });

  it("commits a rest when silence wins the window (pre-suppression)", () => {
    // Leading-rest suppression is added in Task 8; in this task the
    // engine currently commits the rest winner unconditionally.
    const e = createStaffEngine({ windowMs: 250 });
    e.tick(rest(), 0);
    e.tick(rest(), 50);
    e.tick(rest(), 100);
    e.tick(rest(), 200);
    e.tick(rest(), 250);
    expect(e.getCommitted()).toEqual<CommittedEvent[]>([{ kind: "rest" }]);
  });

  it("commits a fresh note in each successive window", () => {
    const e = createStaffEngine({ windowMs: 100 });
    e.tick(note(72), 0);
    e.tick(note(72), 100); // window 1 closes → commit C5
    e.tick(note(74), 100); // window 2 opens
    e.tick(note(74), 200); // window 2 closes → commit D5
    expect(e.getCommitted()).toEqual<CommittedEvent[]>([
      { kind: "note", midi: 72, worstCents: 0 },
      { kind: "note", midi: 74, worstCents: 0 },
    ]);
  });
});
