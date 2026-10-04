import { useEffect, useSyncExternalStore } from "react";
import { Button } from "./ui/button";
import type { JSX } from "react";

type ThemeMode = "light" | "dark" | "auto";

const THEME_STORAGE_KEY = "theme";

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  light: "dark",
  dark: "auto",
  auto: "light",
};

const MODE_LABEL: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  auto: "Auto",
};

function getSnapshot(): ThemeMode {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);

  if (stored === "light" || stored === "dark" || stored === "auto") {
    return stored;
  }

  return "auto";
}

function applyThemeMode(mode: ThemeMode): void {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = mode === "auto" ? (prefersDark ? "dark" : "light") : mode;

  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolved);

  if (mode === "auto") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", mode);
  }

  document.documentElement.setAttribute("data-mode", resolved);
  document.documentElement.style.colorScheme = resolved;
}

function getServerSnapshot(): ThemeMode {
  return "auto";
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("theme-change", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("theme-change", onStoreChange);
  };
}

function toggleMode(): void {
  const nextMode: ThemeMode = NEXT_MODE[getSnapshot()];
  window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
  window.dispatchEvent(new Event("theme-change"));
}

export default function ThemeToggle(): JSX.Element {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect((): void => {
    applyThemeMode(mode);
  }, [mode]);

  useEffect((): (() => void) | undefined => {
    if (mode !== "auto") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function onChange(): void {
      applyThemeMode("auto");
    }

    media.addEventListener("change", onChange);

    return () => {
      media.removeEventListener("change", onChange);
    };
  }, [mode]);

  const label =
    mode === "auto"
      ? `Theme mode: auto (system). Click to switch to ${NEXT_MODE[mode]} mode.`
      : `Theme mode: ${mode}. Click to switch mode.`;

  return (
    <Button variant="secondary" type="button" onClick={toggleMode} aria-label={label} title={label}>
      {MODE_LABEL[mode]}
    </Button>
  );
}
