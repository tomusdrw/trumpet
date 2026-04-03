export interface NoteInfo {
  note: string;
  octave: number;
  frequency: number;
  cents: number;
}

// Using flats to match trumpet convention (Bb trumpet)
const NOTE_NAMES = [
  "C", "C#", "D", "Eb", "E", "F",
  "F#", "G", "Ab", "A", "Bb", "B",
] as const;

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
