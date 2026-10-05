import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AgentChat } from "@/components/agent/AgentChat";

const BLUE_SUGGESTIONS = [
  "Check the security headers on https://example.com and give me the diff",
  "Deploy a WAF rule blocking path traversal on the edge node",
  "Build a containment checklist for a suspected ransomware host",
  "Write a Sigma rule for impossible-travel sign-ins",
];

export const Route = createFileRoute("/_app/blue-team")({
  head: () => ({
    meta: [
      { title: "Blue Team Operations — SentinelSec AI" },
      {
        name: "description",
        content: "Incident response checklists, hardening tasks and security posture tracking for defenders.",
      },
      { property: "og:title", content: "Blue Team Operations — SentinelSec AI" },
      { property: "og:description", content: "Incident response checklists and hardening posture tracking." },
    ],
  }),
  component: BlueTeam,
});

const CATEGORIES = ["Incident response", "Hardening", "Monitoring", "Access control", "Backup & recovery"];

const STARTER_PACKS: Record<string, string[]> = {
  "Incident response": [
    "Confirm the alert and record the detection time",
    "Isolate affected hosts from the network",
    "Preserve volatile evidence and memory images",
    "Rotate credentials and revoke active sessions",
    "Identify the initial access vector",
    "Notify stakeholders and legal per policy",
    "Eradicate persistence and restore from clean backups",
    "Write the post-incident review with action items",
  ],
  Hardening: [
    "Enforce MFA on all administrative accounts",
    "Disable unused services and close unused ports",
    "Apply CIS benchmark baseline to servers",
    "Enable full-disk encryption on endpoints",
    "Set a patch SLA per severity and track it",
    "Enforce TLS 1.2+ and secure cipher suites",
    "Add security headers: HSTS, CSP, X-Content-Type-Options",
  ],
  Monitoring: [
    "Centralise logs from endpoints, servers and cloud",
    "Alert on privileged role assignment changes",
    "Alert on impossible-travel and failed-login bursts",
    "Verify log retention meets policy",
    "Test detections with tabletop scenarios quarterly",
  ],
  "Access control": [
    "Review privileged access quarterly",
    "Remove dormant accounts after 30 days",
    "Apply least privilege to service accounts",
    "Require approval for standing admin access",
  ],
  "Backup & recovery": [
    "Keep offline or immutable backup copies",
    "Test a full restore at least quarterly",
    "Document and rehearse the recovery runbook",
  ],
};

function BlueTeam() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [category, setCategory] = useState<string>(CATEGORIES[0] ?? "Incident response");
  const [open, setOpen] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["checklist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_items")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const inCategory = items.filter((i) => i.category === category);
  const done = inCategory.filter((i) => i.done).length;
  const pct = inCategory.length ? Math.round((done / inCategory.length) * 100) : 0;
  const overall = items.length ? Math.round((items.filter((i) => i.done).length / items.length) * 100) : 0;

  async function loadPack() {
    if (!user) return;
    const titles = STARTER_PACKS[category] ?? [];
    const existing = new Set(inCategory.map((i) => i.title));
    const rows = titles
      .filter((t) => !existing.has(t))
      .map((title) => ({ user_id: user.id, category, title }));
    if (rows.length === 0) { toast.info("This playbook is already loaded."); return; }
    const { error } = await supabase.from("checklist_items").insert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success(`Loaded ${rows.length} tasks.`);
    void qc.invalidateQueries({ queryKey: ["checklist"] });
  }

  async function addItem(form: FormData) {
    if (!user) return;
    const { error } = await supabase.from("checklist_items").insert({
      user_id: user.id,
      category: String(form.get("category") ?? category),
      title: String(form.get("title") ?? "").trim(),
      detail: String(form.get("detail") ?? "").trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["checklist"] });
  }

  async function toggle(id: string, value: boolean) {
    await supabase.from("checklist_items").update({ done: value }).eq("id", id);
    void qc.invalidateQueries({ queryKey: ["checklist"] });
  }

  async function remove(id: string) {
    await supabase.from("checklist_items").delete().eq("id", id);
    void qc.invalidateQueries({ queryKey: ["checklist"] });
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Blue Team Operations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Incident response checklists, hardening guides and posture tracking.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Add task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a task</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void addItem(new FormData(e.currentTarget));
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="c-cat">Category</Label>
                <Select name="category" defaultValue={category}>
                  <SelectTrigger id="c-cat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-title">Task</Label>
                <Input id="c-title" name="title" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-detail">Notes</Label>
                <Textarea id="c-detail" name="detail" rows={3} />
              </div>
              <DialogFooter>
                <Button type="submit">Add task</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <AgentChat
        className="mt-8"
        agentType="blue_team"
        title="Blue Team Agent"
        subtitle="Autonomous defence — header checks, hardening changes and rule deployment via your execution node."
        suggestions={BLUE_SUGGESTIONS}
        placeholder="Describe the system to harden or the response task to execute…"
      />

      <div className="panel mt-10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Overall posture</p>
            <p className="font-display text-3xl font-semibold text-primary">{overall}%</p>
          </div>
          <ShieldCheck className="h-8 w-8 text-primary" />
        </div>
        <Progress value={overall} className="mt-4" />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
              c === category
                ? "border-primary/60 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="panel mt-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{category}</h2>
            <p className="text-xs text-muted-foreground">
              {done} of {inCategory.length} complete · {pct}%
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadPack()}>
            Load standard playbook
          </Button>
        </div>
        <Progress value={pct} className="mt-4" />

        {inCategory.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            No tasks in this category yet — load the standard playbook to start.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-border">
            {inCategory.map((item) => (
              <li key={item.id} className="flex items-start gap-3 py-3">
                <Checkbox
                  id={item.id}
                  checked={item.done}
                  onCheckedChange={(v) => void toggle(item.id, v === true)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={item.id}
                    className={`block text-sm ${item.done ? "text-muted-foreground line-through" : ""}`}
                  >
                    {item.title}
                  </label>
                  {item.detail ? <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p> : null}
                </div>
                <Button variant="ghost" size="icon" aria-label="Remove task" onClick={() => void remove(item.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
