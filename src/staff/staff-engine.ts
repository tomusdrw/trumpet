export type Detection =
  | { kind: "rest" }
  | { kind: "note"; midi: number; cents: number };

export type CommittedEvent =
  | { kind: "rest" }
  | { kind: "note"; midi: number; worstCents: number };

export interface GhostState {
  /** The current running majority-vote leader, or null if nothing seen yet. */
  candidate: CommittedEvent | null;
  /** 0..1 fraction of the current window elapsed. */
  progress: number;
}

export interface StaffEngineOptions {
  /** Window duration in ms. Defaults to 250. */
  windowMs?: number;
}

export interface StaffEngine {
  tick(detection: Detection, timestampMs: number): void;
  getGhost(): GhostState;
  getCommitted(): readonly CommittedEvent[];
  clear(): void;
}

type Key = "rest" | number;

function shouldCommit(
  candidate: CommittedEvent,
  last: CommittedEvent | null,
): boolean {
  if (candidate.kind === "rest") {
    // Never commit a leading rest or consecutive rests.
    if (last === null) return false;
    if (last.kind === "rest") return false;
    return true;
  }
  // Note: suppress consecutive identical midi.
  if (last !== null && last.kind === "note" && last.midi === candidate.midi) {
    return false;
  }
  return true;
}

export function createStaffEngine(opts: StaffEngineOptions = {}): StaffEngine {
  const windowMs = opts.windowMs ?? 250;

  const committed: CommittedEvent[] = [];
  let last: CommittedEvent | null = null;

  let windowStart: number | null = null;
  let windowNow = 0;
  const tally = new Map<Key, number>();
  let leader: Key | null = null;
  let leaderWorstCents = 0;

  function keyOf(d: Detection): Key {
    return d.kind === "rest" ? "rest" : d.midi;
  }

  function resetWindow(nowTs: number): void {
    windowStart = nowTs;
    windowNow = nowTs;
    tally.clear();
    leader = null;
    leaderWorstCents = 0;
  }

  function leaderAsEvent(): CommittedEvent | null {
    if (leader === null) return null;
    if (leader === "rest") return { kind: "rest" };
    return { kind: "note", midi: leader, worstCents: leaderWorstCents };
  }

  return {
    tick(d, nowTs) {
      if (windowStart === null) {
        resetWindow(nowTs);
      }
      windowNow = nowTs;

      const k = keyOf(d);
      const prev = tally.get(k) ?? 0;
      tally.set(k, prev + 1);

      // Recompute leader. Ties go to the most-recently-incremented key —
      // since we just incremented `k`, start from it.
      let newLeader: Key = k;
      let newLeaderCount = tally.get(k)!;
      for (const [cand, count] of tally) {
        if (count > newLeaderCount) {
          newLeader = cand;
          newLeaderCount = count;
        }
      }

      if (newLeader !== leader) {
        leader = newLeader;
        leaderWorstCents = 0;
        if (leader !== "rest" && d.kind === "note" && d.midi === leader) {
          leaderWorstCents = Math.abs(d.cents);
        }
      } else if (
        leader !== "rest" &&
        d.kind === "note" &&
        d.midi === leader
      ) {
        leaderWorstCents = Math.max(leaderWorstCents, Math.abs(d.cents));
      }

      // Close the window?
      if (nowTs - windowStart! >= windowMs) {
        const event = leaderAsEvent();
        if (event !== null && shouldCommit(event, last)) {
          committed.push(event);
          last = event;
        }
        resetWindow(nowTs);
      }
    },

    getGhost(): GhostState {
      if (windowStart === null) {
        return { candidate: null, progress: 0 };
      }
      const elapsed = Math.max(0, windowNow - windowStart);
      const progress = Math.min(1, elapsed / windowMs);
      return { candidate: leaderAsEvent(), progress };
    },

    getCommitted() {
      return committed;
    },

    clear() {
      committed.length = 0;
      last = null;
      windowStart = null;
      windowNow = 0;
      tally.clear();
      leader = null;
      leaderWorstCents = 0;
    },
  };
}
