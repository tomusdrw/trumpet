# Staff Notation Main View — Design Spec

## Overview

Reshape the Trumpet Tuner from a single centered tuner card with a full-screen
background pitch graph into a two-region main view: a compact tuner HUD pinned
at the top, and a treble-clef music staff below it that transcribes what the
player plays as a scrolling, append-only pitch history.

The staff is a **pitch history log rendered with staff notation glyphs**, not
true musical notation. There is no rhythm, no tempo, no bar lines, no time
signature, no key signature. Every committed note looks the same shape
(filled oval notehead, no stem). Rests mark silences. Notes are only committed
once they have been heard clearly in a short sampling window, and consecutive
duplicates of the same note or consecutive rests are suppressed.

The background `FrequencyGraph` is removed entirely. The existing portrait
cents dial is replaced with a horizontal dial that fits the HUD.

## Goals

- Keep the real-time tuner feedback the app already has, but make the primary
  focus "the notes I just played" rendered as a readable staff.
- Combine intonation feedback with the staff so each committed note carries a
  color and a numeric cents label describing *how well* it was played, not
  just *which* pitch it was.
- Stay within the project's existing tech constraints: SolidJS + TypeScript +
  Vite, no new runtime dependencies, hand-rolled SVG for all visuals.

## Non-Goals (explicit out-of-scope for v1)

- Rhythm, duration, bar lines, time signatures, tempo detection, metronome.
- Key signatures or key-aware accidental hiding.
- Clefs other than treble.
- Recording, export, or session save/restore.
- Multi-line scrolling (everything is one horizontal staff).
- Per-note playback.
- Confirmation dialog before Clear.
- Mobile-specific layout (narrow viewports may wrap the HUD awkwardly).

## User-Facing Layout

Three regions stacked vertically:

1. **Top HUD bar** (≈ 100 px tall, full width). One horizontal row, left to
   right: current note name (large), sounding frequency in Hz (small),
   horizontal cents dial (flexes to fill), fingering diagram, numeric
   transpose selector, "Clear staff" button. `ThemeToggle` stays pinned
   fixed-top-right and floats above the HUD.
2. **Main staff region** (fills the rest of the viewport). A single-system
   treble-clef staff stretched full-width. Committed notes flow left-to-right
   and a live ghost notehead sits at the right edge. When the staff runs out
   of width, it scrolls left — oldest committed notes slide off the left
   edge, new ones appear on the right.
3. **Start / error screens** remain as they are today: modal-like centered
   content when the detector isn't running. The HUD and staff are hidden
   until `started()` is true.

The `.app` container is no longer a `max-width: 480px` centered card; it
becomes a full-width column so the staff has room to breathe.

## Pitch Detection Model

### Detector simplification

The existing `pitch-detector.ts` has its own stability layer
(`NOTE_HOLD_FRAMES = 8`, `SILENCE_HOLD_FRAMES = 20`, per-note candidate
counters). With the new commit state machine also running a stability/voting
layer on top, that creates double-smoothing and drifts up to ~380 ms of
latency.

The detector is simplified into a pure probe:

- **Kept:** EMA smoothing on frequency (for cents precision).
- **Removed:** `NOTE_HOLD_FRAMES`, `SILENCE_HOLD_FRAMES`, candidate MIDI
  tracking, silence counters. Silence returns `null` immediately; a new note
  is reported as soon as it's detected.

All stability/voting now lives in the new state machine.

### Transposition convention

Two independent transpositions exist in the app and must not be confused:

- **Staff transposition (fixed).** The staff always renders notes at
  `displayMidi = sourceMidi + 2` — Bb-trumpet written pitch on treble clef.
  This is baked into the staff-rendering layer and never changes at runtime.
- **Header transpose selector (user-controlled).** A numeric semitone offset
  in the HUD, default `0`. The selector value represents the **instrument's
  transposition** (Bb trumpet = `−2`, Eb = `−9`, F = `−7`). The header note
  name is displayed as if the concert pitch had been played on that
  instrument: `headerDisplayMidi = concertMidi - selectorValue`. At `0` the
  header reads concert pitch (e.g. `Bb4`). At `−2` it reads `C5`, matching
  what the staff shows.

The frequency (Hz) displayed in the header is always the actual sounding
frequency, regardless of selector.

The commit state machine works in concert MIDI numbers throughout; the
transpositions are applied only at the rendering layer.

## Commit State Machine

### Inputs

On every `requestAnimationFrame` tick, the state machine receives one
`Detection`:

```ts
type Detection =
  | { kind: "rest" }
  | { kind: "note"; midi: number; cents: number };
```

`rest` means the detector reported `null`. `note` carries the raw MIDI number
rounded from the detected frequency, plus the cents offset from equal
temperament.

### Algorithm: 250 ms majority-vote window with duplicate suppression

Per-window state:

- `windowStart: number` — `performance.now()` of the window's first frame.
- `windowTally: Map<Key, number>` — per-candidate frame counts. `Key` is
  `"rest"` or the MIDI number.
- `windowWorstCents: number` — maximum `|cents|` observed across all frames
  *for the current leading note candidate only*.
- `committed: readonly CommittedEvent[]` — committed events so far.
- `last: CommittedEvent | null` — tail of `committed`, or `null`.

Per frame with detection `d` at timestamp `t`:

1. If `windowStart` is unset, set it to `t`.
2. Compute `key = d.kind === "rest" ? "rest" : d.midi`; increment
   `windowTally[key]`.
3. Recompute the current leader: the key with the highest count (ties →
   the most recently-incremented key).
4. Track `windowWorstCents` for the currently-leading note candidate only:
   - If the leader is a note and `d.kind === "note"` and `d.midi === leader`,
     set `windowWorstCents = max(windowWorstCents, |d.cents|)`.
   - If the leader changed this frame, reset `windowWorstCents` to `0`.
     If the new leader is a note and the current frame `d` matches it,
     reseed with `|d.cents|`. If the new leader is a rest,
     `windowWorstCents` is unused for the rest commit path.
5. Publish the leader as the current ghost state.
6. If `(t - windowStart) >= 250 ms`, close the window:
   - Let `candidate` be the final leader.
   - If `candidate.kind === "rest"` and `last?.kind === "rest"` — **skip**.
   - If `candidate.kind === "note"` and `last?.kind === "note"` and
     `candidate.midi === last.midi` — **skip**.
   - Otherwise push `candidate` to `committed` and update `last`.
   - Reset `windowStart`, `windowTally`, `windowWorstCents`.

### Decision table

| Last committed | Window leader | Result |
|---|---|---|
| (none) | rest | **skip** (no leading rest) |
| (none) | note X | commit X |
| note X | note X | **skip** (duplicate) |
| note X | note Y | commit Y |
| note X | rest | commit rest |
| rest | rest | **skip** (duplicate) |
| rest | note X | commit X |

### Clear

The "Clear" button empties `committed`, resets `last = null`, and resets the
current window (discards in-progress tally and restarts timing from the next
frame).

### Edge cases documented

- **Empty start.** Before any committed events, a silent first window is
  suppressed. The staff shows the empty staff + clef until the first real
  note.
- **Majority-vote means some notes get dropped.** Fast or wobbly passages
  where the vote splits approximately evenly will commit fewer notes than
  were played; that's acceptable given the Q1 decision to treat this as a
  pitch history log, not a transcription.
- **Worst-cents is tracked on the winning candidate only.** Cents from a
  losing candidate that briefly led during the window are discarded when the
  lead changes. The recorded worst-cents describes the committed note, not
  incidental glitches.
- **Legato re-articulation is not detected.** Playing A4, releasing briefly
  with no measurable silence, then playing A4 again merges into a single
  committed A4. The only way to distinguish "held A4" from "two A4s in a
  row" is to have a rest between them.
- **Held notes show once.** Duplicate suppression applies to notes as well as
  rests — holding a single pitch produces exactly one notehead.
- **Transpose selector never rewrites history.** The selector only affects
  the header readout. Changing it mid-session does not shift or relabel
  already-committed notes on the staff, because the staff transposition is
  the fixed `+2` offset and is independent of the selector.

## Staff Rendering Details

All staff rendering lives in hand-rolled SVG. No notation library.

### Coordinate system

One `<svg>` fills the staff region using `viewBox` for responsive scaling.
Y grows downward. The five staff lines are evenly spaced with line-spacing
constant `LS` (e.g., 14 px). X is time — older notes left, newer right.

### Pitch → Y mapping

Treble clef reference: line 2 from the top is G4 (MIDI 67). For a given
source MIDI note:

1. Apply the fixed staff transposition: `displayMidi = sourceMidi + 2`.
2. Pick a letter name + accidental consistent with the `notes.ts`
   convention (flats for Bb/Eb/Ab, sharps for F#/C#/G#).
3. Compute diatonic steps from G4:
   `stepsFromG4 = (letterIndex - G_INDEX) + 7 * (octave - 4)` where
   `C=0, D=1, E=2, F=3, G=4, A=5, B=6`.
4. `y = staffCenterY - stepsFromG4 * (LS / 2)` — each diatonic step is
   half a line-spacing.

This math lives in `staff/staff-layout.ts` as pure functions.

### Notehead shape

A single filled `<ellipse>` per note. `rx ≈ LS * 0.65`, `ry ≈ LS * 0.5`,
rotated by approximately −20° to give the classic leaning-oval look. No
stem. Fill color = the cents-zone color computed from the note's
`worstCents`.

### Accidentals

Rendered as SVG `<text>` with the Unicode glyphs `♯` (U+266F) / `♭`
(U+266D) / `♮` (U+266E). Unlike the musical-symbol-block `𝄽` glyph that
we rejected for rests, these sit in the Miscellaneous Symbols block and
have excellent font coverage across platforms, so we commit to Unicode
text without a `<path>` fallback. Positioned to the left of the notehead,
same Y, offset by `~LS * 0.9` in X. Never stacked — we only ever have one
accidental per committed event.

### Ledger lines

Short horizontal strokes extending `LS * 0.8` each side of the notehead,
one per required diatonic step past the staff edges. For notes on a line
outside the staff, a ledger line passes *through* the notehead; for notes
on a space, ledger lines bracket it. Standard notation convention.

Trumpet concert range is E3–C6. After the `+2` staff transposition that
becomes F#3–D6 displayed. The lowest written notes can sit 5–6 ledger
lines below the staff, so the staff is vertically biased within its
region to leave more room below the lines than above.

### Rests

The Unicode `𝄽` glyph (U+1D13D, Musical Symbols block) is rendered
inconsistently across fonts and was visually bad in early mockups.
Rests are rendered as a **hand-traced quarter-rest SVG `<path>`** exposed
by a small function in `staff/staff-layout.ts`, so the shape is
font-independent and tweakable. A snapshot test covers the path so future
tweaks are intentional.

Rests carry no cents label.

### Ghost (probing) rendering

The ghost is the running majority-vote leader of the current window,
rendered at the X position immediately after the last committed event.
Visual characteristics:

- **Note ghost:** same notehead shape and Y math as a committed note, but
  drawn at `fill-opacity: 0.4` and with no cents label.
- **Rest ghost:** the same rest path at `fill-opacity: 0.4`.
- **Progress bar under the ghost:** two `<rect>`s — a background track in a
  muted color, and a foreground bar whose width advances from 0 to full
  across the 250 ms window. The foreground width is `ghostState.progress`
  (a 0..1 value returned from `engine.getGhost()` and updated on every
  `engine.tick()`). It resets to 0 on each commit.

### Cents label

Under each committed note, one `<text>` showing the signed worst-cents
value (`"−12¢"`, `"+3¢"`, `"0¢"`). Font color matches the notehead color.
Font size ≈ `LS * 0.65`. Text-anchored center. Rests have no label.

### Colors and intonation thresholds

The existing cents-zone thresholds used by `FrequencyGraph.tsx` (currently
inline) are extracted into a new shared module `audio/intonation.ts`:

- `|cents| ≤ 5` → green (`--accent-green`)
- `|cents| ≤ 15` → yellow (`--accent-yellow`)
- else → red (`--accent-red`)

`Staff`, `HorizontalDial`, and future consumers all import from this
module. Theme-awareness comes from CSS custom properties automatically.

### Strip-chart scrolling

Each committed event is assigned `x = index * NOTE_SPACING` where
`NOTE_SPACING ≈ LS * 4`. The ghost sits at `committed.length * NOTE_SPACING`.
The committed-events group is translated left by:

```
scrollX = max(0,
              (committed.length + 1) * NOTE_SPACING
              - (staffWidth - leftMargin))
```

This keeps the ghost just inside the right edge of the viewport once the
staff fills up, and older notes flow off the left. When there are few
notes, `scrollX = 0` and they sit left-aligned after the clef.

Scroll position is pure reactive math driven from `committed.length` —
no imperative animation loop. The only per-frame update is the ghost's
progress-bar width and, when the running leader changes, the ghost's Y.

### Capacity

At `LS = 14 px` and `NOTE_SPACING = 56 px`, a 1000 px-wide staff viewport
holds ~17 visible events after the clef and margins. Thousands of committed
events in memory are fine; SVG handles off-screen elements cheaply and no
virtualization is needed.

### Empty state

Before any committed events and before any real note has been detected,
the staff renders just the five lines and the clef. The ghost only appears
once the first note is detected and a sampling window opens.

## File Map

```
src/
  audio/
    pitch-detector.ts       — MODIFIED: strip NOTE_HOLD_FRAMES /
                              SILENCE_HOLD_FRAMES / candidate counters.
                              Keep EMA frequency smoothing.
    pitch-detector.test.ts  — ADDED: pure-probe behavior tests.
    notes.ts                — MODIFIED: add helper for midi → diatonic step
                              + letter + accidental (Bb-trumpet-friendly
                              enharmonic choices). Re-export existing
                              frequencyToNote unchanged.
    notes.test.ts           — MODIFIED: add cases for the new helper.
    intonation.ts           — ADDED: shared cents-to-color function and
                              zone thresholds.
    intonation.test.ts      — ADDED.

  staff/
    staff-engine.ts         — ADDED: the commit state machine. Pure TS,
                              no SolidJS. API:
                                createStaffEngine(opts) => {
                                  tick(detection, timestampMs): void
                                  getGhost(): GhostState
                                  getCommitted(): readonly CommittedEvent[]
                                  clear(): void
                                }
                              where GhostState is:
                                { candidate: CommittedEvent | null
                                , progress: number   // 0..1 across window
                                }
    staff-engine.test.ts    — ADDED: window majority vote, duplicate-note
                              suppression, duplicate-rest suppression,
                              empty-start "don't commit leading rest",
                              worst-cents tracking on winner only, clear
                              semantics, commit latency bounded to one
                              250 ms window, progress fraction monotonic
                              within a window and resets at commit.
    staff-layout.ts         — ADDED: pitch → Y math, accidental choice,
                              ledger-line set, quarter-rest SVG path.
                              Pure functions.
    staff-layout.test.ts    — ADDED: G4 on line 2, middle C one ledger
                              below, F5 top line, C6 above staff, E3
                              concert → F#3 written, sharp/flat placement,
                              ledger-line count, rest path snapshot.

  components/
    Staff.tsx               — ADDED: main staff SVG. Takes committed
                              events and ghost state (which carries the
                              progress fraction). Renders static staff
                              lines + clef + committed notes + ghost. No
                              internal state.
    HeaderBar.tsx           — ADDED: horizontal HUD with note name,
                              frequency, horizontal cents dial, fingering
                              chart, transpose selector, clear button.
                              Owns the transpose signal.
    HorizontalDial.tsx      — ADDED: horizontal cents dial replacing the
                              portrait Dial. Colored bar + moving tick +
                              "±N¢" label.
    Dial.tsx                — DELETED.
    FingeringChart.tsx      — UNCHANGED. Embedded in HeaderBar at a size
                              that fits the horizontal bar.
    Tuner.tsx               — DELETED. Responsibilities split between
                              HeaderBar and Staff.
    FrequencyGraph.tsx      — DELETED.
    ThemeToggle.tsx         — UNCHANGED. Remains fixed-top-right.

  App.tsx                   — MODIFIED: owns the detector, the staff-engine,
                              the transpose signal, and the clear action.
                              Hands committed + ghost to <Staff />; hands
                              frequency + ghost + cents + transpose to
                              <HeaderBar />. Drops <FrequencyGraph />.
                              Updates visibility gating.
  index.css                 — MODIFIED: delete .frequency-graph, .tuner-*,
                              portrait .dial-* rules. Add .header-bar,
                              .horizontal-dial, .staff styles. Remove the
                              max-width: 480px from .app.
```

## Data Flow

1. `App.tsx` creates `createPitchDetector()` and `createStaffEngine()`.
2. A `requestAnimationFrame` loop reads the detector's frequency each frame,
   builds a `Detection`, and calls `engine.tick(detection, performance.now())`.
3. A SolidJS signal wraps the engine's current `{ committed, ghost }` snapshot
   (where `ghost` is `{ candidate, progress }`) and re-publishes it each frame.
4. `<Staff />` reads the snapshot and renders. Staff-rendering always applies
   the fixed `+2` semitone staff transposition, independent of the header
   selector.
5. `<HeaderBar />` reads the current raw frequency, current ghost MIDI, current
   cents, and the transpose signal. It renders:
   - Note name = `headerDisplayMidi = ghostMidi - selectorValue` (displayed
     with the same flat/sharp convention as `notes.ts`).
   - Frequency in Hz (always sounding).
   - `HorizontalDial` with the current cents value.
   - `FingeringChart` for the current ghost note (unfingered fallback when
     the ghost is a rest).
   - Transpose selector (bound to the transpose signal).
   - Clear button → calls `engine.clear()`.

## Testing

### Pure-function tests (land first, UI depends on them)

- **`staff-engine.test.ts`**
  - Window majority vote picks the most-frequent key.
  - Duplicate-note suppression.
  - Duplicate-rest suppression.
  - Leading silence does not produce a rest.
  - Worst-cents is tracked for the winning candidate only.
  - `clear()` empties committed, resets ghost, resets window.
  - Commit latency from "new note detected" to "note in committed list" is
    within one 250 ms window plus one frame.
- **`staff-layout.test.ts`**
  - G4 on line 2.
  - C4 (middle C) one ledger line below the staff.
  - F5 on the top line.
  - C6 above the staff (ledger lines above).
  - E3 concert → F#3 written (low ledger lines).
  - Sharp on C#, flat on Eb, position relative to notehead.
  - Ledger-line count for a range of pitches.
  - Quarter-rest SVG path snapshot.
- **`intonation.test.ts`**
  - Zone thresholds are stable at `|c|=5` and `|c|=15` boundaries.
- **`pitch-detector.test.ts`**
  - Silence → `null` immediately (no silence hold).
  - New note reported without a multi-frame hold.
  - EMA smoothing still applies to the returned frequency.

### Manual UI verification

1. From silence → empty staff, header reads "—", no ghost, no leading rest.
2. Play a sustained C5 → header reads Bb4 (or C5 with selector −2), dial
   shows cents, ghost appears with progress bar, commits one C5 notehead.
   Holding it longer does **not** produce additional C5 notes.
3. Play C5 → D5 → silence → C5 → staff shows `C5, D5, rest, C5`.
4. Play fast eighth/sixteenth passages → staff commits what it can; some
   notes are dropped when votes split, and the ghost visibly flips during
   unstable input.
5. Change the transpose selector 0 → −2 while history is on the staff →
   committed notes stay in their original positions; header note name
   shifts.
6. Click Clear → staff empties, ghost resets.
7. Play until the staff is past capacity → oldest notes scroll off the
   left, newest appear on the right; the clef stays pinned.

## Risks and Concerns

- **`pitch-detector.ts` simplification is a real change to an existing
  module.** Its previous tests (none for the detector itself, only `notes`
  and `fingerings`) don't cover the behavior we're removing, so we're
  adding a new test file and we'll need to be careful to validate that
  the detector still behaves well in the simplified form during manual
  UI verification.
- **Horizontal dial is a new component, not a refactor.** The portrait
  `Dial.tsx` doesn't translate mechanically — the new `HorizontalDial.tsx`
  is a fresh ~60–80 line SVG component.
- **Full-width layout is a visual change.** Users who liked the centered
  480 px card will notice. Accepted for v1 because the staff wants all the
  horizontal room it can get.
- **No confirmation on Clear.** A stray click wipes the staff. Accepted for
  v1 for simplicity; revisit if it's a real problem in practice.
- **250 ms floor caps transcribable tempo.** A player producing notes
  faster than ~4 per second will have votes split by their own speed and
  see notes dropped. That's a known, accepted limitation of the pitch-
  history-log model.
- **Very low concert notes (E3, F3) after the `+2` staff transposition sit
  5–6 ledger lines below the staff.** The staff is biased vertically to
  leave more room below the lines. Notes in this range will still be
  readable but ledger-line-heavy.
- **Rests have no cents label**, so the label row has gaps when phrases
  contain silences. This is intentional and reads cleanly.
