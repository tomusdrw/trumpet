import type { Component } from "solid-js";
import { centsZone, zoneColor } from "../audio/intonation";

interface HorizontalDialProps {
  cents: number | null;
}

const HorizontalDial: Component<HorizontalDialProps> = (props) => {
  const clampedCents = () => {
    const c = props.cents;
    if (c === null) return 0;
    return Math.max(-50, Math.min(50, c));
  };

  const tickLeftPercent = () => ((clampedCents() + 50) / 100) * 100;

  const labelColor = () => {
    if (props.cents === null) return "var(--text-secondary)";
    return zoneColor(centsZone(props.cents));
  };

  const labelText = () => {
    if (props.cents === null) return "—";
    const sign = props.cents > 0 ? "+" : "";
    return `${sign}${Math.round(props.cents)}¢`;
  };

  return (
    <div class="horizontal-dial">
      <div class="horizontal-dial-bar">
        <div
          class="horizontal-dial-tick"
          style={{ left: `${tickLeftPercent()}%` }}
        />
      </div>
      <div class="horizontal-dial-label" style={{ color: labelColor() }}>
        {labelText()}
      </div>
    </div>
  );
};

export default HorizontalDial;
