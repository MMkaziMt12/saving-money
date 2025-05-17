
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/supabase';

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    const errorMessage = 'SERVER: NEXT_PUBLIC_SUPABASE_URL is missing.';
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  if (!supabaseAnonKey) {
    const errorMessage = 'SERVER: NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.';
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  
  try {
    new URL(supabaseUrl);
  } catch (e) {
    const errorMessage = `SERVER: The provided NEXT_PUBLIC_SUPABASE_URL "${supabaseUrl}" is not a valid URL.`;
    console.error(errorMessage, e);
    throw new Error(errorMessage);
  }
  

  return createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}
