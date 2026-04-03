import type { Component } from "solid-js";
import Dial from "./Dial";
import FingeringChart from "./FingeringChart";
import { frequencyToNote, type NoteInfo } from "../audio/notes";
import { getFingering, type Fingering } from "../audio/fingerings";

interface TunerProps {
  frequency: number | null;
}

const Tuner: Component<TunerProps> = (props) => {
  const noteInfo = (): NoteInfo | null => {
    if (props.frequency === null) return null;
    return frequencyToNote(props.frequency);
  };

  const fingering = (): Fingering | null => {
    const info = noteInfo();
    if (!info) return null;
    return getFingering(info.note, info.octave);
  };

  return (
    <div class="tuner">
      <div class="tuner-note">
        <span class="tuner-note-name">
          {noteInfo()?.note ?? "\u2014"}
          <span class="tuner-note-octave">{noteInfo()?.octave ?? ""}</span>
        </span>
      </div>
      <div class="tuner-frequency">
        {props.frequency !== null
          ? `${props.frequency.toFixed(1)} Hz`
          : "Listening..."}
      </div>

      <Dial cents={noteInfo()?.cents ?? 0} />
      <FingeringChart fingering={fingering()} />
    </div>
  );
};

export default Tuner;
