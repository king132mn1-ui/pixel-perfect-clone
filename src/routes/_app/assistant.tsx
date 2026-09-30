import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bot, Send, Square, Trash2, User as UserIcon, Zap } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/assistant")({
  head: () => ({
    meta: [
      { title: "AI Security Assistant — SentinelSec AI" },
      {
        name: "description",
        content: "Ask the SentinelSec AI analyst about vulnerabilities, CVEs, hardening and incident response.",
      },
      { property: "og:title", content: "AI Security Assistant — SentinelSec AI" },
      { property: "og:description", content: "Technical answers on vulnerabilities, hardening and incident response." },
    ],
  }),
  component: Assistant,
});

type Msg = { id: string; role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Explain broken access control and how to test for it in a REST API",
  "Review this nginx config for security misconfiguration",
  "Draft an incident response checklist for a suspected credential stuffing attack",
  "Summarise CVE-2021-44228 impact and remediation for a Java estate",
];

function Assistant() {
  const { user, isAdmin, subscription, refresh } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("chat_messages")
      .select("id, role, content")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (data) setMessages(data as Msg[]);
      });
  }, [user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const unlimited = isAdmin || !!subscription?.unlimited;
  const outOfCredits = !unlimited && (subscription?.credits_remaining ?? 0) <= 0;

  async function send(text: string) {
    if (!user || streaming) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (outOfCredits) { toast.error("You are out of AI credits. Upgrade your plan to continue."); return; }

    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const history = [...messages, userMsg];
    setMessages([...history, { id: "streaming", role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    void supabase.from("chat_messages").insert({ user_id: user.id, role: "user", content: trimmed });

    const controller = new AbortController();
    abortRef.current = controller;
    let answer = "";

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch("/api/chat", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ messages: history.map((m) => ({ role: m.role, content: m.content })) }),
      });

      if (!response.ok || !response.body) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error ?? "The assistant could not answer that request.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const event = JSON.parse(payload) as { type?: string; delta?: string };
              if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
                answer += event.delta;
                setMessages([...history, { id: "streaming", role: "assistant", content: answer }]);
              }
            } catch {
              /* partial frame */
            }
          }
        }
      }

      if (!answer.trim()) throw new Error("The assistant returned an empty response.");

      const finalMsg: Msg = { id: crypto.randomUUID(), role: "assistant", content: answer };
      setMessages([...history, finalMsg]);
      void supabase.from("chat_messages").insert({ user_id: user.id, role: "assistant", content: answer });
      void refresh();
    } catch (error) {
      if (controller.signal.aborted) {
        setMessages(answer ? [...history, { id: crypto.randomUUID(), role: "assistant", content: answer }] : history);
      } else {
        setMessages(history);
        toast.error(error instanceof Error ? error.message : "Something went wrong.");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function clearChat() {
    if (!user) return;
    await supabase.from("chat_messages").delete().eq("user_id", user.id);
    setMessages([]);
  }

  return (
    <div className="flex h-[calc(100vh-13rem)] flex-col">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">AI Security Assistant</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Defensive analysis, vulnerability explanation and hardening guidance for authorised work.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[11px]">
            <Zap className="mr-1 h-3 w-3 text-primary" />
            {unlimited ? "Unlimited" : `${subscription?.credits_remaining ?? 0} credits`}
          </Badge>
          {messages.length > 0 ? (
            <Button variant="ghost" size="icon" aria-label="Clear conversation" onClick={() => void clearChat()}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="panel mt-6 flex-1 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Bot className="h-10 w-10 text-primary" />
            <p className="mt-4 max-w-md text-sm text-muted-foreground">
              Start with a question about a vulnerability class, a CVE, a configuration you want reviewed, or an
              incident you are working.
            </p>
            <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-md border border-border bg-background/40 p-3 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((m) => (
              <div key={m.id} className="flex gap-3">
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                    m.role === "user" ? "bg-secondary" : "bg-primary text-primary-foreground"
                  }`}
                >
                  {m.role === "user" ? <UserIcon className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                    {m.role === "user" ? "You" : "SentinelSec AI"}
                  </p>
                  <div className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">
                    {m.content || (streaming ? <span className="live-dot text-primary">analysing…</span> : null)}
                  </div>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="mt-4">
        {outOfCredits ? (
          <p className="mb-2 text-xs text-destructive">
            You have no AI credits left. Upgrade your plan on the Billing tab to continue.
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Describe the system, config or incident you need analysed…"
            className="resize-none"
          />
          {streaming ? (
            <Button variant="outline" size="icon" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" aria-label="Send" disabled={!input.trim()} onClick={() => void send(input)}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
