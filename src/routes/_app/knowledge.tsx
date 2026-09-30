import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, BookOpen } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SeverityBadge } from "@/components/SeverityBadge";

export const Route = createFileRoute("/_app/knowledge")({
  head: () => ({
    meta: [
      { title: "Vulnerability Knowledge Base — SentinelSec AI" },
      {
        name: "description",
        content: "Searchable reference of vulnerability classes and landmark CVEs with remediation guidance.",
      },
      { property: "og:title", content: "Vulnerability Knowledge Base — SentinelSec AI" },
      { property: "og:description", content: "Vulnerability classes and CVEs with patch and mitigation guidance." },
    ],
  }),
  component: KnowledgeBase,
});

function KnowledgeBase() {
  const [query, setQuery] = useState("");

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["kb"],
    queryFn: async () => {
      const { data, error } = await supabase.from("kb_entries").select("*").order("severity");
      if (error) throw error;
      return data;
    },
  });

  const term = query.trim().toLowerCase();
  const filtered = term
    ? entries.filter((e) =>
        [e.title, e.cve_id ?? "", e.summary, e.category, ...(e.tags ?? [])].join(" ").toLowerCase().includes(term),
      )
    : entries;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Vulnerability Knowledge Base</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Reference entries for vulnerability classes and landmark CVEs, with remediation guidance.
      </p>

      <div className="relative mt-6 max-w-lg">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, CVE, tag or keyword…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="mt-8 font-mono text-xs text-muted-foreground">LOADING…</p>
      ) : filtered.length === 0 ? (
        <div className="panel mt-8 p-10 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No entries match that search.</p>
        </div>
      ) : (
        <Accordion type="single" collapsible className="panel mt-6 divide-y divide-border px-6">
          {filtered.map((entry) => (
            <AccordionItem key={entry.id} value={entry.id} className="border-0">
              <AccordionTrigger className="py-5 hover:no-underline">
                <div className="flex flex-1 flex-wrap items-center gap-3 pr-4 text-left">
                  <SeverityBadge severity={entry.severity} />
                  <span className="text-sm font-medium">{entry.title}</span>
                  {entry.cve_id ? (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {entry.cve_id}
                    </Badge>
                  ) : null}
                  <span className="ml-auto hidden font-mono text-[10px] text-muted-foreground sm:inline">
                    {entry.category}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-6">
                <p className="text-sm leading-relaxed text-muted-foreground">{entry.summary}</p>
                <p className="mt-4 font-mono text-[11px] tracking-wider text-primary uppercase">Remediation</p>
                <p className="mt-1.5 text-sm leading-relaxed">{entry.remediation}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(entry.tags ?? []).map((tag) => (
                    <Badge key={tag} variant="secondary" className="font-mono text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
