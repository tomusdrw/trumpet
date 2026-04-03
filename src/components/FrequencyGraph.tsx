import { onMount, onCleanup, type Component } from "solid-js";

interface FrequencyGraphProps {
  frequency: number | null;
  cents: number;
}

// Map frequency to Y position (log scale, trumpet range E3–C6)
const MIN_FREQ = 150; // just below E3 (~165 Hz)
const MAX_FREQ = 1100; // just above C6 (~1047 Hz)
const MIN_LOG = Math.log2(MIN_FREQ);
const MAX_LOG = Math.log2(MAX_FREQ);

function freqToY(freq: number, height: number): number {
  const log = Math.log2(Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq)));
  const ratio = (log - MIN_LOG) / (MAX_LOG - MIN_LOG);
  // Invert so high frequencies are at top
  return height * (1 - ratio);
}

function centsToColor(cents: number): string {
  const abs = Math.abs(cents);
  if (abs <= 5) return "rgba(46, 204, 113, 0.8)";
  if (abs <= 15) return "rgba(243, 156, 18, 0.8)";
  return "rgba(231, 76, 60, 0.8)";
}

// Note lines to draw as subtle horizontal guides
const NOTE_FREQUENCIES: [string, number][] = [
  ["E3", 164.81], ["A3", 220], ["Bb3", 233.08],
  ["C4", 261.63], ["F4", 349.23],
  ["Bb4", 466.16], ["D5", 587.33],
  ["F5", 698.46], ["Bb5", 932.33], ["C6", 1046.5],
];

const SCROLL_SPEED = 1.5; // pixels per frame

const FrequencyGraph: Component<FrequencyGraphProps> = (props) => {
  let canvas: HTMLCanvasElement | undefined;
  let animId: number | undefined;

  // Store recent frequency points as [x, freq, cents]
  let points: [number, number, number][] = [];
  let headX = 0;

  onMount(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas!.width;
      const h = canvas!.height;
      ctx.clearRect(0, 0, w, h);

      // Draw subtle note guide lines
      ctx.save();
      ctx.setLineDash([4, 8]);
      for (const [name, freq] of NOTE_FREQUENCIES) {
        const y = freqToY(freq, h);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();

        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.font = "11px sans-serif";
        ctx.fillText(name, 6, y - 4);
      }
      ctx.restore();

      // Scroll: shift all points left
      headX += SCROLL_SPEED;

      // Add current frequency
      if (props.frequency !== null) {
        points.push([headX, props.frequency, props.cents]);
      }

      // Remove points that scrolled off screen
      const cutoff = headX - w;
      while (points.length > 0 && points[0][0] < cutoff) {
        points.shift();
      }

      if (points.length < 2) {
        animId = requestAnimationFrame(draw);
        return;
      }

      // Draw the frequency line with glow
      ctx.save();
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // Draw segments colored by cents
      for (let i = 1; i < points.length; i++) {
        const [px, pf] = points[i - 1];
        const [cx, cf, cc] = points[i];

        const x1 = w - (headX - px);
        const y1 = freqToY(pf, h);
        const x2 = w - (headX - cx);
        const y2 = freqToY(cf, h);

        // Skip drawing segments that span too large a frequency gap (note change)
        if (Math.abs(12 * Math.log2(cf / pf)) > 3) continue;

        ctx.strokeStyle = centsToColor(cc);
        ctx.shadowColor = centsToColor(cc);
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      ctx.restore();

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);

    onCleanup(() => {
      window.removeEventListener("resize", resize);
      if (animId !== undefined) cancelAnimationFrame(animId);
    });
  });

  return <canvas ref={canvas} class="frequency-graph" />;
};

export default FrequencyGraph;
