import type { AgentType, ExecutionPayload, ExecutionResult } from "./agent-types";

const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

export function webhookUrl(): string | undefined {
  const raw = import.meta.env["VITE_WEBHOOK_URL"] as string | undefined;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildPayload(
  agentType: AgentType,
  args: { action?: unknown; target?: unknown; parameters?: unknown },
): ExecutionPayload {
  const parameters =
    args.parameters && typeof args.parameters === "object" && !Array.isArray(args.parameters)
      ? (args.parameters as Record<string, unknown>)
      : {};
  return {
    agent_type: agentType,
    action: typeof args.action === "string" ? args.action : "unspecified_action",
    target: typeof args.target === "string" ? args.target : "",
    parameters,
    timestamp: new Date().toISOString(),
  };
}

function simulate(payload: ExecutionPayload, note: string, attempts: number): ExecutionResult {
  const base = {
    status: "simulated",
    action: payload.action,
    target: payload.target,
    executed_at: payload.timestamp,
  };

  const response =
    payload.agent_type === "red_team"
      ? {
          ...base,
          attack_surface: { open_ports: [80, 443], technologies: ["nginx", "node"], endpoints_discovered: 12 },
          findings: [
            {
              severity: "high",
              title: "Missing Content-Security-Policy header",
              evidence: "GET / → 200, no CSP response header present",
              remediation: "Add a strict CSP with default-src 'self' and report-uri.",
            },
            {
              severity: "medium",
              title: "Server banner discloses version",
              evidence: "Server: nginx/1.18.0",
              remediation: "Set server_tokens off;",
            },
          ],
          output: `$ ${payload.action} ${payload.target}\n[+] simulation mode — no traffic was sent\n[+] 2 candidate issues recorded`,
        }
      : payload.agent_type === "blue_team"
        ? {
            ...base,
            recommendations: [
              "Enable HSTS with a 1-year max-age and includeSubDomains",
              "Rotate credentials for any account seen in the alert window",
            ],
            headers_diff: `- Strict-Transport-Security: (absent)\n+ Strict-Transport-Security: max-age=31536000; includeSubDomains\n- X-Content-Type-Options: (absent)\n+ X-Content-Type-Options: nosniff`,
            rules: [
              'firewall: deny inbound tcp/3389 from 0.0.0.0/0',
              'yara: rule Suspicious_Loader { strings: $a = "VirtualAllocEx" condition: $a }',
            ],
            output: `$ ${payload.action} ${payload.target}\n[+] simulation mode — no changes were applied`,
          }
        : {
            ...base,
            steps: [
              { step: 1, name: "Validate input", status: "ok" },
              { step: 2, name: `Dispatch ${payload.action}`, status: "ok" },
              { step: 3, name: "Collect response", status: "ok" },
            ],
            logs: [`${payload.timestamp} dispatch ${payload.action}`, `${payload.timestamp} simulation complete`],
          };

  return { simulated: true, ok: false, attempts, note, payload, response };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST the execution payload to VITE_WEBHOOK_URL with a 30s timeout and up to
 * 3 attempts. Falls back to a clearly-labelled dry run when the webhook is not
 * configured or never answers successfully.
 */
export async function executeExternalTask(
  payload: ExecutionPayload,
  outerSignal?: AbortSignal,
): Promise<ExecutionResult> {
  const url = webhookUrl();
  if (!url) {
    return simulate(payload, "VITE_WEBHOOK_URL is not configured — dry run only, nothing was sent.", 0);
  }

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (outerSignal?.aborted) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onOuterAbort = () => controller.abort();
    outerSignal?.addEventListener("abort", onOuterAbort);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        lastError = `Webhook returned HTTP ${res.status}`;
      } else {
        let parsed: unknown = text;
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          /* keep raw text */
        }
        return { simulated: false, ok: true, attempts: attempt, payload, response: parsed };
      }
    } catch (error) {
      lastError =
        controller.signal.aborted && !outerSignal?.aborted
          ? "Webhook timed out after 30s"
          : error instanceof Error
            ? error.message
            : "Webhook request failed";
    } finally {
      clearTimeout(timer);
      outerSignal?.removeEventListener("abort", onOuterAbort);
    }
    if (attempt < MAX_ATTEMPTS && !outerSignal?.aborted) await wait(attempt * 1000);
  }

  return simulate(
    payload,
    `${lastError || "Webhook unreachable"} — fell back to simulation after ${MAX_ATTEMPTS} attempts.`,
    MAX_ATTEMPTS,
  );
}
