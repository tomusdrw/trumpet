import { type Component, createSignal, For, Show } from "solid-js";
import type { Challenge } from "../training/challenges";
import { noteTargetCount } from "../training/challenges";
import type { StoredBest } from "../training/storage";

interface ChallengeCardProps {
  challenge: Challenge;
  best: StoredBest | null;
  onPick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const ChallengeCard: Component<ChallengeCardProps> = (props) => {
  const stars = () => props.best?.stars ?? 0;
  const starPositions = [1, 2, 3] as const;
  const [confirmingDelete, setConfirmingDelete] = createSignal(false);
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;

  const handleDeleteClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (props.onDelete === undefined) return;
    if (confirmingDelete()) {
      if (confirmTimer !== undefined) clearTimeout(confirmTimer);
      setConfirmingDelete(false);
      props.onDelete();
      return;
    }
    setConfirmingDelete(true);
    confirmTimer = setTimeout(() => setConfirmingDelete(false), 2000);
  };

  const handleEditClick = (e: MouseEvent) => {
    e.stopPropagation();
    props.onEdit?.();
  };

  return (
    <button class="challenge-card" onClick={props.onPick} type="button">
      <Show when={props.onEdit !== undefined || props.onDelete !== undefined}>
        <div class="challenge-card-controls">
          <Show when={props.onEdit !== undefined}>
            <span
              class="challenge-card-icon"
              role="button"
              tabIndex={0}
              aria-label="Edit challenge"
              title="Edit"
              onClick={handleEditClick}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleEditClick(e as unknown as MouseEvent);
                }
              }}
            >
              ✎
            </span>
          </Show>
          <Show when={props.onDelete !== undefined}>
            <span
              class="challenge-card-icon challenge-card-icon-delete"
              classList={{
                "challenge-card-icon-confirming": confirmingDelete(),
              }}
              role="button"
              tabIndex={0}
              aria-label={
                confirmingDelete() ? "Confirm delete" : "Delete challenge"
              }
              title={confirmingDelete() ? "Click again to delete" : "Delete"}
              onClick={handleDeleteClick}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleDeleteClick(e as unknown as MouseEvent);
                }
              }}
            >
              {confirmingDelete() ? "Remove?" : "✕"}
            </span>
          </Show>
        </div>
      </Show>
      <div class="challenge-card-title">{props.challenge.title}</div>
      <Show when={props.challenge.description !== undefined}>
        <div class="challenge-card-description">
          {props.challenge.description}
        </div>
      </Show>
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
