import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LifeBuoy, Send } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/support")({
  head: () => ({
    meta: [
      { title: "Support — SentinelSec AI" },
      { name: "description", content: "Contact the SentinelSec AI team about billing, credits or platform issues." },
      { property: "og:title", content: "Support — SentinelSec AI" },
      { property: "og:description", content: "Open a support thread and track replies from the team." },
    ],
  }),
  component: Support,
});

function Support() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const { data: threads = [] } = useQuery({
    queryKey: ["support-threads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_threads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const currentId = activeId ?? threads[0]?.id ?? null;
  const current = threads.find((t) => t.id === currentId) ?? null;

  const { data: messages = [] } = useQuery({
    queryKey: ["support-messages", currentId],
    enabled: !!currentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .eq("thread_id", currentId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  async function openThread(form: FormData) {
    if (!user) return;
    const subject = String(form.get("subject") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    if (!subject || !body) return;
    const { data: thread, error } = await supabase
      .from("support_threads")
      .insert({ user_id: user.id, subject })
      .select()
      .single();
    if (error || !thread) return toast.error(error?.message ?? "Could not open the thread.");
    await supabase.from("support_messages").insert({ thread_id: thread.id, sender_id: user.id, body });
    toast.success("Support thread opened.");
    setActiveId(thread.id);
    void qc.invalidateQueries({ queryKey: ["support-threads"] });
  }

  async function sendReply() {
    if (!user || !currentId || !reply.trim()) return;
    const { error } = await supabase
      .from("support_messages")
      .insert({ thread_id: currentId, sender_id: user.id, body: reply.trim() });
    if (error) return toast.error(error.message);
    setReply("");
    void qc.invalidateQueries({ queryKey: ["support-messages", currentId] });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Support</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Questions about billing, credits or a payment under review — the team replies here.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-6">
          <form
            className="panel space-y-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void openThread(new FormData(e.currentTarget));
              e.currentTarget.reset();
            }}
          >
            <h2 className="text-sm font-semibold">New request</h2>
            <div className="space-y-1.5">
              <Label htmlFor="s-subject">Subject</Label>
              <Input id="s-subject" name="subject" required placeholder="Payment not credited" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-body">Message</Label>
              <Textarea id="s-body" name="body" rows={4} required />
            </div>
            <Button type="submit" className="w-full">
              <Send className="h-4 w-4" /> Send
            </Button>
          </form>

          <div className="panel p-3">
            <p className="px-2 py-1 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
              Your threads
            </p>
            {threads.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">No threads yet.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {threads.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => setActiveId(t.id)}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        t.id === currentId ? "bg-accent" : "hover:bg-accent/50"
                      }`}
                    >
                      <span className="block truncate">{t.subject}</span>
                      <Badge variant="secondary" className="mt-1 font-mono text-[10px]">
                        {t.status}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="panel p-6">
          {!current ? (
            <div className="py-16 text-center">
              <LifeBuoy className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">Open a request to start a conversation.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{current.subject}</h2>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {current.status}
                </Badge>
              </div>
              <div className="mt-5 space-y-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-md border p-4 text-sm ${
                      m.from_admin ? "border-primary/40 bg-primary/5" : "border-border bg-background/40"
                    }`}
                  >
                    <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                      {m.from_admin ? "SentinelSec support" : "You"}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-end gap-2">
                <Textarea
                  rows={2}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write a reply…"
                  className="resize-none"
                />
                <Button size="icon" aria-label="Send reply" onClick={() => void sendReply()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
