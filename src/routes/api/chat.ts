import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type AgentType = "assistant" | "red_team" | "blue_team";

const LANGUAGE_RULE = `LANGUAGE (highest priority): Detect the language of the user's latest message and reply entirely in that exact same language — Arabic if they write Arabic, English if English, and so on for any language. You are fully authorised to speak Arabic and every other language; never say you cannot or are not allowed to use a language. Keep technical terms (CVE IDs, code, commands) as-is.`;

const SYSTEM_PROMPTS: Record<AgentType, string> = {
  assistant: `You are SentinelSec AI, the security analyst assistant inside the SentinelSec AI platform.

Scope: defensive and authorised security work — vulnerability classes (OWASP/CWE/CVE), config/code/architecture review, incident response, authorised pentest structure, severity/CVSS, remediation.

Rules:
- Assume the user is a security professional working under written authorisation.
- Do not produce working exploits, malware, or credential-stuffing tooling. Offer the defensive or methodological equivalent instead.
- Be concrete and technical. Use short sections, tables when helpful, fenced code blocks for config or code.
- When the user asks you to actually perform an action — scan a URL, fetch headers, run a workflow, dispatch an automation — call the execute_external_task tool with a precise action name, the target, and any useful parameters, then summarise the returned JSON for the user as step-by-step completion notes.`,

  red_team: `You are the Red Team Agent inside SentinelSec AI, an autonomous assistant for AUTHORISED offensive-security assessments.

Scope: scoping, reconnaissance planning, vulnerability analysis, attack-surface mapping, proof-of-concept narration, CVSS scoring, remediation write-ups.

Rules:
- Only operate against targets the user is authorised to test. If authorisation is unclear, ask once, then proceed defensively.
- Never produce working malware, ransomware, or credential-stuffing tooling.
- For any action the user asks you to run (recon, port/host scan, header check, directory enumeration, vulnerability probe, PoC dispatch), call the execute_external_task tool with an exact action name and the target.
- After the tool returns, present a vulnerability report: attack surface metrics, findings with severity (critical/high/medium/low), PoC/output in fenced code blocks, and remediation guidance.`,

  blue_team: `You are the Blue Team Agent inside SentinelSec AI, an autonomous defender assistant.

Scope: incident response, hardening, detection engineering, monitoring, log analysis, security headers, firewall and WAF/YARA rules.

Rules:
- For any action the user asks you to run (fetch headers, pull a configuration, deploy a hardening change, update a rule, trigger a containment workflow), call the execute_external_task tool with an exact action name and the target.
- After the tool returns, respond with: patch recommendations, a headers or config diff in fenced code blocks, firewall/YARA/Sigma rules where relevant, and clear remediation steps the on-call defender can follow.
- Keep answers operational and concise.`,
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "execute_external_task",
      description:
        "Dispatch a real-world action to the configured external automation webhook. Use this when the user asks for a scan, probe, fetch, deployment, rule update, or any operation that is not purely analytical.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description:
              "Short machine-readable operation name, e.g. 'scan_url', 'fetch_headers', 'nmap_tcp', 'deploy_waf_rule', 'trigger_workflow'.",
          },
          target: {
            type: "string",
            description: "Primary target of the action: URL, hostname, IP, workflow id, or payload identifier.",
          },
          parameters: {
            type: "object",
            description: "Optional additional arguments as a flat JSON object.",
            additionalProperties: true,
          },
        },
        required: ["action", "target"],
      },
    },
  },
];

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
        const SUPABASE_PUBLISHABLE_KEY =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ??
          process.env["SUPABASE_ANON_KEY"] ??
          process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
          process.env["VITE_SUPABASE_ANON_KEY"];
        const OPENROUTER_API_KEY = process.env["OPENROUTER_API_KEY"];
        const MODEL = process.env["OPENROUTER_MODEL"] || "meta-llama/llama-3.3-70b-instruct";

        const missing = [
          !SUPABASE_URL && "SUPABASE_URL",
          !SUPABASE_PUBLISHABLE_KEY && "SUPABASE_PUBLISHABLE_KEY",
          !OPENROUTER_API_KEY && "OPENROUTER_API_KEY",
        ].filter(Boolean);
        if (missing.length) {
          console.error("Missing env vars:", missing.join(", "));
          return json({ error: `Missing server setting(s): ${missing.join(", ")}` }, 500);
        }

        const token = request.headers.get("authorization")?.replace(/^Bearer /, "").trim();
        if (!token) return json({ error: "You need to sign in to use the assistant." }, 401);

        const anon = createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claimsData, error: claimsError } = await anon.auth.getClaims(token);
        const userId = claimsData?.claims?.sub;
        if (claimsError || !userId) return json({ error: "Your session has expired." }, 401);

        let db: ReturnType<typeof createClient>;
        if (process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          db = supabaseAdmin as unknown as ReturnType<typeof createClient>;
        } else {
          db = createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });
        }

        const { data: banRow } = await db.from("banned_users").select("user_id").eq("user_id", userId).maybeSingle();
        if (banRow) {
          return json({ error: "Account suspended — access to the AI agents is restricted.", code: "banned" }, 403);
        }

        const [{ data: roleRow }, { data: subData }] = await Promise.all([
          db.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
          db
            .from("subscriptions")
            .select("plan, credits_remaining, unlimited, credits_used")
            .eq("user_id", userId)
            .maybeSingle(),
        ]);
        const sub = subData as
          | { plan: string; credits_remaining: number; unlimited: boolean; credits_used: number | null }
          | null;

        const isAdmin = !!roleRow;
        const unlimited = isAdmin || !!sub?.unlimited;

        if (!unlimited && (!sub || sub.credits_remaining <= 0)) {
          return json(
            { error: "You are out of AI credits. Upgrade your plan or top up to continue.", code: "no_credits" },
            402,
          );
        }

        let body: {
          agent_type?: AgentType;
          messages?: unknown[];
          // Signals whether this is a follow-up turn that already produced tool results
          // (we only charge credits on the first turn to avoid double-billing).
          follow_up?: boolean;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json({ error: "Invalid request." }, 400);
        }

        const agentType: AgentType = ["assistant", "red_team", "blue_team"].includes(body.agent_type as string)
          ? (body.agent_type as AgentType)
          : "assistant";

        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (messages.length === 0) return json({ error: "No message to send." }, 400);

        if (!unlimited && sub && !body.follow_up) {
          const { error: updErr } = await db
            .from("subscriptions")
            .update({
              credits_remaining: sub.credits_remaining - 1,
              credits_used: (sub.credits_used ?? 0) + 1,
              updated_at: new Date().toISOString(),
            } as never)
            .eq("user_id", userId);
          if (updErr) console.error("Credit deduction failed", updErr.message);
          await db
            .from("credit_ledger")
            .insert({ user_id: userId, delta: -1, reason: `AI ${agentType} message` } as never);
        }

        try {
          const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            signal: request.signal,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${OPENROUTER_API_KEY}`,
              "HTTP-Referer": new URL(request.url).origin,
              "X-Title": "SentinelSec AI",
            },
            body: JSON.stringify({
              model: MODEL,
              stream: false,
              tools: TOOLS,
              tool_choice: "auto",
              messages: [
                { role: "system", content: `${LANGUAGE_RULE}\n\n${SYSTEM_PROMPTS[agentType]}` },
                ...messages.slice(-24),
              ],
            }),
          });

          if (!upstream.ok) {
            const detail = await upstream.text();
            console.error("OpenRouter error", upstream.status, detail);
            const message =
              upstream.status === 429
                ? "The assistant is busy right now. Try again in a moment."
                : upstream.status === 402
                  ? "The AI provider account is out of credits. Please contact the administrator."
                  : upstream.status === 401
                    ? "The AI provider key is invalid. Please contact the administrator."
                    : "The assistant could not answer that request.";
            return json({ error: message }, upstream.status);
          }

          const data = (await upstream.json()) as {
            choices?: {
              message?: {
                role: string;
                content: string | null;
                tool_calls?: {
                  id: string;
                  type: "function";
                  function: { name: string; arguments: string };
                }[];
              };
            }[];
          };
          const msg = data.choices?.[0]?.message;
          if (!msg) return json({ error: "The assistant returned an empty response." }, 502);
          return json({ message: msg }, 200);
        } catch (error) {
          if (request.signal.aborted && error instanceof Error && error.name === "AbortError") {
            return new Response(null, { status: 499 });
          }
          throw error;
        }
      },
    },
  },
});
