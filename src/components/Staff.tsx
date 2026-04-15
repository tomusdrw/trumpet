import { type Component, For, Show } from "solid-js";
import {
  LS,
  STAFF_CENTER_Y,
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

const LEFT_MARGIN = 80; // room for the clef
const NOTE_SPACING = LS * 4; // horizontal spacing between committed events
const VIEW_HEIGHT = 200;
const VIEW_WIDTH = 1000; // logical viewBox width; the <svg> scales
const LABEL_Y = STAFF_BOTTOM_LINE_Y + LS * 4;
const PROGRESS_Y = STAFF_BOTTOM_LINE_Y + LS * 3;
const PROGRESS_HALF_WIDTH = LS * 1.2;

function noteColor(worstCents: number): string {
  return zoneColor(centsZone(worstCents));
}

function formatCents(worstCents: number): string {
  const sign = worstCents > 0 ? "+" : "";
  return `${sign}${worstCents}¢`;
}

const Staff: Component<StaffProps> = (props) => {
  const eventX = (index: number) => LEFT_MARGIN + index * NOTE_SPACING;

  const scrollX = () => {
    const lastX = eventX(props.committed.length + 1);
    const overflow = lastX - (VIEW_WIDTH - LEFT_MARGIN / 2);
    return overflow > 0 ? overflow : 0;
  };

  return (
    <svg
      class="staff"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Five staff lines */}
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

      {/* Treble clef */}
      <text
        x={16}
        y={STAFF_CENTER_Y + LS * 2.2}
        fill="var(--text-primary)"
        font-size={`${LS * 5}`}
        font-family="serif"
      >
        {"\u{1D11E}"}
      </text>

      {/* Scrolling group for committed + ghost */}
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
                      font-size={`${LS * 1.4}`}
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
                  font-size={`${LS * 0.75}`}
                  text-anchor="middle"
                >
                  {formatCents(event.worstCents)}
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
                  <g
                    transform={`translate(${x}, ${QUARTER_REST_Y})`}
                    opacity="0.4"
                  >
                    <path d={quarterRestPath()} fill="var(--text-secondary)" />
                  </g>
                  <rect
                    x={x - PROGRESS_HALF_WIDTH}
                    y={PROGRESS_Y}
                    width={PROGRESS_HALF_WIDTH * 2}
                    height={3}
                    fill="var(--text-secondary)"
                    opacity="0.15"
                  />
                  <rect
                    x={x - PROGRESS_HALF_WIDTH}
                    y={PROGRESS_Y}
                    width={PROGRESS_HALF_WIDTH * 2 * props.ghost.progress}
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
              <g>
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
                        font-size={`${LS * 1.4}`}
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
                </g>
                <rect
                  x={x - PROGRESS_HALF_WIDTH}
                  y={PROGRESS_Y}
                  width={PROGRESS_HALF_WIDTH * 2}
                  height={3}
                  fill="var(--text-secondary)"
                  opacity="0.15"
                />
                <rect
                  x={x - PROGRESS_HALF_WIDTH}
                  y={PROGRESS_Y}
                  width={PROGRESS_HALF_WIDTH * 2 * props.ghost.progress}
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
