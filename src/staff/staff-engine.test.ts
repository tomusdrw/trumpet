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
