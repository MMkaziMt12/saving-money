
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/supabase';

export async function createClient() {
  const cookieStore = cookies(); // Await is not needed here as cookies() itself is not async directly in Next 13+ App Router context for server components.

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || supabaseUrl.trim() === '' || supabaseUrl === 'YOUR_SUPABASE_URL') {
    const errorMessage = 'SERVER: NEXT_PUBLIC_SUPABASE_URL is missing, empty, or still a placeholder. Please check your .env file and ensure it is correctly set and prefixed with NEXT_PUBLIC_.';
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  if (!supabaseAnonKey || supabaseAnonKey.trim() === '' || supabaseAnonKey === 'YOUR_SUPABASE_ANON_KEY') {
    const errorMessage = 'SERVER: NEXT_PUBLIC_SUPABASE_ANON_KEY is missing, empty, or still a placeholder. Please check your .env file and ensure it is correctly set and prefixed with NEXT_PUBLIC_.';
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  
  try {
    new URL(supabaseUrl);
  } catch (e) {
    const errorMessage = `SERVER: The provided NEXT_PUBLIC_SUPABASE_URL "${supabaseUrl}" is not a valid URL. Please check your .env file.`;
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
