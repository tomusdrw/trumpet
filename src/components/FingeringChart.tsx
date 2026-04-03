import { type Component, For } from "solid-js";
import type { Fingering } from "../audio/fingerings";

interface FingeringChartProps {
  fingering: Fingering | null;
}

const VALVE_LABELS = ["1", "2", "3"];
const VALVE_X = [80, 150, 220];
const VALVE_Y = 50;
const VALVE_RADIUS = 28;

const FingeringChart: Component<FingeringChartProps> = (props) => {
  const isActive = () => props.fingering !== null;

  return (
    <div class="fingering-chart">
      <svg viewBox="0 0 300 110" width="300" height="110">
        <For each={VALVE_X}>
          {(x, i) => {
            const pressed = () => props.fingering?.[i()] ?? false;
            return (
              <g>
                <circle
                  cx={x}
                  cy={VALVE_Y}
                  r={VALVE_RADIUS}
                  fill={pressed() ? "var(--accent-green)" : "transparent"}
                  stroke={isActive() ? "var(--text-primary)" : "var(--text-secondary)"}
                  stroke-width="3"
                  opacity={isActive() ? 1 : 0.3}
                  style={{ transition: "fill 0.15s ease-out, opacity 0.15s ease-out" }}
                />
                <text
                  x={x}
                  y={VALVE_Y + 5}
                  text-anchor="middle"
                  fill={pressed() ? "var(--bg)" : isActive() ? "var(--text-primary)" : "var(--text-secondary)"}
                  font-size="18"
                  font-weight="600"
                  opacity={isActive() ? 1 : 0.3}
                >
                  {VALVE_LABELS[i()]}
                </text>
              </g>
            );
          }}
        </For>

        <text
          x="150"
          y="105"
          text-anchor="middle"
          fill="var(--text-secondary)"
          font-size="12"
        >
          {isActive()
            ? props.fingering!.some((v) => v)
              ? "Press highlighted valves"
              : "All valves open"
            : "Play a note..."}
        </text>
      </svg>
    </div>
  );
};

export default FingeringChart;
