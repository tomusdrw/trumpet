# Trumpet Tuner — Design Spec

## Overview

A web-based chromatic tuner optimized for trumpet practice. Listens to the microphone, detects the pitch being played, and displays the nearest note with a dial gauge showing how many cents sharp or flat the player is. Includes a trumpet fingering chart for the detected note.

## Tech Stack

- **SolidJS** + **TypeScript** + **Vite**
- No additional runtime dependencies
- Web Audio API for microphone input and analysis

## Features (v1)

### Pitch Detection & Display
- Real-time pitch detection from microphone input
- Autocorrelation algorithm (not FFT peak-picking) — more reliable for trumpet's strong harmonics
- Displays: note name (large), frequency in Hz (small), cents offset from perfect pitch
- Reference pitch: A4 = 440 Hz, equal temperament

### Dial Gauge
- SVG-based analog needle gauge (user-selected style)
- Colored arc: red (far off) → yellow (close) → green (in tune) → yellow → red
- Needle rotation: -90° to +90° mapping to -50 to +50 cents
- Smooth CSS transitions on needle movement
- Cents readout color matches the zone (green within ~5 cents)

### Fingering Chart
- SVG diagram of 3 trumpet valves (top-down view, circles)
- Pressed valves filled/highlighted, open valves outlined
- Valve numbers (1, 2, 3) labeled
- Static lookup table: note name → valve combination
- Covers standard Bb trumpet range (Bb3–C6)
- Neutral/dimmed state when no pitch detected

### Theme
- Dark and light themes via CSS custom properties on `:root`
- Respects OS `prefers-color-scheme` by default
- In-app toggle button (sun/moon icon) in top corner
- Three-state cycle: system → light → dark → system
- Persisted to `localStorage`

### Mic Permission Flow
- "Start" button on first load (user gesture required by browsers)
- On click: requests `getUserMedia`, starts audio pipeline
- On denial: clear message explaining how to grant mic permission
- No auto-start

## Architecture

```
src/
  audio/
    pitch-detector.ts    — Web Audio API setup + autocorrelation algorithm
    notes.ts             — frequency-to-note mapping, cents calculation
  components/
    Tuner.tsx             — main tuner view (needle dial + note display)
    Dial.tsx              — SVG needle gauge component
    FingeringChart.tsx    — trumpet valve diagram for current note
    ThemeToggle.tsx       — dark/light switch
  App.tsx                 — layout, theme provider, mic permission handling
  index.tsx               — entry point
  index.css               — global styles + theme variables
```

### Data Flow

1. `pitch-detector.ts` opens mic via `getUserMedia`, feeds into `AnalyserNode`
2. Each animation frame: run autocorrelation on audio buffer → get frequency
3. `notes.ts` converts frequency → `{ note: string, octave: number, frequency: number, cents: number }`
4. SolidJS signals (`createSignal`) propagate pitch data to UI components
5. `Dial.tsx` animates needle rotation based on cents
6. `FingeringChart.tsx` looks up valve combination for the detected note

### Pitch Detection Details

- **Algorithm:** Autocorrelation — finds the fundamental period by correlating the signal with delayed copies of itself
- **Why not FFT:** Trumpet harmonics are often stronger than the fundamental, causing FFT peak-picking to lock onto octave errors
- **Sample rate:** Default device sample rate (typically 44100 or 48000 Hz)
- **Buffer size:** 2048 samples — good balance of frequency resolution and latency
- **Update rate:** Tied to `requestAnimationFrame` (~60fps), but pitch calculation is throttled to avoid excessive CPU use

### Fingering Data

Static map from note name + octave to valve array `[v1, v2, v3]` (boolean, true = pressed).

Bb trumpet open harmonic series: Bb2 (pedal), Bb3, F4, Bb4, D5, F5, Bb5, C6.
Valve 2 lowers by 1 half step, valve 1 by 2, valve 3 by 3, combinations stack.

| Note | Valves | Note | Valves |
|------|--------|------|--------|
| E3   | 1,2,3  | F4   | open   |
| F3   | 1,3    | F#4  | 2,3    |
| F#3  | 2,3    | G4   | 1,2    |
| G3   | 1,2    | Ab4  | 1      |
| Ab3  | 1      | A4   | 2      |
| A3   | 2      | Bb4  | open   |
| Bb3  | open   | B4   | 1,2    |
| B3   | 1,2,3  | C5   | 1      |
| C4   | 1,3    | C#5  | 2      |
| C#4  | 2,3    | D5   | open   |
| D4   | 1,2    | Eb5  | 1      |
| Eb4  | 1      | E5   | 2      |
| E4   | 2      | F5   | open   |
| —    | —      | F#5  | 2,3    |
| —    | —      | G5   | 1,2    |
| —    | —      | Ab5  | 1      |
| —    | —      | A5   | 2      |
| —    | —      | Bb5  | open   |
| —    | —      | B5   | 2      |
| —    | —      | C6   | open   |

Notes: Fingerings derived from the Bb trumpet harmonic series. Some notes can be played with alternate fingerings from different partials; the table shows the most standard fingering for each. Upper register (above F5) fingerings can vary by player and instrument.

## Out of Scope (v1)

- Practice mode (target note selection, streak tracking)
- Tuning reference adjustment (A=440 only)
- Recording/playback
- Mobile-specific optimizations
- PWA/offline support
