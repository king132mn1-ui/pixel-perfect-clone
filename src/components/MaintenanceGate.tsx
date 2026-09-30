import { useEffect, useState, type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function MaintenanceGate({ children, pathname }: { children: ReactNode; pathname: string }) {
  const { isAdmin } = useAuth();
  const [state, setState] = useState<{ on: boolean; message: string } | null>(null);

  useEffect(() => {
    let active = true;
    void supabase
      .from("app_settings")
      .select("maintenance_mode, maintenance_message")
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setState({ on: data.maintenance_mode, message: data.maintenance_message });
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  const exempt = pathname.startsWith("/admin") || pathname.startsWith("/auth");

  if (state?.on && !isAdmin && !exempt) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="panel glow max-w-lg p-10 text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-6 text-2xl font-semibold">Maintenance in progress</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{state.message}</p>
          <p className="mt-6 font-mono text-xs tracking-widest text-primary">SENTINELSEC AI</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
