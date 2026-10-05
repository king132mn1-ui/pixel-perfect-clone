export type AgentType = "assistant" | "red_team" | "blue_team";

export type ExecutionPayload = {
  agent_type: AgentType;
  action: string;
  target: string;
  parameters: Record<string, unknown>;
  timestamp: string;
};

export type ExecutionResult = {
  simulated: boolean;
  ok: boolean;
  attempts: number;
  note?: string;
  payload: ExecutionPayload;
  response: unknown;
};

/** A single turn rendered in the chat transcript. */
export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Tool runs that happened while producing this assistant turn. */
  executions?: ExecutionResult[] | undefined;
};

/** Wire-format message exchanged with /api/chat (OpenAI/OpenRouter shape). */
export type WireMessage =
  | { role: "user" | "assistant"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls: { id: string; type: "function"; function: { name: string; arguments: string } }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export const AGENT_LABEL: Record<AgentType, string> = {
  assistant: "SentinelSec AI",
  red_team: "Red Team Agent",
  blue_team: "Blue Team Agent",
};
