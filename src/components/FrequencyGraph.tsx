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
  return height * (1 - ratio);
}

function centsToColor(cents: number, alpha = 0.8): string {
  const abs = Math.abs(cents);
  if (abs <= 5) return `rgba(46, 204, 113, ${alpha})`;
  if (abs <= 15) return `rgba(243, 156, 18, ${alpha})`;
  return `rgba(231, 76, 60, ${alpha})`;
}

// Note lines to draw as subtle horizontal guides
const NOTE_FREQUENCIES: [string, number][] = [
  ["E3", 164.81], ["A3", 220], ["Bb3", 233.08],
  ["C4", 261.63], ["F4", 349.23],
  ["Bb4", 466.16], ["D5", 587.33],
  ["F5", 698.46], ["Bb5", 932.33], ["C6", 1046.5],
];

const SCROLL_SPEED = 1.5; // pixels per frame
// Drawing head sits at the center of the screen
const HEAD_POSITION = 0.5; // 0..1, fraction of width

const FrequencyGraph: Component<FrequencyGraphProps> = (props) => {
  let canvas: HTMLCanvasElement | undefined;
  let animId: number | undefined;

  // Store points as [x, freq, cents] — x is in "world" coordinates
  let points: [number, number, number][] = [];
  let headX = 0;
  let wasNull = true; // track silence gaps

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
      const headScreenX = w * HEAD_POSITION;

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

      const hasSignal = props.frequency !== null;

      // Always advance — the graph scrolls continuously
      headX += SCROLL_SPEED;

      if (hasSignal) {
        // If coming back from silence, insert a gap marker
        if (wasNull) {
          points.push([headX, -1, 0]); // gap sentinel
        }

        points.push([headX, props.frequency!, props.cents]);
        wasNull = false;
      } else {
        wasNull = true;
      }

      // Remove points that scrolled off the left edge
      const cutoff = headX - headScreenX;
      while (points.length > 0 && points[0][0] < cutoff) {
        points.shift();
      }

      // Convert world X to screen X — dot is fixed at center,
      // the entire graph slides left underneath it
      const toScreenX = (wx: number) => headScreenX - (headX - wx);

      // Draw the frequency line
      if (points.length >= 2) {
        ctx.save();
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        for (let i = 1; i < points.length; i++) {
          const [px, pf] = points[i - 1];
          const [cx, cf, cc] = points[i];

          // Skip gap sentinels and large frequency jumps
          if (pf < 0 || cf < 0) continue;
          if (Math.abs(12 * Math.log2(cf / pf)) > 3) continue;

          const x1 = toScreenX(px);
          const y1 = freqToY(pf, h);
          const x2 = toScreenX(cx);
          const y2 = freqToY(cf, h);

          ctx.strokeStyle = centsToColor(cc);
          ctx.shadowColor = centsToColor(cc);
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }

        ctx.restore();
      }

      // Draw the "drawing head" — always fixed at center
      {
        // Find the last real (non-gap) point for Y position
        let lastFreq = -1;
        let lastCents = 0;
        for (let i = points.length - 1; i >= 0; i--) {
          if (points[i][1] > 0) {
            lastFreq = points[i][1];
            lastCents = points[i][2];
            break;
          }
        }

        const dotX = headScreenX;
        const dotY = lastFreq > 0 ? freqToY(lastFreq, h) : h / 2;
        const time = performance.now() / 1000;

        ctx.save();

        if (hasSignal && lastFreq > 0) {
          // Active: pulsing glow
          const color = centsToColor(lastCents);
          const pulse = 1 + 0.3 * Math.sin(time * 6);

          const glowRadius = 24 * pulse;
          const gradient = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, glowRadius);
          gradient.addColorStop(0, centsToColor(lastCents, 0.6));
          gradient.addColorStop(0.5, centsToColor(lastCents, 0.15));
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(dotX, dotY, glowRadius, 0, Math.PI * 2);
          ctx.fill();

          ctx.shadowColor = color;
          ctx.shadowBlur = 20;
          ctx.fillStyle = "white";
          ctx.beginPath();
          ctx.arc(dotX, dotY, 5 * pulse, 0, Math.PI * 2);
          ctx.fill();

          ctx.shadowBlur = 0;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(dotX, dotY, 9 * pulse, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Idle: dim static dot
          ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
          ctx.beginPath();
          ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(dotX, dotY, 8, 0, Math.PI * 2);
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
