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
  computeScrollX,
} from "../staff/staff-layout";
import type { CommittedEvent, GhostState } from "../staff/staff-engine";
import type { Target } from "../training/challenges";
import { centsZone, zoneColor } from "../audio/intonation";

interface StaffProps {
  committed: readonly CommittedEvent[];
  ghost: GhostState;
  targets?: readonly Target[];
  targetIndex?: number;
}

const LEFT_MARGIN = 80;
const NOTE_START = LEFT_MARGIN + LS * 2;
const NOTE_SPACING = LS * 4;
const VIEW_HEIGHT = 200;
const VIEW_WIDTH = 1000;
const LABEL_Y = STAFF_BOTTOM_LINE_Y + LS * 4;
const TARGET_OPACITY = 0.35;

function noteColor(worstCents: number): string {
  return zoneColor(centsZone(worstCents));
}

function formatCents(worstCents: number): string {
  const sign = worstCents > 0 ? "+" : "";
  return `${sign}${worstCents}¢`;
}

const Staff: Component<StaffProps> = (props) => {
  const eventX = (index: number) => NOTE_START + index * NOTE_SPACING;

  const remainingTargets = (): readonly Target[] => {
    const ts = props.targets;
    if (!ts) return [];
    return ts.slice(props.targetIndex ?? 0);
  };

  const scrollX = () =>
    computeScrollX({
      committedCount: props.committed.length,
      remainingTargets: remainingTargets().length,
      noteStart: NOTE_START,
      noteSpacing: NOTE_SPACING,
      viewWidth: VIEW_WIDTH,
      leftMargin: LEFT_MARGIN,
    });

  return (
    <svg
      class="staff"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
    >
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

      <text
        x={16}
        y={STAFF_CENTER_Y + LS * 2.2}
        fill="var(--text-primary)"
        font-size={`${LS * 5}`}
        font-family="serif"
      >
        {"\u{1D11E}"}
      </text>

      <defs>
        <clipPath id="staff-clip">
          <rect
            x={LEFT_MARGIN}
            y={0}
            width={VIEW_WIDTH - LEFT_MARGIN}
            height={VIEW_HEIGHT}
          />
        </clipPath>
      </defs>

      <g clip-path="url(#staff-clip)">
        <g transform={`translate(${-scrollX()}, 0)`}>
          {/* Committed events */}
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
                  <g
                    transform={`translate(${x}, ${QUARTER_REST_Y})`}
                    opacity="0.4"
                  >
                    <path d={quarterRestPath()} fill="var(--text-secondary)" />
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
              );
            }}
          </Show>

          {/* Target track (grayed-out upcoming targets) */}
          <For each={remainingTargets()}>
            {(target, j) => {
              const x = eventX(props.committed.length + 1 + j());
              if (target.kind === "rest") {
                return (
                  <g
                    transform={`translate(${x}, ${QUARTER_REST_Y})`}
                    opacity={TARGET_OPACITY}
                  >
                    <path d={quarterRestPath()} fill="var(--text-secondary)" />
                  </g>
                );
              }
              const displayMidi = target.midi + STAFF_TRANSPOSE_SEMITONES;
              const y = displayMidiToY(displayMidi);
              const accidental = accidentalPlacement(displayMidi);
              const ledgers = ledgerLineYs(displayMidi);
              return (
                <g opacity={TARGET_OPACITY}>
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
                        fill="var(--text-secondary)"
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
                    fill="var(--text-secondary)"
                    transform={`rotate(-20 ${x} ${y})`}
                  />
                </g>
              );
            }}
          </For>
        </g>
      </g>
    </svg>
  );
};

export default Staff;
