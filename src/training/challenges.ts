export type Target =
  | { kind: "note"; midi: number } // concert MIDI
  | { kind: "rest" };

export type ChallengeGroup = "long-tones" | "scales" | "melodies";

export interface Challenge {
  id: string;
  title: string;
  group: ChallengeGroup;
  targets: readonly Target[];
}

const n = (midi: number): Target => ({ kind: "note", midi });
const r: Target = { kind: "rest" };

export const CHALLENGES: readonly Challenge[] = [
  // ---- Long tones ----
  {
    id: "long-g4",
    title: "Long tone: G4",
    group: "long-tones",
    targets: [n(67), r, n(67), r, n(67)],
  },
  {
    id: "long-bb4",
    title: "Long tone: Bb4",
    group: "long-tones",
    targets: [n(70), r, n(70), r, n(70)],
  },
  {
    id: "long-c5",
    title: "Long tone: C5",
    group: "long-tones",
    targets: [n(72), r, n(72), r, n(72)],
  },

  // ---- Scales & arpeggios ----
  {
    id: "scale-bb-major",
    title: "Bb major scale (one octave)",
    group: "scales",
    targets: [n(70), n(72), n(74), n(75), n(77), n(79), n(81), n(82)],
  },
  {
    id: "scale-f-major",
    title: "F major scale (one octave)",
    group: "scales",
    targets: [n(65), n(67), n(69), n(70), n(72), n(74), n(76), n(77)],
  },
  {
    id: "arp-c-major",
    title: "C major arpeggio",
    group: "scales",
    targets: [n(72), n(76), n(79), n(84)],
  },
  {
    id: "arp-bb-major",
    title: "Bb major arpeggio",
    group: "scales",
    targets: [n(70), n(74), n(77), n(82)],
  },

  // ---- Melodies ----
  // Mary had a little lamb: E D C D E E E
  // With rests between the repeated Es.
  {
    id: "mary-lamb",
    title: "Mary Had a Little Lamb",
    group: "melodies",
    targets: [n(76), n(74), n(72), n(74), n(76), r, n(76), r, n(76)],
  },
  // Ode to Joy opening (simplified, no adjacent repeats):
  // E F G F E D C.
  {
    id: "ode-to-joy",
    title: "Ode to Joy (opening)",
    group: "melodies",
    targets: [n(76), n(77), n(79), n(77), n(76), n(74), n(72)],
  },
  // Twinkle Twinkle: C C G G A A G F F E E D D C
  // All repeats separated by rests.
  {
    id: "twinkle",
    title: "Twinkle, Twinkle, Little Star",
    group: "melodies",
    targets: [
      n(72), r, n(72), n(79), r, n(79), n(81), r, n(81), n(79),
      n(77), r, n(77), n(76), r, n(76), n(74), r, n(74), n(72),
    ],
  },
  // Amazing Grace opening: G C E C E D C A G (no adjacent repeats).
  {
    id: "amazing-grace",
    title: "Amazing Grace (opening)",
    group: "melodies",
    targets: [n(67), n(72), n(76), n(72), n(76), n(74), n(72), n(69), n(67)],
  },
];

export function noteTargetCount(c: Challenge): number {
  return c.targets.filter((t) => t.kind === "note").length;
}
