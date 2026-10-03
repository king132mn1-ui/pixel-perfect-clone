import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Shield,
  Bot,
  Crosshair,
  ShieldCheck,
  FileText,
  BookOpen,
  Check,
  ArrowRight,
  Terminal,
  LifeBuoy,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { PLANS } from "@/lib/plans";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SentinelSec AI — AI Security Operations Platform" },
      {
        name: "description",
        content:
          "SentinelSec AI combines an AI security analyst, authorised red team tracking, blue team hardening and audit reporting in one operations workspace.",
      },
      { property: "og:title", content: "SentinelSec AI — AI Security Operations Platform" },
      {
        property: "og:description",
        content:
          "An AI security analyst, engagement tracking, hardening checklists and one-click audit reports for authorised security work.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Bot,
    title: "AI Security Assistant",
    body: "Ask about OWASP Top 10 classes, published CVEs, suspicious config or log evidence and get a technical answer with severity and remediation.",
  },
  {
    icon: Crosshair,
    title: "Red Team Workspace",
    body: "Track authorised engagements, scope, and findings with CVSS-style severity and status through to retest.",
  },
  {
    icon: ShieldCheck,
    title: "Blue Team Hardening",
    body: "Incident-response checklists and system hardening tasks with live posture scoring across your environment.",
  },
  {
    icon: FileText,
    title: "Report Generator",
    body: "Turn any engagement into a formatted security audit report — executive summary, severity breakdown, remediation steps.",
  },
  {
    icon: BookOpen,
    title: "Vulnerability Knowledge Base",
    body: "A searchable reference of vulnerability classes and landmark CVEs with patch and mitigation guidance.",
  },
  {
    icon: LifeBuoy,
    title: "Direct Support",
    body: "Message the operations team from anywhere in the app and get replies in your inbox.",
  },
];

function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-display text-base font-semibold tracking-wide">SentinelSec AI</span>
          </div>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#platform" className="transition-colors hover:text-foreground">
              Platform
            </a>
            <a href="#pricing" className="transition-colors hover:text-foreground">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            {user ? (
              <Button asChild size="sm">
                <Link to="/assistant">Open workspace</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/auth">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="relative mx-auto max-w-4xl px-6 py-28 text-center">
          <Badge variant="outline" className="border-primary/40 text-primary">
            <span className="live-dot mr-2 inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            Authorised security operations only
          </Badge>
          <h1 className="mt-6 text-4xl leading-tight font-bold sm:text-6xl">
            Your security team,
            <br />
            <span className="text-gradient">augmented by AI</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            SentinelSec AI brings offensive assessment tracking, defensive hardening, audit reporting and an expert AI
            analyst into a single operations workspace.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to={user ? "/assistant" : "/auth"}>
                {user ? "Open workspace" : "Start free"} <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#pricing">View pricing</a>
            </Button>
          </div>
          <p className="mt-6 font-mono text-xs text-muted-foreground">
            10 free AI credits on signup · No card required
          </p>
        </div>
      </section>

      <section id="platform" className="mx-auto max-w-7xl px-6 py-24">
        <div className="max-w-2xl">
          <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">Platform</p>
          <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Everything an assessment needs</h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="panel p-6 transition-colors hover:border-primary/50">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="border-t border-border/60 bg-surface/30">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="text-center">
            <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">Pricing</p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Plans that scale with your workload</h2>
            <p className="mt-4 text-sm text-muted-foreground">Paid in USDT (TRC20). Credits reset every month.</p>
          </div>
          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`panel relative p-8 ${plan.highlight ? "glow border-primary/60" : ""}`}
              >
                {plan.highlight ? (
                  <Badge className="absolute -top-3 left-8">Most popular</Badge>
                ) : null}
                <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                <p className="mt-6">
                  <span className="font-display text-4xl font-bold">${plan.price}</span>
                  <span className="text-sm text-muted-foreground"> / month</span>
                </p>
                <ul className="mt-6 space-y-3 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-8 w-full" variant={plan.highlight ? "default" : "outline"}>
                  <Link to={user ? "/billing" : "/auth"}>Choose {plan.name}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            <span className="font-mono text-xs">SentinelSec AI — for authorised security testing only</span>
          </div>
          <Link to="/support" className="transition-colors hover:text-foreground">
            Contact support
          </Link>
        </div>
      </footer>
    </div>
  );
}
