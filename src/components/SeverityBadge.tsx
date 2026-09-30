const STYLES: Record<string, string> = {
  critical: "border-critical/50 bg-critical/15 text-critical",
  high: "border-high/50 bg-high/15 text-high",
  medium: "border-medium/50 bg-medium/15 text-medium",
  low: "border-low/50 bg-low/15 text-low",
  info: "border-info/50 bg-info/15 text-info",
};

export function SeverityBadge({ severity }: { severity: string }) {
  const style = STYLES[severity] ?? STYLES["info"];
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase ${style}`}
    >
      {severity}
    </span>
  );
}

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
