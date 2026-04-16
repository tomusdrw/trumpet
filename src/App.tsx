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
import { createPitchDetector } from "./audio/pitch-detector";
import { frequencyToNote } from "./audio/notes";
import {
  createStaffEngine,
  type CommittedEvent,
  type Detection,
  type GhostState,
} from "./staff/staff-engine";

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

  // Settings
  const [transpose, setTranspose] = createSignal(0);
  const [restDelayMs, setRestDelayMs] = createSignal(500);
  const [windowMs, setWindowMs] = createSignal(1000);
  const [settingsOpen, setSettingsOpen] = createSignal(false);

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
      // Wake Lock not available or denied — not critical
    }
  };

  const releaseWakeLock = () => {
    wakeLock?.release();
    wakeLock = null;
  };

  // Re-acquire wake lock when page becomes visible again (browsers release it on hide)
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

  // Debounce silence so short legato gaps don't immediately commit rests.
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
      // permissions API not supported, show start button
    }
    setLoading(false);
  });

  onCleanup(() => {
    if (animationId !== undefined) cancelAnimationFrame(animationId);
    detector.stop();
    releaseWakeLock();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });

  const handleClear = () => {
    engine.clear();
    setCommitted([]);
    setGhost({ candidate: null, progress: 0 });
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
            onClear={handleClear}
            onSettingsOpen={() => setSettingsOpen(true)}
          />
          <Staff committed={committed()} ghost={ghost()} />
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
