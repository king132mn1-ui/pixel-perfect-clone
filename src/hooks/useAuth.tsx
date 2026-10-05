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
  banned: boolean;
  subscription: Subscription | null;
  refresh: () => Promise<void>;
  spendCredit: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  banned: false,
  subscription: null,
  refresh: async () => {},
  spendCredit: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [banned, setBanned] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const loadProfileData = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setIsAdmin(false);
      setBanned(false);
      setSubscription(null);
      return;
    }
    const [{ data: roles }, { data: sub }, { data: ban }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("banned_users").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);
    setBanned(!!ban);
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

  const spendCredit = useCallback(() => {
    setSubscription((s) =>
      s && !s.unlimited
        ? { ...s, credits_remaining: Math.max(0, s.credits_remaining - 1), credits_used: s.credits_used + 1 }
        : s,
    );
  }, []);

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
      banned,
      subscription,
      refresh,
      spendCredit,
      signOut,
    }),
    [session, loading, isAdmin, banned, subscription, refresh, spendCredit, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
