import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AdminUser = { id: string; email: string | null; display_name: string | null; banned: boolean; role: string };

export function ChatLogs({
  users,
  onToggleBan,
}: {
  users: AdminUser[];
  onToggleBan: (userId: string, banned: boolean) => void | Promise<void>;
}) {
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const { data: threads = [] } = useQuery({
    queryKey: ["admin-chat-threads"],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_threads")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1000);
      return data ?? [];
    },
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["admin-chat-messages", selectedUser],
    enabled: !!selectedUser,
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("user_id", selectedUser!)
        .order("created_at", { ascending: true })
        .limit(2000);
      return data ?? [];
    },
  });

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    threads.forEach((t) => m.set(t.user_id, (m.get(t.user_id) ?? 0) + 1));
    return m;
  }, [threads]);

  const list = users.filter((u) => {
    const s = q.toLowerCase();
    return !s || (u.email ?? "").toLowerCase().includes(s) || u.id.includes(s);
  });
  const user = users.find((u) => u.id === selectedUser);
  const userThreads = threads.filter((t) => t.user_id === selectedUser);
  const shown = messages.filter((m) => !selectedThread || m.thread_id === selectedThread);

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <div className="panel space-y-2 p-3">
        <Input placeholder="Search email or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-[70vh] space-y-1 overflow-y-auto">
          {list.map((u) => (
            <button
              key={u.id}
              onClick={() => { setSelectedUser(u.id); setSelectedThread(null); }}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${selectedUser === u.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"}`}
            >
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{u.email ?? "(no email)"}</span>
                {u.banned ? <Badge variant="destructive" className="text-[10px]">Banned</Badge> : null}
              </div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">{u.id}</div>
              <div className="text-xs text-muted-foreground">{counts.get(u.id) ?? 0} conversations</div>
            </button>
          ))}
        </div>
      </div>

      <div className="panel p-4">
        {!user ? (
          <p className="text-sm text-muted-foreground">Select a user to view their conversation history.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
              <div className="min-w-0">
                <div className="font-medium">{user.email}</div>
                <div className="font-mono text-xs text-muted-foreground">{user.id}</div>
              </div>
              {user.banned ? <Badge variant="destructive">Banned</Badge> : null}
              {user.role !== "admin" ? (
                <Button
                  size="sm"
                  className="ml-auto"
                  variant={user.banned ? "outline" : "destructive"}
                  onClick={() => void onToggleBan(user.id, user.banned)}
                >
                  {user.banned ? "Unban user" : "Ban user"}
                </Button>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={selectedThread === null ? "default" : "outline"} onClick={() => setSelectedThread(null)}>
                All messages
              </Button>
              {userThreads.map((t) => (
                <Button key={t.id} size="sm" variant={selectedThread === t.id ? "default" : "outline"} onClick={() => setSelectedThread(t.id)}>
                  <span className="max-w-[12rem] truncate">{t.title}</span>
                  <span className="ml-1 text-[10px] opacity-70">{t.agent_type}</span>
                </Button>
              ))}
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
              {!isLoading && shown.length === 0 ? <p className="text-sm text-muted-foreground">No messages.</p> : null}
              {shown.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-md border p-3 text-sm ${m.role === "user" ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30"}`}
                >
                  <div className="mb-1 flex gap-2 text-[11px] text-muted-foreground">
                    <span className="font-semibold uppercase">{m.role === "user" ? "User" : "AI"}</span>
                    <span>{m.agent_type}</span>
                    <span className="ml-auto">{new Date(m.created_at).toLocaleString()}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
