# Staff Notation Main View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the background frequency graph and centered tuner card with a compact tuner HUD at the top and a scrolling treble-clef music staff below it that transcribes detected pitches into a committed history with per-note intonation feedback.

**Architecture:** A pure-TypeScript commit engine runs a 250 ms majority-vote window over detections emitted by a simplified pitch detector, suppresses consecutive duplicates (both notes and rests), and tracks the worst cents observed on the winning candidate. A hand-rolled SVG Staff component renders the committed history and a live ghost; a compact HeaderBar component owns the horizontal cents dial, fingering chart, and transpose selector. No new runtime dependencies.

**Tech Stack:** SolidJS, TypeScript, Vite, Vitest. Existing Web Audio API pitch detection. Hand-rolled SVG for all visuals.

**Reference spec:** `docs/superpowers/specs/2026-04-15-staff-notation-design.md` — read this first. This plan implements that spec end-to-end.

---

## Task order and dependencies

```
Phase 1 — Pure modules (TDD, no UI):
  1. intonation.ts
  2. notes.ts extension
  3. staff/staff-layout.ts — pitch→Y + ledger lines
  4. staff/staff-layout.ts — accidental placement
  5. staff/staff-layout.ts — quarter-rest SVG path
  6. staff/staff-engine.ts — scaffold + basic tick
  7. staff/staff-engine.ts — window majority vote + commit
  8. staff/staff-engine.ts — duplicate + leading-silence suppression
  9. staff/staff-engine.ts — worst-cents tracking
 10. staff/staff-engine.ts — clear() + progress fraction
 11. pitch-detector.ts — simplify + export autocorrelate + test

Phase 2 — UI components (manual verify):
 12. HorizontalDial.tsx
 13. Staff.tsx
 14. HeaderBar.tsx
 15. App.tsx rewrite + index.css updates
 16. Delete obsolete components
 17. Manual UI verification
```

Phase 1 tasks 1–11 all land behind green tests before any UI work begins. Phase 2 has no unit tests (the project's vitest config runs in `"node"` environment without a DOM and doesn't have a SolidJS testing library installed); UI is verified manually per the spec's checklist.

---

## Task 1: `audio/intonation.ts` — cents-to-color helper

**Files:**
- Create: `src/audio/intonation.ts`
- Test: `src/audio/intonation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/audio/intonation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { centsZone, zoneColor, type Zone } from "./intonation";

describe("centsZone", () => {
  it("returns 'green' within ±5 cents (inclusive)", () => {
    expect(centsZone(0)).toBe("green" satisfies Zone);
    expect(centsZone(5)).toBe("green" satisfies Zone);
    expect(centsZone(-5)).toBe("green" satisfies Zone);
  });

  it("returns 'yellow' between ±5 and ±15 cents (inclusive at 15)", () => {
    expect(centsZone(6)).toBe("yellow" satisfies Zone);
    expect(centsZone(-6)).toBe("yellow" satisfies Zone);
    expect(centsZone(15)).toBe("yellow" satisfies Zone);
    expect(centsZone(-15)).toBe("yellow" satisfies Zone);
  });

  it("returns 'red' beyond ±15 cents", () => {
    expect(centsZone(16)).toBe("red" satisfies Zone);
    expect(centsZone(-16)).toBe("red" satisfies Zone);
    expect(centsZone(50)).toBe("red" satisfies Zone);
  });
});

describe("zoneColor", () => {
  it("maps zones to CSS custom properties", () => {
    expect(zoneColor("green")).toBe("var(--accent-green)");
    expect(zoneColor("yellow")).toBe("var(--accent-yellow)");
    expect(zoneColor("red")).toBe("var(--accent-red)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/audio/intonation.test.ts`
Expected: FAIL — "Cannot find module './intonation'".

- [ ] **Step 3: Write minimal implementation**

Create `src/audio/intonation.ts`:

```ts
export type Zone = "green" | "yellow" | "red";

export function centsZone(cents: number): Zone {
  const abs = Math.abs(cents);
  if (abs <= 5) return "green";
  if (abs <= 15) return "yellow";
  return "red";
}

export function zoneColor(zone: Zone): string {
  switch (zone) {
    case "green":
      return "var(--accent-green)";
    case "yellow":
      return "var(--accent-yellow)";
    case "red":
      return "var(--accent-red)";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/audio/intonation.test.ts`
Expected: PASS — 4 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/audio/intonation.ts src/audio/intonation.test.ts
git commit -m "feat(audio): add centsZone + zoneColor intonation helpers"
```

---

## Task 2: `audio/notes.ts` — midi-to-staff-pitch helper

The existing `notes.ts` only exports `frequencyToNote`. The staff layer needs a pure MIDI → letter-name + accidental + octave helper (so `Eb5` vs `D#5` can be chosen consistently with the existing NOTE_NAMES table).

**Files:**
- Modify: `src/audio/notes.ts`
- Test: `src/audio/notes.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append the following block to `src/audio/notes.test.ts`:

```ts
import { midiToStaffPitch, type Accidental, type StaffPitch } from "./notes";

describe("midiToStaffPitch", () => {
  it("C4 (middle C) is C natural in octave 4", () => {
    expect(midiToStaffPitch(60)).toEqual<StaffPitch>({
      letter: "C",
      accidental: "natural",
      octave: 4,
    });
  });

  it("A4 is A natural in octave 4", () => {
    expect(midiToStaffPitch(69)).toEqual<StaffPitch>({
      letter: "A",
      accidental: "natural",
      octave: 4,
    });
  });

  it("Bb4 spells as B flat (not A sharp)", () => {
    expect(midiToStaffPitch(70)).toEqual<StaffPitch>({
      letter: "B",
      accidental: "flat",
      octave: 4,
    });
  });

  it("Eb5 spells as E flat", () => {
    expect(midiToStaffPitch(75)).toEqual<StaffPitch>({
      letter: "E",
      accidental: "flat",
      octave: 5,
    });
  });

  it("Ab4 spells as A flat (pitch class 8)", () => {
    expect(midiToStaffPitch(68)).toEqual<StaffPitch>({
      letter: "A",
      accidental: "flat",
      octave: 4,
    });
  });

  it("C#5 spells as C sharp", () => {
    expect(midiToStaffPitch(73)).toEqual<StaffPitch>({
      letter: "C",
      accidental: "sharp",
      octave: 5,
    });
  });

  it("F#4 spells as F sharp", () => {
    expect(midiToStaffPitch(66)).toEqual<StaffPitch>({
      letter: "F",
      accidental: "sharp",
      octave: 4,
    });
  });

  it("C6 is C natural in octave 6 (boundary)", () => {
    expect(midiToStaffPitch(84)).toEqual<StaffPitch>({
      letter: "C",
      accidental: "natural",
      octave: 6,
    });
  });

  it("B3 is B natural in octave 3 (just below middle C)", () => {
    expect(midiToStaffPitch(59)).toEqual<StaffPitch>({
      letter: "B",
      accidental: "natural",
      octave: 3,
    });
  });
});
```

Also add the `Accidental` and `StaffPitch` imports are via the same `"./notes"` path — the test above already references them.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/audio/notes.test.ts`
Expected: FAIL — "Module './notes' has no exported member 'midiToStaffPitch'".

- [ ] **Step 3: Extend `src/audio/notes.ts`**

Replace the contents of `src/audio/notes.ts` with:

```ts
export interface NoteInfo {
  note: string;
  octave: number;
  frequency: number;
  cents: number;
}

export type Accidental = "natural" | "sharp" | "flat";

export interface StaffPitch {
  letter: "C" | "D" | "E" | "F" | "G" | "A" | "B";
  accidental: Accidental;
  octave: number;
}

// Using flats to match trumpet convention (Bb trumpet)
const NOTE_NAMES = [
  "C", "C#", "D", "Eb", "E", "F",
  "F#", "G", "Ab", "A", "Bb", "B",
] as const;

// Per pitch class (0..11): base letter + accidental choice.
// Matches NOTE_NAMES above: sharps for C# and F#, flats for Eb/Ab/Bb.
const PITCH_CLASS_SPELLING: readonly {
  letter: StaffPitch["letter"];
  accidental: Accidental;
}[] = [
  { letter: "C", accidental: "natural" }, //  0 C
  { letter: "C", accidental: "sharp" },   //  1 C#
  { letter: "D", accidental: "natural" }, //  2 D
  { letter: "E", accidental: "flat" },    //  3 Eb
  { letter: "E", accidental: "natural" }, //  4 E
  { letter: "F", accidental: "natural" }, //  5 F
  { letter: "F", accidental: "sharp" },   //  6 F#
  { letter: "G", accidental: "natural" }, //  7 G
  { letter: "A", accidental: "flat" },    //  8 Ab
  { letter: "A", accidental: "natural" }, //  9 A
  { letter: "B", accidental: "flat" },    // 10 Bb
  { letter: "B", accidental: "natural" }, // 11 B
];

const A4_FREQUENCY = 440;
const A4_MIDI = 69;

export function frequencyToNote(frequency: number): NoteInfo | null {
  if (frequency <= 0) return null;

  const halfSteps = 12 * Math.log2(frequency / A4_FREQUENCY);
  const midi = Math.round(halfSteps) + A4_MIDI;
  const cents = Math.round((halfSteps - Math.round(halfSteps)) * 100);

  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;

  return {
    note: NOTE_NAMES[noteIndex],
    octave,
    frequency,
    cents,
  };
}

/**
 * Convert a MIDI note number to a staff-aware pitch description with a
 * chosen letter name, accidental, and octave. The choice of enharmonic
 * spelling matches the existing NOTE_NAMES table (C#, F#, Eb, Ab, Bb).
 */
export function midiToStaffPitch(midi: number): StaffPitch {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const { letter, accidental } = PITCH_CLASS_SPELLING[pitchClass];
  return { letter, accidental, octave };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/audio/notes.test.ts`
Expected: PASS — all existing tests plus 9 new `midiToStaffPitch` tests.

- [ ] **Step 5: Commit**

```bash
git add src/audio/notes.ts src/audio/notes.test.ts
git commit -m "feat(audio): add midiToStaffPitch helper for staff rendering"
```

---

## Task 3: `staff/staff-layout.ts` — pitch→Y math and ledger lines

**Files:**
- Create: `src/staff/staff-layout.ts`
- Test: `src/staff/staff-layout.test.ts`

This task establishes the pure math the Staff component will use: convert a concert MIDI note (plus the fixed +2 staff transpose) into a Y position on a treble-clef staff, and compute the ledger lines needed for notes outside the staff. Accidentals and the rest path come in tasks 4 and 5.

**Layout constants.** We pick a reference coordinate system once here. The Staff component will use this same system via `viewBox`:

- `LS = 14` (line spacing between adjacent staff lines)
- `STAFF_CENTER_Y = 80` (Y of the middle line, i.e. B4 after the +2 transpose of concert A4)
- Five staff lines at `STAFF_CENTER_Y + [-2, -1, 0, 1, 2] * LS`
- `STAFF_TRANSPOSE_SEMITONES = 2` (fixed Bb trumpet written pitch)

Reference: line 2 from the top of a treble clef is G4 (MIDI 67). After +2 semitones, concert F4 (MIDI 65, G letter is 67, so concert F4 = MIDI 65 → displayed as G4 diatonic position... wait). Work through it carefully:

- We receive a **concert** MIDI number.
- `displayMidi = concert + 2`. So concert A4 (69) → display B4 (71).
- We compute the **diatonic step** of `displayMidi` from G4 (the "second line from the top" reference on treble clef). G4 is display step 0.
- `stepsFromG4 = (letterIndex - G_INDEX) + 7 * (octave - 4)` where letters are C=0, D=1, E=2, F=3, G=4, A=5, B=6.
- `y = STAFF_CENTER_Y - (stepsFromG4 - 3) * (LS / 2)` — we offset so that `stepsFromG4 = 3` (B4, middle line) lands on `STAFF_CENTER_Y`.

The top line of the staff is F5 (treble clef top line, letter F, octave 5): `stepsFromG4 = (3 - 4) + 7 * (5 - 4) = 6` → `y = 80 - (6 - 3) * 7 = 80 - 21 = 59`. Good — that's two line-spacings above the middle line (since adjacent lines differ by `LS = 14` and each step is `LS/2 = 7`). ✓

Middle line B4: `stepsFromG4 = (6 - 4) + 7 * (4 - 4) = 2`... wait, that's wrong. B = 6, G = 4, so `6 - 4 = 2`, octave delta 0 → `stepsFromG4 = 2`. But middle line should correspond to `stepsFromG4 = 3` (so that y = 80). Let me re-check.

On a treble clef, from top to bottom, the five lines are F5, D5, B4, G4, E4. The middle line is B4. Second line from the top is D5 (not G4). Second line from the **bottom** is G4. So G4 is the second line from the bottom, and B4 is the middle line.

Compute with `stepsFromG4` as defined:
- G4: `(4-4) + 7*(4-4) = 0` → should be the 4th line from the top (second from bottom) → `y = STAFF_CENTER_Y + LS`.
- B4: `(6-4) + 7*(4-4) = 2` → middle line → `y = STAFF_CENTER_Y`.
- F5: `(3-4) + 7*(5-4) = 6` → top line → `y = STAFF_CENTER_Y - 2 * LS`.

From B4 (step 2, y = STAFF_CENTER_Y) to F5 (step 6, y = STAFF_CENTER_Y - 2*LS), the offset is `-2 * LS` for a step delta of `+4`. So each step is `-LS/2`. Then `y = STAFF_CENTER_Y - (stepsFromG4 - 2) * (LS / 2)`. Let me verify:
- G4 (step 0): `y = 80 - (0 - 2) * 7 = 80 + 14 = 94` → one line below middle. ✓
- B4 (step 2): `y = 80 - 0 = 80` → middle. ✓
- F5 (step 6): `y = 80 - 4 * 7 = 80 - 28 = 52` → two line spacings above middle. ✓
- E4 (step -1, which is (2-4)+0 = -2): `y = 80 - (-2 - 2) * 7 = 80 + 28 = 108` → bottom line of staff. ✓
- D5 (step 4, which is (1-4)+7 = 4): `y = 80 - (4-2)*7 = 80 - 14 = 66` → second line from top. ✓

Good. Formula: `y = STAFF_CENTER_Y - (stepsFromG4 - 2) * (LS / 2)`.

Top line Y: `STAFF_CENTER_Y - 2 * LS = 52` (F5).
Bottom line Y: `STAFF_CENTER_Y + 2 * LS = 108` (E4).

Ledger lines: for notes outside the staff, emit at every integer step delta beyond the edges. Middle C (C4, concert 60 → display D4? No — we're talking about staff layout that receives a concert MIDI. Let me be precise: `stepMidiInput(60)` — concert middle C.

Wait, the `staffLayout` functions take concert MIDI but internally apply the +2. So "middle C on the staff" means concert C4 = 60, plus +2 = 62 = D4. The spec said "C4 (middle C) one ledger line below". That was in a world where the staff wasn't transposed. Let me re-check...

Actually looking at the spec:
> - C4 (middle C) one ledger line below the staff.

This is ambiguous: is C4 the concert input or the display output? In concert context, middle C is MIDI 60. After +2 it's D4. D4 is the space below the bottom line (E4). Not a ledger line — just a space.

Conversely, if by "C4 one ledger below" the spec means the **display** C4, then the corresponding concert input is MIDI 58 (A#3/Bb3). Bb3 shows as C4 on the staff (+2), and C4 is indeed one ledger line below the staff on treble clef.

OK — the spec test case is testing the display geometry: "when the engine asks for display C4, it should land one ledger line below the staff". Let me phrase the tests that way: pass the concert midi that produces the display C4 (so pass 58), and verify the expected Y.

Actually easier: the staff-layout function's public API can take a **staff-display** MIDI number (already transposed) to avoid threading +2 through every test. The App layer applies the +2 shift before calling the layout function. Then the tests are clean: pass 60 → Y below staff, pass 67 → G4 on 2nd-from-bottom line, pass 77 → F5 on top, pass 84 → C6 two ledgers above.

That's the cleanest design. The `STAFF_TRANSPOSE_SEMITONES` constant lives alongside the layout but is applied by callers (the Staff component, tested indirectly via manual verification).

**API shape:**

```ts
export const LS = 14;
export const STAFF_CENTER_Y = 80;
export const STAFF_TRANSPOSE_SEMITONES = 2;

export const STAFF_TOP_LINE_Y = STAFF_CENTER_Y - 2 * LS;    // F5, 52
export const STAFF_BOTTOM_LINE_Y = STAFF_CENTER_Y + 2 * LS; // E4, 108

// Takes an ALREADY-TRANSPOSED display MIDI note.
export function displayMidiToY(displayMidi: number): number { ... }

// Ledger-line Ys needed to reach a note outside the staff (above or below).
// Returns the Y of each ledger-line that should be drawn for this note.
// Empty array when the note is within the staff (E4..F5 inclusive).
export function ledgerLineYs(displayMidi: number): number[] { ... }
```

- [ ] **Step 1: Write the failing test**

Create `src/staff/staff-layout.test.ts`:

```ts
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
    // C4 is step -3 below B4 (middle line). y = 80 - (-3 - 0) * 7 = 80 + 21 = 101.
    // Actually step delta is (stepsFromG4 - 2). C4: stepsFromG4 = (0-4)+0 = -4.
    // y = 80 - (-4 - 2) * 7 = 80 + 42 = 122. That's two line-spacings below the bottom line.
    // The bottom line (E4) is at 108; one line-spacing below is F4 (space), then G4,
    // so C4 is one ledger-line below the staff at y = STAFF_BOTTOM_LINE_Y + LS = 122.
    expect(displayMidiToY(60)).toBe(STAFF_BOTTOM_LINE_Y + LS);
  });

  it("places C6 (MIDI 84) two ledger-line-spacings above the staff", () => {
    // C6 is above F5 (top line). A5 space, then C6 on the ledger line above.
    // Actually: F5 top line, G5 space above, A5 first ledger line above,
    // B5 space, C6 second ledger line above.
    // y = STAFF_TOP_LINE_Y - 2 * LS = 52 - 28 = 24.
    expect(displayMidiToY(84)).toBe(STAFF_TOP_LINE_Y - 2 * LS);
  });

  it("gives sharps and naturals the same Y (accidentals share a step)", () => {
    // F#5 (MIDI 78) spells as F-sharp, so its diatonic position is F5.
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
    // C4 sits on one ledger line below the staff.
    expect(ledgerLineYs(60)).toEqual([STAFF_BOTTOM_LINE_Y + LS]);
  });

  it("returns two ledger lines for C6 above the staff", () => {
    // C6 sits on the second ledger line above the staff.
    // Draws the first (A5) and the second (C6).
    expect(ledgerLineYs(84)).toEqual([
      STAFF_TOP_LINE_Y - LS,
      STAFF_TOP_LINE_Y - 2 * LS,
    ]);
  });

  it("does not draw a ledger line for D4 (space below bottom line)", () => {
    // D4 is in the space between E4 (bottom line) and C4 — no ledger line.
    expect(ledgerLineYs(62)).toEqual([]);
  });

  it("does not draw a ledger line for G5 (space above top line)", () => {
    expect(ledgerLineYs(79)).toEqual([]);
  });

  it("returns one ledger line for B3 — no wait, B3 is three steps below E4", () => {
    // B3 is MIDI 59. stepsFromG4 = (6-4)+(-1)*7 = 2 - 7 = -5.
    // E4 is step -2 (stepsFromG4 = (2-4)+0 = -2). One step below E4 (space) is D4 (step -3),
    // then C4 (-4) ledger, B3 (-5) space, A3 (-6) ledger.
    // So B3 shows on the space between the C4 ledger line and nothing — we draw only C4.
    expect(ledgerLineYs(59)).toEqual([STAFF_BOTTOM_LINE_Y + LS]);
  });

  it("returns two ledger lines for A3 below the staff", () => {
    // A3 = MIDI 57. stepsFromG4 = -6. Needs C4 and A3 ledger lines.
    expect(ledgerLineYs(57)).toEqual([
      STAFF_BOTTOM_LINE_Y + LS,
      STAFF_BOTTOM_LINE_Y + 2 * LS,
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/staff/staff-layout.test.ts`
Expected: FAIL — "Cannot find module './staff-layout'".

- [ ] **Step 3: Write `src/staff/staff-layout.ts`**

Create `src/staff/staff-layout.ts`:

```ts
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

// Reference: G4 on treble clef has stepsFromG4 = 0.
const G_INDEX = LETTER_INDEX.G;
const REFERENCE_OCTAVE = 4;

// Middle line B4: stepsFromG4 = (6 - 4) + 0 = 2.
const MIDDLE_LINE_STEPS = 2;

// Top line F5: stepsFromG4 = (3 - 4) + 7 = 6. Offset from middle = 4.
// Each diatonic step covers LS/2 vertical pixels.
const HALF_LINE = LS / 2;

/**
 * Diatonic steps of a displayMidi note counted from G4 (=0), positive = up.
 * Uses the note's chosen letter-name spelling to determine which step the
 * note occupies; C#5 and Db5 both sit at the C5 step (with different
 * accidentals rendered separately).
 */
export function displayMidiToStep(displayMidi: number): number {
  const pitch = midiToStaffPitch(displayMidi);
  return (
    (LETTER_INDEX[pitch.letter] - G_INDEX) + 7 * (pitch.octave - REFERENCE_OCTAVE)
  );
}

/**
 * Y position for a notehead on the staff, given an already-transposed
 * display MIDI note. Callers are responsible for adding
 * STAFF_TRANSPOSE_SEMITONES to concert MIDI before calling.
 */
export function displayMidiToY(displayMidi: number): number {
  const step = displayMidiToStep(displayMidi);
  return STAFF_CENTER_Y - (step - MIDDLE_LINE_STEPS) * HALF_LINE;
}

/**
 * Ledger lines required for a note outside the staff.
 * Returns the Y coordinate of each ledger line that should be drawn.
 * Empty when the note is inside the staff (E4..F5, steps -2..+6 inclusive
 * relative to G4, i.e. -4..+4 relative to B4).
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/staff/staff-layout.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/staff/staff-layout.ts src/staff/staff-layout.test.ts
git commit -m "feat(staff): add pitch→Y and ledger-line helpers"
```

---

## Task 4: `staff/staff-layout.ts` — accidental placement

**Files:**
- Modify: `src/staff/staff-layout.ts`
- Test: `src/staff/staff-layout.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/staff/staff-layout.test.ts`:

```ts
import { accidentalPlacement, type AccidentalPlacement } from "./staff-layout";

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
    // Positioned to the left of the notehead center by ~LS * 0.9
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/staff/staff-layout.test.ts`
Expected: FAIL — "Module './staff-layout' has no exported member 'accidentalPlacement'".

- [ ] **Step 3: Extend `src/staff/staff-layout.ts`**

Append to `src/staff/staff-layout.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/staff/staff-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/staff/staff-layout.ts src/staff/staff-layout.test.ts
git commit -m "feat(staff): add accidental glyph + placement helper"
```

---

## Task 5: `staff/staff-layout.ts` — quarter-rest SVG path

A hand-traced quarter-rest path, fixed to the middle-line Y, designed to be stamped into the Staff SVG as a `<path d="..." />`.

**Files:**
- Modify: `src/staff/staff-layout.ts`
- Test: `src/staff/staff-layout.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/staff/staff-layout.test.ts`:

```ts
import { quarterRestPath, QUARTER_REST_Y } from "./staff-layout";

describe("quarterRestPath", () => {
  it("returns a non-empty SVG path string", () => {
    const d = quarterRestPath();
    expect(d).toMatch(/^M/);
    expect(d.length).toBeGreaterThan(20);
  });

  it("is stable (snapshot)", () => {
    // If the path changes intentionally, update this literal and review the
    // visual result in the browser. Do not update blindly.
    expect(quarterRestPath()).toBe(
      "M -2 -12 L 4 -4 L -4 4 L 3 10 L -1 14 " +
      "C 2 8 -3 6 -4 10 L -5 2 C -2 4 2 4 -1 -2 Z",
    );
  });

  it("exposes QUARTER_REST_Y anchored at the middle line", () => {
    expect(QUARTER_REST_Y).toBe(STAFF_CENTER_Y);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/staff/staff-layout.test.ts`
Expected: FAIL — "Module './staff-layout' has no exported member 'quarterRestPath'".

- [ ] **Step 3: Extend `src/staff/staff-layout.ts`**

Append to `src/staff/staff-layout.ts`:

```ts
/**
 * Y position at which to anchor the quarter-rest glyph. The path
 * coordinates are authored relative to (0, 0) and then translated to
 * (x, QUARTER_REST_Y) in the Staff component.
 */
export const QUARTER_REST_Y = STAFF_CENTER_Y;

/**
 * SVG `<path d="…">` string for a stylized quarter-rest, authored in a
 * 20-pixel-tall box centered on the origin. The caller translates it to
 * the desired (x, QUARTER_REST_Y) position in the staff's coordinate
 * system.
 */
export function quarterRestPath(): string {
  return (
    "M -2 -12 L 4 -4 L -4 4 L 3 10 L -1 14 " +
    "C 2 8 -3 6 -4 10 L -5 2 C -2 4 2 4 -1 -2 Z"
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/staff/staff-layout.test.ts`
Expected: PASS — all staff-layout tests green.

- [ ] **Step 5: Commit**

```bash
git add src/staff/staff-layout.ts src/staff/staff-layout.test.ts
git commit -m "feat(staff): add quarter-rest SVG path"
```

---

## Task 6: `staff/staff-engine.ts` — scaffold, types, empty state

**Files:**
- Create: `src/staff/staff-engine.ts`
- Test: `src/staff/staff-engine.test.ts`

Set up the public types, the factory, and the starting state. No commit logic yet — just getters that return empty values.

- [ ] **Step 1: Write the failing test**

Create `src/staff/staff-engine.test.ts`:

```ts
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
    // Ghost should reflect the single-frame leader.
    expect(e.getGhost().candidate).toEqual<CommittedEvent>({
      kind: "note",
      midi: 72,
      worstCents: 0,
    });
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/staff/staff-engine.test.ts`
Expected: FAIL — "Cannot find module './staff-engine'".

- [ ] **Step 3: Write `src/staff/staff-engine.ts`**

Create `src/staff/staff-engine.ts`:

```ts
export type Detection =
  | { kind: "rest" }
  | { kind: "note"; midi: number; cents: number };

export type CommittedEvent =
  | { kind: "rest" }
  | { kind: "note"; midi: number; worstCents: number };

export interface GhostState {
  /** The current running majority-vote leader, or null if nothing seen yet. */
  candidate: CommittedEvent | null;
  /** 0..1 fraction of the window elapsed. */
  progress: number;
}

export interface StaffEngineOptions {
  /** Window duration in ms. Defaults to 250. */
  windowMs?: number;
}

export interface StaffEngine {
  tick(detection: Detection, timestampMs: number): void;
  getGhost(): GhostState;
  getCommitted(): readonly CommittedEvent[];
  clear(): void;
}

type Key = "rest" | number;

export function createStaffEngine(opts: StaffEngineOptions = {}): StaffEngine {
  const windowMs = opts.windowMs ?? 250;

  const committed: CommittedEvent[] = [];
  let last: CommittedEvent | null = null;

  let windowStart: number | null = null;
  let windowNow = 0;
  const tally = new Map<Key, number>();
  let leader: Key | null = null;
  let leaderWorstCents = 0;

  function keyOf(d: Detection): Key {
    return d.kind === "rest" ? "rest" : d.midi;
  }

  function resetWindow(nowTs: number): void {
    windowStart = nowTs;
    windowNow = nowTs;
    tally.clear();
    leader = null;
    leaderWorstCents = 0;
  }

  function leaderAsEvent(): CommittedEvent | null {
    if (leader === null) return null;
    if (leader === "rest") return { kind: "rest" };
    return { kind: "note", midi: leader, worstCents: leaderWorstCents };
  }

  return {
    tick(d, nowTs) {
      if (windowStart === null) {
        resetWindow(nowTs);
      }
      windowNow = nowTs;

      const k = keyOf(d);
      const prev = tally.get(k) ?? 0;
      tally.set(k, prev + 1);

      // Recompute leader (ties → most-recently-incremented, which is k since
      // we just incremented it).
      let newLeader: Key = k;
      let newLeaderCount = tally.get(k)!;
      for (const [cand, count] of tally) {
        if (count > newLeaderCount) {
          newLeader = cand;
          newLeaderCount = count;
        }
      }

      if (newLeader !== leader) {
        leader = newLeader;
        leaderWorstCents = 0;
        if (leader !== "rest" && d.kind === "note" && d.midi === leader) {
          leaderWorstCents = Math.abs(d.cents);
        }
      } else if (
        leader !== "rest" &&
        d.kind === "note" &&
        d.midi === leader
      ) {
        leaderWorstCents = Math.max(leaderWorstCents, Math.abs(d.cents));
      }
    },

    getGhost(): GhostState {
      if (windowStart === null) {
        return { candidate: null, progress: 0 };
      }
      const elapsed = Math.max(0, windowNow - windowStart);
      const progress = Math.min(1, elapsed / windowMs);
      return { candidate: leaderAsEvent(), progress };
    },

    getCommitted() {
      return committed;
    },

    clear() {
      committed.length = 0;
      last = null;
      windowStart = null;
      windowNow = 0;
      tally.clear();
      leader = null;
      leaderWorstCents = 0;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/staff/staff-engine.test.ts`
Expected: PASS — all 4 initial-state tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/staff/staff-engine.ts src/staff/staff-engine.test.ts
git commit -m "feat(staff): scaffold staff-engine types and initial state"
```

---

## Task 7: `staff/staff-engine.ts` — window majority vote + commit

Add the commit path: when a window closes, push the winner to `committed` and reset the window.

**Files:**
- Modify: `src/staff/staff-engine.ts`
- Modify: `src/staff/staff-engine.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/staff/staff-engine.test.ts`:

```ts
describe("createStaffEngine — majority-vote commit", () => {
  it("commits the winning note after 250 ms of the same input", () => {
    const e = createStaffEngine({ windowMs: 250 });
    // Feed 5 frames of C5 (MIDI 72) over 250 ms (one frame at start, one at end).
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
    // 3 × C5 then 2 × D5 — C5 has the majority.
    e.tick(note(72), 0);
    e.tick(note(72), 50);
    e.tick(note(72), 100);
    e.tick(note(74), 150);
    e.tick(note(74), 200);
    e.tick(note(74), 250); // window closes; leader is C5 with 3 votes vs D5 2
    const c = e.getCommitted();
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "note", midi: 72 });
  });

  it("commits a rest when silence wins the window", () => {
    const e = createStaffEngine({ windowMs: 250 });
    e.tick(note(72), 0);       // 1 note frame
    e.tick(rest(), 50);        // 1 rest frame
    e.tick(rest(), 100);       // 2 rest frames
    e.tick(rest(), 150);       // 3 rest frames
    e.tick(rest(), 200);       // 4 rest frames, rest leads
    // BUT: last is null (nothing committed yet) → leading rest will be
    // suppressed in Task 8. For this test we use a note that precedes the
    // silence, by manually pushing a leading C5 first via a full window.
    // Simpler: test silence after a committed C5.
    e.tick(rest(), 250);       // window closes
    // In the current (pre-suppression) implementation this commits a rest.
    expect(e.getCommitted()).toEqual<CommittedEvent[]>([{ kind: "rest" }]);
  });

  it("commits a fresh note in each successive window", () => {
    const e = createStaffEngine({ windowMs: 100 });
    e.tick(note(72), 0);
    e.tick(note(72), 100);   // window 1 closes → commit C5
    e.tick(note(74), 100);   // window 2 opens (same timestamp ok)
    e.tick(note(74), 200);   // window 2 closes → commit D5
    expect(e.getCommitted()).toEqual<CommittedEvent[]>([
      { kind: "note", midi: 72, worstCents: 0 },
      { kind: "note", midi: 74, worstCents: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/staff/staff-engine.test.ts`
Expected: FAIL — no commits happening yet (committed is still empty after window close).

- [ ] **Step 3: Add the commit path**

In `src/staff/staff-engine.ts`, modify the `tick` method body. Replace the current `tick` implementation with:

```ts
    tick(d, nowTs) {
      if (windowStart === null) {
        resetWindow(nowTs);
      }
      windowNow = nowTs;

      const k = keyOf(d);
      const prev = tally.get(k) ?? 0;
      tally.set(k, prev + 1);

      let newLeader: Key = k;
      let newLeaderCount = tally.get(k)!;
      for (const [cand, count] of tally) {
        if (count > newLeaderCount) {
          newLeader = cand;
          newLeaderCount = count;
        }
      }

      if (newLeader !== leader) {
        leader = newLeader;
        leaderWorstCents = 0;
        if (leader !== "rest" && d.kind === "note" && d.midi === leader) {
          leaderWorstCents = Math.abs(d.cents);
        }
      } else if (
        leader !== "rest" &&
        d.kind === "note" &&
        d.midi === leader
      ) {
        leaderWorstCents = Math.max(leaderWorstCents, Math.abs(d.cents));
      }

      // Close the window?
      if (nowTs - windowStart! >= windowMs) {
        const event = leaderAsEvent();
        if (event !== null) {
          committed.push(event);
          last = event;
        }
        resetWindow(nowTs);
      }
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/staff/staff-engine.test.ts`
Expected: PASS — initial-state tests and commit tests green.

- [ ] **Step 5: Commit**

```bash
git add src/staff/staff-engine.ts src/staff/staff-engine.test.ts
git commit -m "feat(staff): commit window majority winner on close"
```

---

## Task 8: `staff/staff-engine.ts` — duplicate and leading-silence suppression

Add the suppression rules from the Section 2 decision table:

- Leading rest (`last === null`, winner is rest) → skip.
- Duplicate rest (`last.kind === "rest"`, winner is rest) → skip.
- Duplicate note (`last.kind === "note"`, winner matches midi) → skip.

**Files:**
- Modify: `src/staff/staff-engine.ts`
- Modify: `src/staff/staff-engine.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/staff/staff-engine.test.ts`:

```ts
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
    // window 1: note C5 → commit
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

  it("does commit a different note after a held note", () => {
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
```

Note that one of Task 7's earlier tests ("commits a rest when silence wins the window") will now need updating since leading rests are suppressed. Update that test:

```ts
  it("commits a rest when silence wins the window (after a note)", () => {
    const e = createStaffEngine({ windowMs: 250 });
    // Seed a committed C5 first so last != null.
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/staff/staff-engine.test.ts`
Expected: FAIL — leading rest is currently committed; duplicate notes/rests are currently committed.

- [ ] **Step 3: Add the suppression logic**

In `src/staff/staff-engine.ts`, inside `tick`, replace the commit block:

```ts
      // Close the window?
      if (nowTs - windowStart! >= windowMs) {
        const event = leaderAsEvent();
        if (event !== null && shouldCommit(event, last)) {
          committed.push(event);
          last = event;
        }
        resetWindow(nowTs);
      }
```

And add a `shouldCommit` helper at module scope, above `createStaffEngine`:

```ts
function shouldCommit(
  candidate: CommittedEvent,
  last: CommittedEvent | null,
): boolean {
  if (candidate.kind === "rest") {
    // Never commit a leading rest or consecutive rests.
    if (last === null) return false;
    if (last.kind === "rest") return false;
    return true;
  }
  // Note: suppress consecutive identical midi.
  if (last !== null && last.kind === "note" && last.midi === candidate.midi) {
    return false;
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/staff/staff-engine.test.ts`
Expected: PASS — all engine tests green, including the suppression cases.

- [ ] **Step 5: Commit**

```bash
git add src/staff/staff-engine.ts src/staff/staff-engine.test.ts
git commit -m "feat(staff): suppress leading + consecutive duplicate rests/notes"
```

---

## Task 9: `staff/staff-engine.ts` — worst-cents tracking

The `tick` logic already maintains `leaderWorstCents` for the current leader. This task adds tests that verify it propagates into the committed event correctly, and adds the case where the leader *changes* mid-window (the old leader's cents must be discarded).

**Files:**
- Modify: `src/staff/staff-engine.test.ts` (no source changes — logic is already in place; this task is a validation pass)

- [ ] **Step 1: Write the failing test**

Append to `src/staff/staff-engine.test.ts`:

```ts
describe("createStaffEngine — worst-cents tracking", () => {
  it("records the worst cents seen for the winning note", () => {
    const e = createStaffEngine({ windowMs: 100 });
    e.tick(note(72, 3), 0);
    e.tick(note(72, -12), 25);
    e.tick(note(72, 7), 50);
    e.tick(note(72, -1), 75);
    e.tick(note(72, 100)); // close window
    e.tick(note(72, 4), 100); // new window start — previous tick closed window
    // Hmm — the above is awkward. Let's do a cleaner sequence:
  });

  it("records the max |cents| across all same-leader frames", () => {
    const e = createStaffEngine({ windowMs: 100 });
    e.tick(note(72, 3), 0);
    e.tick(note(72, -12), 25);
    e.tick(note(72, 7), 50);
    e.tick(note(72, -1), 75);
    e.tick(note(72, 4), 100); // closes window; all frames were C5
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
    // Frame 1: D5 with -30 cents (briefly leads)
    e.tick(note(74, -30), 0);
    // Frames 2-5: C5 with small cents (takes the lead from frame 2 onward — tie-break goes to most recent)
    e.tick(note(72, 2), 25);
    e.tick(note(72, 3), 50);
    e.tick(note(72, 4), 75);
    e.tick(note(72, 1), 100); // closes window
    const c = e.getCommitted();
    expect(c).toHaveLength(1);
    // Leader is C5 (4 frames vs 1 frame of D5); worstCents for C5 max is 4.
    expect(c[0]).toEqual<CommittedEvent>({
      kind: "note",
      midi: 72,
      worstCents: 4,
    });
  });

  it("commits worstCents = 0 for a rest", () => {
    const e = createStaffEngine({ windowMs: 100 });
    e.tick(note(72, 5), 0);
    e.tick(note(72, 5), 100); // commit C5
    e.tick(rest(), 100);
    e.tick(rest(), 200); // commit rest
    const c = e.getCommitted();
    expect(c[1]).toEqual<CommittedEvent>({ kind: "rest" });
  });
});
```

Delete the stub `it("records the worst cents seen for the winning note", …)` block that was left incomplete above.

- [ ] **Step 2: Run test to verify it fails (or passes if already correct)**

Run: `npm test -- src/staff/staff-engine.test.ts`
Expected: PASS — the Task 6 scaffold already tracks `leaderWorstCents` per the leader-changed branch, and the commit path in Task 7 reads it via `leaderAsEvent()`. If any test fails, diagnose before moving on.

- [ ] **Step 3: Fix any regressions**

If the "discards cents from a losing candidate" test fails, the leader-change reset in `tick` is wrong. Re-read the Task 6 implementation and verify that when `newLeader !== leader`, `leaderWorstCents = 0` and is reseeded only if the new leader matches the current frame's note.

- [ ] **Step 4: Re-run**

Run: `npm test -- src/staff/staff-engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/staff/staff-engine.test.ts
git commit -m "test(staff): cover worst-cents tracking + losing-candidate discard"
```

---

## Task 10: `staff/staff-engine.ts` — `clear()` + progress fraction

`clear()` is already implemented; this task adds its test coverage plus tests for the progress fraction.

**Files:**
- Modify: `src/staff/staff-engine.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/staff/staff-engine.test.ts`:

```ts
describe("createStaffEngine — clear() and progress", () => {
  it("clear() empties committed, resets ghost", () => {
    const e = createStaffEngine({ windowMs: 100 });
    e.tick(note(72), 0);
    e.tick(note(72), 100); // commit
    e.tick(note(74), 100);
    e.tick(note(74), 150); // mid-window; ghost has D5
    expect(e.getCommitted()).toHaveLength(1);
    expect(e.getGhost().candidate).toMatchObject({ kind: "note", midi: 74 });

    e.clear();
    expect(e.getCommitted()).toEqual([]);
    expect(e.getGhost()).toEqual<GhostState>({ candidate: null, progress: 0 });
  });

  it("clear() lets a new window start cleanly", () => {
    const e = createStaffEngine({ windowMs: 100 });
    e.tick(note(72), 0);
    e.clear();
    e.tick(note(74), 500);
    e.tick(note(74), 600); // window 100ms → commit D5
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
    e.tick(note(72), 100); // closes + commits
    // After the close the window has been reset with nowTs=100,
    // so progress is 0 until the next tick advances it.
    expect(e.getGhost().progress).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npm test -- src/staff/staff-engine.test.ts`
Expected: PASS if Task 6's scaffolding is correct. If the progress-reset test fails, the cause is `windowNow` being read in `getGhost` before a fresh tick updates it — in which case `progress` should still read 0 because `resetWindow` sets `windowNow = nowTs` and `windowStart = nowTs`, so elapsed = 0.

- [ ] **Step 3: Fix if needed**

If any test fails, trace through the `resetWindow` / `getGhost` interaction. No implementation changes expected; this task is primarily a validation pass.

- [ ] **Step 4: Re-run**

Run: `npm test -- src/staff/staff-engine.test.ts`
Expected: PASS — all staff-engine tests green.

- [ ] **Step 5: Commit**

```bash
git add src/staff/staff-engine.test.ts
git commit -m "test(staff): cover clear() + progress fraction"
```

---

## Task 11: Simplify `audio/pitch-detector.ts` and test `autocorrelate`

Strip `NOTE_HOLD_FRAMES`, `SILENCE_HOLD_FRAMES`, and candidate tracking. Keep EMA smoothing. Export `autocorrelate` so it can be unit-tested with a synthetic sine wave buffer (creating a real `AudioContext` in tests is not feasible under the `"node"` vitest environment).

**Files:**
- Modify: `src/audio/pitch-detector.ts`
- Create: `src/audio/pitch-detector.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/audio/pitch-detector.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { autocorrelate } from "./pitch-detector";

function sineBuffer(freq: number, sampleRate: number, length: number): Float32Array {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buf[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return buf;
}

describe("autocorrelate", () => {
  it("detects a 440 Hz sine wave within 1% of the true frequency", () => {
    const buf = sineBuffer(440, 44100, 4096);
    const freq = autocorrelate(buf, 44100);
    expect(freq).not.toBeNull();
    expect(freq!).toBeGreaterThan(440 * 0.99);
    expect(freq!).toBeLessThan(440 * 1.01);
  });

  it("detects a 523.25 Hz (C5) sine wave within 1%", () => {
    const buf = sineBuffer(523.25, 44100, 4096);
    const freq = autocorrelate(buf, 44100);
    expect(freq).not.toBeNull();
    expect(Math.abs(freq! - 523.25) / 523.25).toBeLessThan(0.01);
  });

  it("returns null for silence (all zeros)", () => {
    const buf = new Float32Array(4096);
    const freq = autocorrelate(buf, 44100);
    expect(freq).toBeNull();
  });

  it("returns null for low-amplitude noise (below RMS threshold)", () => {
    const buf = new Float32Array(4096);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = (Math.random() - 0.5) * 0.005; // < 0.01 RMS threshold
    }
    const freq = autocorrelate(buf, 44100);
    expect(freq).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/audio/pitch-detector.test.ts`
Expected: FAIL — "Module './pitch-detector' has no exported member 'autocorrelate'" (it's currently module-local).

- [ ] **Step 3: Simplify and export**

Replace the contents of `src/audio/pitch-detector.ts` with:

```ts
export interface PitchDetector {
  start(): Promise<void>;
  stop(): void;
  getFrequency(): number | null;
}

const BUFFER_SIZE = 4096;
const CORRELATION_THRESHOLD = 0.9;
// Trumpet range: E3 (~165 Hz) to C6 (~1047 Hz)
const MIN_PERIOD = 35;   // ~1260 Hz ceiling
const MAX_PERIOD = 300;  // ~147 Hz floor

// Exponential moving average for frequency smoothing (cents precision).
// 0 = no smoothing, 1 = frozen.
const EMA_ALPHA = 0.85;

export function autocorrelate(
  buffer: Float32Array,
  sampleRate: number,
): number | null {
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return null;

  const correlations = new Float32Array(MAX_PERIOD + 1);
  for (
    let period = MIN_PERIOD;
    period <= MAX_PERIOD && period < buffer.length / 2;
    period++
  ) {
    let correlation = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < buffer.length - period; i++) {
      correlation += buffer[i] * buffer[i + period];
      norm1 += buffer[i] * buffer[i];
      norm2 += buffer[i + period] * buffer[i + period];
    }

    const norm = Math.sqrt(norm1 * norm2);
    correlations[period] = norm === 0 ? 0 : correlation / norm;
  }

  let foundPeriod = 0;
  let rising = false;
  for (
    let period = MIN_PERIOD;
    period <= MAX_PERIOD && period < buffer.length / 2;
    period++
  ) {
    if (correlations[period] > correlations[period - 1]) {
      rising = true;
    } else if (rising && correlations[period] < correlations[period - 1]) {
      if (correlations[period - 1] >= CORRELATION_THRESHOLD) {
        foundPeriod = period - 1;
        break;
      }
      rising = false;
    }
  }

  if (foundPeriod === 0) return null;

  const prev = correlations[foundPeriod - 1] ?? 0;
  const curr = correlations[foundPeriod];
  const next = correlations[foundPeriod + 1] ?? 0;
  const denom = 2 * (prev - 2 * curr + next);
  const shift = denom === 0 ? 0 : (prev - next) / denom;
  const refinedPeriod = foundPeriod + (isFinite(shift) ? shift : 0);

  return sampleRate / refinedPeriod;
}

export function createPitchDetector(): PitchDetector {
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let mediaStream: MediaStream | null = null;
  let buffer: Float32Array<ArrayBuffer> | null = null;
  let smoothedFrequency: number | null = null;

  return {
    async start() {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext();
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = BUFFER_SIZE * 2;
      buffer = new Float32Array(BUFFER_SIZE) as Float32Array<ArrayBuffer>;

      const source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(analyserNode);
    },

    stop() {
      mediaStream?.getTracks().forEach((t) => t.stop());
      audioContext?.close();
      audioContext = null;
      analyserNode = null;
      mediaStream = null;
      buffer = null;
      smoothedFrequency = null;
    },

    getFrequency(): number | null {
      if (!analyserNode || !buffer || !audioContext) return null;
      analyserNode.getFloatTimeDomainData(buffer);
      const raw = autocorrelate(buffer, audioContext.sampleRate);

      if (raw === null) {
        smoothedFrequency = null;
        return null;
      }

      if (smoothedFrequency === null) {
        smoothedFrequency = raw;
      } else {
        smoothedFrequency =
          smoothedFrequency * EMA_ALPHA + raw * (1 - EMA_ALPHA);
      }

      return smoothedFrequency;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/audio/pitch-detector.test.ts`
Expected: PASS — 4 autocorrelate tests green.

Also run the full test suite to catch any regressions:

Run: `npm test`
Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/audio/pitch-detector.ts src/audio/pitch-detector.test.ts
git commit -m "refactor(audio): simplify pitch-detector to a pure probe

Strip NOTE_HOLD_FRAMES, SILENCE_HOLD_FRAMES, and candidate tracking —
the staff-engine now owns all stability gating, so detector-level holds
cause double-smoothing. Keep EMA on frequency for cents precision.
Export autocorrelate so it can be unit-tested with synthetic buffers."
```

---

## Task 12: `components/HorizontalDial.tsx`

A flat cents dial replacing the portrait `Dial.tsx`. Colored gradient bar, moving tick, and a `±N¢` label.

**Files:**
- Create: `src/components/HorizontalDial.tsx`

No unit test — manual verification covers it (vitest runs in `"node"` without a DOM).

- [ ] **Step 1: Write `HorizontalDial.tsx`**

Create `src/components/HorizontalDial.tsx`:

```tsx
import type { Component } from "solid-js";
import { centsZone, zoneColor } from "../audio/intonation";

interface HorizontalDialProps {
  cents: number | null;
}

const HorizontalDial: Component<HorizontalDialProps> = (props) => {
  const clampedCents = () => {
    const c = props.cents;
    if (c === null) return 0;
    return Math.max(-50, Math.min(50, c));
  };

  const tickLeftPercent = () => ((clampedCents() + 50) / 100) * 100;

  const labelColor = () => {
    if (props.cents === null) return "var(--text-secondary)";
    return zoneColor(centsZone(props.cents));
  };

  const labelText = () => {
    if (props.cents === null) return "—";
    const sign = props.cents > 0 ? "+" : "";
    return `${sign}${Math.round(props.cents)}¢`;
  };

  return (
    <div class="horizontal-dial">
      <div class="horizontal-dial-bar">
        <div
          class="horizontal-dial-tick"
          style={{ left: `${tickLeftPercent()}%` }}
        />
      </div>
      <div class="horizontal-dial-label" style={{ color: labelColor() }}>
        {labelText()}
      </div>
    </div>
  );
};

export default HorizontalDial;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/HorizontalDial.tsx
git commit -m "feat(ui): add HorizontalDial component"
```

---

## Task 13: `components/Staff.tsx`

The main staff SVG. Takes committed events + ghost state, renders static staff lines + treble clef + committed notes (with accidentals, ledger lines, cents labels) + the live ghost (with progress bar).

**Files:**
- Create: `src/components/Staff.tsx`

- [ ] **Step 1: Write `Staff.tsx`**

Create `src/components/Staff.tsx`:

```tsx
import { type Component, For, Show } from "solid-js";
import {
  LS,
  STAFF_CENTER_Y,
  STAFF_TOP_LINE_Y,
  STAFF_BOTTOM_LINE_Y,
  STAFF_TRANSPOSE_SEMITONES,
  displayMidiToY,
  ledgerLineYs,
  accidentalPlacement,
  quarterRestPath,
  QUARTER_REST_Y,
} from "../staff/staff-layout";
import type { CommittedEvent, GhostState } from "../staff/staff-engine";
import { centsZone, zoneColor } from "../audio/intonation";

interface StaffProps {
  committed: readonly CommittedEvent[];
  ghost: GhostState;
}

const LEFT_MARGIN = 80;        // room for the clef
const NOTE_SPACING = LS * 4;   // horizontal spacing between committed events
const VIEW_HEIGHT = 200;
const VIEW_WIDTH = 1000;       // logical viewBox width; the <svg> scales
const LABEL_Y = STAFF_BOTTOM_LINE_Y + LS * 4;
const PROGRESS_Y = STAFF_BOTTOM_LINE_Y + LS * 3;

function noteColor(worstCents: number): string {
  return zoneColor(centsZone(worstCents));
}

const Staff: Component<StaffProps> = (props) => {
  const eventX = (index: number) => LEFT_MARGIN + index * NOTE_SPACING;

  const scrollX = () => {
    const lastX = eventX(props.committed.length + 1);
    const overflow = lastX - (VIEW_WIDTH - LEFT_MARGIN / 2);
    return overflow > 0 ? overflow : 0;
  };

  const ghostX = () => eventX(props.committed.length) - scrollX();

  return (
    <svg
      class="staff"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Five staff lines (full width) */}
      <For each={[-2, -1, 0, 1, 2]}>
        {(offset) => (
          <line
            x1={0}
            x2={VIEW_WIDTH}
            y1={STAFF_CENTER_Y + offset * LS}
            y2={STAFF_CENTER_Y + offset * LS}
            stroke="var(--text-secondary)"
            stroke-width="1"
            opacity="0.5"
          />
        )}
      </For>

      {/* Treble clef (Unicode U+1D11E). Font fallback to serif. */}
      <text
        x={16}
        y={STAFF_CENTER_Y + LS * 2.2}
        fill="var(--text-primary)"
        font-size={LS * 5}
        font-family="serif"
      >
        𝄞
      </text>

      {/* Committed + ghost group, translated left as the staff fills. */}
      <g transform={`translate(${-scrollX()}, 0)`}>
        <For each={props.committed}>
          {(event, index) => {
            const x = eventX(index());
            if (event.kind === "rest") {
              return (
                <g transform={`translate(${x}, ${QUARTER_REST_Y})`}>
                  <path
                    d={quarterRestPath()}
                    fill="var(--text-secondary)"
                    opacity="0.85"
                  />
                </g>
              );
            }
            const displayMidi = event.midi + STAFF_TRANSPOSE_SEMITONES;
            const y = displayMidiToY(displayMidi);
            const color = noteColor(event.worstCents);
            const accidental = accidentalPlacement(displayMidi);
            const ledgers = ledgerLineYs(displayMidi);
            const signed = `${event.worstCents > 0 ? "" : ""}${event.worstCents}¢`;
            return (
              <g>
                <For each={ledgers}>
                  {(ly) => (
                    <line
                      x1={x - LS * 0.8}
                      x2={x + LS * 0.8}
                      y1={ly}
                      y2={ly}
                      stroke="var(--text-secondary)"
                      stroke-width="1"
                      opacity="0.6"
                    />
                  )}
                </For>
                <Show when={accidental}>
                  {(acc) => (
                    <text
                      x={x + acc().dx}
                      y={acc().y + LS * 0.35}
                      fill={color}
                      font-size={LS * 1.4}
                      font-family="serif"
                      text-anchor="middle"
                    >
                      {acc().glyph}
                    </text>
                  )}
                </Show>
                <ellipse
                  cx={x}
                  cy={y}
                  rx={LS * 0.65}
                  ry={LS * 0.5}
                  fill={color}
                  transform={`rotate(-20 ${x} ${y})`}
                />
                <text
                  x={x}
                  y={LABEL_Y}
                  fill={color}
                  font-size={LS * 0.75}
                  text-anchor="middle"
                >
                  {event.worstCents}¢
                </text>
              </g>
            );
          }}
        </For>

        {/* Ghost */}
        <Show when={props.ghost.candidate}>
          {(candidate) => {
            const c = candidate();
            const x = eventX(props.committed.length);
            if (c.kind === "rest") {
              return (
                <g>
                  <g transform={`translate(${x}, ${QUARTER_REST_Y})`} opacity="0.4">
                    <path d={quarterRestPath()} fill="var(--text-secondary)" />
                  </g>
                  <rect
                    x={x - LS * 1.2}
                    y={PROGRESS_Y}
                    width={LS * 2.4}
                    height={3}
                    fill="var(--text-secondary)"
                    opacity="0.15"
                  />
                  <rect
                    x={x - LS * 1.2}
                    y={PROGRESS_Y}
                    width={LS * 2.4 * props.ghost.progress}
                    height={3}
                    fill="var(--text-primary)"
                  />
                </g>
              );
            }
            const displayMidi = c.midi + STAFF_TRANSPOSE_SEMITONES;
            const y = displayMidiToY(displayMidi);
            const accidental = accidentalPlacement(displayMidi);
            const ledgers = ledgerLineYs(displayMidi);
            return (
              <g opacity="0.5">
                <For each={ledgers}>
                  {(ly) => (
                    <line
                      x1={x - LS * 0.8}
                      x2={x + LS * 0.8}
                      y1={ly}
                      y2={ly}
                      stroke="var(--text-secondary)"
                      stroke-width="1"
                    />
                  )}
                </For>
                <Show when={accidental}>
                  {(acc) => (
                    <text
                      x={x + acc().dx}
                      y={acc().y + LS * 0.35}
                      fill="var(--text-primary)"
                      font-size={LS * 1.4}
                      font-family="serif"
                      text-anchor="middle"
                    >
                      {acc().glyph}
                    </text>
                  )}
                </Show>
                <ellipse
                  cx={x}
                  cy={y}
                  rx={LS * 0.65}
                  ry={LS * 0.5}
                  fill="var(--text-primary)"
                  transform={`rotate(-20 ${x} ${y})`}
                />
                <rect
                  x={x - LS * 1.2}
                  y={PROGRESS_Y}
                  width={LS * 2.4}
                  height={3}
                  fill="var(--text-secondary)"
                  opacity="0.15"
                />
                <rect
                  x={x - LS * 1.2}
                  y={PROGRESS_Y}
                  width={LS * 2.4 * props.ghost.progress}
                  height={3}
                  fill="var(--text-primary)"
                />
              </g>
            );
          }}
        </Show>
      </g>
    </svg>
  );
};

export default Staff;
```

Note: `scrollX`/`ghostX` use the raw committed-count scrolling math. Because the visible SVG applies a reactive `translate(-scrollX, 0)`, the ghost's absolute X ends up at `ghostX()`. The ghost progress bar uses `x - LS * 1.2` which is relative to the ghost's translated position via the enclosing `<g>`.

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: No errors. If SolidJS's `Show` callback signature causes trouble with `candidate()`, use destructuring or double-check the SolidJS `Show` idiom.

- [ ] **Step 3: Commit**

```bash
git add src/components/Staff.tsx
git commit -m "feat(ui): add Staff SVG component"
```

---

## Task 14: `components/HeaderBar.tsx`

Horizontal HUD: note name, frequency, HorizontalDial, FingeringChart, transpose selector, clear button. Owns the transpose signal; exposes it and the clear callback to `App.tsx`.

**Files:**
- Create: `src/components/HeaderBar.tsx`

- [ ] **Step 1: Write `HeaderBar.tsx`**

Create `src/components/HeaderBar.tsx`:

```tsx
import { type Component, Show } from "solid-js";
import HorizontalDial from "./HorizontalDial";
import FingeringChart from "./FingeringChart";
import { midiToStaffPitch } from "../audio/notes";
import { getFingering, type Fingering } from "../audio/fingerings";
import type { CommittedEvent } from "../staff/staff-engine";

interface HeaderBarProps {
  frequency: number | null;
  cents: number | null;
  ghost: CommittedEvent | null;
  transpose: number;                // semitones; negative for Bb/Eb/F instruments
  onTransposeChange: (value: number) => void;
  onClear: () => void;
}

function formatNoteName(concertMidi: number, transposeSemitones: number): string {
  // Display MIDI = concert − transpose (selector value represents the
  // instrument's transposition; Bb = −2 means display is concert + 2).
  const displayMidi = concertMidi - transposeSemitones;
  const pitch = midiToStaffPitch(displayMidi);
  const accidental =
    pitch.accidental === "sharp" ? "#" :
    pitch.accidental === "flat" ? "b" : "";
  return `${pitch.letter}${accidental}`;
}

function concertFingering(concertMidi: number): Fingering | null {
  const pitch = midiToStaffPitch(concertMidi);
  const noteLabel = `${pitch.letter}${
    pitch.accidental === "sharp" ? "#" :
    pitch.accidental === "flat" ? "b" : ""
  }`;
  return getFingering(noteLabel, pitch.octave);
}

const HeaderBar: Component<HeaderBarProps> = (props) => {
  const noteName = () => {
    const g = props.ghost;
    if (g === null || g.kind === "rest") return "—";
    return formatNoteName(g.midi, props.transpose);
  };

  const octave = () => {
    const g = props.ghost;
    if (g === null || g.kind === "rest") return null;
    const displayMidi = g.midi - props.transpose;
    return midiToStaffPitch(displayMidi).octave;
  };

  const fingering = () => {
    const g = props.ghost;
    if (g === null || g.kind === "rest") return null;
    return concertFingering(g.midi);
  };

  const freqText = () => {
    if (props.frequency === null) return "— Hz";
    return `${props.frequency.toFixed(1)} Hz`;
  };

  const handleTransposeChange = (e: Event) => {
    const value = parseInt((e.currentTarget as HTMLInputElement).value, 10);
    if (!Number.isNaN(value)) props.onTransposeChange(value);
  };

  return (
    <div class="header-bar">
      <div class="header-note">
        <span class="header-note-name">{noteName()}</span>
        <Show when={octave() !== null}>
          <span class="header-note-octave">{octave()}</span>
        </Show>
      </div>
      <div class="header-freq">{freqText()}</div>
      <div class="header-dial">
        <HorizontalDial cents={props.cents} />
      </div>
      <div class="header-fingering">
        <FingeringChart fingering={fingering()} />
      </div>
      <label class="header-transpose">
        <span class="header-transpose-label">transpose</span>
        <input
          type="number"
          class="header-transpose-input"
          step="1"
          value={props.transpose}
          onInput={handleTransposeChange}
        />
      </label>
      <button class="header-clear" type="button" onClick={props.onClear}>
        Clear
      </button>
    </div>
  );
};

export default HeaderBar;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/HeaderBar.tsx
git commit -m "feat(ui): add HeaderBar HUD component"
```

---

## Task 15: Rewrite `App.tsx` and update `index.css`

Wire the new engine + components together. Remove the old `FrequencyGraph`, `Tuner`, and `Dial` imports. Delete their CSS rules and add new styles for `.header-bar`, `.horizontal-dial`, and `.staff`.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Rewrite `App.tsx`**

Replace the contents of `src/App.tsx` with:

```tsx
import {
  createSignal,
  onCleanup,
  onMount,
  type Component,
} from "solid-js";
import ThemeToggle from "./components/ThemeToggle";
import HeaderBar from "./components/HeaderBar";
import Staff from "./components/Staff";
import { createPitchDetector } from "./audio/pitch-detector";
import { frequencyToNote } from "./audio/notes";
import {
  createStaffEngine,
  type CommittedEvent,
  type Detection,
  type GhostState,
} from "./staff/staff-engine";

const App: Component = () => {
  const [started, setStarted] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [frequency, setFrequency] = createSignal<number | null>(null);
  const [cents, setCents] = createSignal<number | null>(null);
  const [committed, setCommitted] = createSignal<readonly CommittedEvent[]>([]);
  const [ghost, setGhost] = createSignal<GhostState>({
    candidate: null,
    progress: 0,
  });
  const [transpose, setTranspose] = createSignal(0);

  const detector = createPitchDetector();
  const engine = createStaffEngine({ windowMs: 250 });
  let animationId: number | undefined;

  const toDetection = (freq: number | null): Detection => {
    if (freq === null) return { kind: "rest" };
    const info = frequencyToNote(freq);
    if (info === null) return { kind: "rest" };
    // Compute raw MIDI (integer) from the frequency.
    const midi = Math.round(12 * Math.log2(freq / 440) + 69);
    return { kind: "note", midi, cents: info.cents };
  };

  const startListening = async () => {
    try {
      await detector.start();
      setStarted(true);
      setError(null);

      const tick = () => {
        const freq = detector.getFrequency();
        setFrequency(freq);
        const detection = toDetection(freq);
        if (detection.kind === "note") {
          setCents(detection.cents);
        } else {
          setCents(null);
        }
        engine.tick(detection, performance.now());
        // Snapshot — engine returns stable array references; copy to trigger Solid.
        setCommitted([...engine.getCommitted()]);
        setGhost(engine.getGhost());
        animationId = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError(
          "Microphone access denied. Please allow microphone access in your browser settings and reload.",
        );
      } else {
        setError("Could not access microphone. Please check your device settings.");
      }
    }
  };

  onMount(async () => {
    try {
      const status = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      if (status.state === "granted") {
        await startListening();
      }
    } catch {
      // permissions API not supported, show start button
    }
    setLoading(false);
  });

  onCleanup(() => {
    if (animationId !== undefined) cancelAnimationFrame(animationId);
    detector.stop();
  });

  const handleClear = () => {
    engine.clear();
    setCommitted([]);
    setGhost({ candidate: null, progress: 0 });
  };

  return (
    <div class="app">
      <ThemeToggle />
      {started() && (
        <>
          <HeaderBar
            frequency={frequency()}
            cents={cents()}
            ghost={ghost().candidate}
            transpose={transpose()}
            onTransposeChange={setTranspose}
            onClear={handleClear}
          />
          <Staff committed={committed()} ghost={ghost()} />
        </>
      )}

      {!loading() && !started() && !error() && (
        <div class="start-screen">
          <h1>Trumpet Tuner</h1>
          <p class="start-subtitle">Play a note — see it on the staff</p>
          <button class="start-button" onClick={startListening}>
            Start Tuning
          </button>
        </div>
      )}

      {error() && (
        <div class="error-screen">
          <h1>Trumpet Tuner</h1>
          <p class="error-message">{error()}</p>
          <button class="start-button" onClick={startListening}>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
```

- [ ] **Step 2: Rewrite `index.css`**

Replace the contents of `src/index.css` with:

```css
:root {
  --bg: #1a1a2e;
  --bg-surface: #16213e;
  --text-primary: #ffffff;
  --text-secondary: #8892a4;
  --accent-green: #2ecc71;
  --accent-yellow: #f39c12;
  --accent-red: #e74c3c;
}

:root.light {
  --bg: #f5f5f5;
  --bg-surface: #ffffff;
  --text-primary: #1a1a2e;
  --text-secondary: #666;
  --accent-green: #27ae60;
  --accent-yellow: #e67e22;
  --accent-red: #c0392b;
}

@media (prefers-color-scheme: light) {
  :root:not(.dark) {
    --bg: #f5f5f5;
    --bg-surface: #ffffff;
    --text-primary: #1a1a2e;
    --text-secondary: #666;
    --accent-green: #27ae60;
    --accent-yellow: #e67e22;
    --accent-red: #c0392b;
  }
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text-primary);
  min-height: 100vh;
}

.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  position: relative;
  z-index: 1;
}

/* Header bar */
.header-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 20px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--text-secondary);
}

.header-note {
  min-width: 72px;
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.header-note-name {
  font-size: 28px;
  font-weight: 700;
}

.header-note-octave {
  font-size: 14px;
  color: var(--text-secondary);
}

.header-freq {
  font-size: 12px;
  color: var(--text-secondary);
  width: 80px;
}

.header-dial {
  flex: 1;
  min-width: 160px;
}

.header-fingering svg {
  width: 140px;
  height: auto;
}

.header-transpose {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.header-transpose-input {
  width: 48px;
  padding: 4px 6px;
  font-family: monospace;
  font-size: 12px;
  background: var(--bg);
  color: var(--text-primary);
  border: 1px solid var(--text-secondary);
  border-radius: 4px;
}

.header-clear {
  background: var(--bg);
  color: var(--text-primary);
  border: 1px solid var(--text-secondary);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.header-clear:hover {
  background: var(--text-secondary);
  color: var(--bg);
}

/* Horizontal dial */
.horizontal-dial {
  display: flex;
  align-items: center;
  gap: 10px;
}

.horizontal-dial-bar {
  position: relative;
  flex: 1;
  height: 14px;
  border-radius: 7px;
  background: linear-gradient(
    90deg,
    var(--accent-red),
    var(--accent-yellow) 20%,
    var(--accent-green) 45%,
    var(--accent-green) 55%,
    var(--accent-yellow) 80%,
    var(--accent-red)
  );
  opacity: 0.6;
}

.horizontal-dial-tick {
  position: absolute;
  top: -4px;
  bottom: -4px;
  width: 3px;
  margin-left: -1.5px;
  background: var(--text-primary);
  border-radius: 2px;
  transition: left 0.12s ease-out;
}

.horizontal-dial-label {
  min-width: 48px;
  font-size: 13px;
  font-weight: 600;
  text-align: right;
}

/* Staff */
.staff {
  flex: 1;
  width: 100%;
  max-height: calc(100vh - 120px);
  background: var(--bg);
}

/* Theme toggle */
.theme-toggle {
  position: fixed;
  top: 16px;
  right: 16px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--text-secondary);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  z-index: 10;
}

.theme-toggle:hover {
  background: var(--text-secondary);
}

/* Start / Error screens */
.start-screen,
.error-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex: 1;
  padding: 20px;
  text-align: center;
}

.start-subtitle {
  color: var(--text-secondary);
  font-size: 18px;
}

.start-button {
  margin-top: 20px;
  padding: 16px 48px;
  font-size: 20px;
  font-weight: 600;
  background: var(--accent-green);
  color: #fff;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.start-button:hover {
  opacity: 0.85;
}

.error-message {
  color: var(--accent-red);
  font-size: 16px;
  max-width: 360px;
  line-height: 1.5;
}
```

- [ ] **Step 3: Type-check and run tests**

Run:

```bash
npx tsc -b --noEmit
npm test
```

Expected: type-check passes; all tests pass. The `Tuner.tsx` / `Dial.tsx` / `FrequencyGraph.tsx` files still exist but are no longer imported — they'll be deleted in Task 16.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/index.css
git commit -m "feat(ui): wire staff-engine + HeaderBar + Staff into App"
```

---

## Task 16: Delete obsolete components

Now that `App.tsx` no longer imports them, remove `FrequencyGraph.tsx`, `Tuner.tsx`, and `Dial.tsx`.

**Files:**
- Delete: `src/components/FrequencyGraph.tsx`
- Delete: `src/components/Tuner.tsx`
- Delete: `src/components/Dial.tsx`

- [ ] **Step 1: Verify nothing else references them**

Run:

```bash
grep -rn "FrequencyGraph\|Tuner\|from.*Dial" src || echo "no references"
```

Expected: the only hits, if any, should be inside the three files being deleted themselves. `HeaderBar.tsx` imports `FingeringChart`, not `Dial`. `HorizontalDial` is different from `Dial` — `grep` should not match `HorizontalDial` under the `from.*Dial` pattern if the regex is precise; if it does, refine to `from ['\"].*\/Dial['\"]`.

- [ ] **Step 2: Delete the files**

```bash
rm src/components/FrequencyGraph.tsx
rm src/components/Tuner.tsx
rm src/components/Dial.tsx
```

- [ ] **Step 3: Type-check and run tests**

Run:

```bash
npx tsc -b --noEmit
npm test
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add -A src/components
git commit -m "chore(ui): remove obsolete FrequencyGraph, Tuner, and Dial"
```

---

## Task 17: Manual UI verification

No code changes — run the dev server and walk through the verification checklist from the spec.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the URL Vite prints (typically `http://localhost:5173`).

- [ ] **Step 2: Walk through the spec's checklist**

From `docs/superpowers/specs/2026-04-15-staff-notation-design.md`, Section "Manual UI verification":

1. [ ] From silence → empty staff, header reads "—", no ghost, no leading rest.
2. [ ] Play a sustained C5 (concert Bb4 on a Bb trumpet). Confirm: header reads `Bb` at selector `0`; dial shows cents; ghost appears + progress bar fills; staff commits one notehead after ~250 ms. Hold the note another 2 seconds — **no additional noteheads** appear.
3. [ ] Play a sequence like C → D → silence → C. Confirm the staff shows four events in the expected order.
4. [ ] Play fast eighth-note/sixteenth-note passages. Confirm the ghost visibly flips between candidates while the vote is split, and committed events are fewer than played.
5. [ ] With history on the staff, change the transpose selector from `0` to `-2`. Confirm: committed noteheads **do not move** vertically; the header note name shifts (e.g., Bb → C).
6. [ ] Click **Clear**. Confirm the staff empties and the ghost resets.
7. [ ] Play continuously until the staff is past capacity. Confirm oldest notes scroll off the left edge and new ones appear on the right; the treble clef stays pinned at the left.

- [ ] **Step 3: Fix any issues found**

If any step fails, diagnose the root cause. Visual issues (e.g., the quarter-rest path looking wrong) go back to `staff-layout.ts` Task 5 — update the path and re-run the snapshot test. State machine issues (wrong commits, missed commits) go back to `staff-engine.ts` — add a failing test that reproduces, fix, and re-land.

- [ ] **Step 4: Final commit (if any fixes)**

If you made fix-up commits, push them and verify the commit history is coherent. If Step 2 passed cleanly, no commit is needed for this task.

---

## Plan self-review

Spec coverage check — every spec requirement traces to a task:

- **Detector simplification** → Task 11
- **Transposition convention (fixed staff +2 vs user selector)** → Task 14 (HeaderBar formatNoteName + selector UI) and Task 15 (App wires selector into HeaderBar; Staff applies +2 via `STAFF_TRANSPOSE_SEMITONES`)
- **Commit state machine (250 ms window, majority vote)** → Tasks 6, 7
- **Duplicate + leading-silence suppression** → Task 8
- **Worst-cents tracking** → Task 6 (logic) + Task 9 (coverage)
- **Clear button** → Task 10 (engine) + Tasks 14, 15 (UI wiring)
- **Ghost + progress bar** → Task 6 (`getGhost` + `progress`) + Task 13 (Staff renders)
- **Staff layout (pitch→Y, ledger lines, accidentals, rest path)** → Tasks 3, 4, 5
- **Notehead shape + colors from intonation zones** → Task 13 (renders) + Task 1 (zones)
- **Cents label under each committed note** → Task 13
- **Strip-chart scrolling + empty state** → Task 13
- **HeaderBar with note name, frequency, horizontal dial, fingering, selector, clear** → Tasks 12, 14
- **App.tsx rewrite, css rewrite, removal of old components** → Tasks 15, 16
- **Manual verification** → Task 17

All spec sections covered.

Placeholder scan: no "TBD", "TODO", or "implement later" in any task body. All test code is concrete. All file paths are absolute-to-the-repo (`src/...`).

Type consistency check: `CommittedEvent`, `Detection`, `GhostState`, `StaffPitch`, `Accidental`, `Zone` all defined in the first task that introduces them and referenced consistently afterward. `createStaffEngine` signature is consistent across Task 6 (scaffold), Task 7 (commit addition), Task 8 (suppression), and Task 15 (App.tsx consumer). The `getGhost()` return shape matches the spec's `{ candidate, progress }` in every touch.

One known soft-spot: Task 13's `<Show when={accidental}>{(acc) => …}` callback pattern assumes SolidJS's `Show` passes the truthy value as an accessor to the render function. If that's not the current Solid idiom, fall back to `{accidental ? <text …/> : null}`. This will surface at type-check time in Task 13's Step 2 and should be fixed there inline.
