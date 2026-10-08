import { useState } from "react";
import { ChevronDown, CloudOff, Terminal, Zap } from "lucide-react";

import { SeverityBadge } from "@/components/SeverityBadge";
import type { ExecutionResult } from "@/lib/agent-types";

function Code({ children, label }: { children: string; label?: string }) {
  return (
    <div className="mt-2">
      {label ? (
        <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">{label}</p>
      ) : null}
      <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
        {children}
      </pre>
    </div>
  );
}

function DiffBlock({ text }: { text: string }) {
  return (
    <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed">
      {text.split("\n").map((line, i) => (
        <div
          key={i}
          className={
            line.startsWith("+")
              ? "text-low"
              : line.startsWith("-")
                ? "text-critical"
                : "text-muted-foreground"
          }
        >
          {line}
        </div>
      ))}
    </pre>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function RedTeamBody({ data }: { data: Record<string, unknown> }) {
  const surface = asRecord(data["attack_surface"]);
  const findings = Array.isArray(data["findings"]) ? data["findings"] : [];
  const output = asString(data["output"]) ?? asString(data["poc"]);
  return (
    <>
      {surface ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(surface).map(([k, v]) => (
            <div key={k} className="rounded-md border border-border px-2.5 py-1.5">
              <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                {k.replace(/_/g, " ")}
              </p>
              <p className="font-display text-sm font-semibold">
                {Array.isArray(v) ? v.join(", ") : String(v)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {findings.map((raw, i) => {
        const f = asRecord(raw);
        if (!f) return null;
        return (
          <div key={i} className="mt-2 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={String(f["severity"] ?? "info")} />
              <span className="text-sm font-medium">{String(f["title"] ?? "Finding")}</span>
            </div>
            {asString(f["evidence"]) ? <Code label="Evidence">{String(f["evidence"])}</Code> : null}
            {asString(f["remediation"]) ? (
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="text-primary">Remediation — </span>
                {String(f["remediation"])}
              </p>
            ) : null}
          </div>
        );
      })}
      {output ? <Code label="Output">{output}</Code> : null}
    </>
  );
}

function BlueTeamBody({ data }: { data: Record<string, unknown> }) {
  const recs = Array.isArray(data["recommendations"]) ? data["recommendations"] : [];
  const rules = Array.isArray(data["rules"]) ? data["rules"] : [];
  const diff = asString(data["headers_diff"]) ?? asString(data["diff"]);
  const output = asString(data["output"]);
  return (
    <>
      {recs.length ? (
        <ul className="mt-2 space-y-1.5">
          {recs.map((r, i) => (
            <li key={i} className="flex gap-2 text-xs">
              <span className="text-primary">▸</span>
              <span>{String(r)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {diff ? (
        <div className="mt-2">
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Config diff</p>
          <DiffBlock text={diff} />
        </div>
      ) : null}
      {rules.length ? <Code label="Rules">{rules.map(String).join("\n")}</Code> : null}
      {output ? <Code label="Output">{output}</Code> : null}
    </>
  );
}

function AssistantBody({ data }: { data: Record<string, unknown> }) {
  const steps = Array.isArray(data["steps"]) ? data["steps"] : [];
  const logs = Array.isArray(data["logs"]) ? data["logs"] : [];
  const rest = Object.fromEntries(
    Object.entries(data).filter(([k]) => !["steps", "logs"].includes(k)),
  );
  return (
    <>
      {steps.length ? (
        <ol className="mt-2 space-y-1.5">
          {steps.map((raw, i) => {
            const s = asRecord(raw);
            return (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-[10px] text-primary">{String(s?.["step"] ?? i + 1)}</span>
                <span className="flex-1">{String(s?.["name"] ?? raw)}</span>
                <span className="font-mono text-[10px] text-muted-foreground uppercase">
                  {String(s?.["status"] ?? "")}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      {logs.length ? <Code label="Automation log">{logs.map(String).join("\n")}</Code> : null}
      {Object.keys(rest).length ? <Code label="Response">{JSON.stringify(rest, null, 2)}</Code> : null}
    </>
  );
}

export function ExecutionCard({ result }: { result: ExecutionResult }) {
  const [open, setOpen] = useState(true);
  const data = asRecord(result.response);
  const { payload } = result;

  // Failed / unconfigured webhook: show a calm one-line notice, never raw payloads or HTTP errors.
  if (result.simulated || !result.ok) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-md border border-medium/40 bg-medium/10 px-3 py-2 text-[11px] text-medium">
        <CloudOff className="h-3.5 w-3.5 shrink-0" />
        <span className="font-mono uppercase tracking-wider">{payload.action}</span>
        <span className="text-muted-foreground">
          External node unavailable — the agent answered from analysis instead. / تعذّر الوصول إلى العقدة الخارجية.
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        {result.simulated ? (
          <CloudOff className="h-3.5 w-3.5 text-medium" />
        ) : (
          <Zap className="h-3.5 w-3.5 text-primary" />
        )}
        <span className="font-mono text-[11px] tracking-wider uppercase">
          {payload.action}
        </span>
        {payload.target ? (
          <span className="truncate font-mono text-[11px] text-muted-foreground">{payload.target}</span>
        ) : null}
        <span
          className={`ml-auto rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
            result.simulated ? "border-medium/50 bg-medium/15 text-medium" : "border-low/50 bg-low/15 text-low"
          }`}
        >
          {result.simulated ? "Simulated" : "Executed"}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="mt-2 border-t border-border pt-2">
          {result.note ? <p className="text-[11px] text-medium">{result.note}</p> : null}

          {result.simulated ? (
            <Code label="Prepared execution payload">{JSON.stringify(payload, null, 2)}</Code>
          ) : null}

          {data ? (
            payload.agent_type === "red_team" ? (
              <RedTeamBody data={data} />
            ) : payload.agent_type === "blue_team" ? (
              <BlueTeamBody data={data} />
            ) : (
              <AssistantBody data={data} />
            )
          ) : (
            <Code label="Raw response">{String(result.response ?? "")}</Code>
          )}

          <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
            <Terminal className="h-3 w-3" />
            {result.attempts} attempt{result.attempts === 1 ? "" : "s"} · {payload.timestamp}
          </p>
        </div>
      ) : null}
    </div>
  );
}
