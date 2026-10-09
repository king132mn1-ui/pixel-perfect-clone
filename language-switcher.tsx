import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <div dir="ltr" className="inline-flex rounded-md border border-border p-0.5 text-sm" role="group" aria-label="Language">
      {(["ar", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={cn(
            "rounded px-3 py-1 font-medium transition-colors",
            lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
