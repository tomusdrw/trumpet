// [valve1, valve2, valve3] — true = pressed
export type Fingering = [boolean, boolean, boolean];

const OPEN: Fingering = [false, false, false];
const V1: Fingering = [true, false, false];
const V2: Fingering = [false, true, false];
const V12: Fingering = [true, true, false];
const V13: Fingering = [true, false, true];
const V23: Fingering = [false, true, true];
const V123: Fingering = [true, true, true];

// Key: "Note+Octave" (concert pitch), value: fingering for Bb trumpet
const FINGERING_MAP: Record<string, Fingering> = {
  // Low register (2nd partial and below)
  E3: V123, F3: V13, "F#3": V23, G3: V12,
  Ab3: V1, A3: V2, Bb3: OPEN,
  // 3rd partial
  B3: V123, C4: V13, "C#4": V23, D4: V12,
  Eb4: V1, E4: V2, F4: OPEN,
  // 4th partial
  "F#4": V23, G4: V12, Ab4: V1, A4: V2,
  Bb4: OPEN, B4: V12,
  // 5th partial
  C5: V1, "C#5": V2, D5: OPEN,
  // 6th partial
  Eb5: V1, E5: V2, F5: OPEN,
  // Upper register
  "F#5": V23, G5: V12, Ab5: V1, A5: V2,
  Bb5: OPEN, B5: V2, C6: OPEN,
};

export function getFingering(note: string, octave: number): Fingering | null {
  const key = `${note}${octave}`;
  return FINGERING_MAP[key] ?? null;
}
