import { useEffect, useRef, useState } from "react";
import { Bot, Crosshair, Loader2, Send, ShieldCheck, Square, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ExecutionCard } from "@/components/agent/ExecutionCard";
import { runAgent } from "@/lib/agent";
import { webhookUrl } from "@/lib/agent-webhook";
import { AGENT_LABEL, type AgentMessage, type AgentType } from "@/lib/agent-types";

const ICONS: Record<AgentType, typeof Bot> = {
  assistant: Bot,
  red_team: Crosshair,
  blue_team: ShieldCheck,
};

type Props = {
  agentType: AgentType;
  title: string;
  subtitle: string;
  suggestions: string[];
  placeholder: string;
  className?: string;
};

export function AgentChat({ agentType, title, subtitle, suggestions, placeholder, className }: Props) {
  const { user, isAdmin, subscription, refresh } = useAuth();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const Icon = ICONS[agentType];
  const live = !!webhookUrl();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void supabase
      .from("chat_messages")
      .select("id, role, content, agent_type")
      .eq("user_id", user.id)
      .eq("agent_type", agentType)
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (!cancelled && data) setMessages(data as AgentMessage[]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, agentType]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, activity]);

  const unlimited = isAdmin || !!subscription?.unlimited;
  const outOfCredits = !unlimited && (subscription?.credits_remaining ?? 0) <= 0;

  async function send(text: string) {
    if (!user || busy) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (outOfCredits) {
      toast.error("You are out of AI credits. Upgrade your plan to continue.");
      return;
    }

    const userMsg: AgentMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const history = [...messages];
    setMessages([...history, userMsg]);
    setInput("");
    setBusy(true);
    setActivity(null);

    void supabase
      .from("chat_messages")
      .insert({ user_id: user.id, role: "user", content: trimmed, agent_type: agentType });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { assistant } = await runAgent({
        agentType,
        history,
        userText: trimmed,
        signal: controller.signal,
        onActivity: setActivity,
      });
      setMessages([...history, userMsg, assistant]);
      void supabase
        .from("chat_messages")
        .insert({ user_id: user.id, role: "assistant", content: assistant.content, agent_type: agentType });
      void refresh();
    } catch (error) {
      if (controller.signal.aborted) {
        setMessages([...history, userMsg]);
      } else {
        setMessages([...history, userMsg]);
        toast.error(error instanceof Error ? error.message : "Something went wrong.");
      }
    } finally {
      setActivity(null);
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function clearChat() {
    if (!user) return;
    await supabase.from("chat_messages").delete().eq("user_id", user.id).eq("agent_type", agentType);
    setMessages([]);
  }

  return (
    <div className={`flex flex-col ${className ?? ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[11px]">
            <span
              className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${live ? "bg-low" : "bg-medium"}`}
              aria-hidden
            />
            {live ? "Webhook live" : "Simulation mode"}
          </Badge>
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

      <div className="panel mt-4 min-h-0 flex-1 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
            <Icon className="h-10 w-10 text-primary" />
            <p className="mt-4 max-w-md text-sm text-muted-foreground">
              Ask a question, or give the agent a task to execute — it will dispatch a structured job to your
              automation node and report back here.
            </p>
            <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
              {suggestions.map((s) => (
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
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                    {m.role === "user" ? "You" : AGENT_LABEL[agentType]}
                  </p>
                  <div className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{m.content}</div>
                  {m.executions?.map((ex, i) => <ExecutionCard key={i} result={ex} />)}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="flex items-center gap-2 text-xs text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="live-dot">{activity ?? "Agent reasoning…"}</span>
              </div>
            ) : null}
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
            placeholder={placeholder}
            className="resize-none"
          />
          {busy ? (
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
