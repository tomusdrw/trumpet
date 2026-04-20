import { describe, it, expect } from "vitest";
import { CHALLENGES, noteTargetCount, type Challenge } from "./challenges";

describe("CHALLENGES catalog", () => {
  it("is an array", () => {
    expect(Array.isArray(CHALLENGES)).toBe(true);
  });

  it("has unique ids", () => {
    const ids = CHALLENGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every challenge has at least one target", () => {
    for (const c of CHALLENGES) {
      expect(c.targets.length, c.id).toBeGreaterThan(0);
    }
  });

  it("every challenge starts with a note target, not a rest", () => {
    for (const c of CHALLENGES) {
      expect(c.targets[0].kind, c.id).toBe("note");
    }
  });

  it("no two consecutive identical note-midi targets without a rest between", () => {
    for (const c of CHALLENGES) {
      for (let i = 1; i < c.targets.length; i++) {
        const prev = c.targets[i - 1];
        const curr = c.targets[i];
        if (prev.kind === "note" && curr.kind === "note") {
          expect(
            curr.midi,
            `${c.id} at index ${i}: two consecutive ${curr.midi}s without a rest`,
          ).not.toBe(prev.midi);
        }
      }
    }
  });
});

describe("noteTargetCount", () => {
  it("counts only note targets", () => {
    const ch: Challenge = {
      id: "test",
      title: "Test",
      group: "long-tones",
      targets: [
        { kind: "note", midi: 60 },
        { kind: "rest" },
        { kind: "note", midi: 62 },
      ],
    };
    expect(noteTargetCount(ch)).toBe(2);
  });

  it("returns 0 for an all-rest sequence", () => {
    const ch: Challenge = {
      id: "test",
      title: "Test",
      group: "long-tones",
      targets: [{ kind: "rest" }, { kind: "rest" }],
    };
    expect(noteTargetCount(ch)).toBe(0);
  });
});
