import { describe, it, expect } from "vitest";
import { computeScore } from "./scoring";

describe("computeScore", () => {
  it("returns score 100 + 3 stars when no mistakes and 0 cents", () => {
    const r = computeScore({
      perNoteWorstCents: [0, 0, 0],
      mistakes: 0,
      noteTargetCount: 3,
    });
    expect(r.score).toBe(100);
    expect(r.stars).toBe(3);
    expect(r.avgCents).toBe(0);
  });

  it("returns score 0 + 1 star when avg cents is 30 or more", () => {
    const r = computeScore({
      perNoteWorstCents: [30, 30, 30],
      mistakes: 0,
      noteTargetCount: 3,
    });
    expect(r.score).toBe(0);
    expect(r.stars).toBe(1);
    expect(r.avgCents).toBe(30);
  });

  it("avg cents of 6 with no mistakes scores 80 = 2 stars", () => {
    // intonationFactor = 1 - 6/30 = 0.8 ; score = 100 * 0.8 = 80
    const r = computeScore({
      perNoteWorstCents: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
      mistakes: 0,
      noteTargetCount: 10,
    });
    expect(r.score).toBe(80);
    expect(r.stars).toBe(2);
  });

  it("applies 50% weighted mistake penalty", () => {
    // avg cents 0 → intonationFactor 1
    // 2 mistakes / 10 notes = 0.2 ; penalty factor = 1 - 0.2 * 0.5 = 0.9
    // score = 100 * 1 * 0.9 = 90 → exactly 3 stars
    const r = computeScore({
      perNoteWorstCents: new Array(10).fill(0),
      mistakes: 2,
      noteTargetCount: 10,
    });
    expect(r.score).toBe(90);
    expect(r.stars).toBe(3);
  });

  it("mistake penalty floors at 0", () => {
    // 100 mistakes / 10 notes = 10 ; penalty = 1 - 10 * 0.5 = -4 → clamped to 0
    const r = computeScore({
      perNoteWorstCents: new Array(10).fill(0),
      mistakes: 100,
      noteTargetCount: 10,
    });
    expect(r.score).toBe(0);
    expect(r.stars).toBe(1);
  });

  it("star boundary at 90 = 3 stars, 89 = 2 stars", () => {
    // Use cents to land exactly at 90 vs 89.
    // score = 100 * (1 - avg/30) with no mistakes. avg = 3 → 100 * 0.9 = 90.
    const r3 = computeScore({
      perNoteWorstCents: [3],
      mistakes: 0,
      noteTargetCount: 1,
    });
    expect(r3.score).toBe(90);
    expect(r3.stars).toBe(3);

    // avg 3.3 → 100 * (1 - 3.3/30) = 89 (rounded).
    const r2 = computeScore({
      perNoteWorstCents: [3.3],
      mistakes: 0,
      noteTargetCount: 1,
    });
    expect(r2.score).toBe(89);
    expect(r2.stars).toBe(2);
  });

  it("star boundary at 70 = 2 stars, 69 = 1 star", () => {
    // avg 9 → 100 * (1 - 9/30) = 70
    const r2 = computeScore({
      perNoteWorstCents: [9],
      mistakes: 0,
      noteTargetCount: 1,
    });
    expect(r2.score).toBe(70);
    expect(r2.stars).toBe(2);

    // avg 9.3 → 100 * (1 - 9.3/30) = 69 (rounded)
    const r1 = computeScore({
      perNoteWorstCents: [9.3],
      mistakes: 0,
      noteTargetCount: 1,
    });
    expect(r1.score).toBe(69);
    expect(r1.stars).toBe(1);
  });

  it("handles empty perNoteWorstCents without NaN", () => {
    const r = computeScore({
      perNoteWorstCents: [],
      mistakes: 0,
      noteTargetCount: 0,
    });
    expect(r.score).toBe(100);
    expect(r.stars).toBe(3);
    expect(r.avgCents).toBe(0);
  });
});
