import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  getLovableAiGatewayResponseHeaders,
} from "@/lib/run-id";

const SYSTEM_PROMPT = `You are SentinelSec AI, the security analyst assistant inside the SentinelSec AI platform.

Your scope is defensive and authorised security work:
- Explaining vulnerability classes (OWASP Top 10, CWE, published CVEs) and how they are exploited conceptually
- Reviewing configuration, code and architecture for weaknesses, and writing hardened replacements
- Incident response guidance, detection logic, logging and monitoring advice
- Helping structure authorised penetration-test engagements: scoping, methodology, evidence handling, severity rating (CVSS) and remediation write-ups

Rules:
- Assume the user is a security professional working under written authorisation.
- Do not produce working exploits, malware, credential-stuffing tooling, or step-by-step instructions aimed at systems the user does not own. Offer the defensive or methodological equivalent instead, and say briefly why.
- Be concrete and technical. Use short sections, tables where they help, and fenced code blocks for configuration or code.
- When rating an issue, give severity (critical/high/medium/low), impact, and concrete remediation steps.`;

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

        // Prefer the privileged client; fall back to a user-scoped client (RLS) when the
        // service role key is not available (e.g. external hosting).
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

        let body: { messages?: { role: string; content: string }[] };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json({ error: "Invalid request." }, 400);
        }
        const messages = (body.messages ?? []).filter(
          (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
        );
        if (messages.length === 0) return json({ error: "No message to send." }, 400);

        if (!unlimited && sub) {
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
            .insert({ user_id: userId, delta: -1, reason: "AI assistant message" } as never);
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
              stream: true,
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                ...messages.slice(-24).map((m) => ({ role: m.role, content: m.content })),
              ],
            }),
          });

          if (!upstream.ok || !upstream.body) {
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

          return new Response(upstream.body, {
            status: 200,
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
          });
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
