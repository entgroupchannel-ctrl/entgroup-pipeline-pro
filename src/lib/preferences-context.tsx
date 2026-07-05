import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type FontSize = "sm" | "md" | "lg" | "xl";
export type Theme = "light" | "dark";

interface PreferencesContextValue {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const FONT_KEY = "crm.fontSize";
const THEME_KEY = "crm.theme";

function readInitialFontSize(): FontSize {
  if (typeof window === "undefined") return "md";
  const v = window.localStorage.getItem(FONT_KEY);
  return v === "sm" || v === "md" || v === "lg" || v === "xl" ? v : "md";
}

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const v = window.localStorage.getItem(THEME_KEY);
  if (v === "light" || v === "dark") return v;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(readInitialFontSize);
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.fontSize = fontSize;
    window.localStorage.setItem(FONT_KEY, fontSize);
  }, [fontSize]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return (
    <PreferencesContext.Provider
      value={{
        fontSize,
        setFontSize: setFontSizeState,
        theme,
        setTheme: setThemeState,
        toggleTheme: () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
