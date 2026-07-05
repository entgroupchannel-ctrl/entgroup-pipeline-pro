import { Moon, Sun, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreferences, type FontSize } from "@/lib/preferences-context";
import { cn } from "@/lib/utils";

const SIZES: { value: FontSize; label: string; className: string }[] = [
  { value: "sm", label: "A", className: "text-xs" },
  { value: "md", label: "A", className: "text-sm" },
  { value: "lg", label: "A", className: "text-base" },
  { value: "xl", label: "A", className: "text-lg" },
];

export function PreferencesToggle() {
  const { fontSize, setFontSize, theme, toggleTheme } = usePreferences();

  return (
    <div className="flex items-center gap-1">
      <div
        className="flex items-center gap-0.5 rounded-md border bg-background p-0.5"
        role="group"
        aria-label="ขนาดตัวอักษร"
      >
        <Type className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
        {SIZES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setFontSize(s.value)}
            aria-pressed={fontSize === s.value}
            aria-label={`ขนาดตัวอักษร ${s.value.toUpperCase()}`}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded font-semibold leading-none transition-colors",
              s.className,
              fontSize === s.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
        title={theme === "dark" ? "โหมดสว่าง" : "โหมดมืด"}
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </div>
  );
}
