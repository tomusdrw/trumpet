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
