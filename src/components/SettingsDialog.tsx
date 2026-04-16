import type { Component } from "solid-js";

interface SettingsDialogProps {
  transpose: number;
  onTransposeChange: (value: number) => void;
  restDelayMs: number;
  onRestDelayChange: (value: number) => void;
  windowMs: number;
  onWindowMsChange: (value: number) => void;
  onClose: () => void;
}

function intFromInput(e: Event): number | null {
  const v = parseInt((e.currentTarget as HTMLInputElement).value, 10);
  return Number.isNaN(v) ? null : v;
}

const SettingsDialog: Component<SettingsDialogProps> = (props) => {
  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) props.onClose();
  };

  return (
    <div class="settings-backdrop" onClick={handleBackdropClick}>
      <div class="settings-dialog">
        <div class="settings-header">
          <h2>Settings</h2>
          <button class="settings-close" onClick={props.onClose}>
            ✕
          </button>
        </div>

        <label class="settings-field">
          <span class="settings-label">Transpose (semitones)</span>
          <span class="settings-hint">
            Bb trumpet = −2, Eb = −9, concert = 0
          </span>
          <input
            type="number"
            class="settings-input"
            step="1"
            value={props.transpose}
            onInput={(e) => {
              const v = intFromInput(e);
              if (v !== null) props.onTransposeChange(v);
            }}
          />
        </label>

        <label class="settings-field">
          <span class="settings-label">Rest delay (ms)</span>
          <span class="settings-hint">
            How long silence must last before a rest is placed
          </span>
          <input
            type="number"
            class="settings-input"
            step="50"
            min="0"
            value={props.restDelayMs}
            onInput={(e) => {
              const v = intFromInput(e);
              if (v !== null && v >= 0) props.onRestDelayChange(v);
            }}
          />
        </label>

        <label class="settings-field">
          <span class="settings-label">Sampling window (ms)</span>
          <span class="settings-hint">
            Time to listen before committing a note — higher = more stable
          </span>
          <input
            type="number"
            class="settings-input"
            step="50"
            min="100"
            value={props.windowMs}
            onInput={(e) => {
              const v = intFromInput(e);
              if (v !== null && v >= 100) props.onWindowMsChange(v);
            }}
          />
        </label>
      </div>
    </div>
  );
};

export default SettingsDialog;
