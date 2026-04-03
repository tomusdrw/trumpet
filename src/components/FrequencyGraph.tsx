import { onMount, onCleanup, type Component } from "solid-js";

interface FrequencyGraphProps {
  frequency: number | null;
  cents: number;
}

const MIN_FREQ = 150;
const MAX_FREQ = 1100;
const MIN_LOG = Math.log2(MIN_FREQ);
const MAX_LOG = Math.log2(MAX_FREQ);

function freqToY(freq: number, height: number): number {
  const log = Math.log2(Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq)));
  const ratio = (log - MIN_LOG) / (MAX_LOG - MIN_LOG);
  return height * (1 - ratio);
}

function centsToRgb(cents: number): [number, number, number] {
  const abs = Math.abs(cents);
  if (abs <= 5) return [46, 204, 113];
  if (abs <= 15) return [243, 156, 18];
  return [231, 76, 60];
}

const NOTE_FREQUENCIES: [string, number][] = [
  ["E3", 164.81], ["A3", 220], ["Bb3", 233.08],
  ["C4", 261.63], ["F4", 349.23],
  ["Bb4", 466.16], ["D5", 587.33],
  ["F5", 698.46], ["Bb5", 932.33], ["C6", 1046.5],
];

const SCROLL_PX = 2; // pixels to shift left per frame

const FrequencyGraph: Component<FrequencyGraphProps> = (props) => {
  let canvas: HTMLCanvasElement | undefined;
  let animId: number | undefined;

  // Track previous Y so we can draw a connecting segment each frame
  let prevY: number | null = null;
  let prevCents = 0;

  onMount(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: false })!;

    // Offscreen canvas holds the scrolling line — we shift it left each frame
    const lineCanvas = document.createElement("canvas");
    const lineCtx = lineCanvas.getContext("2d")!;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas!.width = w;
      canvas!.height = h;
      lineCanvas.width = w;
      lineCanvas.height = h;
      prevY = null;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas!.width;
      const h = canvas!.height;
      const centerX = Math.floor(w * 0.5);

      // --- Scrolling line layer (offscreen) ---

      // Shift existing content left by copying onto itself
      lineCtx.globalCompositeOperation = "copy";
      lineCtx.drawImage(lineCanvas, -SCROLL_PX, 0);
      lineCtx.globalCompositeOperation = "source-over";

      // Clear everything to the right of the pen (future area)
      lineCtx.clearRect(centerX, 0, w - centerX, h);

      // Draw new segment at the pen position
      const hasSignal = props.frequency !== null;
      if (hasSignal) {
        const curY = freqToY(props.frequency!, h);
        const [r, g, b] = centsToRgb(props.cents);

        if (prevY !== null) {
          // Glow: thick transparent line (no shadowBlur needed)
          lineCtx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.25)`;
          lineCtx.lineWidth = 10;
          lineCtx.lineCap = "round";
          lineCtx.beginPath();
          lineCtx.moveTo(centerX - SCROLL_PX, prevY);
          lineCtx.lineTo(centerX, curY);
          lineCtx.stroke();

          // Core: thin opaque line
          lineCtx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
          lineCtx.lineWidth = 2.5;
          lineCtx.beginPath();
          lineCtx.moveTo(centerX - SCROLL_PX, prevY);
          lineCtx.lineTo(centerX, curY);
          lineCtx.stroke();
        }

        prevY = curY;
        prevCents = props.cents;
      } else {
        prevY = null;
      }

      // --- Composite onto main canvas ---
      ctx.clearRect(0, 0, w, h);

      // Note guide lines (static)
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

      // Scrolling line
      ctx.drawImage(lineCanvas, 0, 0);

      // Pen dot at center
      const dotY = prevY ?? h / 2;
      ctx.save();

      if (hasSignal && prevY !== null) {
        const [r, g, b] = centsToRgb(prevCents);
        const time = performance.now() / 1000;
        const pulse = 1 + 0.3 * Math.sin(time * 6);

        // Radial glow
        const glowR = 22 * pulse;
        const grad = ctx.createRadialGradient(centerX, dotY, 0, centerX, dotY, glowR);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.5)`);
        grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.1)`);
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(centerX, dotY, glowR, 0, Math.PI * 2);
        ctx.fill();

        // White core
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(centerX, dotY, 4 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Colored ring
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, dotY, 8 * pulse, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Idle dot
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.beginPath();
        ctx.arc(centerX, dotY, 4, 0, Math.PI * 2);
        ctx.fill();
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
