# Training Mode — Design Spec

## Overview

Add a training mode alongside the existing free-play staff. The user picks a
challenge from a catalog; the staff shows the challenge's target notes grayed
out ahead of the ghost. As the user plays, committed notes replace the grayed
targets left-to-right and are colored by intonation exactly as in free-play.
When all targets are played, the run ends with a numeric score (0–100) and a
1-3 star rating; the best score per challenge is persisted in localStorage.

The existing `pitch-detector` and `staff-engine` are reused unchanged — both
modes share the same detection stack. Training is purely a layer on top.

## Goals

- Let a learner practice specific pitch sequences and see "what they played
  vs. what the exercise asked for" on the same staff.
- Grade each run in a way that rewards intonation, not just finishing.
- Keep the detector / sampling-window / engine logic shared so future tuning
  improves both modes at once.
- Stay within existing tech constraints: SolidJS + TypeScript + Vite, no new
  runtime dependencies, hand-rolled SVG.

## Non-Goals (out-of-scope for v1)

- Rhythm, tempo, duration grading. Rhythmic challenges are a planned later
  tier but not in this spec.
- Audio playback of the target melody ("play along").
- User-authored or server-fetched challenges; catalog is hardcoded TS.
- Keys/clefs beyond the existing treble + `+2` staff transposition.
- Linear unlock / progression gating. v1 is a free library; a user can pick
  any challenge at any time.
- Multi-user profiles or cloud sync. localStorage only.
- Countdown / "get ready" animation before a run. First played note starts it.
- Re-articulation detection. Same limitation as free-play — repeated notes
  must be separated by rests in the target sequence.

## User-Facing Layout

Two top-level modes selected by a `mode` signal in `App.tsx`:

1. **Free play** (default) — the existing `Staff` + `HeaderBar`, unchanged.
2. **Training** — `HeaderBar` stays visible; the staff region is replaced
   by `TrainingScreen`, which has three internal sub-views:
   - **Picker.** Grid of `ChallengeCard` tiles grouped by category
     (Long tones / Scales & arpeggios / Melodies). Each card shows title,
     note count, best-score badge, and earned stars (1–3 filled, otherwise
     outlined).
   - **Active run.** Full staff region with the target track drawn ahead of
     the ghost. A status strip above the staff shows the challenge title,
     `x / N` target progress, running mistake count, and a Restart button.
   - **Result.** Modal over the staff showing stars earned, numeric score,
     avg worst-cents, mistake count, and Retry / Back-to-picker buttons.
     A "New best!" ribbon appears when the run beats the stored best.

A "Train" button is added to `HeaderBar` next to the existing ⚙ and Clear
buttons; it switches the mode. The training screen has its own "Exit" button
back to free-play.

## Matching Model

### Target sequence format

```ts
type Target =
  | { kind: "note"; midi: number }  // concert MIDI
  | { kind: "rest" };

type Challenge = {
  id: string;
  title: string;
  group: "long-tones" | "scales" | "melodies";
  targets: readonly Target[];
};
```

All MIDI numbers in the catalog are **concert pitches**. The staff's fixed
`+2` transposition applies at render time, just like in free-play.

Catalog invariant: two consecutive `kind: "note"` targets with the same midi
are **not** allowed — repeated notes must be separated by an explicit rest
target. This is enforced by a test in `challenges.test.ts`.

### Matching algorithm (lenient sequential)

State inside `training-engine.ts`:

- `targetIndex: number` — 0 at start; advances on each matched target.
- `mistakes: number` — committed events that didn't match and weren't
  "ignored committed rests while expecting a note".
- `perNoteWorstCents: number[]` — recorded once per matched note target.

For each new `CommittedEvent` that arrives (i.e. the user's `committed`
array grew by one):

- If `targetIndex >= targets.length`, ignore (run is over).
- Let `t = targets[targetIndex]`.
- If `t.kind === "note"`:
  - Committed event is `{ kind: "note", midi: t.midi, worstCents }`:
    push `worstCents` into `perNoteWorstCents`; `targetIndex += 1`.
  - Committed event is a different note: `mistakes += 1`; target does not
    advance. (User can still recover by playing the correct note next.)
  - Committed event is a rest: ignore. Rests while the engine is waiting
    for a note happen naturally (user is thinking) and should not be
    penalized.
- If `t.kind === "rest"`:
  - Committed event is a rest: `targetIndex += 1`.
  - Committed event is a note: `mistakes += 1`; target does not advance.
    The user needs to produce silence — which the staff-engine will eventually
    commit as a rest once `rest-delay` elapses.

Run ends when `targetIndex === targets.length`. The training engine reports
`isDone() === true`; `TrainingScreen` transitions to the result sub-view.

### Matching decision table

| Current target | Committed event | Effect |
|---|---|---|
| note X | note X | record worstCents, advance |
| note X | note Y (Y≠X) | mistake++, stay |
| note X | rest | ignore (no penalty) |
| rest | rest | advance |
| rest | note | mistake++, stay |

### Interaction with the shared staff-engine

The training engine does **not** drive the staff-engine — it subscribes to it.
On every animation frame, `App.tsx` still calls `engine.tick(detection, t)`
on the shared staff-engine, then passes the latest `committed` snapshot to
the training engine. The training engine detects "new event" by comparing
`committed.length` to its own last-seen count.

When entering training mode and when starting or restarting a run, the shared
staff-engine's `clear()` is called so the committed history starts empty.
This is destructive to the free-play history; it's intentional.

## Scoring

`scoring.ts` exposes a pure function:

```ts
function computeScore(progress: {
  perNoteWorstCents: readonly number[];
  mistakes: number;
  noteTargetCount: number;
}): { score: number; stars: 1 | 2 | 3; avgCents: number };
```

Formula:

```
avgCents        = mean(perNoteWorstCents)  // 0 if no notes recorded
intonationFactor = clamp(1 - avgCents / 30, 0, 1)
mistakePenalty   = clamp(1 - (mistakes / noteTargetCount) * 0.5, 0, 1)
rawScore         = 100 * intonationFactor * mistakePenalty
score            = round(rawScore)
stars            = score >= 90 ? 3
                 : score >= 70 ? 2
                 :               1
```

Notes:

- `avgCents` uses the per-note `worstCents` already recorded by the
  staff-engine (trimmed-max of the window). This is already a conservative
  measure, so averaging it across notes is a sensible run-level metric.
- 30¢ is the cap — avg worst-cents ≥ 30 zeroes out the intonation factor.
- Mistakes are weighted at half: a run with 2 mistakes out of 10 notes
  loses 10% of the score, not 20%. Lenient matching means mistakes shouldn't
  dominate the score.
- Star thresholds are first-pass. Expect to tune after real use. Both
  thresholds and weights live as named constants in `scoring.ts`.
- If `noteTargetCount === 0` (shouldn't happen for real challenges but
  guarded), `mistakePenalty = 1` and `avgCents = 0`.

## Staff Rendering for Training Mode

`Staff.tsx` gains two optional props:

```ts
targets?: readonly Target[];
targetIndex?: number;
```

Behavior:

- When `targets` is absent, `Staff` behaves exactly as today.
- When `targets` is present:
  - Slice `remainingTargets = targets.slice(targetIndex)`.
  - Committed events render as today, at `x = eventX(i)` for `i` in
    `[0, committed.length)`.
  - The ghost still renders at `x = eventX(committed.length)`.
  - Each remaining target renders at
    `x = eventX(committed.length + 1 + j)` for `j` in
    `[0, remainingTargets.length)`, at `fill-opacity: 0.35`, using
    `var(--text-secondary)` as color (neutral), reusing the same notehead
    / rest / accidental / ledger-line math.
  - Scroll math is extended:
    `totalEvents = committed.length + 1 (ghost) + remainingTargets.length`
    `lastX = eventX(totalEvents - 1)`
    `scrollX = max(0, lastX - (VIEW_WIDTH - LEFT_MARGIN/2))`.
    This keeps the last upcoming target roughly inside the viewport when the
    challenge is long.

No change to colors / dial / HUD — the ghost and committed notes still use
the cents-zone colors from `audio/intonation.ts`.

## Challenge Catalog

Initial v1 catalog lives in `src/training/challenges.ts`. Concert pitches;
every consecutive-repeat pair is separated by an explicit rest target.
Exact sequences are finalized in the TS file — the shape here is the
authoritative list:

**Long tones** (3):
- `long-g4` — G4, rest, G4, rest, G4
- `long-c5` — C5, rest, C5, rest, C5
- `long-bb4` — Bb4, rest, Bb4, rest, Bb4

**Scales & arpeggios** (4):
- `scale-bb-major` — Bb4 C5 D5 Eb5 F5 G5 A5 Bb5
- `scale-f-major` — F4 G4 A4 Bb4 C5 D5 E5 F5
- `arp-c-major` — C5 E5 G5 C6
- `arp-bb-major` — Bb4 D5 F5 Bb5

**Melodies** (4):
- `mary-had-a-little-lamb` — first phrase
- `ode-to-joy` — main theme
- `twinkle-twinkle` — first two lines
- `amazing-grace-opening` — first phrase

Final note sequences (MIDI numbers + rests) are captured in `challenges.ts`
alongside tests that verify the invariants.

## Persistence

`src/training/storage.ts` wraps `localStorage` under the key
`trumpet-training-v1`:

```ts
type StoredBest = { score: number; stars: 1 | 2 | 3; playedAt: number };
type StorageShape = { [challengeId: string]: StoredBest };

function getAll(): StorageShape;
function getBest(id: string): StoredBest | null;
function recordRun(id: string, score: number, stars: 1 | 2 | 3): boolean;
  // returns true iff the new run replaced the best
```

Behavior:

- Malformed JSON or missing keys → treat as empty; never throw.
- `recordRun` only overwrites when the new score strictly beats the stored
  best. Ties keep the old entry. `playedAt = Date.now()` is stamped on write.
- All reads / writes are synchronous. Catalog is small enough that a single
  `getAll()` on picker mount is fine.

## File Map

```
src/
  training/
    challenges.ts              — ADDED: static catalog; concert-MIDI targets.
    challenges.test.ts         — ADDED: ids unique, targets non-empty,
                                 no two consecutive identical notes without
                                 a rest in between.
    training-engine.ts         — ADDED: pure state machine. API:
                                   createTrainingEngine(challenge) => {
                                     onCommitted(events: readonly
                                                 CommittedEvent[]): void
                                     getProgress(): TrainingProgress
                                     isDone(): boolean
                                     reset(): void
                                   }
                                 where TrainingProgress =
                                   { targetIndex, noteTargetCount,
                                     mistakes, perNoteWorstCents }.
    training-engine.test.ts    — ADDED: matching rules from the decision
                                 table, skip-committed-rest-when-waiting-
                                 for-note, mistake-doesn't-advance, reset
                                 restores initial state, done-when-all-
                                 targets-matched.
    scoring.ts                 — ADDED: computeScore + named thresholds.
    scoring.test.ts            — ADDED: exact-boundary cases for 1/2/3
                                 stars, zero-mistakes-zero-cents = 100,
                                 empty-perNoteWorstCents handled, 30¢-cap.
    storage.ts                 — ADDED: localStorage wrapper. Swallows
                                 JSON parse errors.
    storage.test.ts            — ADDED: round-trip, malformed recovery,
                                 recordRun only overwrites on strict beat.

  components/
    Staff.tsx                  — MODIFIED: accept optional targets +
                                 targetIndex props; render remaining targets
                                 at 35% opacity; extend scroll math to
                                 include remaining targets.
    Staff.test.tsx             — ADDED: target-track rendering test
                                 (opacity, positioning). Existing free-play
                                 behavior (no targets prop) unchanged.
    TrainingScreen.tsx         — ADDED: picker / active / result sub-view
                                 switcher. Owns local training-engine.
    ChallengeCard.tsx          — ADDED: tile with title, note count, best
                                 score badge, stars.
    TrainingResult.tsx         — ADDED: modal with stars, score, avg cents,
                                 mistake count, retry / back actions,
                                 "New best!" ribbon.
    HeaderBar.tsx              — MODIFIED: add "Train" button.

  App.tsx                      — MODIFIED: add `mode: "free-play" |
                                 "training"` signal. Switch main region
                                 between <Staff /> and <TrainingScreen />.
                                 Clear shared staff-engine on mode change
                                 and on training run start/restart.
  index.css                    — MODIFIED: add .training-screen, .challenge-
                                 card, .training-result, .training-status
                                 styles.
```

## Data Flow

1. `App.tsx` holds the shared `createStaffEngine()` and `createPitchDetector()`,
   unchanged.
2. The rAF tick still calls `engine.tick(detection, performance.now())` and
   publishes `committed` + `ghost` signals, unchanged.
3. When `mode === "training"`:
   - `TrainingScreen` renders the picker / active / result sub-view.
   - In the active sub-view, `TrainingScreen` owns a `createTrainingEngine(
     challenge)` instance.
   - A SolidJS `createEffect` feeds the latest `committed` snapshot into
     `trainingEngine.onCommitted(committed)` each frame.
   - `<Staff />` is rendered with `committed`, `ghost`, `targets`, and
     `targetIndex` from `trainingEngine.getProgress()`.
   - When `trainingEngine.isDone()` flips true, `TrainingScreen` computes
     the score via `computeScore(progress)`, calls `storage.recordRun`, and
     shows `<TrainingResult />`.
4. When `mode === "free-play"`, `TrainingScreen` is not mounted; `<Staff />`
   receives only `committed` + `ghost`. Everything is exactly as today.

## Testing

### Pure-function tests (land first)

- `training-engine.test.ts`
  - Exact-match note advances + records `worstCents`.
  - Wrong-note committed → mistake++, target doesn't advance.
  - Rest committed while expecting a note → ignored, no penalty.
  - Rest committed while expecting a rest → advances.
  - Note committed while expecting a rest → mistake++, target doesn't
    advance.
  - `isDone()` flips true exactly when `targetIndex === targets.length`.
  - `reset()` restores `targetIndex = 0`, empty `perNoteWorstCents`,
    `mistakes = 0`.
- `scoring.test.ts`
  - avgCents = 0 + mistakes = 0 → score = 100, stars = 3.
  - avgCents = 30 → intonationFactor = 0, score = 0, stars = 1.
  - avgCents = 6, mistakes = 0, noteTargetCount = 10 → score = 80, stars = 2.
  - Empty `perNoteWorstCents` + `noteTargetCount = 0` → handled gracefully,
    no NaN.
  - Boundaries: score = 90 → 3 stars; score = 89 → 2 stars; score = 70 →
    2 stars; score = 69 → 1 star.
- `storage.test.ts`
  - `getAll()` on empty storage → `{}`.
  - `recordRun` then `getBest` round-trip.
  - `recordRun` with a lower score → does not overwrite; returns false.
  - Malformed JSON in storage → `getAll` returns `{}`, no throw.
- `challenges.test.ts`
  - All ids unique.
  - All `targets` arrays non-empty.
  - No two consecutive identical note-midi targets without an intervening
    rest.
  - At least one challenge per group.

### Component tests

- `Staff.test.tsx`
  - Rendering with `targets` present adds extra elements at reduced opacity.
  - Rendering without `targets` matches previous behavior (no regression).
  - Scroll math accounts for remaining targets when the total exceeds
    viewport.

### Manual UI verification

1. Enter training mode from free-play → staff history clears; picker appears
   with all challenges; previously-played challenges show their best score
   + stars.
2. Pick `long-g4`, play G4 three times with clear rests → three green
   noteheads replace the grayed targets; result modal shows 3 stars.
3. Pick `scale-bb-major`, play a wrong note mid-scale then the correct one
   → mistake counter increments by 1, target advances on the correct note.
4. Pick `twinkle-twinkle`, play with mediocre intonation (~20¢) → 1–2 stars
   + result modal reflects avg.
5. Click Restart mid-run → staff clears, target track resets, mistake
   counter resets.
6. Exit mid-run → best score unchanged; re-entering the challenge still
   shows the old best.
7. Replay a challenge with a better score → "New best!" ribbon appears,
   localStorage reflects the new best.
8. Switch between free-play and training repeatedly → no stale state; each
   mode starts with a clean staff history.

## Risks and Concerns

- **Destructive `engine.clear()` on mode switch and run start.** A user
  with free-play history on the staff loses it when entering training.
  Accepted for v1 — training is an explicit intent. A future "resume
  free-play" escape hatch could keep a snapshot, but not in scope here.
- **Star thresholds and scoring weights are first-pass.** 30¢ cap, 50%
  mistake weight, 70/90 star thresholds are educated guesses. They'll
  almost certainly be tuned after real use; they live as named constants
  so tuning is a one-line change.
- **Matching is tolerant of committed rests while waiting for a note.**
  This is deliberate — users need thinking time — but it means "long
  silences" are never penalized. Acceptable for v1.
- **Repeated notes need rest separation in targets.** A hard constraint
  inherited from the staff-engine's duplicate suppression. Any target
  sequence that violates this would silently be uncompletable, so the
  catalog test fails fast.
- **1000 ms sampling window still applies.** Fast melodic passages will
  drop notes. Advanced / rhythmic challenges are a later tier where this
  will need to be revisited.
- **Catalog is hardcoded TS with no user editing.** Adding a challenge is a
  code change. Acceptable for v1 where ~11 curated challenges cover the
  first learning arc.
- **No audio playback of target melody.** The user reads the staff. If this
  proves hard for beginners, a "play along" mode (MIDI or sampled) could
  be added later but is out of scope.
