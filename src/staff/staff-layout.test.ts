import { describe, it, expect } from "vitest";
import {
  LS,
  STAFF_CENTER_Y,
  STAFF_TOP_LINE_Y,
  STAFF_BOTTOM_LINE_Y,
  displayMidiToY,
  ledgerLineYs,
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
