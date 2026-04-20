import { midiToStaffPitch } from "../audio/notes";

export const LS = 14;
export const STAFF_CENTER_Y = 80;
export const STAFF_TRANSPOSE_SEMITONES = 2;

export const STAFF_TOP_LINE_Y = STAFF_CENTER_Y - 2 * LS;
export const STAFF_BOTTOM_LINE_Y = STAFF_CENTER_Y + 2 * LS;

// Letter → index in the C-based diatonic scale.
const LETTER_INDEX: Record<string, number> = {
  C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6,
};

const G_INDEX = LETTER_INDEX.G;
const REFERENCE_OCTAVE = 4;

// Middle line B4: stepsFromG4 = (6 - 4) + 0 = 2.
const MIDDLE_LINE_STEPS = 2;

// Each diatonic step covers LS/2 vertical pixels.
const HALF_LINE = LS / 2;

/**
 * Diatonic steps of a displayMidi note counted from G4 (=0), positive = up.
 * Uses the note's chosen letter-name spelling so C#5 and Db5 both sit at
 * the same step (their accidentals are rendered separately).
 */
export function displayMidiToStep(displayMidi: number): number {
  const pitch = midiToStaffPitch(displayMidi);
  return (
    (LETTER_INDEX[pitch.letter] - G_INDEX) +
    7 * (pitch.octave - REFERENCE_OCTAVE)
  );
}

/**
 * Y position for a notehead, given an already-transposed display MIDI.
 * Callers add STAFF_TRANSPOSE_SEMITONES to concert MIDI before calling.
 */
export function displayMidiToY(displayMidi: number): number {
  const step = displayMidiToStep(displayMidi);
  return STAFF_CENTER_Y - (step - MIDDLE_LINE_STEPS) * HALF_LINE;
}

export interface AccidentalPlacement {
  glyph: "♯" | "♭" | "♮";
  /** X offset from the notehead center (negative = left). */
  dx: number;
  /** Y position (same as notehead Y). */
  y: number;
}

const ACCIDENTAL_DX = -LS * 0.9;

/**
 * Accidental glyph and position for a display MIDI note, or null if the
 * note is a natural. Uses the Unicode sharp/flat characters from the
 * Miscellaneous Symbols block (excellent font coverage).
 */
export function accidentalPlacement(
  displayMidi: number,
): AccidentalPlacement | null {
  const pitch = midiToStaffPitch(displayMidi);
  if (pitch.accidental === "natural") return null;
  const glyph = pitch.accidental === "sharp" ? "♯" : "♭";
  return {
    glyph,
    dx: ACCIDENTAL_DX,
    y: displayMidiToY(displayMidi),
  };
}

/**
 * Ledger lines required for a note outside the staff.
 * Empty when the note is inside the staff (E4..F5 inclusive).
 */
export function ledgerLineYs(displayMidi: number): number[] {
  const step = displayMidiToStep(displayMidi);
  const stepFromMiddle = step - MIDDLE_LINE_STEPS;
  const ys: number[] = [];

  if (stepFromMiddle > 4) {
    // Above the top line (F5 step +4). Emit a ledger at every even step
    // above +4 up to the note's step.
    for (let s = 6; s <= stepFromMiddle; s += 2) {
      ys.push(STAFF_CENTER_Y - s * HALF_LINE);
    }
  } else if (stepFromMiddle < -4) {
    // Below the bottom line (E4 step -4).
    for (let s = -6; s >= stepFromMiddle; s -= 2) {
      ys.push(STAFF_CENTER_Y - s * HALF_LINE);
    }
  }

  return ys;
}

/**
 * Y position at which to anchor the quarter-rest glyph. The path
 * coordinates are authored relative to (0, 0) and then translated to
 * (x, QUARTER_REST_Y) in the Staff component.
 */
export const QUARTER_REST_Y = STAFF_CENTER_Y;

/**
 * SVG `<path d="…">` string for a stylized quarter-rest, authored in a
 * ~20-pixel-tall box centered on the origin. Callers translate it to
 * the desired (x, QUARTER_REST_Y) position in the staff's coordinate
 * system.
 */
export function quarterRestPath(): string {
  return (
    "M -2 -12 L 4 -4 L -4 4 L 3 10 L -1 14 " +
    "C 2 8 -3 6 -4 10 L -5 2 C -2 4 2 4 -1 -2 Z"
  );
}

export interface ScrollXArgs {
  committedCount: number;
  remainingTargets: number;
  noteStart: number;
  noteSpacing: number;
  viewWidth: number;
  leftMargin: number;
}

/**
 * X scroll offset for the staff's event-containing group.
 *
 * Free-play mode (remainingTargets === 0): keep the ghost near the right
 * edge — identical behavior to the original inline formula.
 *
 * Training mode (remainingTargets > 0): keep the ghost roughly 1/3 from
 * the left of the visible region so upcoming targets are visible ahead of
 * the current note being played.
 */
export function computeScrollX(a: ScrollXArgs): number {
  const eventX = (i: number) => a.noteStart + i * a.noteSpacing;
  const ghostIndex = a.committedCount;

  if (a.remainingTargets === 0) {
    const lastX = eventX(ghostIndex + 1);
    const overflow = lastX - (a.viewWidth - a.leftMargin / 2);
    return overflow > 0 ? overflow : 0;
  }
  const ghostX = eventX(ghostIndex);
  const desiredScreenX = a.leftMargin + (a.viewWidth - a.leftMargin) / 3;
  return Math.max(0, ghostX - desiredScreenX);
}
