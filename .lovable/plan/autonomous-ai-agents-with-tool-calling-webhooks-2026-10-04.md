# Autonomous AI Agents with Tool Calling + Webhooks

Transform the Assistant, Red Team, and Blue Team into agents that can execute real-world tasks by calling an `execute_external_task` tool, which posts a structured payload to a webhook (`VITE_WEBHOOK_URL`), and renders the response back in chat.

## What the user will see

- Assistant, Red Team, and Blue Team each get a chat interface (Red/Blue currently show CRUD lists — these gain a chat panel at the top; existing engagement/finding tools remain below).
- Role-specific system prompts and output styling (vulnerability reports for Red, remediation/defensive rules for Blue, task logs for Assistant).
- When the user asks for an action ("scan https://example.com", "harden this nginx config", "fetch headers of X"), the agent emits a tool call. A loading pill "Agent executing task on external node…" appears while the webhook runs.
- Results render inline: Red Team shows severity badges + styled code blocks for PoC/output; Blue Team shows diff-style patches, firewall/YARA rules; Assistant shows step summaries and JSON trees.
- If `VITE_WEBHOOK_URL` is unset or the call fails after retries, the chat shows the exact JSON payload the agent prepared, plus a simulated result, clearly labeled "Simulation (no webhook configured)".

## Technical plan

### Server: `/api/chat` tool-calling loop

- Accept `{ messages, agent_type, pending_tool_results? }` where `agent_type` ∈ `"assistant" | "red_team" | "blue_team"`.
- Pick a role-specific `SYSTEM_PROMPT` per agent_type.
- Call OpenRouter with `tools: [execute_external_task]` (JSON schema with `action`, `target`, `parameters`).
- Switch to **non-streaming** when tools are enabled so we can cleanly return either `{ type: "message", content }` or `{ type: "tool_call", id, name, arguments }`. Keeps credit gating + persistence intact.
- When the client sends `pending_tool_results`, append them as `role: "tool"` messages and re-invoke the model for the final answer.

### Client: shared agent runtime (`src/lib/agent.ts`)

- `runAgent({ agentType, history, onUpdate })`:
  1. POST history to `/api/chat`.
  2. If response is a tool_call for `execute_external_task`, call `executeExternalTask(payload)` from `src/lib/agent-webhook.ts`.
  3. POST follow-up with the tool result back to `/api/chat`.
  4. Return final assistant message.
- `executeExternalTask(payload)` (`src/lib/agent-webhook.ts`):
  - Reads `import.meta.env.VITE_WEBHOOK_URL`.
  - Builds `{ agent_type, action, target, parameters, timestamp }`.
  - POSTs with 30s `AbortSignal.timeout(30_000)`, up to 3 attempts with exponential backoff on timeout/non-2xx.
  - If URL missing or all retries fail: returns `{ simulated: true, payload, note }` with a plausible mocked structure (status, findings[], output).

### UI components

- `src/components/agent/AgentChat.tsx`: shared chat shell (messages, composer, loading pill, abort). Takes `agentType` and renders bubbles using `renderAgentContent`.
- `src/components/agent/renderAgentContent.tsx`: parses tool-result payloads and renders role-styled cards (code blocks, severity badges, diffs, JSON tree).
- `src/components/agent/ToolActivity.tsx`: inline "executing task" indicator with the pending action name.

### Pages

- `src/routes/_app/assistant.tsx` — swap manual SSE for `AgentChat agentType="assistant"`.
- `src/routes/_app/red-team.tsx` — add `AgentChat agentType="red_team"` above existing engagements CRUD.
- `src/routes/_app/blue-team.tsx` — add `AgentChat agentType="blue_team"` above checklist CRUD.

### Concurrency

- Each `AgentChat` instance holds its own `AbortController` and request queue; `runAgent` is async and multiple panels can run in parallel without shared state. The webhook helper uses per-call controllers so retries don't cross-cancel.

### Env + fallback

- `VITE_WEBHOOK_URL` read in the browser only. No server env added.
- Simulation mode clearly labeled in the UI; the prepared payload is shown verbatim in a code block.

## Out of scope

- Changing model/provider (OpenRouter + llama-3.3-70b stays; still works with tools).
- Persisting tool-call history beyond plain assistant text in `chat_messages`.
- Red/Blue Team CRUD changes (engagements, findings, checklists untouched).
