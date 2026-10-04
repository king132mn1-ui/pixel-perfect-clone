import { createFileRoute } from "@tanstack/react-router";

import { AgentChat } from "@/components/agent/AgentChat";

export const Route = createFileRoute("/_app/assistant")({
  head: () => ({
    meta: [
      { title: "AI Security Assistant — SentinelSec AI" },
      {
        name: "description",
        content:
          "An autonomous security analyst agent that answers technical questions and executes automation tasks on your external node.",
      },
      { property: "og:title", content: "AI Security Assistant — SentinelSec AI" },
      {
        property: "og:description",
        content: "Autonomous agent for vulnerability analysis, hardening and task automation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Assistant,
});

const SUGGESTIONS = [
  "Explain broken access control and how to test for it in a REST API",
  "Fetch the response headers for https://example.com and summarise the gaps",
  "Trigger the nightly asset-inventory workflow and report the result",
  "Summarise CVE-2021-44228 impact and remediation for a Java estate",
];

function Assistant() {
  return (
    <AgentChat
      className="h-[calc(100vh-13rem)]"
      agentType="assistant"
      title="AI Security Assistant"
      subtitle="Defensive analysis, hardening guidance and autonomous task execution for authorised work."
      suggestions={SUGGESTIONS}
      placeholder="Ask a question, or describe a task for the agent to execute…"
    />
  );
}
