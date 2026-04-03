import { createSignal, type Component } from "solid-js";

type ThemeMode = "system" | "light" | "dark";
const CYCLE: ThemeMode[] = ["system", "light", "dark"];
const ICONS: Record<ThemeMode, string> = {
  system: "\u25D1",
  light: "\u2600",
  dark: "\u263E",
};

function getInitialTheme(): ThemeMode {
  return (localStorage.getItem("theme") as ThemeMode) ?? "system";
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (mode !== "system") {
    root.classList.add(mode);
  }
  localStorage.setItem("theme", mode);
}

const ThemeToggle: Component = () => {
  const [mode, setMode] = createSignal<ThemeMode>(getInitialTheme());

  applyTheme(mode());

  const cycle = () => {
    const next = CYCLE[(CYCLE.indexOf(mode()) + 1) % CYCLE.length];
    setMode(next);
    applyTheme(next);
  };

  return (
    <button class="theme-toggle" onClick={cycle} title={`Theme: ${mode()}`}>
      {ICONS[mode()]}
    </button>
  );
};

export default ThemeToggle;
