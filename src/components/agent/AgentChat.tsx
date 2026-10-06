import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Crosshair,
  History,
  Loader2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";

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

type Thread = { id: string; title: string; updated_at: string };

type Props = {
  agentType: AgentType;
  title: string;
  subtitle: string;
  suggestions: string[];
  placeholder: string;
  className?: string;
};

export function AgentChat({ agentType, title, subtitle, suggestions, placeholder, className }: Props) {
  const { user, isAdmin, banned, subscription, refresh, spendCredit } = useAuth();
  const search = useSearch({ strict: false }) as { thread?: string };
  const navigate = useNavigate();
  const threadId = search.thread ?? null;

  const [threads, setThreads] = useState<Thread[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const skipLoadRef = useRef<string | null>(null);
  const Icon = ICONS[agentType];
  const live = !!webhookUrl();

  const goToThread = useCallback(
    (id: string | null) => {
      void navigate({
        to: ".",
        search: ((prev: Record<string, unknown>) => ({ ...prev, thread: id ?? undefined })) as never,
      });
    },
    [navigate],
  );

  const loadThreads = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("chat_threads")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .eq("agent_type", agentType)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) console.error("Failed to load chat history", error);
    else setThreads(data ?? []);
  }, [user, agentType]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!user) return;
    if (!threadId) {
      setMessages([]);
      return;
    }
    if (skipLoadRef.current === threadId) {
      skipLoadRef.current = null;
      return;
    }
    let cancelled = false;
    void supabase
      .from("chat_messages")
      .select("id, role, content, agent_type")
      .eq("user_id", user.id)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error("Could not load this conversation.");
        else setMessages((data ?? []) as AgentMessage[]);
      });
    inputRef.current?.focus();
    return () => {
      cancelled = true;
    };
  }, [user, threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, activity]);

  const unlimited = isAdmin || !!subscription?.unlimited;
  const outOfCredits = !unlimited && (subscription?.credits_remaining ?? 0) <= 0;
  const blocked = outOfCredits || banned;

  async function saveMessage(tid: string, role: "user" | "assistant", content: string) {
    if (!user) return;
    const { error } = await supabase
      .from("chat_messages")
      .insert({ user_id: user.id, role, content, agent_type: agentType, thread_id: tid });
    if (error) console.error("Failed to save message", error);
    await supabase.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", tid);
  }

  async function send(text: string) {
    if (!user || busy || banned) return;
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
    if (!unlimited) spendCredit();

    let tid = threadId;
    if (!tid) {
      const { data, error } = await supabase
        .from("chat_threads")
        .insert({ user_id: user.id, agent_type: agentType, title: trimmed.slice(0, 60) })
        .select("id")
        .single();
      if (error || !data) {
        toast.error("Could not start a new conversation.");
        setBusy(false);
        return;
      }
      tid = data.id;
      skipLoadRef.current = tid;
      goToThread(tid);
    }
    const activeTid = tid;
    void saveMessage(activeTid, "user", trimmed).then(loadThreads);

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
      void saveMessage(activeTid, "assistant", assistant.content).then(loadThreads);
      void refresh();
    } catch (error) {
      setMessages([...history, userMsg]);
      if (!controller.signal.aborted) {
        toast.error(error instanceof Error ? error.message : "Something went wrong.");
      }
    } finally {
      setActivity(null);
      setBusy(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }

  async function deleteThread(id: string) {
    const { error } = await supabase.from("chat_threads").delete().eq("id", id);
    if (error) {
      toast.error("Could not delete conversation.");
      return;
    }
    setThreads((t) => t.filter((x) => x.id !== id));
    if (id === threadId) goToThread(null);
  }

  function newChat() {
    if (busy) return;
    goToThread(null);
    setMessages([]);
    inputRef.current?.focus();
  }

  return (
    <div className={`flex flex-col ${className ?? ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={showSidebar ? "Hide chat history" : "Show chat history"}
            onClick={() => setShowSidebar((v) => !v)}
          >
            {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
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
          <Button size="sm" onClick={newChat} disabled={busy}>
            <MessageSquarePlus className="h-4 w-4" /> New Chat
          </Button>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 gap-4">
        {showSidebar ? (
          <aside className="panel hidden w-64 shrink-0 flex-col overflow-hidden md:flex">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
              <History className="h-3.5 w-3.5" /> Chat history
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {threads.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">No saved conversations yet.</p>
              ) : (
                threads.map((t) => (
                  <div
                    key={t.id}
                    className={`group flex items-center gap-1 rounded-md transition-colors ${
                      t.id === threadId ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => !busy && goToThread(t.id)}
                      className="min-w-0 flex-1 px-2.5 py-2 text-left"
                    >
                      <p className="truncate text-xs">{t.title}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {new Date(t.updated_at).toLocaleString()}
                      </p>
                    </button>
                    <button
                      type="button"
                      aria-label="Delete conversation"
                      onClick={() => void deleteThread(t.id)}
                      className="mr-1 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="panel min-h-0 flex-1 overflow-y-auto p-6">
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
            {banned ? (
              <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                Account suspended — access to the AI agents is restricted. Contact support.
              </div>
            ) : outOfCredits ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3">
                <p className="text-sm text-destructive">
                  You have 0 credits left. Upgrade your plan or buy more credits to keep chatting.
                </p>
                <Button asChild size="sm">
                  <Link to="/billing">Upgrade plan</Link>
                </Button>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                autoFocus
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder={blocked ? "Messaging is disabled" : placeholder}
                disabled={blocked}
                className="resize-none"
              />
              {busy ? (
                <Button variant="outline" size="icon" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  aria-label="Send"
                  disabled={blocked || !input.trim()}
                  onClick={() => void send(input)}
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
