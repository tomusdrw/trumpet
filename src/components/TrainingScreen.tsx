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
import CustomChallengeDialog from "./CustomChallengeDialog";
import {
  CHALLENGES,
  type Challenge,
  type ChallengeGroup,
} from "../training/challenges";
import {
  createTrainingEngine,
  type TrainingEngine,
  type TrainingProgress,
} from "../training/training-engine";
import { computeScore, type RunScore } from "../training/scoring";
import { getAll, recordRun, type StorageShape } from "../training/storage";
import {
  deleteCustom,
  listCustom,
  type StoredCustomChallenge,
} from "../training/custom-storage";
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

type DialogState =
  | { kind: "closed" }
  | { kind: "add" }
  | { kind: "edit"; targetId: string; initialSource: string };

// "custom" is the picker-level bucket; individual custom challenges still carry
// their declared ChallengeGroup.
type PickerGroup = ChallengeGroup | "custom";

const PICKER_GROUP_ORDER: readonly PickerGroup[] = [
  "long-tones",
  "scales",
  "melodies",
  "custom",
];
const PICKER_GROUP_LABEL: Record<PickerGroup, string> = {
  "long-tones": "Long tones",
  scales: "Scales & arpeggios",
  melodies: "Melodies",
  custom: "Custom",
};

function storedToChallenge(s: StoredCustomChallenge): Challenge {
  return {
    id: s.id,
    title: s.title,
    group: s.group,
    description: s.description,
    targets: s.targets,
  };
}

const TrainingScreen: Component<TrainingScreenProps> = (props) => {
  const [view, setView] = createSignal<View>({ kind: "picker" });
  const [bests, setBests] = createSignal<StorageShape>(getAll());
  const [customs, setCustoms] = createSignal<StoredCustomChallenge[]>(
    listCustom(),
  );
  const [dialog, setDialog] = createSignal<DialogState>({ kind: "closed" });
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

  const refreshCustoms = () => setCustoms(listCustom());

  const handleDeleteCustom = (id: string) => {
    deleteCustom(id);
    refreshCustoms();
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

  // Sort custom challenges within the Custom bucket by group, then newest first.
  const customsSorted = createMemo(() => {
    const groupIndex: Record<ChallengeGroup, number> = {
      "long-tones": 0,
      scales: 1,
      melodies: 2,
    };
    return [...customs()].sort((a, b) => {
      const gDiff = groupIndex[a.group] - groupIndex[b.group];
      if (gDiff !== 0) return gDiff;
      return b.createdAt - a.createdAt;
    });
  });

  const builtInsByGroup = createMemo(() => {
    const map = new Map<ChallengeGroup, Challenge[]>();
    map.set("long-tones", []);
    map.set("scales", []);
    map.set("melodies", []);
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
          <For each={PICKER_GROUP_ORDER}>
            {(group) => (
              <Show
                when={
                  group !== "custom"
                    ? (builtInsByGroup().get(group as ChallengeGroup)?.length ??
                        0) > 0
                    : true
                }
              >
                <section class="challenge-group">
                  <h3 class="challenge-group-heading">
                    {PICKER_GROUP_LABEL[group]}
                  </h3>
                  <div class="challenge-group-grid">
                    <Show when={group === "custom"}>
                      <button
                        class="challenge-card challenge-card-add"
                        type="button"
                        onClick={() => setDialog({ kind: "add" })}
                      >
                        <span class="challenge-card-add-plus">+</span>
                        <span class="challenge-card-add-label">
                          Add custom challenge
                        </span>
                      </button>
                      <For each={customsSorted()}>
                        {(s) => (
                          <ChallengeCard
                            challenge={storedToChallenge(s)}
                            best={bests()[s.id] ?? null}
                            onPick={() => startChallenge(storedToChallenge(s))}
                            onEdit={() =>
                              setDialog({
                                kind: "edit",
                                targetId: s.id,
                                initialSource: s.source,
                              })
                            }
                            onDelete={() => handleDeleteCustom(s.id)}
                          />
                        )}
                      </For>
                    </Show>
                    <Show when={group !== "custom"}>
                      <For
                        each={builtInsByGroup().get(group as ChallengeGroup)}
                      >
                        {(c) => (
                          <ChallengeCard
                            challenge={c}
                            best={bests()[c.id] ?? null}
                            onPick={() => startChallenge(c)}
                          />
                        )}
                      </For>
                    </Show>
                  </div>
                </section>
              </Show>
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

      <Show when={view().kind === "picker" && CHALLENGES.length === 0 && customs().length === 0}>
        <div class="training-empty">No challenges available.</div>
      </Show>

      <Show when={dialog().kind === "add"}>
        <CustomChallengeDialog
          mode="add"
          onClose={() => setDialog({ kind: "closed" })}
          onSaved={() => {
            setDialog({ kind: "closed" });
            refreshCustoms();
          }}
        />
      </Show>

      <Show when={dialog().kind === "edit"}>
        {(() => {
          const d = dialog();
          if (d.kind !== "edit") return null;
          return (
            <CustomChallengeDialog
              mode="edit"
              editTargetId={d.targetId}
              initialSource={d.initialSource}
              onClose={() => setDialog({ kind: "closed" })}
              onSaved={() => {
                setDialog({ kind: "closed" });
                refreshCustoms();
              }}
            />
          );
        })()}
      </Show>
    </div>
  );
};

export default TrainingScreen;
