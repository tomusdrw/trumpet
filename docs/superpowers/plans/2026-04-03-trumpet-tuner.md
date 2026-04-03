# Trumpet Tuner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time web-based trumpet tuner with dial gauge and fingering chart.

**Architecture:** SolidJS app with two pure-logic audio modules (note math, pitch detection) and four UI components (dial, fingering chart, theme toggle, tuner wrapper). Mic input flows through Web Audio API → autocorrelation → SolidJS signals → reactive UI.

**Tech Stack:** SolidJS, TypeScript, Vite, Vitest (unit tests for pure logic modules)

---

## File Structure

```
src/
  audio/
    notes.ts              — frequency↔note conversion, cents calculation
    notes.test.ts         — unit tests for notes module
    fingerings.ts         — trumpet valve lookup table
    fingerings.test.ts    — unit tests for fingerings module
    pitch-detector.ts     — Web Audio API mic setup + autocorrelation
  components/
    Dial.tsx              — SVG needle gauge
    FingeringChart.tsx    — SVG trumpet valve diagram
    ThemeToggle.tsx       — dark/light/system cycle button
    Tuner.tsx             — orchestrates Dial + FingeringChart + note display
  App.tsx                 — mic permission flow, layout shell
  index.tsx               — mount point
  index.css               — CSS custom properties for themes, global layout
index.html                — Vite entry HTML
package.json
tsconfig.json
vite.config.ts
vitest.config.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/index.tsx`, `src/App.tsx`, `src/index.css`

- [ ] **Step 1: Scaffold Vite + SolidJS project**

```bash
cd /Users/tomusdrw/workspace/tuner
npx degit solidjs/templates/ts .
npm install
```

- [ ] **Step 2: Add vitest**

```bash
npm install -D vitest
```

- [ ] **Step 3: Create vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 4: Add test script to package.json**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Verify dev server starts**

```bash
npm run dev
```

Expected: Vite dev server starts on localhost, shows SolidJS template page.

- [ ] **Step 6: Replace App.tsx with minimal shell**

Replace `src/App.tsx` with:

```tsx
import type { Component } from "solid-js";

const App: Component = () => {
  return (
    <div class="app">
      <h1>Trumpet Tuner</h1>
    </div>
  );
};

export default App;
```

- [ ] **Step 7: Replace index.css with empty theme skeleton**

Replace `src/index.css` with:

```css
:root {
  --bg: #1a1a2e;
  --bg-surface: #16213e;
  --text-primary: #ffffff;
  --text-secondary: #8892a4;
  --accent-green: #2ecc71;
  --accent-yellow: #f39c12;
  --accent-red: #e74c3c;
}

:root.light {
  --bg: #f5f5f5;
  --bg-surface: #ffffff;
  --text-primary: #1a1a2e;
  --text-secondary: #666;
  --accent-green: #27ae60;
  --accent-yellow: #e67e22;
  --accent-red: #c0392b;
}

@media (prefers-color-scheme: light) {
  :root:not(.dark) {
    --bg: #f5f5f5;
    --bg-surface: #ffffff;
    --text-primary: #1a1a2e;
    --text-secondary: #666;
    --accent-green: #27ae60;
    --accent-yellow: #e67e22;
    --accent-red: #c0392b;
  }
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text-primary);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app {
  text-align: center;
  max-width: 480px;
  width: 100%;
  padding: 20px;
}
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold SolidJS + Vite + Vitest project with theme CSS"
```

---

### Task 2: Notes Module (frequency ↔ note conversion)

**Files:**
- Create: `src/audio/notes.ts`, `src/audio/notes.test.ts`

- [ ] **Step 1: Write failing tests for `frequencyToNote`**

Create `src/audio/notes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { frequencyToNote, type NoteInfo } from "./notes";

describe("frequencyToNote", () => {
  it("returns A4 for 440 Hz with 0 cents", () => {
    const result = frequencyToNote(440);
    expect(result.note).toBe("A");
    expect(result.octave).toBe(4);
    expect(result.cents).toBe(0);
  });

  it("returns A4 for frequencies slightly above 440 Hz", () => {
    const result = frequencyToNote(442);
    expect(result.note).toBe("A");
    expect(result.octave).toBe(4);
    expect(result.cents).toBeGreaterThan(0);
    expect(result.cents).toBeLessThan(10);
  });

  it("returns A4 for frequencies slightly below 440 Hz", () => {
    const result = frequencyToNote(438);
    expect(result.note).toBe("A");
    expect(result.octave).toBe(4);
    expect(result.cents).toBeLessThan(0);
    expect(result.cents).toBeGreaterThan(-10);
  });

  it("returns Bb4 for ~466.16 Hz", () => {
    const result = frequencyToNote(466.16);
    expect(result.note).toBe("Bb");
    expect(result.octave).toBe(4);
    expect(Math.abs(result.cents)).toBeLessThan(2);
  });

  it("returns C4 (middle C) for ~261.63 Hz", () => {
    const result = frequencyToNote(261.63);
    expect(result.note).toBe("C");
    expect(result.octave).toBe(4);
    expect(Math.abs(result.cents)).toBeLessThan(2);
  });

  it("returns null for frequency 0", () => {
    const result = frequencyToNote(0);
    expect(result).toBeNull();
  });

  it("returns null for negative frequency", () => {
    const result = frequencyToNote(-100);
    expect(result).toBeNull();
  });

  it("returns cents clamped to -50..+50 range", () => {
    // A frequency exactly between two notes would be ~49 cents off
    const result = frequencyToNote(440);
    expect(result!.cents).toBeGreaterThanOrEqual(-50);
    expect(result!.cents).toBeLessThanOrEqual(50);
  });

  it("uses flats for enharmonic notes (Bb not A#, Eb not D#)", () => {
    // Bb4 = 466.16 Hz
    const bb = frequencyToNote(466.16);
    expect(bb!.note).toBe("Bb");

    // Eb4 = 311.13 Hz
    const eb = frequencyToNote(311.13);
    expect(eb!.note).toBe("Eb");

    // Ab4 = 415.30 Hz
    const ab = frequencyToNote(415.30);
    expect(ab!.note).toBe("Ab");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/audio/notes.test.ts
```

Expected: FAIL — module `./notes` does not exist.

- [ ] **Step 3: Implement `frequencyToNote`**

Create `src/audio/notes.ts`:

```ts
export interface NoteInfo {
  note: string;
  octave: number;
  frequency: number;
  cents: number;
}

// Using flats to match trumpet convention (Bb trumpet)
const NOTE_NAMES = [
  "C", "C#", "D", "Eb", "E", "F",
  "F#", "G", "Ab", "A", "Bb", "B",
] as const;

const A4_FREQUENCY = 440;
const A4_MIDI = 69;

export function frequencyToNote(frequency: number): NoteInfo | null {
  if (frequency <= 0) return null;

  // Number of half steps from A4
  const halfSteps = 12 * Math.log2(frequency / A4_FREQUENCY);
  const midi = Math.round(halfSteps) + A4_MIDI;
  const cents = Math.round((halfSteps - Math.round(halfSteps)) * 100);

  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;

  return {
    note: NOTE_NAMES[noteIndex],
    octave,
    frequency,
    cents,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/audio/notes.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audio/notes.ts src/audio/notes.test.ts
git commit -m "feat: add frequency-to-note conversion module with tests"
```

---

### Task 3: Fingerings Module

**Files:**
- Create: `src/audio/fingerings.ts`, `src/audio/fingerings.test.ts`

- [ ] **Step 1: Write failing tests for `getFingeringForNote`**

Create `src/audio/fingerings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getFingering, type Fingering } from "./fingerings";

describe("getFingering", () => {
  it("returns open for Bb3", () => {
    expect(getFingering("Bb", 3)).toEqual([false, false, false]);
  });

  it("returns [true, true, true] for E3", () => {
    expect(getFingering("E", 3)).toEqual([true, true, true]);
  });

  it("returns open for C6", () => {
    expect(getFingering("C", 6)).toEqual([false, false, false]);
  });

  it("returns [true, false, true] for F3", () => {
    expect(getFingering("F", 3)).toEqual([true, false, true]);
  });

  it("returns [false, true, false] for A4", () => {
    expect(getFingering("A", 4)).toEqual([false, true, false]);
  });

  it("returns open for D5", () => {
    expect(getFingering("D", 5)).toEqual([false, false, false]);
  });

  it("returns null for notes outside trumpet range", () => {
    expect(getFingering("C", 3)).toBeNull();
    expect(getFingering("D", 6)).toBeNull();
  });

  it("returns [true, false, false] for C5", () => {
    expect(getFingering("C", 5)).toEqual([true, false, false]);
  });

  it("returns [false, true, false] for C#5", () => {
    expect(getFingering("C#", 5)).toEqual([false, true, false]);
  });

  it("handles enharmonic Ab/G# correctly", () => {
    expect(getFingering("Ab", 4)).toEqual([true, false, false]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/audio/fingerings.test.ts
```

Expected: FAIL — module `./fingerings` does not exist.

- [ ] **Step 3: Implement fingerings lookup**

Create `src/audio/fingerings.ts`:

```ts
// [valve1, valve2, valve3] — true = pressed
export type Fingering = [boolean, boolean, boolean];

const OPEN: Fingering = [false, false, false];
const V1: Fingering = [true, false, false];
const V2: Fingering = [false, true, false];
const V3: Fingering = [false, false, true];
const V12: Fingering = [true, true, false];
const V13: Fingering = [true, false, true];
const V23: Fingering = [false, true, true];
const V123: Fingering = [true, true, true];

// Key: "Note+Octave" (concert pitch), value: fingering for Bb trumpet
const FINGERING_MAP: Record<string, Fingering> = {
  // Low register (2nd partial and below)
  E3: V123, F3: V13, "F#3": V23, G3: V12,
  Ab3: V1, A3: V2, Bb3: OPEN,
  // 3rd partial
  B3: V123, C4: V13, "C#4": V23, D4: V12,
  Eb4: V1, E4: V2, F4: OPEN,
  // 4th partial
  "F#4": V23, G4: V12, Ab4: V1, A4: V2,
  Bb4: OPEN, B4: V12,
  // 5th partial
  C5: V1, "C#5": V2, D5: OPEN,
  // 6th partial
  Eb5: V1, E5: V2, F5: OPEN,
  // Upper register
  "F#5": V23, G5: V12, Ab5: V1, A5: V2,
  Bb5: OPEN, B5: V2, C6: OPEN,
};

export function getFingering(note: string, octave: number): Fingering | null {
  const key = `${note}${octave}`;
  return FINGERING_MAP[key] ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/audio/fingerings.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audio/fingerings.ts src/audio/fingerings.test.ts
git commit -m "feat: add trumpet fingering lookup table with tests"
```

---

### Task 4: Pitch Detector (autocorrelation + Web Audio)

**Files:**
- Create: `src/audio/pitch-detector.ts`

This module interfaces with browser APIs (Web Audio, getUserMedia) so it is not unit-tested. The autocorrelation math is embedded directly — it's a single function operating on a Float32Array.

- [ ] **Step 1: Implement pitch detector**

Create `src/audio/pitch-detector.ts`:

```ts
export interface PitchDetector {
  start(): Promise<void>;
  stop(): void;
  getFrequency(): number | null;
}

const BUFFER_SIZE = 2048;
const MIN_CORRELATION = 0.9;
// Trumpet range: E3 (~165 Hz) to C6 (~1047 Hz)
// At 44100 Hz sample rate: period for 1047 Hz = ~42 samples, period for 165 Hz = ~267 samples
const MIN_PERIOD = 10; // well above max trumpet freq
const MAX_PERIOD = 500; // well below min trumpet freq

function autocorrelate(buffer: Float32Array, sampleRate: number): number | null {
  // Check if there's enough signal (RMS)
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return null; // too quiet

  // Autocorrelation
  let bestCorrelation = 0;
  let bestPeriod = 0;

  for (let period = MIN_PERIOD; period < MAX_PERIOD && period < buffer.length / 2; period++) {
    let correlation = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < buffer.length - period; i++) {
      correlation += buffer[i] * buffer[i + period];
      norm1 += buffer[i] * buffer[i];
      norm2 += buffer[i + period] * buffer[i + period];
    }

    // Normalized correlation
    const norm = Math.sqrt(norm1 * norm2);
    if (norm === 0) continue;
    correlation /= norm;

    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestPeriod = period;
    }
  }

  if (bestCorrelation < MIN_CORRELATION) return null;
  if (bestPeriod === 0) return null;

  // Parabolic interpolation for sub-sample accuracy
  const prev = bestPeriod > 0 ? correlationAt(buffer, bestPeriod - 1) : 0;
  const curr = correlationAt(buffer, bestPeriod);
  const next = correlationAt(buffer, bestPeriod + 1);
  const shift = (prev - next) / (2 * (prev - 2 * curr + next));
  const refinedPeriod = bestPeriod + (isFinite(shift) ? shift : 0);

  return sampleRate / refinedPeriod;
}

function correlationAt(buffer: Float32Array, period: number): number {
  let correlation = 0;
  for (let i = 0; i < buffer.length - period; i++) {
    correlation += buffer[i] * buffer[i + period];
  }
  return correlation;
}

export function createPitchDetector(): PitchDetector {
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let mediaStream: MediaStream | null = null;
  let buffer: Float32Array | null = null;

  return {
    async start() {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext();
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = BUFFER_SIZE * 2;
      buffer = new Float32Array(BUFFER_SIZE);

      const source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(analyserNode);
    },

    stop() {
      mediaStream?.getTracks().forEach((t) => t.stop());
      audioContext?.close();
      audioContext = null;
      analyserNode = null;
      mediaStream = null;
      buffer = null;
    },

    getFrequency(): number | null {
      if (!analyserNode || !buffer || !audioContext) return null;
      analyserNode.getFloatTimeDomainData(buffer);
      return autocorrelate(buffer, audioContext.sampleRate);
    },
  };
}
```

- [ ] **Step 2: Verify the project still compiles**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/audio/pitch-detector.ts
git commit -m "feat: add autocorrelation-based pitch detector using Web Audio API"
```

---

### Task 5: Dial Component (SVG needle gauge)

**Files:**
- Create: `src/components/Dial.tsx`

- [ ] **Step 1: Implement Dial component**

Create `src/components/Dial.tsx`:

```tsx
import type { Component } from "solid-js";

interface DialProps {
  cents: number; // -50 to +50
}

const Dial: Component<DialProps> = (props) => {
  // Map -50..+50 cents to -90..+90 degrees
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
        {/* Background arc segments */}
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

        {/* Tick marks */}
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

      {/* Cents readout */}
      <div class="dial-cents" style={{ color: zoneColor() }}>
        {props.cents > 0 ? "+" : ""}{props.cents} cents
      </div>
    </div>
  );
};

export default Dial;
```

- [ ] **Step 2: Add dial styles to index.css**

Append to `src/index.css`:

```css
.dial {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 20px 0;
}

.dial svg {
  display: block;
}

.dial-cents {
  font-size: 24px;
  font-weight: 600;
  margin-top: -10px;
}
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/Dial.tsx src/index.css
git commit -m "feat: add SVG dial gauge component"
```

---

### Task 6: Fingering Chart Component

**Files:**
- Create: `src/components/FingeringChart.tsx`

- [ ] **Step 1: Implement FingeringChart component**

Create `src/components/FingeringChart.tsx`:

```tsx
import type { Component } from "solid-js";
import type { Fingering } from "../audio/fingerings";

interface FingeringChartProps {
  fingering: Fingering | null;
}

const VALVE_LABELS = ["1", "2", "3"];
const VALVE_X = [80, 150, 220]; // x positions for 3 valves
const VALVE_Y = 50;
const VALVE_RADIUS = 28;

const FingeringChart: Component<FingeringChartProps> = (props) => {
  const isActive = () => props.fingering !== null;

  return (
    <div class="fingering-chart">
      <svg viewBox="0 0 300 110" width="300" height="110">
        {VALVE_X.map((x, i) => {
          const pressed = () => props.fingering?.[i] ?? false;
          return (
            <g>
              {/* Valve body */}
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
              {/* Valve number */}
              <text
                x={x}
                y={VALVE_Y + 5}
                text-anchor="middle"
                fill={pressed() ? "var(--bg)" : isActive() ? "var(--text-primary)" : "var(--text-secondary)"}
                font-size="18"
                font-weight="600"
                opacity={isActive() ? 1 : 0.3}
              >
                {VALVE_LABELS[i]}
              </text>
            </g>
          );
        })}

        {/* Label */}
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
```

- [ ] **Step 2: Add fingering chart styles to index.css**

Append to `src/index.css`:

```css
.fingering-chart {
  display: flex;
  justify-content: center;
  margin: 10px 0;
}
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/FingeringChart.tsx src/index.css
git commit -m "feat: add trumpet fingering chart SVG component"
```

---

### Task 7: Theme Toggle Component

**Files:**
- Create: `src/components/ThemeToggle.tsx`

- [ ] **Step 1: Implement ThemeToggle component**

Create `src/components/ThemeToggle.tsx`:

```tsx
import { createSignal, type Component } from "solid-js";

type ThemeMode = "system" | "light" | "dark";
const CYCLE: ThemeMode[] = ["system", "light", "dark"];
const ICONS: Record<ThemeMode, string> = {
  system: "\u25D1", // ◑ half circle
  light: "\u2600",  // ☀
  dark: "\u263E",   // ☾
};

function getInitialTheme(): ThemeMode {
  return (localStorage.getItem("theme") as ThemeMode) ?? "system";
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (mode !== "system") {
    root.classList.add(mode);
  }
  localStorage.setItem("theme", mode);
}

const ThemeToggle: Component = () => {
  const [mode, setMode] = createSignal<ThemeMode>(getInitialTheme());

  // Apply on mount
  applyTheme(mode());

  const cycle = () => {
    const next = CYCLE[(CYCLE.indexOf(mode()) + 1) % CYCLE.length];
    setMode(next);
    applyTheme(next);
  };

  return (
    <button class="theme-toggle" onClick={cycle} title={`Theme: ${mode()}`}>
      {ICONS[mode()]}
    </button>
  );
};

export default ThemeToggle;
```

- [ ] **Step 2: Add theme toggle styles to index.css**

Append to `src/index.css`:

```css
.theme-toggle {
  position: fixed;
  top: 16px;
  right: 16px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--text-secondary);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.theme-toggle:hover {
  background: var(--text-secondary);
}
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ThemeToggle.tsx src/index.css
git commit -m "feat: add theme toggle component with system/light/dark cycling"
```

---

### Task 8: Tuner Component (orchestrates all pieces)

**Files:**
- Create: `src/components/Tuner.tsx`

- [ ] **Step 1: Implement Tuner component**

Create `src/components/Tuner.tsx`:

```tsx
import { type Component } from "solid-js";
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
      {/* Note display */}
      <div class="tuner-note">
        <span class="tuner-note-name">
          {noteInfo()?.note ?? "—"}
          <span class="tuner-note-octave">{noteInfo()?.octave ?? ""}</span>
        </span>
      </div>
      <div class="tuner-frequency">
        {props.frequency !== null
          ? `${props.frequency.toFixed(1)} Hz`
          : "Listening..."}
      </div>

      {/* Dial gauge */}
      <Dial cents={noteInfo()?.cents ?? 0} />

      {/* Fingering chart */}
      <FingeringChart fingering={fingering()} />
    </div>
  );
};

export default Tuner;
```

- [ ] **Step 2: Add tuner styles to index.css**

Append to `src/index.css`:

```css
.tuner {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.tuner-note {
  margin-bottom: 4px;
}

.tuner-note-name {
  font-size: 80px;
  font-weight: 700;
  line-height: 1;
}

.tuner-note-octave {
  font-size: 32px;
  font-weight: 400;
  vertical-align: sub;
  color: var(--text-secondary);
}

.tuner-frequency {
  font-size: 16px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/Tuner.tsx src/index.css
git commit -m "feat: add Tuner component wiring dial, fingering, and note display"
```

---

### Task 9: App Component (mic permission + integration)

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement full App with mic permission flow**

Replace `src/App.tsx` with:

```tsx
import { createSignal, onCleanup, type Component } from "solid-js";
import ThemeToggle from "./components/ThemeToggle";
import Tuner from "./components/Tuner";
import { createPitchDetector } from "./audio/pitch-detector";

const App: Component = () => {
  const [started, setStarted] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [frequency, setFrequency] = createSignal<number | null>(null);

  const detector = createPitchDetector();
  let animationId: number | undefined;

  const startListening = async () => {
    try {
      await detector.start();
      setStarted(true);
      setError(null);

      const tick = () => {
        setFrequency(detector.getFrequency());
        animationId = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError(
          "Microphone access denied. Please allow microphone access in your browser settings and reload."
        );
      } else {
        setError("Could not access microphone. Please check your device settings.");
      }
    }
  };

  onCleanup(() => {
    if (animationId !== undefined) cancelAnimationFrame(animationId);
    detector.stop();
  });

  return (
    <div class="app">
      <ThemeToggle />

      {!started() && !error() && (
        <div class="start-screen">
          <h1>Trumpet Tuner</h1>
          <p class="start-subtitle">
            Play a note and see how in-tune you are
          </p>
          <button class="start-button" onClick={startListening}>
            Start Tuning
          </button>
        </div>
      )}

      {error() && (
        <div class="error-screen">
          <h1>Trumpet Tuner</h1>
          <p class="error-message">{error()}</p>
          <button class="start-button" onClick={startListening}>
            Try Again
          </button>
        </div>
      )}

      {started() && <Tuner frequency={frequency()} />}
    </div>
  );
};

export default App;
```

- [ ] **Step 2: Add start screen and error styles to index.css**

Append to `src/index.css`:

```css
.start-screen,
.error-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.start-subtitle {
  color: var(--text-secondary);
  font-size: 18px;
}

.start-button {
  margin-top: 20px;
  padding: 16px 48px;
  font-size: 20px;
  font-weight: 600;
  background: var(--accent-green);
  color: #fff;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.start-button:hover {
  opacity: 0.85;
}

.error-message {
  color: var(--accent-red);
  font-size: 16px;
  max-width: 360px;
  line-height: 1.5;
}
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Manual smoke test**

```bash
npm run dev
```

Open the URL in browser. Verify:
1. Start screen shows with "Start Tuning" button
2. Theme toggle works (cycles through system/light/dark)
3. Clicking "Start Tuning" requests mic permission
4. When playing a trumpet note (or whistling), the note name, dial, and fingering update in real time
5. The needle moves smoothly and reflects pitch accuracy

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/index.css
git commit -m "feat: integrate all components with mic permission flow"
```

---

### Task 10: Cleanup and Final Polish

**Files:**
- Modify: `src/index.tsx`, `index.html`
- Delete: any unused template files

- [ ] **Step 1: Clean up index.html title**

In `index.html`, change the `<title>` to:

```html
<title>Trumpet Tuner</title>
```

- [ ] **Step 2: Clean up index.tsx**

Ensure `src/index.tsx` is minimal:

```tsx
import { render } from "solid-js/web";
import App from "./App";
import "./index.css";

render(() => <App />, document.getElementById("root")!);
```

- [ ] **Step 3: Remove any unused template files**

Delete any leftover template assets (e.g., `src/logo.svg`, `src/App.module.css`) that came from the SolidJS template but are not used.

```bash
# Check what exists and remove unused template files
ls src/
# Remove any found unused files, e.g.:
# rm src/logo.svg src/App.module.css
```

- [ ] **Step 4: Run all tests one final time**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Final manual verification**

```bash
npm run dev
```

Verify the complete flow works end-to-end as described in Task 9, Step 5.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: clean up template files and finalize project"
```
