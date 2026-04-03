import { onMount, onCleanup, type Component } from "solid-js";

interface FrequencyGraphProps {
  frequency: number | null;
  cents: number;
}

// Map frequency to Y position (log scale, trumpet range E3–C6)
const MIN_FREQ = 150;
const MAX_FREQ = 1100;
const MIN_LOG = Math.log2(MIN_FREQ);
const MAX_LOG = Math.log2(MAX_FREQ);

function freqToY(freq: number, height: number): number {
  const log = Math.log2(Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq)));
  const ratio = (log - MIN_LOG) / (MAX_LOG - MIN_LOG);
  return height * (1 - ratio);
}

function centsToColor(cents: number, alpha = 0.8): string {
  const abs = Math.abs(cents);
  if (abs <= 5) return `rgba(46, 204, 113, ${alpha})`;
  if (abs <= 15) return `rgba(243, 156, 18, ${alpha})`;
  return `rgba(231, 76, 60, ${alpha})`;
}

const NOTE_FREQUENCIES: [string, number][] = [
  ["E3", 164.81], ["A3", 220], ["Bb3", 233.08],
  ["C4", 261.63], ["F4", 349.23],
  ["Bb4", 466.16], ["D5", 587.33],
  ["F5", 698.46], ["Bb5", 932.33], ["C6", 1046.5],
];

const SCROLL_SPEED = 1.5;

// Point stored in screen coordinates. freq < 0 means gap.
interface GraphPoint {
  x: number;
  freq: number;
  cents: number;
}

const FrequencyGraph: Component<FrequencyGraphProps> = (props) => {
  let canvas: HTMLCanvasElement | undefined;
  let animId: number | undefined;

  let points: GraphPoint[] = [];
  let wasNull = true;

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
      const centerX = w * 0.5;

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

      // 1. Shift all existing points left
      for (const p of points) {
        p.x -= SCROLL_SPEED;
      }

      // 2. Remove points that fell off the left edge
      while (points.length > 0 && points[0].x < -10) {
        points.shift();
      }

      // 3. Add new point at the center if there's signal
      const hasSignal = props.frequency !== null;
      if (hasSignal) {
        if (wasNull) {
          // Insert gap marker so we don't connect across silence
          points.push({ x: centerX, freq: -1, cents: 0 });
        }
        points.push({ x: centerX, freq: props.frequency!, cents: props.cents });
        wasNull = false;
      } else {
        wasNull = true;
      }

      // 4. Draw the line segments
      if (points.length >= 2) {
        ctx.save();
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];

          // Skip gaps and large frequency jumps
          if (prev.freq < 0 || curr.freq < 0) continue;
          if (Math.abs(12 * Math.log2(curr.freq / prev.freq)) > 3) continue;

          const x1 = prev.x;
          const y1 = freqToY(prev.freq, h);
          const x2 = curr.x;
          const y2 = freqToY(curr.freq, h);

          ctx.strokeStyle = centsToColor(curr.cents);
          ctx.shadowColor = centsToColor(curr.cents);
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }

        ctx.restore();
      }

      // 5. Draw the fixed center dot (the "pen")
      {
        // Find last real point for Y position
        let dotY = h / 2;
        let dotCents = 0;
        let dotActive = false;
        for (let i = points.length - 1; i >= 0; i--) {
          if (points[i].freq > 0) {
            dotY = freqToY(points[i].freq, h);
            dotCents = points[i].cents;
            dotActive = hasSignal;
            break;
          }
        }

        ctx.save();

        if (dotActive) {
          const color = centsToColor(dotCents);
          const time = performance.now() / 1000;
          const pulse = 1 + 0.3 * Math.sin(time * 6);

          // Radial glow
          const glowRadius = 24 * pulse;
          const gradient = ctx.createRadialGradient(centerX, dotY, 0, centerX, dotY, glowRadius);
          gradient.addColorStop(0, centsToColor(dotCents, 0.6));
          gradient.addColorStop(0.5, centsToColor(dotCents, 0.15));
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(centerX, dotY, glowRadius, 0, Math.PI * 2);
          ctx.fill();

          // White core
          ctx.shadowColor = color;
          ctx.shadowBlur = 20;
          ctx.fillStyle = "white";
          ctx.beginPath();
          ctx.arc(centerX, dotY, 5 * pulse, 0, Math.PI * 2);
          ctx.fill();

          // Colored ring
          ctx.shadowBlur = 0;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(centerX, dotY, 9 * pulse, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Idle: dim dot
          ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
          ctx.beginPath();
          ctx.arc(centerX, dotY, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(centerX, dotY, 8, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.restore();
      }

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
