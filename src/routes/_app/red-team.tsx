import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Crosshair, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeverityBadge, SEVERITIES } from "@/components/SeverityBadge";
import { buildReportHtml } from "@/lib/report";

export const Route = createFileRoute("/_app/red-team")({
  head: () => ({
    meta: [
      { title: "Red Team Workspace — SentinelSec AI" },
      {
        name: "description",
        content: "Track authorised penetration test engagements, scope and findings through to remediation.",
      },
      { property: "og:title", content: "Red Team Workspace — SentinelSec AI" },
      { property: "og:description", content: "Engagements, scope and findings for authorised assessments." },
    ],
  }),
  component: RedTeam,
});

const STATUSES = ["open", "in_progress", "remediated", "accepted_risk"];

function RedTeam() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [engOpen, setEngOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);

  const { data: engagements = [] } = useQuery({
    queryKey: ["engagements"],
    queryFn: async () => {
      const { data, error } = await supabase.from("engagements").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const activeId = selected ?? engagements[0]?.id ?? null;
  const active = engagements.find((e) => e.id === activeId) ?? null;

  const { data: findings = [] } = useQuery({
    queryKey: ["findings", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("findings")
        .select("*")
        .eq("engagement_id", activeId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const counts = useMemo(() => {
    const base: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) base[f.severity] = (base[f.severity] ?? 0) + 1;
    return base;
  }, [findings]);

  async function createEngagement(form: FormData) {
    if (!user) return;
    const { error } = await supabase.from("engagements").insert({
      user_id: user.id,
      name: String(form.get("name") ?? "").trim(),
      client: String(form.get("client") ?? "").trim() || null,
      scope: String(form.get("scope") ?? "").trim() || null,
    });
    if (error) return toast.error(error.message);
    setEngOpen(false);
    toast.success("Engagement created.");
    void qc.invalidateQueries({ queryKey: ["engagements"] });
  }

  async function createFinding(form: FormData) {
    if (!user || !activeId) return;
    const { error } = await supabase.from("findings").insert({
      user_id: user.id,
      engagement_id: activeId,
      title: String(form.get("title") ?? "").trim(),
      severity: String(form.get("severity") ?? "medium"),
      description: String(form.get("description") ?? "").trim() || null,
      remediation: String(form.get("remediation") ?? "").trim() || null,
    });
    if (error) return toast.error(error.message);
    setFindOpen(false);
    toast.success("Finding logged.");
    void qc.invalidateQueries({ queryKey: ["findings", activeId] });
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from("findings").update({ status }).eq("id", id);
    void qc.invalidateQueries({ queryKey: ["findings", activeId] });
  }

  async function deleteFinding(id: string) {
    await supabase.from("findings").delete().eq("id", id);
    void qc.invalidateQueries({ queryKey: ["findings", activeId] });
  }

  function exportReport() {
    if (!active) return;
    const html = buildReportHtml(active, findings);
    const win = window.open("", "_blank");
    if (!win) return toast.error("Allow pop-ups to export the report.");
    win.document.write(html);
    win.document.close();
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Red Team Workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Authorised assessment tracking — engagements, scope and findings.
          </p>
        </div>
        <Dialog open={engOpen} onOpenChange={setEngOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> New engagement
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New engagement</DialogTitle>
            </DialogHeader>
            <form
              id="eng-form"
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void createEngagement(new FormData(e.currentTarget));
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="eng-name">Engagement name</Label>
                <Input id="eng-name" name="name" required placeholder="Q3 external perimeter assessment" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eng-client">Client / business unit</Label>
                <Input id="eng-client" name="client" placeholder="Acme Corp" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eng-scope">Authorised scope</Label>
                <Textarea
                  id="eng-scope"
                  name="scope"
                  rows={4}
                  placeholder="In-scope hosts, domains, exclusions, testing window and authorisation reference."
                />
              </div>
              <DialogFooter>
                <Button type="submit">Create engagement</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="panel h-fit p-3">
          <p className="px-2 py-1 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Engagements</p>
          {engagements.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">No engagements yet.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {engagements.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => setSelected(e.id)}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      e.id === activeId ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                  >
                    <span className="block truncate font-medium">{e.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{e.client ?? "No client set"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section>
          {!active ? (
            <div className="panel p-12 text-center">
              <Crosshair className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                Create an engagement to start recording scope and findings.
              </p>
            </div>
          ) : (
            <>
              <div className="panel p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{active.name}</h2>
                    <p className="text-sm text-muted-foreground">{active.client ?? "No client set"}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={exportReport}>
                      <FileText className="h-4 w-4" /> Export report
                    </Button>
                    <Dialog open={findOpen} onOpenChange={setFindOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm">
                          <Plus className="h-4 w-4" /> Finding
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Log a finding</DialogTitle>
                        </DialogHeader>
                        <form
                          className="space-y-4"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void createFinding(new FormData(e.currentTarget));
                          }}
                        >
                          <div className="space-y-1.5">
                            <Label htmlFor="f-title">Title</Label>
                            <Input id="f-title" name="title" required placeholder="Unauthenticated IDOR on /api/orders" />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="f-sev">Severity</Label>
                            <Select name="severity" defaultValue="medium">
                              <SelectTrigger id="f-sev">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SEVERITIES.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="f-desc">Description & evidence</Label>
                            <Textarea id="f-desc" name="description" rows={4} />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="f-rem">Remediation</Label>
                            <Textarea id="f-rem" name="remediation" rows={3} />
                          </div>
                          <DialogFooter>
                            <Button type="submit">Save finding</Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                {active.scope ? (
                  <div className="mt-5 rounded-md border border-border bg-background/40 p-4">
                    <p className="font-mono text-[11px] tracking-wider text-primary uppercase">Authorised scope</p>
                    <p className="mt-1.5 text-sm whitespace-pre-wrap text-muted-foreground">{active.scope}</p>
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-2">
                  {SEVERITIES.map((s) => (
                    <div key={s} className="rounded-md border border-border px-3 py-2">
                      <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">{s}</p>
                      <p className="font-display text-lg font-semibold">{counts[s] ?? 0}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {findings.length === 0 ? (
                  <div className="panel p-10 text-center text-sm text-muted-foreground">
                    No findings recorded for this engagement yet.
                  </div>
                ) : (
                  findings.map((f) => (
                    <div key={f.id} className="panel p-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <SeverityBadge severity={f.severity} />
                        <h3 className="text-sm font-medium">{f.title}</h3>
                        <div className="ml-auto flex items-center gap-2">
                          <Select value={f.status} onValueChange={(v) => void updateStatus(f.id, v)}>
                            <SelectTrigger className="h-8 w-40 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s.replace("_", " ")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete finding"
                            onClick={() => void deleteFinding(f.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {f.description ? (
                        <p className="mt-3 text-sm whitespace-pre-wrap text-muted-foreground">{f.description}</p>
                      ) : null}
                      {f.remediation ? (
                        <div className="mt-3">
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            Remediation
                          </Badge>
                          <p className="mt-1.5 text-sm whitespace-pre-wrap">{f.remediation}</p>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
