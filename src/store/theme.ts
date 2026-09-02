import { create } from "zustand";

export type Theme = "system" | "light" | "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const THEME_STORAGE_KEY = "theme";
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

function isTheme(value: string | null): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

function persistTheme(theme: Theme): void {
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable in sandboxed WebViews; the in-memory choice still applies.
  }
}

function readTheme(): Theme {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_STORAGE_KEY) ?? null;
    if (isTheme(stored)) {
      return stored;
    }
    if (stored !== null) {
      persistTheme("system");
    }
  } catch {
    // An unreadable preference has the same explicit behavior as a missing preference.
  }
  return "system";
}

function createSystemThemeQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  try {
    return window.matchMedia(SYSTEM_THEME_QUERY);
  } catch {
    return null;
  }
}

const systemThemeQuery = createSystemThemeQuery();

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") {
    return;
  }
  const systemDark = systemThemeQuery?.matches ?? false;
  const isDark = theme === "dark" || (theme === "system" && systemDark);
  document.documentElement.classList.toggle("dark", isDark);
}

const initialTheme = readTheme();
applyTheme(initialTheme);

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    persistTheme(theme);
    applyTheme(theme);
    set({ theme });
  },
}));

function handleSystemThemeChange(): void {
  if (useThemeStore.getState().theme === "system") {
    applyTheme("system");
  }
}

let removeSystemThemeListener: (() => void) | null = null;

if (systemThemeQuery) {
  if (typeof systemThemeQuery.addEventListener === "function") {
    systemThemeQuery.addEventListener("change", handleSystemThemeChange);
    removeSystemThemeListener = () => {
      systemThemeQuery.removeEventListener("change", handleSystemThemeChange);
    };
  } else if (typeof systemThemeQuery.addListener === "function") {
    systemThemeQuery.addListener(handleSystemThemeChange);
    removeSystemThemeListener = () => {
      systemThemeQuery.removeListener(handleSystemThemeChange);
    };
  }
}

export function disposeThemeListener(): void {
  removeSystemThemeListener?.();
  removeSystemThemeListener = null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(disposeThemeListener);
}
