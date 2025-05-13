import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    const errorMessage = 'NEXT_PUBLIC_SUPABASE_URL is missing. Please check your .env file and ensure it is correctly set and prefixed with NEXT_PUBLIC_.';
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  if (!supabaseAnonKey) {
    const errorMessage = 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Please check your .env file and ensure it is correctly set and prefixed with NEXT_PUBLIC_.';
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  
  // Validate the Supabase URL format
  try {
    new URL(supabaseUrl);
  } catch (e) {
    const errorMessage = `The provided NEXT_PUBLIC_SUPABASE_URL "${supabaseUrl}" is not a valid URL. Please check your .env file.`;
    console.error(errorMessage, e);
    throw new Error(errorMessage);
  }

  // Create a supabase client on the browser with project's credentials
  return createBrowserClient<Database>(
    supabaseUrl, // Now guaranteed to be a string
    supabaseAnonKey // Now guaranteed to be a string
  );
}
