import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const THEMES = [
  { id: "cyber", label: "Cyberpunk" },
  { id: "dark", label: "Dark Mode" },
  { id: "light", label: "Light Mode" },
  { id: "oled", label: "OLED Pure Black" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const ThemeContext = createContext<{ theme: ThemeId; setTheme: (t: ThemeId) => void }>({
  theme: "cyber",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("cyber");

  useEffect(() => {
    const stored = window.localStorage.getItem("sentinelsec-theme") as ThemeId | null;
    if (stored && THEMES.some((t) => t.id === stored)) setThemeState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme !== "light");
    window.localStorage.setItem("sentinelsec-theme", theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
