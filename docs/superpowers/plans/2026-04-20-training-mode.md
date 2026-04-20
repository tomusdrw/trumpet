# Training Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a training mode alongside free-play where the user picks a challenge, the staff shows target notes grayed out ahead of the ghost, and played notes replace the targets left-to-right with a numeric + star score recorded at the end.

**Architecture:** Training is layered on top of the existing shared `pitch-detector` + `staff-engine`. New `training/` modules hold pure state (engine, scoring, storage, catalog). `Staff.tsx` is extended with optional target-track rendering. `TrainingScreen.tsx` switches between picker / active-run / result sub-views. `App.tsx` owns a `mode` signal that swaps the main region between `Staff` and `TrainingScreen`.

**Tech Stack:** SolidJS + TypeScript + Vite + Vitest. No new runtime or dev dependencies.

**Spec:** `docs/superpowers/specs/2026-04-20-training-mode-design.md`

**Plan-level deviation from spec:** the spec lists a `Staff.test.tsx` component test. There is no component-testing infrastructure in this repo (no `@solidjs/testing-library`). Rather than introducing it for a single opacity/positioning check, we extract the scroll math into a pure function in `staff-layout.ts` and unit-test that; the visual rendering changes are covered by manual verification.

---

## Task 1: Add Target / Challenge types and empty catalog

**Files:**
- Create: `src/training/challenges.ts`
- Create: `src/training/challenges.test.ts`

- [ ] **Step 1: Write the failing test**

Write `src/training/challenges.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CHALLENGES, noteTargetCount, type Challenge } from "./challenges";

describe("CHALLENGES catalog", () => {
  it("is an array", () => {
    expect(Array.isArray(CHALLENGES)).toBe(true);
  });

  it("has unique ids", () => {
    const ids = CHALLENGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every challenge has at least one target", () => {
    for (const c of CHALLENGES) {
      expect(c.targets.length, c.id).toBeGreaterThan(0);
    }
  });

  it("every challenge starts with a note target, not a rest", () => {
    for (const c of CHALLENGES) {
      expect(c.targets[0].kind, c.id).toBe("note");
    }
  });

  it("no two consecutive identical note-midi targets without a rest between", () => {
    for (const c of CHALLENGES) {
      for (let i = 1; i < c.targets.length; i++) {
        const prev = c.targets[i - 1];
        const curr = c.targets[i];
        if (prev.kind === "note" && curr.kind === "note") {
          expect(
            curr.midi,
            `${c.id} at index ${i}: two consecutive ${curr.midi}s without a rest`,
          ).not.toBe(prev.midi);
        }
      }
    }
  });
});

describe("noteTargetCount", () => {
  it("counts only note targets", () => {
    const ch: Challenge = {
      id: "test",
      title: "Test",
      group: "long-tones",
      targets: [
        { kind: "note", midi: 60 },
        { kind: "rest" },
        { kind: "note", midi: 62 },
      ],
    };
    expect(noteTargetCount(ch)).toBe(2);
  });

  it("returns 0 for an all-rest sequence", () => {
    const ch: Challenge = {
      id: "test",
      title: "Test",
      group: "long-tones",
      targets: [{ kind: "rest" }, { kind: "rest" }],
    };
    expect(noteTargetCount(ch)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/training/challenges.test.ts
```

Expected: FAIL — module `./challenges` does not exist.

- [ ] **Step 3: Write minimal implementation**

Write `src/training/challenges.ts`:

```ts
export type Target =
  | { kind: "note"; midi: number } // concert MIDI
  | { kind: "rest" };

export type ChallengeGroup = "long-tones" | "scales" | "melodies";

export interface Challenge {
  id: string;
  title: string;
  group: ChallengeGroup;
  targets: readonly Target[];
}

export const CHALLENGES: readonly Challenge[] = [];

export function noteTargetCount(c: Challenge): number {
  return c.targets.filter((t) => t.kind === "note").length;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/training/challenges.test.ts
```

Expected: PASS — all tests green (empty catalog trivially satisfies all invariants; `noteTargetCount` tests use inline challenges).

- [ ] **Step 5: Commit**

```bash
git add src/training/challenges.ts src/training/challenges.test.ts
git commit -m "feat(training): add Target + Challenge types with catalog invariants"
```

---

## Task 2: Add scoring module

**Files:**
- Create: `src/training/scoring.ts`
- Create: `src/training/scoring.test.ts`

- [ ] **Step 1: Write the failing test**

Write `src/training/scoring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeScore } from "./scoring";

describe("computeScore", () => {
  it("returns score 100 + 3 stars when no mistakes and 0 cents", () => {
    const r = computeScore({
      perNoteWorstCents: [0, 0, 0],
      mistakes: 0,
      noteTargetCount: 3,
    });
    expect(r.score).toBe(100);
    expect(r.stars).toBe(3);
    expect(r.avgCents).toBe(0);
  });

  it("returns score 0 + 1 star when avg cents is 30 or more", () => {
    const r = computeScore({
      perNoteWorstCents: [30, 30, 30],
      mistakes: 0,
      noteTargetCount: 3,
    });
    expect(r.score).toBe(0);
    expect(r.stars).toBe(1);
    expect(r.avgCents).toBe(30);
  });

  it("avg cents of 6 with no mistakes scores 80 = 2 stars", () => {
    // intonationFactor = 1 - 6/30 = 0.8 ; score = 100 * 0.8 = 80
    const r = computeScore({
      perNoteWorstCents: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
      mistakes: 0,
      noteTargetCount: 10,
    });
    expect(r.score).toBe(80);
    expect(r.stars).toBe(2);
  });

  it("applies 50% weighted mistake penalty", () => {
    // avg cents 0 → intonationFactor 1
    // 2 mistakes / 10 notes = 0.2 ; penalty factor = 1 - 0.2 * 0.5 = 0.9
    // score = 100 * 1 * 0.9 = 90 → exactly 3 stars
    const r = computeScore({
      perNoteWorstCents: new Array(10).fill(0),
      mistakes: 2,
      noteTargetCount: 10,
    });
    expect(r.score).toBe(90);
    expect(r.stars).toBe(3);
  });

  it("mistake penalty floors at 0", () => {
    // 100 mistakes / 10 notes = 10 ; penalty = 1 - 10 * 0.5 = -4 → clamped to 0
    const r = computeScore({
      perNoteWorstCents: new Array(10).fill(0),
      mistakes: 100,
      noteTargetCount: 10,
    });
    expect(r.score).toBe(0);
    expect(r.stars).toBe(1);
  });

  it("star boundary at 90 = 3 stars, 89 = 2 stars", () => {
    // Use cents to land exactly at 90 vs 89.
    // score = 100 * (1 - avg/30) with no mistakes. avg = 3 → 100 * 0.9 = 90.
    const r3 = computeScore({
      perNoteWorstCents: [3],
      mistakes: 0,
      noteTargetCount: 1,
    });
    expect(r3.score).toBe(90);
    expect(r3.stars).toBe(3);

    // avg 3.3 → 100 * (1 - 3.3/30) = 89 (rounded).
    const r2 = computeScore({
      perNoteWorstCents: [3.3],
      mistakes: 0,
      noteTargetCount: 1,
    });
    expect(r2.score).toBe(89);
    expect(r2.stars).toBe(2);
  });

  it("star boundary at 70 = 2 stars, 69 = 1 star", () => {
    // avg 9 → 100 * (1 - 9/30) = 70
    const r2 = computeScore({
      perNoteWorstCents: [9],
      mistakes: 0,
      noteTargetCount: 1,
    });
    expect(r2.score).toBe(70);
    expect(r2.stars).toBe(2);

    // avg 9.3 → 100 * (1 - 9.3/30) = 69 (rounded)
    const r1 = computeScore({
      perNoteWorstCents: [9.3],
      mistakes: 0,
      noteTargetCount: 1,
    });
    expect(r1.score).toBe(69);
    expect(r1.stars).toBe(1);
  });

  it("handles empty perNoteWorstCents without NaN", () => {
    const r = computeScore({
      perNoteWorstCents: [],
      mistakes: 0,
      noteTargetCount: 0,
    });
    expect(r.score).toBe(100);
    expect(r.stars).toBe(3);
    expect(r.avgCents).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/training/scoring.test.ts
```

Expected: FAIL — module `./scoring` does not exist.

- [ ] **Step 3: Write minimal implementation**

Write `src/training/scoring.ts`:

```ts
export const INTONATION_CAP_CENTS = 30;
export const MISTAKE_WEIGHT = 0.5;
export const STAR_3_THRESHOLD = 90;
export const STAR_2_THRESHOLD = 70;

export interface RunProgress {
  perNoteWorstCents: readonly number[];
  mistakes: number;
  noteTargetCount: number;
}

export interface RunScore {
  score: number;
  stars: 1 | 2 | 3;
  avgCents: number;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function computeScore(p: RunProgress): RunScore {
  const avgCents =
    p.perNoteWorstCents.length === 0
      ? 0
      : p.perNoteWorstCents.reduce((s, c) => s + c, 0) /
        p.perNoteWorstCents.length;

  const intonationFactor = clamp01(1 - avgCents / INTONATION_CAP_CENTS);
  const mistakeRatio =
    p.noteTargetCount === 0 ? 0 : p.mistakes / p.noteTargetCount;
  const mistakePenalty = clamp01(1 - mistakeRatio * MISTAKE_WEIGHT);

  const rawScore = 100 * intonationFactor * mistakePenalty;
  const score = Math.round(rawScore);
  const stars: 1 | 2 | 3 =
    score >= STAR_3_THRESHOLD ? 3 : score >= STAR_2_THRESHOLD ? 2 : 1;

  return { score, stars, avgCents };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/training/scoring.test.ts
```

Expected: PASS — all 8 test cases green.

- [ ] **Step 5: Commit**

```bash
git add src/training/scoring.ts src/training/scoring.test.ts
git commit -m "feat(training): add score + star computation"
```

---

## Task 3: Add localStorage-backed best-score storage

**Files:**
- Create: `src/training/storage.ts`
- Create: `src/training/storage.test.ts`

- [ ] **Step 1: Write the failing test**

Write `src/training/storage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getAll, getBest, recordRun, STORAGE_KEY } from "./storage";

// In-memory localStorage stub. Vitest runs in the node environment by default,
// which does not provide window/localStorage.
function installMemoryStorage() {
  const data = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(i) {
      return Array.from(data.keys())[i] ?? null;
    },
    removeItem(key) {
      data.delete(key);
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
  (globalThis as unknown as { localStorage: Storage }).localStorage = stub;
  return stub;
}

beforeEach(() => {
  installMemoryStorage();
});

describe("storage", () => {
  it("returns {} from getAll() when nothing is stored", () => {
    expect(getAll()).toEqual({});
  });

  it("returns null from getBest() for an unknown challenge", () => {
    expect(getBest("missing")).toBeNull();
  });

  it("recordRun writes a new best and returns true", () => {
    const wasNewBest = recordRun("ch1", 80, 2);
    expect(wasNewBest).toBe(true);
    const best = getBest("ch1");
    expect(best?.score).toBe(80);
    expect(best?.stars).toBe(2);
    expect(typeof best?.playedAt).toBe("number");
  });

  it("recordRun with a lower score does not overwrite and returns false", () => {
    recordRun("ch1", 80, 2);
    const firstTimestamp = getBest("ch1")!.playedAt;
    const wasNewBest = recordRun("ch1", 60, 1);
    expect(wasNewBest).toBe(false);
    expect(getBest("ch1")!.score).toBe(80);
    expect(getBest("ch1")!.playedAt).toBe(firstTimestamp);
  });

  it("recordRun with an equal score does not overwrite (strict-beat only)", () => {
    recordRun("ch1", 80, 2);
    const firstTimestamp = getBest("ch1")!.playedAt;
    const wasNewBest = recordRun("ch1", 80, 2);
    expect(wasNewBest).toBe(false);
    expect(getBest("ch1")!.playedAt).toBe(firstTimestamp);
  });

  it("recordRun with a higher score overwrites and returns true", () => {
    recordRun("ch1", 80, 2);
    const wasNewBest = recordRun("ch1", 95, 3);
    expect(wasNewBest).toBe(true);
    expect(getBest("ch1")!.score).toBe(95);
    expect(getBest("ch1")!.stars).toBe(3);
  });

  it("getAll returns every stored challenge", () => {
    recordRun("ch1", 80, 2);
    recordRun("ch2", 95, 3);
    const all = getAll();
    expect(Object.keys(all).sort()).toEqual(["ch1", "ch2"]);
  });

  it("malformed JSON in storage is swallowed as empty", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    expect(getAll()).toEqual({});
    expect(getBest("ch1")).toBeNull();
  });

  it("non-object JSON in storage is swallowed as empty", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(42));
    expect(getAll()).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/training/storage.test.ts
```

Expected: FAIL — module `./storage` does not exist.

- [ ] **Step 3: Write minimal implementation**

Write `src/training/storage.ts`:

```ts
export const STORAGE_KEY = "trumpet-training-v1";

export interface StoredBest {
  score: number;
  stars: 1 | 2 | 3;
  playedAt: number;
}

export type StorageShape = Record<string, StoredBest>;

function readRaw(): StorageShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    return parsed as StorageShape;
  } catch {
    return {};
  }
}

function writeRaw(data: StorageShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage may be full or disabled; drop the write silently.
  }
}

export function getAll(): StorageShape {
  return readRaw();
}

export function getBest(id: string): StoredBest | null {
  const all = readRaw();
  return all[id] ?? null;
}

export function recordRun(
  id: string,
  score: number,
  stars: 1 | 2 | 3,
): boolean {
  const all = readRaw();
  const existing = all[id];
  if (existing !== undefined && existing.score >= score) {
    return false;
  }
  all[id] = { score, stars, playedAt: Date.now() };
  writeRaw(all);
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/training/storage.test.ts
```

Expected: PASS — all 9 test cases green.

- [ ] **Step 5: Commit**

```bash
git add src/training/storage.ts src/training/storage.test.ts
git commit -m "feat(training): add localStorage-backed best-score tracking"
```

---

## Task 4: Add training engine (state machine)

**Files:**
- Create: `src/training/training-engine.ts`
- Create: `src/training/training-engine.test.ts`

- [ ] **Step 1: Write the failing test**

Write `src/training/training-engine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createTrainingEngine } from "./training-engine";
import type { Challenge } from "./challenges";
import type { CommittedEvent } from "../staff/staff-engine";

function noteEvent(midi: number, worstCents = 0): CommittedEvent {
  return { kind: "note", midi, worstCents };
}

function restEvent(): CommittedEvent {
  return { kind: "rest" };
}

function makeChallenge(targets: Challenge["targets"]): Challenge {
  return { id: "t", title: "Test", group: "long-tones", targets };
}

describe("createTrainingEngine — matching", () => {
  it("advances targetIndex and records worstCents on a correct note match", () => {
    const c = makeChallenge([
      { kind: "note", midi: 60 },
      { kind: "note", midi: 62 },
    ]);
    const e = createTrainingEngine(c);
    e.onCommitted([noteEvent(60, 5)]);
    const p = e.getProgress();
    expect(p.targetIndex).toBe(1);
    expect(p.perNoteWorstCents).toEqual([5]);
    expect(p.mistakes).toBe(0);
  });

  it("counts a wrong note as a mistake and does not advance", () => {
    const c = makeChallenge([
      { kind: "note", midi: 60 },
      { kind: "note", midi: 62 },
    ]);
    const e = createTrainingEngine(c);
    e.onCommitted([noteEvent(64)]);
    const p = e.getProgress();
    expect(p.targetIndex).toBe(0);
    expect(p.mistakes).toBe(1);
    expect(p.perNoteWorstCents).toEqual([]);
  });

  it("ignores a committed rest while expecting a note (no penalty)", () => {
    const c = makeChallenge([{ kind: "note", midi: 60 }]);
    const e = createTrainingEngine(c);
    e.onCommitted([restEvent()]);
    const p = e.getProgress();
    expect(p.targetIndex).toBe(0);
    expect(p.mistakes).toBe(0);
  });

  it("advances on a matching rest", () => {
    const c = makeChallenge([
      { kind: "note", midi: 60 },
      { kind: "rest" },
      { kind: "note", midi: 60 },
    ]);
    const e = createTrainingEngine(c);
    e.onCommitted([noteEvent(60), restEvent()]);
    const p = e.getProgress();
    expect(p.targetIndex).toBe(2);
  });

  it("counts a note as a mistake when expecting a rest", () => {
    const c = makeChallenge([
      { kind: "note", midi: 60 },
      { kind: "rest" },
    ]);
    const e = createTrainingEngine(c);
    // First note matches; next a note (not the expected rest) = mistake.
    e.onCommitted([noteEvent(60), noteEvent(62)]);
    const p = e.getProgress();
    expect(p.targetIndex).toBe(1);
    expect(p.mistakes).toBe(1);
  });

  it("supports recovery: wrong note then correct note", () => {
    const c = makeChallenge([{ kind: "note", midi: 60 }]);
    const e = createTrainingEngine(c);
    e.onCommitted([noteEvent(62), noteEvent(60, 7)]);
    const p = e.getProgress();
    expect(p.targetIndex).toBe(1);
    expect(p.mistakes).toBe(1);
    expect(p.perNoteWorstCents).toEqual([7]);
  });

  it("only processes newly-appended events across calls", () => {
    const c = makeChallenge([
      { kind: "note", midi: 60 },
      { kind: "note", midi: 62 },
    ]);
    const e = createTrainingEngine(c);
    const events: CommittedEvent[] = [];
    events.push(noteEvent(60));
    e.onCommitted(events);
    expect(e.getProgress().targetIndex).toBe(1);
    events.push(noteEvent(62));
    e.onCommitted(events);
    expect(e.getProgress().targetIndex).toBe(2);
    // Calling again with no new events is a no-op.
    e.onCommitted(events);
    expect(e.getProgress().targetIndex).toBe(2);
    expect(e.getProgress().mistakes).toBe(0);
  });
});

describe("createTrainingEngine — isDone", () => {
  it("reports not done initially", () => {
    const c = makeChallenge([{ kind: "note", midi: 60 }]);
    const e = createTrainingEngine(c);
    expect(e.isDone()).toBe(false);
  });

  it("flips to done when targetIndex reaches targets.length", () => {
    const c = makeChallenge([
      { kind: "note", midi: 60 },
      { kind: "note", midi: 62 },
    ]);
    const e = createTrainingEngine(c);
    e.onCommitted([noteEvent(60), noteEvent(62)]);
    expect(e.isDone()).toBe(true);
  });

  it("ignores commits after done", () => {
    const c = makeChallenge([{ kind: "note", midi: 60 }]);
    const e = createTrainingEngine(c);
    e.onCommitted([noteEvent(60), noteEvent(62), noteEvent(64)]);
    expect(e.isDone()).toBe(true);
    expect(e.getProgress().mistakes).toBe(0);
  });
});

describe("createTrainingEngine — reset", () => {
  it("clears progress and starts processing from index 0 again", () => {
    const c = makeChallenge([
      { kind: "note", midi: 60 },
      { kind: "note", midi: 62 },
    ]);
    const e = createTrainingEngine(c);
    e.onCommitted([noteEvent(60), noteEvent(65)]); // 1 match + 1 mistake
    expect(e.getProgress().mistakes).toBe(1);

    e.reset();
    expect(e.getProgress()).toEqual({
      targetIndex: 0,
      noteTargetCount: 2,
      mistakes: 0,
      perNoteWorstCents: [],
    });
    // After reset, onCommitted should be re-called with the fresh (cleared)
    // staff-engine array — index-0 restart.
    e.onCommitted([noteEvent(60)]);
    expect(e.getProgress().targetIndex).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/training/training-engine.test.ts
```

Expected: FAIL — module `./training-engine` does not exist.

- [ ] **Step 3: Write minimal implementation**

Write `src/training/training-engine.ts`:

```ts
import type { CommittedEvent } from "../staff/staff-engine";
import type { Challenge } from "./challenges";
import { noteTargetCount } from "./challenges";

export interface TrainingProgress {
  targetIndex: number;
  noteTargetCount: number;
  mistakes: number;
  perNoteWorstCents: readonly number[];
}

export interface TrainingEngine {
  onCommitted(events: readonly CommittedEvent[]): void;
  getProgress(): TrainingProgress;
  isDone(): boolean;
  reset(): void;
}

export function createTrainingEngine(challenge: Challenge): TrainingEngine {
  const total = challenge.targets.length;
  const nNotes = noteTargetCount(challenge);

  let targetIndex = 0;
  let mistakes = 0;
  const perNoteWorstCents: number[] = [];
  let processedCount = 0;

  function process(event: CommittedEvent): void {
    if (targetIndex >= total) return;
    const t = challenge.targets[targetIndex];
    if (t.kind === "note") {
      if (event.kind === "note" && event.midi === t.midi) {
        perNoteWorstCents.push(event.worstCents);
        targetIndex += 1;
      } else if (event.kind === "note") {
        mistakes += 1;
      }
      // Committed rest while expecting a note: ignore.
    } else {
      // expecting rest
      if (event.kind === "rest") {
        targetIndex += 1;
      } else {
        mistakes += 1;
      }
    }
  }

  return {
    onCommitted(events) {
      // Only process newly-appended events. Callers may hand the full
      // snapshot each frame; we keep our own cursor.
      if (events.length < processedCount) {
        // Upstream reset — caller should have called reset() first, but
        // tolerate shrinkage by restarting from 0.
        processedCount = 0;
      }
      for (let i = processedCount; i < events.length; i++) {
        process(events[i]);
      }
      processedCount = events.length;
    },
    getProgress() {
      return {
        targetIndex,
        noteTargetCount: nNotes,
        mistakes,
        perNoteWorstCents: perNoteWorstCents.slice(),
      };
    },
    isDone() {
      return targetIndex >= total;
    },
    reset() {
      targetIndex = 0;
      mistakes = 0;
      perNoteWorstCents.length = 0;
      processedCount = 0;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/training/training-engine.test.ts
```

Expected: PASS — all test cases green.

- [ ] **Step 5: Commit**

```bash
git add src/training/training-engine.ts src/training/training-engine.test.ts
git commit -m "feat(training): add training-engine state machine"
```

---

## Task 5: Populate the challenge catalog

**Files:**
- Modify: `src/training/challenges.ts`

- [ ] **Step 1: Populate the catalog**

Replace the body of `src/training/challenges.ts` so that the exported
`CHALLENGES` constant contains the full v1 catalog. Keep the types
defined in Task 1. The catalog is authored in concert MIDI; the
staff transposition is applied at render time.

MIDI reference:
- C4=60, D4=62, E4=64, F4=65, G4=67, A4=69, Bb4=70, B4=71
- C5=72, D5=74, Eb5=75, E5=76, F5=77, G5=79, A5=81, Bb5=82
- C6=84

Full file content:

```ts
export type Target =
  | { kind: "note"; midi: number } // concert MIDI
  | { kind: "rest" };

export type ChallengeGroup = "long-tones" | "scales" | "melodies";

export interface Challenge {
  id: string;
  title: string;
  group: ChallengeGroup;
  targets: readonly Target[];
}

const n = (midi: number): Target => ({ kind: "note", midi });
const r: Target = { kind: "rest" };

export const CHALLENGES: readonly Challenge[] = [
  // ---- Long tones ----
  {
    id: "long-g4",
    title: "Long tone: G4",
    group: "long-tones",
    targets: [n(67), r, n(67), r, n(67)],
  },
  {
    id: "long-bb4",
    title: "Long tone: Bb4",
    group: "long-tones",
    targets: [n(70), r, n(70), r, n(70)],
  },
  {
    id: "long-c5",
    title: "Long tone: C5",
    group: "long-tones",
    targets: [n(72), r, n(72), r, n(72)],
  },

  // ---- Scales & arpeggios ----
  {
    id: "scale-bb-major",
    title: "Bb major scale (one octave)",
    group: "scales",
    targets: [n(70), n(72), n(74), n(75), n(77), n(79), n(81), n(82)],
  },
  {
    id: "scale-f-major",
    title: "F major scale (one octave)",
    group: "scales",
    targets: [n(65), n(67), n(69), n(70), n(72), n(74), n(76), n(77)],
  },
  {
    id: "arp-c-major",
    title: "C major arpeggio",
    group: "scales",
    targets: [n(72), n(76), n(79), n(84)],
  },
  {
    id: "arp-bb-major",
    title: "Bb major arpeggio",
    group: "scales",
    targets: [n(70), n(74), n(77), n(82)],
  },

  // ---- Melodies ----
  // Mary had a little lamb: E D C D E E E
  // With rests between the repeated Es.
  {
    id: "mary-lamb",
    title: "Mary Had a Little Lamb",
    group: "melodies",
    targets: [n(76), n(74), n(72), n(74), n(76), r, n(76), r, n(76)],
  },
  // Ode to Joy opening (simplified, no adjacent repeats):
  // E F G F E D C.
  {
    id: "ode-to-joy",
    title: "Ode to Joy (opening)",
    group: "melodies",
    targets: [n(76), n(77), n(79), n(77), n(76), n(74), n(72)],
  },
  // Twinkle Twinkle: C C G G A A G F F E E D D C
  // All repeats separated by rests.
  {
    id: "twinkle",
    title: "Twinkle, Twinkle, Little Star",
    group: "melodies",
    targets: [
      n(72), r, n(72), n(79), r, n(79), n(81), r, n(81), n(79),
      n(77), r, n(77), n(76), r, n(76), n(74), r, n(74), n(72),
    ],
  },
  // Amazing Grace opening: G C E C E D C A G (no adjacent repeats).
  {
    id: "amazing-grace",
    title: "Amazing Grace (opening)",
    group: "melodies",
    targets: [n(67), n(72), n(76), n(72), n(76), n(74), n(72), n(69), n(67)],
  },
];

export function noteTargetCount(c: Challenge): number {
  return c.targets.filter((t) => t.kind === "note").length;
}
```

- [ ] **Step 2: Run all tests (catalog invariants included)**

```bash
npx vitest run
```

Expected: PASS — the catalog invariant tests added in Task 1 now run against real data; every entry should satisfy them. If any fail, fix the catalog inline (most likely: an adjacent-note repeat slipped through).

- [ ] **Step 3: Commit**

```bash
git add src/training/challenges.ts
git commit -m "feat(training): populate initial challenge catalog"
```

---

## Task 6: Extract scroll math into a pure function in staff-layout

**Files:**
- Modify: `src/staff/staff-layout.ts`
- Modify: `src/staff/staff-layout.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/staff/staff-layout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeScrollX } from "./staff-layout";

describe("computeScrollX — free-play mode (no targets)", () => {
  const layout = {
    noteStart: 100,
    noteSpacing: 56,
    viewWidth: 1000,
    leftMargin: 80,
  };

  it("returns 0 when the ghost fits within the viewport", () => {
    const x = computeScrollX({ committedCount: 3, remainingTargets: 0, ...layout });
    expect(x).toBe(0);
  });

  it("scrolls to keep the ghost near the right edge once the staff fills", () => {
    // committedCount = 20 → ghost at eventX(20) = 100 + 20*56 = 1220.
    // overflow = eventX(21) - (1000 - 40) = 1276 - 960 = 316.
    const x = computeScrollX({ committedCount: 20, remainingTargets: 0, ...layout });
    expect(x).toBe(316);
  });
});

describe("computeScrollX — training mode (remainingTargets > 0)", () => {
  const layout = {
    noteStart: 100,
    noteSpacing: 56,
    viewWidth: 1000,
    leftMargin: 80,
  };

  it("returns 0 for short challenges (ghost + targets fit)", () => {
    const x = computeScrollX({ committedCount: 0, remainingTargets: 5, ...layout });
    expect(x).toBe(0);
  });

  it("keeps the ghost ~1/3 from the left once past the visible capacity", () => {
    // committedCount = 15, remainingTargets = 10.
    // ghostX = 100 + 15*56 = 940.
    // desiredGhostScreenX = leftMargin + (viewWidth - leftMargin) / 3
    //                     = 80 + 920/3 = 80 + 306.666... ≈ 386.67.
    // scrollX = max(0, 940 - 386.67) ≈ 553.33.
    const x = computeScrollX({ committedCount: 15, remainingTargets: 10, ...layout });
    expect(x).toBeCloseTo(553.33, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/staff/staff-layout.test.ts
```

Expected: FAIL — `computeScrollX` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/staff/staff-layout.ts`:

```ts
export interface ScrollXArgs {
  committedCount: number;
  remainingTargets: number;
  noteStart: number;
  noteSpacing: number;
  viewWidth: number;
  leftMargin: number;
}

/**
 * X scroll offset for the staff's event-containing group.
 *
 * Free-play mode (remainingTargets === 0): keep the ghost near the right
 * edge — identical behavior to the original inline formula.
 *
 * Training mode (remainingTargets > 0): keep the ghost roughly 1/3 from
 * the left of the visible region so upcoming targets are visible ahead of
 * the current note being played.
 */
export function computeScrollX(a: ScrollXArgs): number {
  const eventX = (i: number) => a.noteStart + i * a.noteSpacing;
  const ghostIndex = a.committedCount;

  if (a.remainingTargets === 0) {
    const lastX = eventX(ghostIndex + 1);
    const overflow = lastX - (a.viewWidth - a.leftMargin / 2);
    return overflow > 0 ? overflow : 0;
  }
  const ghostX = eventX(ghostIndex);
  const desiredScreenX = a.leftMargin + (a.viewWidth - a.leftMargin) / 3;
  return Math.max(0, ghostX - desiredScreenX);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/staff/staff-layout.test.ts
```

Expected: PASS — both new `computeScrollX` describe blocks plus the existing layout tests.

- [ ] **Step 5: Commit**

```bash
git add src/staff/staff-layout.ts src/staff/staff-layout.test.ts
git commit -m "feat(staff): extract scroll math + add training scroll mode"
```

---

## Task 7: Extend Staff.tsx to render the target track

**Files:**
- Modify: `src/components/Staff.tsx`

- [ ] **Step 1: Rewrite the Staff component**

Overwrite `src/components/Staff.tsx` with:

```tsx
import { type Component, For, Show } from "solid-js";
import {
  LS,
  STAFF_CENTER_Y,
  STAFF_BOTTOM_LINE_Y,
  STAFF_TRANSPOSE_SEMITONES,
  displayMidiToY,
  ledgerLineYs,
  accidentalPlacement,
  quarterRestPath,
  QUARTER_REST_Y,
  computeScrollX,
} from "../staff/staff-layout";
import type { CommittedEvent, GhostState } from "../staff/staff-engine";
import type { Target } from "../training/challenges";
import { centsZone, zoneColor } from "../audio/intonation";

interface StaffProps {
  committed: readonly CommittedEvent[];
  ghost: GhostState;
  targets?: readonly Target[];
  targetIndex?: number;
}

const LEFT_MARGIN = 80;
const NOTE_START = LEFT_MARGIN + LS * 2;
const NOTE_SPACING = LS * 4;
const VIEW_HEIGHT = 200;
const VIEW_WIDTH = 1000;
const LABEL_Y = STAFF_BOTTOM_LINE_Y + LS * 4;
const TARGET_OPACITY = 0.35;

function noteColor(worstCents: number): string {
  return zoneColor(centsZone(worstCents));
}

function formatCents(worstCents: number): string {
  const sign = worstCents > 0 ? "+" : "";
  return `${sign}${worstCents}¢`;
}

const Staff: Component<StaffProps> = (props) => {
  const eventX = (index: number) => NOTE_START + index * NOTE_SPACING;

  const remainingTargets = (): readonly Target[] => {
    const ts = props.targets;
    if (!ts) return [];
    return ts.slice(props.targetIndex ?? 0);
  };

  const scrollX = () =>
    computeScrollX({
      committedCount: props.committed.length,
      remainingTargets: remainingTargets().length,
      noteStart: NOTE_START,
      noteSpacing: NOTE_SPACING,
      viewWidth: VIEW_WIDTH,
      leftMargin: LEFT_MARGIN,
    });

  return (
    <svg
      class="staff"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <For each={[-2, -1, 0, 1, 2]}>
        {(offset) => (
          <line
            x1={0}
            x2={VIEW_WIDTH}
            y1={STAFF_CENTER_Y + offset * LS}
            y2={STAFF_CENTER_Y + offset * LS}
            stroke="var(--text-secondary)"
            stroke-width="1"
            opacity="0.5"
          />
        )}
      </For>

      <text
        x={16}
        y={STAFF_CENTER_Y + LS * 2.2}
        fill="var(--text-primary)"
        font-size={`${LS * 5}`}
        font-family="serif"
      >
        {"\u{1D11E}"}
      </text>

      <defs>
        <clipPath id="staff-clip">
          <rect
            x={LEFT_MARGIN}
            y={0}
            width={VIEW_WIDTH - LEFT_MARGIN}
            height={VIEW_HEIGHT}
          />
        </clipPath>
      </defs>

      <g clip-path="url(#staff-clip)">
        <g transform={`translate(${-scrollX()}, 0)`}>
          {/* Committed events */}
          <For each={props.committed}>
            {(event, index) => {
              const x = eventX(index());
              if (event.kind === "rest") {
                return (
                  <g transform={`translate(${x}, ${QUARTER_REST_Y})`}>
                    <path
                      d={quarterRestPath()}
                      fill="var(--text-secondary)"
                      opacity="0.85"
                    />
                  </g>
                );
              }
              const displayMidi = event.midi + STAFF_TRANSPOSE_SEMITONES;
              const y = displayMidiToY(displayMidi);
              const color = noteColor(event.worstCents);
              const accidental = accidentalPlacement(displayMidi);
              const ledgers = ledgerLineYs(displayMidi);
              return (
                <g>
                  <For each={ledgers}>
                    {(ly) => (
                      <line
                        x1={x - LS * 0.8}
                        x2={x + LS * 0.8}
                        y1={ly}
                        y2={ly}
                        stroke="var(--text-secondary)"
                        stroke-width="1"
                        opacity="0.6"
                      />
                    )}
                  </For>
                  <Show when={accidental}>
                    {(acc) => (
                      <text
                        x={x + acc().dx}
                        y={acc().y + LS * 0.35}
                        fill={color}
                        font-size={`${LS * 1.4}`}
                        font-family="serif"
                        text-anchor="middle"
                      >
                        {acc().glyph}
                      </text>
                    )}
                  </Show>
                  <ellipse
                    cx={x}
                    cy={y}
                    rx={LS * 0.65}
                    ry={LS * 0.5}
                    fill={color}
                    transform={`rotate(-20 ${x} ${y})`}
                  />
                  <text
                    x={x}
                    y={LABEL_Y}
                    fill={color}
                    font-size={`${LS * 0.75}`}
                    text-anchor="middle"
                  >
                    {formatCents(event.worstCents)}
                  </text>
                </g>
              );
            }}
          </For>

          {/* Ghost */}
          <Show when={props.ghost.candidate}>
            {(candidate) => {
              const c = candidate();
              const x = eventX(props.committed.length);
              if (c.kind === "rest") {
                return (
                  <g
                    transform={`translate(${x}, ${QUARTER_REST_Y})`}
                    opacity="0.4"
                  >
                    <path d={quarterRestPath()} fill="var(--text-secondary)" />
                  </g>
                );
              }
              const displayMidi = c.midi + STAFF_TRANSPOSE_SEMITONES;
              const y = displayMidiToY(displayMidi);
              const accidental = accidentalPlacement(displayMidi);
              const ledgers = ledgerLineYs(displayMidi);
              return (
                <g opacity="0.5">
                  <For each={ledgers}>
                    {(ly) => (
                      <line
                        x1={x - LS * 0.8}
                        x2={x + LS * 0.8}
                        y1={ly}
                        y2={ly}
                        stroke="var(--text-secondary)"
                        stroke-width="1"
                      />
                    )}
                  </For>
                  <Show when={accidental}>
                    {(acc) => (
                      <text
                        x={x + acc().dx}
                        y={acc().y + LS * 0.35}
                        fill="var(--text-primary)"
                        font-size={`${LS * 1.4}`}
                        font-family="serif"
                        text-anchor="middle"
                      >
                        {acc().glyph}
                      </text>
                    )}
                  </Show>
                  <ellipse
                    cx={x}
                    cy={y}
                    rx={LS * 0.65}
                    ry={LS * 0.5}
                    fill="var(--text-primary)"
                    transform={`rotate(-20 ${x} ${y})`}
                  />
                </g>
              );
            }}
          </Show>

          {/* Target track (grayed-out upcoming targets) */}
          <For each={remainingTargets()}>
            {(target, j) => {
              const x = eventX(props.committed.length + 1 + j());
              if (target.kind === "rest") {
                return (
                  <g
                    transform={`translate(${x}, ${QUARTER_REST_Y})`}
                    opacity={TARGET_OPACITY}
                  >
                    <path d={quarterRestPath()} fill="var(--text-secondary)" />
                  </g>
                );
              }
              const displayMidi = target.midi + STAFF_TRANSPOSE_SEMITONES;
              const y = displayMidiToY(displayMidi);
              const accidental = accidentalPlacement(displayMidi);
              const ledgers = ledgerLineYs(displayMidi);
              return (
                <g opacity={TARGET_OPACITY}>
                  <For each={ledgers}>
                    {(ly) => (
                      <line
                        x1={x - LS * 0.8}
                        x2={x + LS * 0.8}
                        y1={ly}
                        y2={ly}
                        stroke="var(--text-secondary)"
                        stroke-width="1"
                      />
                    )}
                  </For>
                  <Show when={accidental}>
                    {(acc) => (
                      <text
                        x={x + acc().dx}
                        y={acc().y + LS * 0.35}
                        fill="var(--text-secondary)"
                        font-size={`${LS * 1.4}`}
                        font-family="serif"
                        text-anchor="middle"
                      >
                        {acc().glyph}
                      </text>
                    )}
                  </Show>
                  <ellipse
                    cx={x}
                    cy={y}
                    rx={LS * 0.65}
                    ry={LS * 0.5}
                    fill="var(--text-secondary)"
                    transform={`rotate(-20 ${x} ${y})`}
                  />
                </g>
              );
            }}
          </For>
        </g>
      </g>
    </svg>
  );
};

export default Staff;
```

- [ ] **Step 2: Build-check**

```bash
npx tsc -b
```

Expected: no errors. (Vitest runs separately.)

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: PASS — existing Staff behavior unchanged when `targets` prop is absent; scroll math tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/Staff.tsx
git commit -m "feat(staff): render optional target track for training mode"
```

---

## Task 8: Add ChallengeCard component

**Files:**
- Create: `src/components/ChallengeCard.tsx`

- [ ] **Step 1: Create the component**

Write `src/components/ChallengeCard.tsx`:

```tsx
import { type Component, For } from "solid-js";
import type { Challenge } from "../training/challenges";
import { noteTargetCount } from "../training/challenges";
import type { StoredBest } from "../training/storage";

interface ChallengeCardProps {
  challenge: Challenge;
  best: StoredBest | null;
  onPick: () => void;
}

const ChallengeCard: Component<ChallengeCardProps> = (props) => {
  const stars = () => props.best?.stars ?? 0;
  const starPositions = [1, 2, 3] as const;

  return (
    <button class="challenge-card" onClick={props.onPick} type="button">
      <div class="challenge-card-title">{props.challenge.title}</div>
      <div class="challenge-card-meta">
        {noteTargetCount(props.challenge)} notes
      </div>
      <div class="challenge-card-stars" aria-label={`${stars()} stars`}>
        <For each={starPositions}>
          {(pos) => (
            <span
              class="challenge-card-star"
              classList={{ "challenge-card-star-filled": pos <= stars() }}
            >
              {pos <= stars() ? "★" : "☆"}
            </span>
          )}
        </For>
      </div>
      <div class="challenge-card-score">
        {props.best !== null ? `Best: ${props.best.score}` : "—"}
      </div>
    </button>
  );
};

export default ChallengeCard;
```

- [ ] **Step 2: Build-check**

```bash
npx tsc -b
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ChallengeCard.tsx
git commit -m "feat(training): add ChallengeCard picker tile"
```

---

## Task 9: Add TrainingResult modal component

**Files:**
- Create: `src/components/TrainingResult.tsx`

- [ ] **Step 1: Create the component**

Write `src/components/TrainingResult.tsx`:

```tsx
import { type Component, For, Show } from "solid-js";
import type { RunScore } from "../training/scoring";

interface TrainingResultProps {
  result: RunScore;
  isNewBest: boolean;
  mistakes: number;
  onRetry: () => void;
  onBackToPicker: () => void;
}

const TrainingResult: Component<TrainingResultProps> = (props) => {
  const starPositions = [1, 2, 3] as const;

  return (
    <div class="training-result-backdrop">
      <div class="training-result">
        <Show when={props.isNewBest}>
          <div class="training-result-ribbon">New best!</div>
        </Show>
        <div class="training-result-stars" aria-label={`${props.result.stars} stars`}>
          <For each={starPositions}>
            {(pos) => (
              <span
                class="training-result-star"
                classList={{
                  "training-result-star-filled": pos <= props.result.stars,
                }}
              >
                {pos <= props.result.stars ? "★" : "☆"}
              </span>
            )}
          </For>
        </div>
        <div class="training-result-score">{props.result.score}</div>
        <div class="training-result-stats">
          <div>Avg worst cents: {props.result.avgCents.toFixed(1)}¢</div>
          <div>Mistakes: {props.mistakes}</div>
        </div>
        <div class="training-result-actions">
          <button class="start-button" onClick={props.onRetry} type="button">
            Retry
          </button>
          <button
            class="header-clear"
            onClick={props.onBackToPicker}
            type="button"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrainingResult;
```

- [ ] **Step 2: Build-check**

```bash
npx tsc -b
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TrainingResult.tsx
git commit -m "feat(training): add TrainingResult modal"
```

---

## Task 10: Add TrainingScreen component

**Files:**
- Create: `src/components/TrainingScreen.tsx`

- [ ] **Step 1: Create the component**

Write `src/components/TrainingScreen.tsx`:

```tsx
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
} from "solid-js";
import Staff from "./Staff";
import ChallengeCard from "./ChallengeCard";
import TrainingResult from "./TrainingResult";
import { CHALLENGES, type Challenge, type ChallengeGroup } from "../training/challenges";
import {
  createTrainingEngine,
  type TrainingEngine,
  type TrainingProgress,
} from "../training/training-engine";
import { computeScore, type RunScore } from "../training/scoring";
import { getAll, recordRun, type StorageShape } from "../training/storage";
import type { CommittedEvent, GhostState } from "../staff/staff-engine";

interface TrainingScreenProps {
  committed: readonly CommittedEvent[];
  ghost: GhostState;
  onClearStaff: () => void;
  onExit: () => void;
}

type View =
  | { kind: "picker" }
  | { kind: "active"; challenge: Challenge; engine: TrainingEngine }
  | {
      kind: "result";
      challenge: Challenge;
      result: RunScore;
      isNewBest: boolean;
      mistakes: number;
    };

const GROUP_ORDER: readonly ChallengeGroup[] = [
  "long-tones",
  "scales",
  "melodies",
];
const GROUP_LABEL: Record<ChallengeGroup, string> = {
  "long-tones": "Long tones",
  scales: "Scales & arpeggios",
  melodies: "Melodies",
};

const TrainingScreen: Component<TrainingScreenProps> = (props) => {
  const [view, setView] = createSignal<View>({ kind: "picker" });
  const [bests, setBests] = createSignal<StorageShape>(getAll());
  const [progress, setProgress] = createSignal<TrainingProgress>({
    targetIndex: 0,
    noteTargetCount: 0,
    mistakes: 0,
    perNoteWorstCents: [],
  });

  const startChallenge = (challenge: Challenge) => {
    const engine = createTrainingEngine(challenge);
    props.onClearStaff();
    setProgress(engine.getProgress());
    setView({ kind: "active", challenge, engine });
  };

  const restart = () => {
    const v = view();
    if (v.kind !== "active") return;
    v.engine.reset();
    props.onClearStaff();
    setProgress(v.engine.getProgress());
  };

  const backToPicker = () => {
    props.onClearStaff();
    setBests(getAll());
    setView({ kind: "picker" });
  };

  // Feed committed events into the active engine and finish the run when done.
  createEffect(() => {
    const v = view();
    if (v.kind !== "active") return;
    v.engine.onCommitted(props.committed);
    setProgress(v.engine.getProgress());
    if (v.engine.isDone()) {
      const p = v.engine.getProgress();
      const result = computeScore(p);
      const isNewBest = recordRun(v.challenge.id, result.score, result.stars);
      setView({
        kind: "result",
        challenge: v.challenge,
        result,
        isNewBest,
        mistakes: p.mistakes,
      });
    }
  });

  const groupedChallenges = createMemo(() => {
    const map = new Map<ChallengeGroup, Challenge[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const c of CHALLENGES) map.get(c.group)!.push(c);
    return map;
  });

  return (
    <div class="training-screen">
      <div class="training-topbar">
        <button class="header-clear" onClick={props.onExit} type="button">
          ← Free play
        </button>
        <Show when={view().kind === "active"}>
          <div class="training-status">
            {(() => {
              const v = view();
              if (v.kind !== "active") return null;
              const p = progress();
              return (
                <>
                  <span class="training-status-title">{v.challenge.title}</span>
                  <span class="training-status-progress">
                    {p.targetIndex} / {v.challenge.targets.length}
                  </span>
                  <span class="training-status-mistakes">
                    Mistakes: {p.mistakes}
                  </span>
                  <button class="header-clear" onClick={restart} type="button">
                    Restart
                  </button>
                </>
              );
            })()}
          </div>
        </Show>
      </div>

      <Show when={view().kind === "picker"}>
        <div class="challenge-groups">
          <For each={GROUP_ORDER}>
            {(group) => (
              <section class="challenge-group">
                <h3 class="challenge-group-heading">{GROUP_LABEL[group]}</h3>
                <div class="challenge-group-grid">
                  <For each={groupedChallenges().get(group)}>
                    {(c) => (
                      <ChallengeCard
                        challenge={c}
                        best={bests()[c.id] ?? null}
                        onPick={() => startChallenge(c)}
                      />
                    )}
                  </For>
                </div>
              </section>
            )}
          </For>
        </div>
      </Show>

      <Show when={view().kind === "active" || view().kind === "result"}>
        {(() => {
          const v = view();
          if (v.kind !== "active" && v.kind !== "result") return null;
          return (
            <Staff
              committed={props.committed}
              ghost={props.ghost}
              targets={v.challenge.targets}
              targetIndex={progress().targetIndex}
            />
          );
        })()}
      </Show>

      <Show when={view().kind === "result"}>
        {(() => {
          const v = view();
          if (v.kind !== "result") return null;
          const currentChallenge = v.challenge;
          return (
            <TrainingResult
              result={v.result}
              isNewBest={v.isNewBest}
              mistakes={v.mistakes}
              onRetry={() => startChallenge(currentChallenge)}
              onBackToPicker={backToPicker}
            />
          );
        })()}
      </Show>

      <Show when={view().kind === "picker" && CHALLENGES.length === 0}>
        <div class="training-empty">No challenges available.</div>
      </Show>
    </div>
  );
};

export default TrainingScreen;
```

- [ ] **Step 2: Build-check**

```bash
npx tsc -b
```

Expected: no errors.

- [ ] **Step 3: Run the test suite**

```bash
npm test
```

Expected: PASS — the TrainingScreen has no direct tests; we're just confirming nothing downstream broke.

- [ ] **Step 4: Commit**

```bash
git add src/components/TrainingScreen.tsx
git commit -m "feat(training): add TrainingScreen with picker/active/result views"
```

---

## Task 11: Add Train button to HeaderBar

**Files:**
- Modify: `src/components/HeaderBar.tsx`

- [ ] **Step 1: Modify HeaderBar**

Overwrite `src/components/HeaderBar.tsx` with:

```tsx
import type { Component } from "solid-js";
import HorizontalDial from "./HorizontalDial";
import FingeringChart from "./FingeringChart";
import { midiToStaffPitch } from "../audio/notes";
import { getFingering, type Fingering } from "../audio/fingerings";
import type { CommittedEvent } from "../staff/staff-engine";

interface HeaderBarProps {
  frequency: number | null;
  cents: number | null;
  ghost: CommittedEvent | null;
  transpose: number;
  mode: "free-play" | "training";
  onClear: () => void;
  onSettingsOpen: () => void;
  onTrainClick: () => void;
}

function accidentalSuffix(accidental: "natural" | "sharp" | "flat"): string {
  if (accidental === "sharp") return "#";
  if (accidental === "flat") return "b";
  return "";
}

function formatNoteName(
  concertMidi: number,
  transposeSemitones: number,
): string {
  const displayMidi = concertMidi - transposeSemitones;
  const pitch = midiToStaffPitch(displayMidi);
  return `${pitch.letter}${accidentalSuffix(pitch.accidental)}`;
}

function concertFingering(concertMidi: number): Fingering | null {
  const pitch = midiToStaffPitch(concertMidi);
  const noteLabel = `${pitch.letter}${accidentalSuffix(pitch.accidental)}`;
  return getFingering(noteLabel, pitch.octave);
}

const HeaderBar: Component<HeaderBarProps> = (props) => {
  const noteName = () => {
    const g = props.ghost;
    if (g === null || g.kind === "rest") return "—";
    return formatNoteName(g.midi, props.transpose);
  };

  const octave = () => {
    const g = props.ghost;
    if (g === null || g.kind === "rest") return null;
    const displayMidi = g.midi - props.transpose;
    return midiToStaffPitch(displayMidi).octave;
  };

  const fingering = () => {
    const g = props.ghost;
    if (g === null || g.kind === "rest") return null;
    return concertFingering(g.midi);
  };

  const freqText = () => {
    if (props.frequency === null) return "— Hz";
    return `${props.frequency.toFixed(1)} Hz`;
  };

  return (
    <div class="header-bar">
      <div class="header-note">
        <span class="header-note-name">{noteName()}</span>
        {octave() !== null && (
          <span class="header-note-octave">{octave()}</span>
        )}
      </div>
      <div class="header-freq">{freqText()}</div>
      <div class="header-dial">
        <HorizontalDial cents={props.cents} />
      </div>
      <div class="header-fingering">
        <FingeringChart fingering={fingering()} />
      </div>
      <button
        class="header-icon-btn"
        type="button"
        onClick={props.onTrainClick}
        title={props.mode === "training" ? "Free play" : "Train"}
      >
        {props.mode === "training" ? "⟵" : "🎯"}
      </button>
      <button
        class="header-icon-btn"
        type="button"
        onClick={props.onSettingsOpen}
        title="Settings"
      >
        ⚙
      </button>
      <button class="header-clear" type="button" onClick={props.onClear}>
        Clear
      </button>
    </div>
  );
};

export default HeaderBar;
```

- [ ] **Step 2: Build-check**

```bash
npx tsc -b
```

Expected: TypeScript will fail with "Property 'mode' is missing" / "Property 'onTrainClick' is missing" on the `<HeaderBar />` call site in `App.tsx`. This is expected — Task 12 wires those props.

- [ ] **Step 3: No commit yet** — leave this change uncommitted; Task 12 introduces the props in App.tsx and both changes are committed together. If you prefer a commit per task, commit now with `npx tsc --noEmit` temporarily skipped; the cleaner path is to wait.

---

## Task 12: Wire mode switching in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Modify App.tsx**

Overwrite `src/App.tsx` with:

```tsx
import {
  createSignal,
  onCleanup,
  onMount,
  Show,
  type Component,
} from "solid-js";
import ThemeToggle from "./components/ThemeToggle";
import HeaderBar from "./components/HeaderBar";
import Staff from "./components/Staff";
import SettingsDialog from "./components/SettingsDialog";
import TrainingScreen from "./components/TrainingScreen";
import { createPitchDetector } from "./audio/pitch-detector";
import { frequencyToNote } from "./audio/notes";
import {
  createStaffEngine,
  type CommittedEvent,
  type Detection,
  type GhostState,
} from "./staff/staff-engine";

type Mode = "free-play" | "training";

const App: Component = () => {
  const [started, setStarted] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [frequency, setFrequency] = createSignal<number | null>(null);
  const [cents, setCents] = createSignal<number | null>(null);
  const [committed, setCommitted] = createSignal<readonly CommittedEvent[]>([]);
  const [ghost, setGhost] = createSignal<GhostState>({
    candidate: null,
    progress: 0,
  });

  const [transpose, setTranspose] = createSignal(0);
  const [restDelayMs, setRestDelayMs] = createSignal(500);
  const [windowMs, setWindowMs] = createSignal(1000);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [mode, setMode] = createSignal<Mode>("free-play");

  const detector = createPitchDetector();
  const engine = createStaffEngine({ windowMs: windowMs() });
  let animationId: number | undefined;
  let wakeLock: WakeLockSentinel | null = null;

  const acquireWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => {
          wakeLock = null;
        });
      }
    } catch {
      /* Wake Lock not available or denied — not critical */
    }
  };

  const releaseWakeLock = () => {
    wakeLock?.release();
    wakeLock = null;
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible" && started()) {
      acquireWakeLock();
    }
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);

  const handleWindowMsChange = (ms: number) => {
    setWindowMs(ms);
    engine.setWindowMs(ms);
  };

  let lastNoteDetection: (Detection & { kind: "note" }) | null = null;
  let lastNoteSeenAt = 0;

  const toDetection = (freq: number | null, nowTs: number): Detection => {
    if (freq !== null) {
      const info = frequencyToNote(freq);
      if (info !== null) {
        const midi = Math.round(12 * Math.log2(freq / 440) + 69);
        const d: Detection = { kind: "note", midi, cents: info.cents };
        lastNoteDetection = d;
        lastNoteSeenAt = nowTs;
        return d;
      }
    }
    if (
      lastNoteDetection !== null &&
      nowTs - lastNoteSeenAt < restDelayMs()
    ) {
      return lastNoteDetection;
    }
    return { kind: "rest" };
  };

  const startListening = async () => {
    try {
      await detector.start();
      setStarted(true);
      setError(null);
      await acquireWakeLock();

      const tick = () => {
        const nowTs = performance.now();
        const freq = detector.getFrequency();
        setFrequency(freq);
        const detection = toDetection(freq, nowTs);
        if (freq !== null) {
          const info = frequencyToNote(freq);
          setCents(info?.cents ?? null);
        } else {
          setCents(null);
        }
        engine.tick(detection, nowTs);
        setCommitted([...engine.getCommitted()]);
        setGhost(engine.getGhost());
        animationId = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError(
          "Microphone access denied. Please allow microphone access in your browser settings and reload.",
        );
      } else {
        setError(
          "Could not access microphone. Please check your device settings.",
        );
      }
    }
  };

  onMount(async () => {
    try {
      const status = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      if (status.state === "granted") {
        await startListening();
      }
    } catch {
      /* permissions API not supported, show start button */
    }
    setLoading(false);
  });

  onCleanup(() => {
    if (animationId !== undefined) cancelAnimationFrame(animationId);
    detector.stop();
    releaseWakeLock();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });

  const clearStaff = () => {
    engine.clear();
    setCommitted([]);
    setGhost({ candidate: null, progress: 0 });
  };

  const handleTrainClick = () => {
    clearStaff();
    setMode(mode() === "training" ? "free-play" : "training");
  };

  return (
    <div class="app">
      <ThemeToggle />
      {started() && (
        <>
          <HeaderBar
            frequency={frequency()}
            cents={cents()}
            ghost={ghost().candidate}
            transpose={transpose()}
            mode={mode()}
            onClear={clearStaff}
            onSettingsOpen={() => setSettingsOpen(true)}
            onTrainClick={handleTrainClick}
          />
          <Show
            when={mode() === "training"}
            fallback={<Staff committed={committed()} ghost={ghost()} />}
          >
            <TrainingScreen
              committed={committed()}
              ghost={ghost()}
              onClearStaff={clearStaff}
              onExit={() => {
                clearStaff();
                setMode("free-play");
              }}
            />
          </Show>
        </>
      )}

      {!loading() && !started() && !error() && (
        <div class="start-screen">
          <h1>Trumpet Tuner</h1>
          <p class="start-subtitle">Play a note — see it on the staff</p>
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

      <Show when={settingsOpen()}>
        <SettingsDialog
          transpose={transpose()}
          onTransposeChange={setTranspose}
          restDelayMs={restDelayMs()}
          onRestDelayChange={setRestDelayMs}
          windowMs={windowMs()}
          onWindowMsChange={handleWindowMsChange}
          onClose={() => setSettingsOpen(false)}
        />
      </Show>
    </div>
  );
};

export default App;
```

- [ ] **Step 2: Build-check**

```bash
npx tsc -b
```

Expected: no errors.

- [ ] **Step 3: Run the test suite**

```bash
npm test
```

Expected: PASS — all existing tests still green.

- [ ] **Step 4: Commit (includes HeaderBar change from Task 11)**

```bash
git add src/components/HeaderBar.tsx src/App.tsx
git commit -m "feat(training): wire mode switching with Train button + screen"
```

---

## Task 13: Add training-mode CSS

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Append training styles**

Append to `src/index.css`:

```css
/* Training screen */
.training-screen {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.training-topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 20px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--text-secondary);
}

.training-status {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  font-size: 13px;
  color: var(--text-secondary);
}

.training-status-title {
  font-weight: 600;
  color: var(--text-primary);
}

.training-status-progress {
  font-family: monospace;
}

.training-status-mistakes {
  color: var(--accent-yellow);
}

/* Challenge picker */
.challenge-groups {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px 20px;
  overflow-y: auto;
}

.challenge-group-heading {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
}

.challenge-group-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.challenge-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  background: var(--bg-surface);
  border: 1px solid var(--text-secondary);
  border-radius: 10px;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: transform 0.1s, border-color 0.1s;
}

.challenge-card:hover {
  border-color: var(--accent-green);
  transform: translateY(-1px);
}

.challenge-card-title {
  font-size: 15px;
  font-weight: 600;
}

.challenge-card-meta {
  font-size: 12px;
  color: var(--text-secondary);
}

.challenge-card-stars {
  display: flex;
  gap: 2px;
  font-size: 16px;
  color: var(--text-secondary);
}

.challenge-card-star-filled {
  color: var(--accent-yellow);
}

.challenge-card-score {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
}

/* Training result modal */
.training-result-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
}

.training-result {
  position: relative;
  background: var(--bg-surface);
  color: var(--text-primary);
  border-radius: 16px;
  padding: 32px 40px;
  min-width: 320px;
  text-align: center;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
}

.training-result-ribbon {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--accent-green);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 6px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.training-result-stars {
  display: flex;
  justify-content: center;
  gap: 8px;
  font-size: 44px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.training-result-star-filled {
  color: var(--accent-yellow);
}

.training-result-score {
  font-size: 48px;
  font-weight: 700;
  margin-bottom: 8px;
}

.training-result-stats {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.training-result-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.training-empty {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
}
```

- [ ] **Step 2: Verify visually**

```bash
npm run dev
```

Open the app in a browser, click the 🎯 button in the header, verify:
- Challenge picker renders three groups with cards.
- Each card shows title, note count, 3 outlined stars, "—" for no score.
- Clicking a card clears the staff and shows only the target track (grayed-out notes).

Kill the dev server with Ctrl-C when done.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat(training): add training mode styles"
```

---

## Task 14: Manual verification pass

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify free-play regression**

With the mic live, stay in free-play and confirm:
- Notes commit and render as before.
- Clear button empties the staff.
- Dial + fingering update on the ghost.
- Switch to training and back — free-play staff starts empty each time (accepted destructive behavior).

- [ ] **Step 3: Verify training happy path**

1. Click 🎯. Pick "Long tone: G4". Confirm grayed-out G4, rest, G4, rest, G4 appear.
2. Play G4 cleanly. As each one commits, it replaces the grayed target with a colored notehead at the same position.
3. Result modal appears with 2–3 stars and a score. Retry and Back buttons work. localStorage has an entry for `long-g4`.
4. Back out to picker. The `long-g4` card now shows filled stars and a numeric best score.

- [ ] **Step 4: Verify mistake counting**

1. Pick "C major arpeggio" (C5 E5 G5 C6).
2. Deliberately play a wrong note (e.g. D5) before the expected C5. Verify:
   - Status bar shows "Mistakes: 1".
   - Target index did not advance until C5 is played.
3. Finish the arpeggio. Result modal reflects mistakes in the stats.

- [ ] **Step 5: Verify mid-run navigation**

1. Pick "Bb major scale". Play 3 notes.
2. Click "Restart" in the top bar — staff and target track reset; progress back to 0/8.
3. Play 3 notes. Click "← Free play" mid-run.
4. Re-enter training. Previous challenge has no new best (no run recorded).

- [ ] **Step 6: Verify best-score persistence**

1. Play "Long tone: C5" with good intonation — record a 3-star run.
2. Refresh the page.
3. Re-enter training — card still shows 3 stars and the recorded score.
4. Play again with worse intonation — "New best!" ribbon should NOT appear, stored best unchanged.

- [ ] **Step 7: Run the full test suite**

```bash
npm test
```

Expected: All tests green.

- [ ] **Step 8: Final build check**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 9: Commit any verification-driven fixes**

If manual verification surfaced bugs, fix them and commit. If everything
passes as-is, no commit needed for this task.

---

## Notes for the implementer

- **TDD order.** Tasks 1–5 cover pure logic with tests before implementation. Task 6 also keeps TDD (scroll math is pure). Tasks 7–13 are UI / integration and are covered by manual verification — there's no component-test infra in this repo and the spec-level `Staff.test.tsx` was explicitly deferred (see the plan-level deviation note).
- **Never bypass suppression.** Do not try to work around the staff-engine's duplicate-note suppression inside the training engine. The catalog invariant guarantees adjacent identical notes are always separated by a rest target, so this is handled at the data layer.
- **Keep `clearStaff()` the only path that empties `committed`.** Mode transitions, run starts, run restarts, and the explicit Clear button all go through the same function to stay predictable.
- **`onCommitted` is idempotent per-event.** The engine tracks its own `processedCount` so passing the full committed array each frame is fine.
- **Star thresholds and score weights** are named constants in `scoring.ts`. Expect to tune after real use.
