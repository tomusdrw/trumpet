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
  transpose: number; // semitones; e.g. -2 for Bb trumpet
  onTransposeChange: (value: number) => void;
  onClear: () => void;
}

function accidentalSuffix(accidental: "natural" | "sharp" | "flat"): string {
  if (accidental === "sharp") return "#";
  if (accidental === "flat") return "b";
  return "";
}

function formatNoteName(
  concertMidi: number,
  transposeSemitones: number,
): string {
  // Display MIDI = concert − transpose (selector represents the instrument's
  // transposition; Bb = −2 means display is concert + 2).
  const displayMidi = concertMidi - transposeSemitones;
  const pitch = midiToStaffPitch(displayMidi);
  return `${pitch.letter}${accidentalSuffix(pitch.accidental)}`;
}

function concertFingering(concertMidi: number): Fingering | null {
  const pitch = midiToStaffPitch(concertMidi);
  const noteLabel = `${pitch.letter}${accidentalSuffix(pitch.accidental)}`;
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
