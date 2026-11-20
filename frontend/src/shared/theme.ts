export type Theme = "light" | "dark";

const STORAGE_KEY = "takt-theme";

export function getStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function resolveTheme(): Theme {
  return getStoredTheme() ?? systemTheme();
}

export function applyTheme(theme: Theme): void {
  try {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    return;
  }
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    return;
  }
}

export function initTheme(): Theme {
  const theme = resolveTheme();
  applyTheme(theme);
  return theme;
}

export function toggleTheme(theme: Theme): Theme {
  const next = theme === "dark" ? "light" : "dark";
  applyTheme(next);
  storeTheme(next);
  return next;
}
