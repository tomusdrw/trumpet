import { createSignal, onCleanup, onMount, type Component } from "solid-js";
import ThemeToggle from "./components/ThemeToggle";
import Tuner from "./components/Tuner";
import FrequencyGraph from "./components/FrequencyGraph";
import { createPitchDetector } from "./audio/pitch-detector";
import { frequencyToNote } from "./audio/notes";

const App: Component = () => {
  const [started, setStarted] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [frequency, setFrequency] = createSignal<number | null>(null);

  const detector = createPitchDetector();
  let animationId: number | undefined;

  const startListening = async () => {
    try {
      await detector.start();
      setStarted(true);
      setError(null);

      const tick = () => {
        setFrequency(detector.getFrequency());
        animationId = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError(
          "Microphone access denied. Please allow microphone access in your browser settings and reload."
        );
      } else {
        setError("Could not access microphone. Please check your device settings.");
      }
    }
  };

  onMount(async () => {
    try {
      const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
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

  const cents = () => {
    const f = frequency();
    if (f === null) return 0;
    const info = frequencyToNote(f);
    return info?.cents ?? 0;
  };

  return (
    <div class="app">
      <ThemeToggle />
      {started() && <FrequencyGraph frequency={frequency()} cents={cents()} />}

      {!loading() && !started() && !error() && (
        <div class="start-screen">
          <h1>Trumpet Tuner</h1>
          <p class="start-subtitle">
            Play a note and see how in-tune you are
          </p>
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

      {started() && <Tuner frequency={frequency()} />}
    </div>
  );
};

export default App;
