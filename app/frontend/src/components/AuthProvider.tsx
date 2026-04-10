import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';
import { ensureProfileForAuthUser } from '@/lib/supabaseAuth';
import { syncAuthFromSupabaseUser } from '@/lib/store';

type AuthContextValue = {
  user: SupabaseUser | null;
  loading: boolean;
  supabaseReady: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    if (!supabaseReady) {
      syncAuthFromSupabaseUser(null);
      setUser(null);
      setLoading(false);
      return;
    }

    const supabase = getSupabaseClient();

    const applySession = (nextUser: SupabaseUser | null) => {
      syncAuthFromSupabaseUser(nextUser);
      setUser(nextUser);
    };

    const scheduleEnsureProfile = (nextUser: SupabaseUser | null) => {
      if (!nextUser) return;
      setTimeout(() => {
        void ensureProfileForAuthUser(nextUser).catch((e) => {
          console.warn('[Chrona] ensureProfileForAuthUser', e);
        });
      }, 0);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      applySession(u);
      scheduleEnsureProfile(u);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      applySession(u);
      scheduleEnsureProfile(u);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabaseReady]);

  const value = useMemo(
    () => ({ user, loading, supabaseReady }),
    [user, loading, supabaseReady],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
