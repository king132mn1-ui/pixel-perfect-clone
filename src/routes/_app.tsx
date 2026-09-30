import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  Shield,
  Bot,
  Crosshair,
  ShieldCheck,
  BookOpen,
  CreditCard,
  LifeBuoy,
  Cog,
  LogOut,
  Infinity as InfinityIcon,
  Zap,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { SupportWidget } from "@/components/SupportWidget";
import { planLabel } from "@/lib/plans";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const NAV = [
  { to: "/assistant", label: "Assistant", icon: Bot },
  { to: "/red-team", label: "Red Team", icon: Crosshair },
  { to: "/blue-team", label: "Blue Team", icon: ShieldCheck },
  { to: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { to: "/billing", label: "Billing", icon: CreditCard },
  { to: "/support", label: "Support", icon: LifeBuoy },
] as const;

function AppLayout() {
  const { user, loading, isAdmin, subscription, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="live-dot font-mono text-xs tracking-widest text-primary">AUTHENTICATING…</span>
      </div>
    );
  }

  const unlimited = isAdmin || subscription?.unlimited;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-display text-sm font-semibold tracking-wide">SentinelSec AI</span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-3 rounded-md border border-border bg-surface px-3 py-1.5 sm:flex">
              <div className="flex items-center gap-1.5">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-success" />
                <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                  {isAdmin ? "Super Admin" : planLabel(subscription?.plan ?? "free")}
                </span>
              </div>
              <span className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                {unlimited ? (
                  <>
                    <InfinityIcon className="h-3.5 w-3.5 text-primary" />
                    <span className="font-mono text-[11px] text-primary">UNLIMITED</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5 text-primary" />
                    <span className="font-mono text-[11px]">
                      {subscription?.credits_remaining ?? 0}
                      <span className="text-muted-foreground"> credits</span>
                    </span>
                  </>
                )}
              </div>
              {!unlimited ? (
                <>
                  <span className="h-4 w-px bg-border" />
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {subscription?.credits_used ?? 0} used
                  </span>
                </>
              ) : null}
            </div>

            {isAdmin ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/admin">
                  <Cog className="h-4 w-4" /> Admin
                </Link>
              </Button>
            ) : null}
            <ThemeSwitcher />
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mx-auto max-w-7xl overflow-x-auto px-6">
          <nav className="flex gap-1 pb-2">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {subscription?.plan === "free" && !isAdmin ? (
        <div className="border-b border-primary/25 bg-primary/10">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-2 text-xs">
            <span className="text-muted-foreground">
              You are on the free trial with {subscription.credits_remaining} credits remaining.
            </span>
            <Badge asChild variant="outline" className="border-primary/40 text-primary">
              <Link to="/billing">Upgrade</Link>
            </Badge>
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>

      <SupportWidget />
    </div>
  );
}
