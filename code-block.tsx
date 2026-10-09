import { cn } from "@/lib/utils";

type CodeBlockProps = { code: string; language?: string; className?: string };

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  return (
    <div dir="ltr" className={cn("overflow-hidden rounded-lg border border-border bg-muted text-start", className)}>
      {language && (
        <div className="border-b border-border px-4 py-1.5 font-mono text-xs text-muted-foreground">{language}</div>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-sm text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}
