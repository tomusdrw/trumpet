import { describe, it, expect } from "vitest";
import {
  LS,
  STAFF_CENTER_Y,
  STAFF_TOP_LINE_Y,
  STAFF_BOTTOM_LINE_Y,
  displayMidiToY,
  ledgerLineYs,
  accidentalPlacement,
  quarterRestPath,
  QUARTER_REST_Y,
  computeScrollX,
} from "./staff-layout";

describe("displayMidiToY", () => {
  it("places G4 (MIDI 67) on the second line from the bottom", () => {
    // G4: stepsFromG4 = 0 → y = STAFF_CENTER_Y + LS
    expect(displayMidiToY(67)).toBe(STAFF_CENTER_Y + LS);
  });

  it("places B4 (MIDI 71) on the middle line", () => {
    expect(displayMidiToY(71)).toBe(STAFF_CENTER_Y);
  });

  it("places F5 (MIDI 77) on the top line", () => {
    expect(displayMidiToY(77)).toBe(STAFF_TOP_LINE_Y);
  });

  it("places E4 (MIDI 64) on the bottom line", () => {
    expect(displayMidiToY(64)).toBe(STAFF_BOTTOM_LINE_Y);
  });

  it("places D5 (MIDI 74) on the second line from the top", () => {
    expect(displayMidiToY(74)).toBe(STAFF_CENTER_Y - LS);
  });

  it("places middle C (C4, MIDI 60) one ledger line below the staff", () => {
    expect(displayMidiToY(60)).toBe(STAFF_BOTTOM_LINE_Y + LS);
  });

  it("places C6 (MIDI 84) two ledger-line-spacings above the staff", () => {
    expect(displayMidiToY(84)).toBe(STAFF_TOP_LINE_Y - 2 * LS);
  });

  it("gives sharps and naturals the same Y (accidentals share a step)", () => {
    // F#5 (MIDI 78) spells as F-sharp → diatonic F5 position.
    expect(displayMidiToY(78)).toBe(displayMidiToY(77));
  });

  it("gives flats and naturals the same Y", () => {
    // Bb4 (MIDI 70) spells as B-flat → diatonic B4 (middle line).
    expect(displayMidiToY(70)).toBe(STAFF_CENTER_Y);
  });
});

describe("ledgerLineYs", () => {
  it("returns empty for notes within the staff", () => {
    expect(ledgerLineYs(67)).toEqual([]); // G4
    expect(ledgerLineYs(71)).toEqual([]); // B4
    expect(ledgerLineYs(77)).toEqual([]); // F5 (top line)
    expect(ledgerLineYs(64)).toEqual([]); // E4 (bottom line)
  });

  it("returns one ledger line for middle C (C4)", () => {
    expect(ledgerLineYs(60)).toEqual([STAFF_BOTTOM_LINE_Y + LS]);
  });

  it("returns two ledger lines for C6 above the staff", () => {
    // First ledger is A5 (one step above the top line) then C6.
    expect(ledgerLineYs(84)).toEqual([
      STAFF_TOP_LINE_Y - LS,
      STAFF_TOP_LINE_Y - 2 * LS,
    ]);
  });

  it("does not draw a ledger line for D4 (space below bottom line)", () => {
    expect(ledgerLineYs(62)).toEqual([]);
  });

  it("does not draw a ledger line for G5 (space above top line)", () => {
    expect(ledgerLineYs(79)).toEqual([]);
  });

  it("returns one ledger line for B3 (space below the C4 ledger)", () => {
    // B3 sits in the space below the C4 ledger line; draw only C4.
    expect(ledgerLineYs(59)).toEqual([STAFF_BOTTOM_LINE_Y + LS]);
  });

  it("returns two ledger lines for A3 below the staff", () => {
    // A3 is on the second ledger below (C4 first, A3 second).
    expect(ledgerLineYs(57)).toEqual([
      STAFF_BOTTOM_LINE_Y + LS,
      STAFF_BOTTOM_LINE_Y + 2 * LS,
    ]);
  });
});

describe("accidentalPlacement", () => {
  it("returns null for naturals", () => {
    expect(accidentalPlacement(71)).toBeNull(); // B4
    expect(accidentalPlacement(67)).toBeNull(); // G4
    expect(accidentalPlacement(60)).toBeNull(); // C4
  });

  it("returns a sharp glyph for C#5 positioned left of the notehead", () => {
    const p = accidentalPlacement(73);
    expect(p).not.toBeNull();
    expect(p!.glyph).toBe("♯");
    expect(p!.y).toBe(displayMidiToY(73));
    expect(p!.dx).toBeCloseTo(-LS * 0.9, 5);
  });

  it("returns a flat glyph for Bb4", () => {
    const p = accidentalPlacement(70);
    expect(p).not.toBeNull();
    expect(p!.glyph).toBe("♭");
    expect(p!.y).toBe(displayMidiToY(70));
  });

  it("returns a flat glyph for Eb5", () => {
    const p = accidentalPlacement(75);
    expect(p).not.toBeNull();
    expect(p!.glyph).toBe("♭");
  });

  it("returns a sharp glyph for F#4", () => {
    const p = accidentalPlacement(66);
    expect(p!.glyph).toBe("♯");
  });
});

describe("quarterRestPath", () => {
  it("returns a non-empty SVG path string", () => {
    const d = quarterRestPath();
    expect(d).toMatch(/^M/);
    expect(d.length).toBeGreaterThan(20);
  });

  it("is stable (snapshot)", () => {
    // If the path changes intentionally, update this literal and review
    // the visual result in the browser. Do not update blindly.
    expect(quarterRestPath()).toBe(
      "M -2 -12 L 4 -4 L -4 4 L 3 10 L -1 14 " +
        "C 2 8 -3 6 -4 10 L -5 2 C -2 4 2 4 -1 -2 Z",
    );
  });

  it("exposes QUARTER_REST_Y anchored at the middle line", () => {
    expect(QUARTER_REST_Y).toBe(STAFF_CENTER_Y);
  });
});

describe("computeScrollX — free-play mode (no targets)", () => {
  const layout = {
    noteStart: 100,
    noteSpacing: 56,
    viewWidth: 1000,
    leftMargin: 80,
  };

  it("returns 0 when the ghost fits within the viewport", () => {
    const x = computeScrollX({ committedCount: 3, remainingTargets: 0, ...layout });
    expect(x).toBe(0);
  });

  it("scrolls to keep the ghost near the right edge once the staff fills", () => {
    // committedCount = 20 → ghost at eventX(20) = 100 + 20*56 = 1220.
    // overflow = eventX(21) - (1000 - 40) = 1276 - 960 = 316.
    const x = computeScrollX({ committedCount: 20, remainingTargets: 0, ...layout });
    expect(x).toBe(316);
  });
});

describe("computeScrollX — training mode (remainingTargets > 0)", () => {
  const layout = {
    noteStart: 100,
    noteSpacing: 56,
    viewWidth: 1000,
    leftMargin: 80,
  };

  it("returns 0 for short challenges (ghost + targets fit)", () => {
    const x = computeScrollX({ committedCount: 0, remainingTargets: 5, ...layout });
    expect(x).toBe(0);
  });

  it("keeps the ghost ~1/3 from the left once past the visible capacity", () => {
    // committedCount = 15, remainingTargets = 10.
    // ghostX = 100 + 15*56 = 940.
    // desiredGhostScreenX = leftMargin + (viewWidth - leftMargin) / 3
    //                     = 80 + 920/3 = 80 + 306.666... ≈ 386.67.
    // scrollX = max(0, 940 - 386.67) ≈ 553.33.
    const x = computeScrollX({ committedCount: 15, remainingTargets: 10, ...layout });
    expect(x).toBeCloseTo(553.33, 1);
  });
});
