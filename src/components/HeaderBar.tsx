import type { Component } from "solid-js";
import HorizontalDial from "./HorizontalDial";
import FingeringChart from "./FingeringChart";
import { midiToStaffPitch } from "../audio/notes";
import { getFingering, type Fingering } from "../audio/fingerings";
import type { CommittedEvent } from "../staff/staff-engine";

interface HeaderBarProps {
  frequency: number | null;
  cents: number | null;
  ghost: CommittedEvent | null;
  transpose: number;
  onClear: () => void;
  onSettingsOpen: () => void;
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

  return (
    <div class="header-bar">
      <div class="header-note">
        <span class="header-note-name">{noteName()}</span>
        {octave() !== null && (
          <span class="header-note-octave">{octave()}</span>
        )}
      </div>
      <div class="header-freq">{freqText()}</div>
      <div class="header-dial">
        <HorizontalDial cents={props.cents} />
      </div>
      <div class="header-fingering">
        <FingeringChart fingering={fingering()} />
      </div>
      <button class="header-icon-btn" type="button" onClick={props.onSettingsOpen} title="Settings">
        ⚙
      </button>
      <button class="header-clear" type="button" onClick={props.onClear}>
        Clear
      </button>
    </div>
  );
};

export default HeaderBar;
