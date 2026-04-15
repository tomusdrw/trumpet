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
