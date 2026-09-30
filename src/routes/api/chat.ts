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
        const SUPABASE_URL = process.env["SUPABASE_URL"];
        const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
        const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];

        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !LOVABLE_API_KEY) {
          return json({ error: "Server is not configured." }, 500);
        }

        const token = request.headers.get("authorization")?.replace(/^Bearer /, "").trim();
        if (!token) return json({ error: "You need to sign in to use the assistant." }, 401);

        const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claimsData, error: claimsError } = await anon.auth.getClaims(token);
        const userId = claimsData?.claims?.sub;
        if (claimsError || !userId) return json({ error: "Your session has expired." }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const [{ data: roleRow }, { data: sub }] = await Promise.all([
          supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
          supabaseAdmin
            .from("subscriptions")
            .select("plan, credits_remaining, unlimited, credits_used")
            .eq("user_id", userId)
            .maybeSingle(),
        ]);

        const isAdmin = !!roleRow;
        const unlimited = isAdmin || !!sub?.unlimited;

        if (!unlimited) {
          if (!sub || sub.credits_remaining <= 0) {
            return json(
              { error: "You are out of AI credits. Upgrade your plan or top up to continue.", code: "no_credits" },
              402,
            );
          }
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
          await supabaseAdmin
            .from("subscriptions")
            .update({
              credits_remaining: sub.credits_remaining - 1,
              credits_used: (sub.credits_used ?? 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
          await supabaseAdmin
            .from("credit_ledger")
            .insert({ user_id: userId, delta: -1, reason: "AI assistant message" });
        }

        const gateway = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));

        try {
          const upstream = await gateway.fetch("https://ai.gateway.lovable.dev/v1/responses", {
            method: "POST",
            signal: request.signal,
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": LOVABLE_API_KEY,
              "X-Lovable-AIG-SDK": "fetch",
            },
            body: JSON.stringify({
              model: "openai/gpt-6-astra",
              stream: true,
              store: false,
              reasoning: { effort: "medium", summary: "auto" },
              include: ["reasoning.encrypted_content"],
              input: [
                { role: "system", content: SYSTEM_PROMPT },
                ...messages.slice(-24).map((m) => ({ role: m.role, content: m.content })),
              ],
            }),
          });

          if (!upstream.ok) {
            const detail = await upstream.text();
            console.error("AI gateway error", upstream.status, detail);
            const message =
              upstream.status === 429
                ? "The assistant is busy right now. Try again in a moment."
                : upstream.status === 402
                  ? "The platform AI allowance has run out. Please contact the administrator."
                  : "The assistant could not answer that request.";
            return json({ error: message }, upstream.status);
          }

          const headers = getLovableAiGatewayResponseHeaders(upstream.headers);
          headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "text/event-stream");
          headers.set("Cache-Control", "no-cache, no-transform");
          return new Response(upstream.body, { status: upstream.status, headers });
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
