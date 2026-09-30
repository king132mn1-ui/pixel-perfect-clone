import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Power, ShieldAlert, Check, X, Send } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PLAN_BY_ID, planLabel } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Control — SentinelSec AI" },
      { name: "description", content: "Super-admin control panel for users, payments, maintenance and support." },
      { property: "og:title", content: "Admin Control — SentinelSec AI" },
      { property: "og:description", content: "Manage users, verify USDT payments and control platform availability." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data: users = [] } = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ data: profiles }, { data: subs }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("subscriptions").select("*"),
        supabase.from("user_roles").select("*"),
      ]);
      return (profiles ?? []).map((p) => ({
        ...p,
        subscription: (subs ?? []).find((s) => s.user_id === p.id) ?? null,
        role: (roles ?? []).find((r) => r.user_id === p.id)?.role ?? "user",
      }));
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["admin-payments"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["admin-settings"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").maybeSingle();
      return data;
    },
  });

  const { data: threads = [] } = useQuery({
    queryKey: ["admin-threads"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("support_threads").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [maintMessage, setMaintMessage] = useState("");

  useEffect(() => {
    if (settings?.maintenance_message) setMaintMessage(settings.maintenance_message);
  }, [settings?.maintenance_message]);

  const { data: threadMessages = [] } = useQuery({
    queryKey: ["admin-thread-messages", activeThread],
    enabled: !!activeThread,
    queryFn: async () => {
      const { data } = await supabase
        .from("support_messages")
        .select("*")
        .eq("thread_id", activeThread!)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  if (loading) return <div className="p-10 font-mono text-xs text-muted-foreground">LOADING…</div>;

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="panel max-w-md p-10 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 text-lg font-semibold">Administrator access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This control panel is restricted to platform administrators.
          </p>
          <Button asChild className="mt-6">
            <Link to="/assistant">Back to workspace</Link>
          </Button>
        </div>
      </div>
    );
  }

  async function setPlan(userId: string, planId: string) {
    const plan = PLAN_BY_ID[planId as keyof typeof PLAN_BY_ID];
    const { error } = await supabase
      .from("subscriptions")
      .update({
        plan: planId,
        credits_remaining: plan?.unlimited ? 0 : (plan?.credits ?? 0),
        unlimited: !!plan?.unlimited,
      })
      .eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    toast.success("Subscription updated.");
    void qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  async function setCredits(userId: string, credits: number) {
    const { error } = await supabase.from("subscriptions").update({ credits_remaining: credits }).eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    toast.success("Credits updated.");
    void qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  async function reviewPayment(id: string, userId: string, planId: string, approve: boolean) {
    const { error } = await supabase
      .from("payments")
      .update({ status: approve ? "approved" : "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (approve) await setPlan(userId, planId);
    toast.success(approve ? "Payment approved and plan activated." : "Payment rejected.");
    void qc.invalidateQueries({ queryKey: ["admin-payments"] });
  }

  async function saveMaintenance(enabled: boolean) {
    const { error } = await supabase
      .from("app_settings")
      .update({ maintenance_mode: enabled, maintenance_message: maintMessage })
      .eq("id", true);
    if (error) { toast.error(error.message); return; }
    toast.success(enabled ? "Maintenance mode is ON." : "Maintenance mode is OFF.");
    void qc.invalidateQueries({ queryKey: ["admin-settings"] });
  }

  async function sendAdminReply() {
    if (!user || !activeThread || !reply.trim()) return;
    const { error } = await supabase
      .from("support_messages")
      .insert({ thread_id: activeThread, sender_id: user.id, body: reply.trim(), from_admin: true });
    if (error) { toast.error(error.message); return; }
    setReply("");
    void qc.invalidateQueries({ queryKey: ["admin-thread-messages", activeThread] });
  }

  const pending = payments.filter((p) => p.status === "pending");

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <Link to="/assistant" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Workspace
          </Link>
          <h1 className="font-display text-sm font-semibold tracking-wide">ADMIN CONTROL</h1>
          <Badge variant="outline" className="font-mono text-[10px]">
            super-admin
          </Badge>
          <div className="ml-auto">
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="payments">Payments {pending.length ? `(${pending.length})` : ""}</TabsTrigger>
            <TabsTrigger value="support">Support inbox</TabsTrigger>
            <TabsTrigger value="platform">Platform</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-6">
            <div className="panel overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                    <th className="p-4 text-left">User</th>
                    <th className="p-4 text-left">Role</th>
                    <th className="p-4 text-left">Plan</th>
                    <th className="p-4 text-left">Credits</th>
                    <th className="p-4 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="p-4">
                        <p className="font-medium">{u.display_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </td>
                      <td className="p-4">
                        <Badge variant={u.role === "admin" ? "default" : "secondary"} className="font-mono text-[10px]">
                          {u.role}
                        </Badge>
                      </td>
                      <td className="p-4">{planLabel(u.subscription?.plan ?? "free")}</td>
                      <td className="p-4 font-mono">
                        {u.subscription?.unlimited ? "∞" : (u.subscription?.credits_remaining ?? 0)}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {["starter", "professional", "enterprise"].map((p) => (
                            <Button key={p} size="sm" variant="outline" onClick={() => void setPlan(u.id, p)}>
                              {p}
                            </Button>
                          ))}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void setCredits(u.id, (u.subscription?.credits_remaining ?? 0) + 100)}
                          >
                            +100 credits
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="payments" className="mt-6 space-y-3">
            {payments.length === 0 ? (
              <div className="panel p-10 text-center text-sm text-muted-foreground">No payments submitted yet.</div>
            ) : (
              payments.map((p) => {
                const owner = users.find((u) => u.id === p.user_id);
                return (
                  <div key={p.id} className="panel flex flex-wrap items-center gap-4 p-5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {planLabel(p.plan)} · ${p.amount_usd} · {p.network}
                      </p>
                      <p className="text-xs text-muted-foreground">{owner?.email ?? p.user_id}</p>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">TXID: {p.txid}</p>
                    </div>
                    <Badge
                      variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}
                      className="font-mono text-[10px]"
                    >
                      {p.status}
                    </Badge>
                    {p.status === "pending" ? (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void reviewPayment(p.id, p.user_id, p.plan, true)}>
                          <Check className="h-4 w-4" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void reviewPayment(p.id, p.user_id, p.plan, false)}
                        >
                          <X className="h-4 w-4" /> Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="support" className="mt-6 grid gap-6 lg:grid-cols-[20rem_1fr]">
            <div className="panel p-3">
              {threads.length === 0 ? (
                <p className="p-6 text-center text-xs text-muted-foreground">Inbox is empty.</p>
              ) : (
                <ul className="space-y-1">
                  {threads.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => setActiveThread(t.id)}
                        className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                          t.id === activeThread ? "bg-accent" : "hover:bg-accent/50"
                        }`}
                      >
                        <span className="block truncate">{t.subject}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {users.find((u) => u.id === t.user_id)?.email ?? ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="panel p-6">
              {!activeThread ? (
                <p className="py-16 text-center text-sm text-muted-foreground">Select a thread to reply.</p>
              ) : (
                <>
                  <div className="space-y-4">
                    {threadMessages.map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-md border p-4 text-sm ${
                          m.from_admin ? "border-primary/40 bg-primary/5" : "border-border bg-background/40"
                        }`}
                      >
                        <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                          {m.from_admin ? "Support" : "User"}
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
                      placeholder="Reply as support…"
                      className="resize-none"
                    />
                    <Button size="icon" aria-label="Send reply" onClick={() => void sendAdminReply()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="platform" className="mt-6">
            <div className="panel max-w-2xl p-6">
              <div className="flex items-center gap-3">
                <Power className={settings?.maintenance_mode ? "h-5 w-5 text-destructive" : "h-5 w-5 text-primary"} />
                <div className="flex-1">
                  <h2 className="text-sm font-semibold">Maintenance kill-switch</h2>
                  <p className="text-xs text-muted-foreground">
                    Blocks the platform for all non-admin users and shows the message below.
                  </p>
                </div>
                <Switch
                  checked={!!settings?.maintenance_mode}
                  onCheckedChange={(v) => void saveMaintenance(v)}
                  aria-label="Toggle maintenance mode"
                />
              </div>
              <div className="mt-5 space-y-1.5">
                <Label htmlFor="maint">Maintenance message</Label>
                <Input id="maint" value={maintMessage} onChange={(e) => setMaintMessage(e.target.value)} />
              </div>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => void saveMaintenance(!!settings?.maintenance_mode)}
              >
                Save message
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
