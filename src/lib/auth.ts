import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        'Supabase URL and anon key are required. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
      );
    }

    // @supabase/ssr v0.10+ requires cookie handlers for createBrowserClient
    // Without these, PKCE code verifier and session tokens aren't managed correctly
    _supabase = createBrowserClient(url, key, {
      cookies: {
        getAll() {
          if (typeof document === 'undefined') return [];
          const pairs = document.cookie.split('; ');
          const result: { name: string; value: string }[] = [];
          pairs.forEach((pair) => {
            const eqIdx = pair.indexOf('=');
            if (eqIdx > 0) {
              result.push({
                name: decodeURIComponent(pair.slice(0, eqIdx)),
                value: decodeURIComponent(pair.slice(eqIdx + 1)),
              });
            }
          });
          return result;
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
            if (options?.maxAge) cookieStr += `; max-age=${options.maxAge}`;
            if (options?.domain) cookieStr += `; domain=${options.domain}`;
            if (options?.path) cookieStr += `; path=${options.path}`;
            if (options?.sameSite) {
              const ss = typeof options.sameSite === 'boolean' ? 'lax' : options.sameSite.toLowerCase();
              cookieStr += `; samesite=${ss}`;
            }
            if (options?.secure) cookieStr += '; secure';
            document.cookie = cookieStr;
          });
        },
      },
    });
  }
  return _supabase;
}

// Proxy for backward compatibility
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabase();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

/**
 * Sign in with Google OAuth.
 */
export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  return { data, error };
};

export const signOut = async () => {
  return supabase.auth.signOut();
};

/**
 * Get the real Supabase Auth user ID (UUID).
 * Returns null if not authenticated.
 */
export async function getSupabaseUserId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
