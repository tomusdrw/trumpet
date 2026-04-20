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
