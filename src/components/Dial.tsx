import type { Component } from "solid-js";

interface DialProps {
  cents: number;
}

const Dial: Component<DialProps> = (props) => {
  const rotation = () => {
    const clamped = Math.max(-50, Math.min(50, props.cents));
    return (clamped / 50) * 90;
  };

  const zoneColor = () => {
    const absCents = Math.abs(props.cents);
    if (absCents <= 5) return "var(--accent-green)";
    if (absCents <= 15) return "var(--accent-yellow)";
    return "var(--accent-red)";
  };

  return (
    <div class="dial">
      <svg viewBox="0 0 300 180" width="300" height="180">
        {/* Red left */}
        <path
          d="M 30 160 A 130 130 0 0 1 65 52"
          fill="none"
          stroke="var(--accent-red)"
          stroke-width="10"
          stroke-linecap="round"
          opacity="0.8"
        />
        {/* Yellow left */}
        <path
          d="M 65 52 A 130 130 0 0 1 110 18"
          fill="none"
          stroke="var(--accent-yellow)"
          stroke-width="10"
          stroke-linecap="round"
          opacity="0.8"
        />
        {/* Green center */}
        <path
          d="M 110 18 A 130 130 0 0 1 190 18"
          fill="none"
          stroke="var(--accent-green)"
          stroke-width="10"
          stroke-linecap="round"
          opacity="0.8"
        />
        {/* Yellow right */}
        <path
          d="M 190 18 A 130 130 0 0 1 235 52"
          fill="none"
          stroke="var(--accent-yellow)"
          stroke-width="10"
          stroke-linecap="round"
          opacity="0.8"
        />
        {/* Red right */}
        <path
          d="M 235 52 A 130 130 0 0 1 270 160"
          fill="none"
          stroke="var(--accent-red)"
          stroke-width="10"
          stroke-linecap="round"
          opacity="0.8"
        />

        {/* Tick labels */}
        <text x="22" y="158" fill="var(--text-secondary)" font-size="12">-50</text>
        <text x="140" y="12" fill="var(--text-secondary)" font-size="12" text-anchor="middle">0</text>
        <text x="268" y="158" fill="var(--text-secondary)" font-size="12" text-anchor="end">+50</text>

        {/* Needle */}
        <g
          transform={`rotate(${rotation()}, 150, 160)`}
          style={{ transition: "transform 0.15s ease-out" }}
        >
          <line
            x1="150" y1="160" x2="150" y2="25"
            stroke="var(--text-primary)"
            stroke-width="3"
            stroke-linecap="round"
          />
        </g>

        {/* Center pivot */}
        <circle cx="150" cy="160" r="8" fill="var(--text-primary)" />
      </svg>

      <div class="dial-cents" style={{ color: zoneColor() }}>
        {props.cents > 0 ? "+" : ""}{props.cents} cents
      </div>
    </div>
  );
};

export default Dial;
