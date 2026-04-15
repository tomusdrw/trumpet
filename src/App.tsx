import {
  createSignal,
  onCleanup,
  onMount,
  type Component,
} from "solid-js";
import ThemeToggle from "./components/ThemeToggle";
import HeaderBar from "./components/HeaderBar";
import Staff from "./components/Staff";
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
  const [transpose, setTranspose] = createSignal(0);
  const [restDelayMs, setRestDelayMs] = createSignal(500);

  const detector = createPitchDetector();
  const engine = createStaffEngine({ windowMs: 250 });
  let animationId: number | undefined;

  // Debounce silence so short legato gaps don't immediately commit rests:
  // we remember the last note detection and substitute it while silence
  // is shorter than `restDelayMs`. Only genuinely sustained silence is
  // reported as a rest to the engine.
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
    // Silence (or bad reading) — debounce against the most recent note.
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

      const tick = () => {
        const nowTs = performance.now();
        const freq = detector.getFrequency();
        setFrequency(freq);
        const detection = toDetection(freq, nowTs);
        // Raw cents (from the detector) drive the live dial, independent
        // of silence debouncing. When the mic is genuinely silent, show
        // no cents even if the engine is still bridging a short gap.
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
            onTransposeChange={setTranspose}
            restDelayMs={restDelayMs()}
            onRestDelayChange={setRestDelayMs}
            onClear={handleClear}
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
    </div>
  );
};

export default App;
