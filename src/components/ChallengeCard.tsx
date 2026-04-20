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
