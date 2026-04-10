import type { User as SupabaseUser } from '@supabase/supabase-js';
import { clearSession } from './store';
import { getSupabaseClient } from './supabaseClient';

export type SignUpWithProfileResult = {
  /** True when Supabase did not return a session (e.g. email confirmation required). Profile row is created on first successful sign-in. */
  emailConfirmationRequired: boolean;
};

/**
 * Ensures `public.profiles` has a row for this auth user. Requires an authenticated Supabase client (JWT present).
 * Uses `user.id` as PK and `company_name` from `user.user_metadata.company_name` (set at signUp).
 */
export async function ensureProfileForAuthUser(user: SupabaseUser): Promise<void> {
  const supabase = getSupabaseClient();
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const rawName = meta?.company_name;
  const companyName = typeof rawName === 'string' ? rawName.trim() : '';
  const { error } = await supabase.from('profiles').upsert(
    { id: user.id, company_name: companyName || null },
    { onConflict: 'id' },
  );
  if (error) {
    throw new Error(error.message || 'Не удалось сохранить профиль компании');
  }
}

/** Removes all legacy BizPulse localStorage keys (bp_*) so demo data never leaks to a new account. */
export function clearAllBpLocalStorageKeys(): void {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith('bp_')) {
      toRemove.push(key);
    }
  }
  toRemove.forEach((key) => localStorage.removeItem(key));
}

function mapAuthError(message: string | undefined): string {
  if (!message) return 'Ошибка авторизации';
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid_credentials')) {
    return 'Неверный email или пароль';
  }
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'Пользователь с таким email уже существует';
  }
  return message;
}

export async function signInWithEmailPassword(email: string, password: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    throw new Error(mapAuthError(error.message));
  }
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new Error('Сессия не получена после входа');
  }
  try {
    await ensureProfileForAuthUser(user);
  } catch (e) {
    await supabase.auth.signOut();
    throw new Error(e instanceof Error ? e.message : 'Не удалось подготовить профиль');
  }
  clearAllBpLocalStorageKeys();
}

export async function signUpWithProfile(params: {
  email: string;
  password: string;
  name: string;
  companyName: string;
}): Promise<SignUpWithProfileResult> {
  const supabase = getSupabaseClient();
  const { email, password, name, companyName } = params;
  const trimmedCompany = companyName.trim();

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        name,
        company_name: trimmedCompany,
      },
    },
  });

  if (error) {
    throw new Error(mapAuthError(error.message));
  }

  const user = data.user;
  if (!user) {
    throw new Error('Регистрация не завершена: пользователь не создан');
  }

  // Without a session (common when email confirmation is enabled), JWT is absent → RLS sees auth.uid() = null → INSERT fails.
  if (data.session?.user) {
    try {
      await ensureProfileForAuthUser(data.session.user);
    } catch (e) {
      await supabase.auth.signOut();
      throw new Error(e instanceof Error ? e.message : 'Не удалось создать профиль компании');
    }
  }

  clearAllBpLocalStorageKeys();
  return { emailConfirmationRequired: !data.session };
}

export async function signOutSupabase(): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
  clearSession();
}

export async function getSupabaseSessionUser(): Promise<SupabaseUser | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn('getSession error', error);
    return null;
  }
  return data.session?.user ?? null;
}
