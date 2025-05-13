
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/supabase';

export function createClient(request: NextRequest) {
  // Create an unmodified response
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

   if (!supabaseUrl) {
    const errorMessage = 'MIDDLEWARE: NEXT_PUBLIC_SUPABASE_URL is missing.';
    console.error(errorMessage);
    // Potentially redirect to an error page or return an error response
    // For now, we'll let it proceed and potentially fail in createServerClient
    // or be handled by its internal error mechanisms.
    // throw new Error(errorMessage); // Throwing here stops middleware execution
  }

  if (!supabaseAnonKey) {
    const errorMessage = 'MIDDLEWARE: NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.';
    console.error(errorMessage);
    // throw new Error(errorMessage);
  }
  
  // It's harder to throw and stop execution gracefully in middleware for config errors.
  // Best to ensure these are set. Logging is a good first step.

  const supabase = createServerClient<Database>(
    supabaseUrl!, // Assume they are set or let createServerClient handle if not
    supabaseAnonKey!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // If the cookie is updated, update the cookies for the request and response
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          // If the cookie is removed, update the cookies for the request and response
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  return { supabase, response };
}
