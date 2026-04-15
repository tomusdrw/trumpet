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

  const detector = createPitchDetector();
  const engine = createStaffEngine({ windowMs: 250 });
  let animationId: number | undefined;

  const toDetection = (freq: number | null): Detection => {
    if (freq === null) return { kind: "rest" };
    const info = frequencyToNote(freq);
    if (info === null) return { kind: "rest" };
    const midi = Math.round(12 * Math.log2(freq / 440) + 69);
    return { kind: "note", midi, cents: info.cents };
  };

  const startListening = async () => {
    try {
      await detector.start();
      setStarted(true);
      setError(null);

      const tick = () => {
        const freq = detector.getFrequency();
        setFrequency(freq);
        const detection = toDetection(freq);
        if (detection.kind === "note") {
          setCents(detection.cents);
        } else {
          setCents(null);
        }
        engine.tick(detection, performance.now());
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
