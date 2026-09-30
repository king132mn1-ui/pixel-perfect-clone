import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type Subscription = {
  user_id: string;
  plan: string;
  credits_remaining: number;
  credits_used: number;
  unlimited: boolean;
  period_end: string | null;
};

type AuthValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  subscription: Subscription | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  subscription: null,
  refresh: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const loadProfileData = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setIsAdmin(false);
      setSubscription(null);
      return;
    }
    const [{ data: roles }, { data: sub }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    setIsAdmin(!!roles?.some((r) => r.role === "admin"));
    setSubscription((sub as Subscription | null) ?? null);
  }, []);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      setTimeout(() => {
        void loadProfileData(nextSession?.user?.id);
      }, 0);
    });

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      void loadProfileData(data.session?.user?.id);
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfileData]);

  const refresh = useCallback(async () => {
    await loadProfileData(session?.user?.id);
  }, [loadProfileData, session?.user?.id]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setIsAdmin(false);
    setSubscription(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      isAdmin,
      subscription,
      refresh,
      signOut,
    }),
    [session, loading, isAdmin, subscription, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
