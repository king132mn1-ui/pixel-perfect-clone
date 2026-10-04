import { supabase } from "@/integrations/supabase/client";

import { buildPayload, executeExternalTask } from "./agent-webhook";
import type {
  AgentMessage,
  AgentType,
  ExecutionResult,
  WireMessage,
} from "./agent-types";

const MAX_TOOL_ROUNDS = 4;

type RunArgs = {
  agentType: AgentType;
  history: AgentMessage[];
  userText: string;
  signal: AbortSignal;
  onActivity?: (label: string | null) => void;
};

type RunResult = {
  assistant: AgentMessage;
};

type ApiResponse = {
  message?: {
    role: string;
    content: string | null;
    tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  };
  error?: string;
};

function toWire(history: AgentMessage[]): WireMessage[] {
  return history.map((m) => ({ role: m.role, content: m.content }));
}

async function callChat(
  agentType: AgentType,
  wire: WireMessage[],
  signal: AbortSignal,
  followUp: boolean,
): Promise<ApiResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const res = await fetch("/api/chat", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ agent_type: agentType, messages: wire, follow_up: followUp }),
  });
  const data = (await res.json().catch(() => ({}))) as ApiResponse;
  if (!res.ok) throw new Error(data.error ?? `Chat request failed (${res.status}).`);
  return data;
}

/**
 * One agent turn: send the chat, run any tool calls against the webhook,
 * loop up to MAX_TOOL_ROUNDS, and return the final assistant message.
 */
export async function runAgent({
  agentType,
  history,
  userText,
  signal,
  onActivity,
}: RunArgs): Promise<RunResult> {
  const wire: WireMessage[] = [...toWire(history), { role: "user", content: userText }];
  const executions: ExecutionResult[] = [];
  let followUp = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await callChat(agentType, wire, signal, followUp);
    followUp = true;
    const msg = data.message;
    if (!msg) throw new Error("The assistant returned an empty response.");

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      onActivity?.(null);
      return {
        assistant: {
          id: crypto.randomUUID(),
          role: "assistant",
          content: (msg.content ?? "").trim() || "(no response)",
          executions: executions.length ? executions : undefined,
        },
      };
    }

    // Append the assistant tool-call turn so the next call carries context.
    wire.push({
      role: "assistant",
      content: msg.content ?? "",
      tool_calls: toolCalls,
    });

    // Run every tool call. Only execute_external_task is supported.
    for (const call of toolCalls) {
      if (call.function.name !== "execute_external_task") {
        wire.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: `Unknown tool: ${call.function.name}` }),
        });
        continue;
      }
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        /* leave empty */
      }
      const payload = buildPayload(agentType, args);
      onActivity?.(`Agent executing ${payload.action || "task"} on external node…`);
      const result = await executeExternalTask(payload, signal);
      executions.push(result);
      wire.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  onActivity?.(null);
  return {
    assistant: {
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        "The agent reached its tool-call limit for this turn. Partial results are attached below — ask a follow-up to continue.",
      executions,
    },
  };
}
