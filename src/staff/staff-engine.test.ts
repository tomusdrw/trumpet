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

  it("commits a rest when silence wins the window (after a note)", () => {
    const e = createStaffEngine({ windowMs: 250 });
    // Seed a committed C5 first so `last !== null`.
    e.tick(note(72), 0);
    e.tick(note(72), 250); // window 1 closes → commit C5
    // Now silence wins window 2.
    e.tick(rest(), 250);
    e.tick(rest(), 300);
    e.tick(rest(), 400);
    e.tick(rest(), 500); // window 2 closes → commit rest
    expect(e.getCommitted()).toEqual<CommittedEvent[]>([
      { kind: "note", midi: 72, worstCents: 0 },
      { kind: "rest" },
    ]);
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

describe("createStaffEngine — suppression", () => {
  it("does not commit a leading rest", () => {
    const e = createStaffEngine({ windowMs: 100 });
    e.tick(rest(), 0);
    e.tick(rest(), 50);
    e.tick(rest(), 100); // window closes; leader = rest, last = null
    expect(e.getCommitted()).toEqual([]);
  });

  it("does not commit consecutive rests", () => {
    const e = createStaffEngine({ windowMs: 100 });
    // window 1: C5 → commit
    e.tick(note(72), 0);
    e.tick(note(72), 100);
    // window 2: rest → commit
    e.tick(rest(), 100);
    e.tick(rest(), 200);
    // window 3: rest → SKIP (duplicate rest)
    e.tick(rest(), 200);
    e.tick(rest(), 300);
    expect(e.getCommitted()).toEqual<CommittedEvent[]>([
      { kind: "note", midi: 72, worstCents: 0 },
      { kind: "rest" },
    ]);
  });

  it("does not commit consecutive identical notes", () => {
    const e = createStaffEngine({ windowMs: 100 });
    // window 1: C5 → commit
    e.tick(note(72), 0);
    e.tick(note(72), 100);
    // window 2: C5 again → SKIP
    e.tick(note(72), 100);
    e.tick(note(72), 200);
    // window 3: D5 → commit
    e.tick(note(74), 200);
    e.tick(note(74), 300);
    expect(e.getCommitted()).toEqual<CommittedEvent[]>([
      { kind: "note", midi: 72, worstCents: 0 },
      { kind: "note", midi: 74, worstCents: 0 },
    ]);
  });

  it("commits a different note after a held note", () => {
    const e = createStaffEngine({ windowMs: 100 });
    e.tick(note(72), 0);
    e.tick(note(72), 100); // commit C5
    e.tick(note(72), 100);
    e.tick(note(72), 200); // skip C5
    e.tick(note(74), 200);
    e.tick(note(74), 300); // commit D5
    const c = e.getCommitted();
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ kind: "note", midi: 72 });
    expect(c[1]).toMatchObject({ kind: "note", midi: 74 });
  });
});

describe("createStaffEngine — worst-cents tracking", () => {
  it("records the max |cents| across all same-leader frames", () => {
    const e = createStaffEngine({ windowMs: 100 });
    e.tick(note(72, 3), 0);
    e.tick(note(72, -12), 25);
    e.tick(note(72, 7), 50);
    e.tick(note(72, -1), 75);
    e.tick(note(72, 4), 100); // closes window
    const c = e.getCommitted();
    expect(c).toHaveLength(1);
    expect(c[0]).toEqual<CommittedEvent>({
      kind: "note",
      midi: 72,
      worstCents: 12,
    });
  });

  it("discards cents from a losing candidate", () => {
    const e = createStaffEngine({ windowMs: 100 });
    // Frame 1: D5 with -30 cents (briefly leads).
    e.tick(note(74, -30), 0);
    // Frames 2-5: C5 — wins by count; its worstCents is max 4.
    e.tick(note(72, 2), 25);
    e.tick(note(72, 3), 50);
    e.tick(note(72, 4), 75);
    e.tick(note(72, 1), 100); // closes window
    const c = e.getCommitted();
    expect(c).toHaveLength(1);
    expect(c[0]).toEqual<CommittedEvent>({
      kind: "note",
      midi: 72,
      worstCents: 4,
    });
  });

  it("commits a rest without cents tracking", () => {
    const e = createStaffEngine({ windowMs: 100 });
    e.tick(note(72, 5), 0);
    e.tick(note(72, 5), 100); // commit C5
    e.tick(rest(), 100);
    e.tick(rest(), 200); // commit rest
    const c = e.getCommitted();
    expect(c[1]).toEqual<CommittedEvent>({ kind: "rest" });
  });
});

describe("createStaffEngine — clear() and progress", () => {
  it("clear() empties committed and resets ghost", () => {
    const e = createStaffEngine({ windowMs: 100 });
    e.tick(note(72), 0);
    e.tick(note(72), 100); // commit
    e.tick(note(74), 100);
    e.tick(note(74), 150); // mid-window; ghost = D5
    expect(e.getCommitted()).toHaveLength(1);
    expect(e.getGhost().candidate).toMatchObject({ kind: "note", midi: 74 });

    e.clear();
    expect(e.getCommitted()).toEqual([]);
    expect(e.getGhost()).toEqual<GhostState>({
      candidate: null,
      progress: 0,
    });
  });

  it("clear() lets a new window start cleanly", () => {
    const e = createStaffEngine({ windowMs: 100 });
    e.tick(note(72), 0);
    e.clear();
    e.tick(note(74), 500);
    e.tick(note(74), 600); // 100ms window → commit D5
    expect(e.getCommitted()).toEqual<CommittedEvent[]>([
      { kind: "note", midi: 74, worstCents: 0 },
    ]);
  });

  it("progress advances from 0 to 1 within a window", () => {
    const e = createStaffEngine({ windowMs: 100 });
    e.tick(note(72), 0);
    expect(e.getGhost().progress).toBe(0);

    e.tick(note(72), 25);
    expect(e.getGhost().progress).toBeCloseTo(0.25, 5);

    e.tick(note(72), 50);
    expect(e.getGhost().progress).toBeCloseTo(0.5, 5);

    e.tick(note(72), 99);
    expect(e.getGhost().progress).toBeCloseTo(0.99, 5);
  });

  it("progress resets to 0 after a commit closes a window", () => {
    const e = createStaffEngine({ windowMs: 100 });
    e.tick(note(72), 0);
    e.tick(note(72), 100); // closes + commits; window reset at nowTs=100
    expect(e.getGhost().progress).toBe(0);
  });
});
