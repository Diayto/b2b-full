// Chrona — in-memory session mirror (Supabase Auth). No business data in localStorage.
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { Company, User, UserRole } from './types';

export interface Session {
  userId: string;
  companyId: string;
  role: UserRole;
  email?: string;
  name?: string;
  companyName?: string;
}

let authMemory: Session | null = null;

export function syncAuthFromSupabaseUser(user: SupabaseUser | null): void {
  if (!user) {
    authMemory = null;
    return;
  }
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const nameMeta = meta?.name;
  const companyMeta = meta?.company_name;
  authMemory = {
    userId: user.id,
    companyId: user.id,
    role: 'owner',
    email: user.email ?? undefined,
    name: typeof nameMeta === 'string' ? nameMeta : undefined,
    companyName: typeof companyMeta === 'string' ? companyMeta : undefined,
  };
}

export function getSession(): Session | null {
  return authMemory;
}

export function clearSession(): void {
  authMemory = null;
}

export function getCurrentUser(): User | null {
  const session = getSession();
  if (!session) return null;
  return {
    id: session.userId,
    email: session.email ?? '',
    name: session.name ?? '',
    companyId: session.companyId,
    role: session.role,
    createdAt: new Date().toISOString(),
  };
}

export function getCompany(companyId: string): Company | null {
  const session = getSession();
  if (!session || session.companyId !== companyId) return null;
  return {
    id: companyId,
    name: session.companyName ?? 'Компания',
    currency: 'KZT',
    createdAt: new Date().toISOString(),
  };
}

/** Clears legacy BizPulse localStorage keys from older builds (no longer used for app data). */
export function clearLegacyBrowserStorage(): void {
  const prefix = 'bp_';
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && (key.startsWith(prefix) || key === 'chrona_owner_demo')) {
      toRemove.push(key);
    }
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}
