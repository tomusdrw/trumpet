import {
  type Component,
  createMemo,
  createSignal,
  For,
  Show,
} from "solid-js";
import {
  parseChallenges,
  type ParseResult,
} from "../training/custom-challenge-dsl";
import {
  addCustom,
  deleteCustom,
  newCustomId,
  type StoredCustomChallenge,
} from "../training/custom-storage";

interface Props {
  mode: "add" | "edit";
  initialSource?: string;
  editTargetId?: string;
  onClose: () => void;
  onSaved: () => void;
}

const PROLOGUE = `You are helping generate exercises for a trumpet training app.
Output ONLY text matching the grammar below — no prose, no code fences.

GRAMMAR
  challenge := title_line group_line [description_line] [transpose_line] notes_line
  Multiple challenges: concatenate, separated by a blank line or just start
  the next challenge with a new \`title:\` line.

  title_line       = "title: "        <1-60 printable chars>
  group_line       = "group: "        ("long-tones" | "scales" | "melodies")
  description_line = "description: "  <up to 120 chars>
  transpose_line   = "transpose: "    <integer, e.g. -2 or 0>
  notes_line       = "notes: "        <NOTE> (" " <NOTE>)*
  NOTE             = PITCH | "-"
  PITCH            = [A-G] ("b" | "#")? [0-8]       (scientific pitch; C4 = middle C)
  "-"              = a rest

CONVENTIONS
  - Notes are written as they'd appear on a Bb trumpet part (WRITTEN pitch).
  - The app converts to concert pitch using \`transpose\`. Default is -2 (Bb trumpet).
  - If the user explicitly asks for CONCERT pitch, add \`transpose: 0\`.
  - Keep each exercise musical and short (4-32 notes is typical).
  - Use rests (\`-\`) between repeated pitches in melodies so the app can detect
    re-attacks (e.g. "E E E" should be "E4 - E4 - E4").

SELF-CHECK before answering, verify every line matches one of these regexes:
  ^title:\\s+\\S.{0,59}$
  ^group:\\s+(long-tones|scales|melodies)$
  ^description:\\s+\\S.{0,119}$
  ^transpose:\\s+-?\\d+$
  ^notes:\\s+([A-G][b#]?[0-8]|-)(\\s+([A-G][b#]?[0-8]|-))*$

EXAMPLE
  title: Happy Birthday
  group: melodies
  description: slow, expressive
  notes: C4 C4 D4 C4 F4 E4 - C4 C4 D4 C4 G4 F4

Now generate: `;

function countNotes(result: ParseResult, idx: number): number {
  return result.challenges[idx].challenge.targets.filter(
    (t) => t.kind === "note",
  ).length;
}

const CustomChallengeDialog: Component<Props> = (props) => {
  const [source, setSource] = createSignal(props.initialSource ?? "");
  const [copied, setCopied] = createSignal(false);
  const [prologueOpen, setPrologueOpen] = createSignal(props.mode === "add");

  const parsed = createMemo<ParseResult>(() => parseChallenges(source()));

  const editModeBlockCountError = () => {
    if (props.mode !== "edit") return null;
    const p = parsed();
    if (p.errors.length > 0) return null;
    if (p.challenges.length === 0) return null;
    if (p.challenges.length === 1) return null;
    return "Edit mode accepts a single challenge — remove extra blocks, or cancel and use Add.";
  };

  const canSave = () => {
    const p = parsed();
    if (p.errors.length > 0) return false;
    if (p.challenges.length === 0) return false;
    if (props.mode === "edit" && p.challenges.length !== 1) return false;
    return true;
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) props.onClose();
  };

  const copyPrologue = async () => {
    try {
      await navigator.clipboard.writeText(PROLOGUE);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard not available — user can still select + copy manually.
    }
  };

  const save = () => {
    if (!canSave()) return;
    const p = parsed();
    const now = Date.now();
    if (props.mode === "edit" && props.editTargetId !== undefined) {
      deleteCustom(props.editTargetId);
    }
    for (const pc of p.challenges) {
      const id = newCustomId(pc.challenge.title);
      const entry: StoredCustomChallenge = {
        id,
        title: pc.challenge.title,
        group: pc.challenge.group,
        description: pc.challenge.description,
        targets: pc.challenge.targets,
        source: pc.source,
        createdAt: now,
      };
      addCustom(entry);
    }
    props.onSaved();
  };

  return (
    <div class="settings-backdrop" onClick={handleBackdropClick}>
      <div class="settings-dialog custom-dialog">
        <div class="settings-header">
          <h2>
            {props.mode === "edit" ? "Edit challenge" : "Add custom challenge"}
          </h2>
          <button
            class="settings-close"
            onClick={props.onClose}
            type="button"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div class="custom-section">
          <button
            class="custom-section-header"
            onClick={() => setPrologueOpen(!prologueOpen())}
            type="button"
          >
            <span>{prologueOpen() ? "▾" : "▸"} Prologue for your LLM</span>
            <Show when={!prologueOpen()}>
              <span class="custom-section-hint">click to expand</span>
            </Show>
          </button>
          <Show when={prologueOpen()}>
            <textarea
              class="custom-textarea custom-prologue"
              readonly
              rows={10}
            >{PROLOGUE}</textarea>
            <div class="custom-actions-row">
              <button
                class="custom-btn"
                type="button"
                onClick={copyPrologue}
              >
                {copied() ? "Copied!" : "Copy prologue"}
              </button>
              <span class="custom-hint">
                Paste this into your LLM, then append a request like "Generate
                the melody of Happy Birthday".
              </span>
            </div>
          </Show>
        </div>

        <div class="custom-section">
          <label class="custom-section-header" for="custom-paste">
            <span>
              {props.mode === "edit"
                ? "Challenge source"
                : "Paste the LLM output"}
            </span>
          </label>
          <textarea
            id="custom-paste"
            class="custom-textarea"
            rows={8}
            placeholder={"title: Happy Birthday\ngroup: melodies\nnotes: C4 C4 D4 C4 F4 E4"}
            value={source()}
            onInput={(e) => setSource(e.currentTarget.value)}
          />
        </div>

        <div class="custom-section">
          <Show when={source().trim() === ""}>
            <div class="custom-preview-empty">
              Preview will appear here once you paste a challenge.
            </div>
          </Show>

          <Show when={source().trim() !== "" && parsed().errors.length > 0}>
            <div class="custom-preview-errors">
              <div class="custom-preview-heading">Errors</div>
              <ul>
                <For each={parsed().errors}>
                  {(err) => (
                    <li>
                      <span class="custom-error-line">Line {err.line}:</span>{" "}
                      {err.message}
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>

          <Show
            when={
              source().trim() !== "" &&
              parsed().errors.length === 0 &&
              parsed().challenges.length > 0
            }
          >
            <div class="custom-preview-ok">
              <div class="custom-preview-heading">
                Will {props.mode === "edit" ? "replace with" : "add"}:
              </div>
              <ul>
                <For each={parsed().challenges}>
                  {(pc, i) => (
                    <li>
                      <strong>{pc.challenge.title}</strong>{" "}
                      <span class="custom-preview-meta">
                        ({pc.challenge.group}, {countNotes(parsed(), i())}{" "}
                        notes)
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>

          <Show when={editModeBlockCountError() !== null}>
            <div class="custom-preview-errors">
              <div class="custom-preview-heading">Error</div>
              <ul>
                <li>{editModeBlockCountError()}</li>
              </ul>
            </div>
          </Show>
        </div>

        <div class="custom-footer">
          <button
            class="custom-btn"
            type="button"
            onClick={props.onClose}
          >
            Cancel
          </button>
          <button
            class="custom-btn custom-btn-primary"
            type="button"
            onClick={save}
            disabled={!canSave()}
          >
            {props.mode === "edit" ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomChallengeDialog;
