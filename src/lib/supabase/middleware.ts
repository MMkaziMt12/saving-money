
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/supabase'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || supabaseUrl.trim() === '' || supabaseUrl === 'YOUR_SUPABASE_URL') {
    console.error('MIDDLEWARE_ERROR: NEXT_PUBLIC_SUPABASE_URL is missing, empty, or still a placeholder. Check your .env file or deployment environment variables.');
    // Allow request to proceed, Supabase client creation will likely throw its own error,
    // but logging here helps identify the source problem earlier.
  }
  if (!supabaseAnonKey || supabaseAnonKey.trim() === '' || supabaseAnonKey === 'YOUR_SUPABASE_ANON_KEY') {
    console.error('MIDDLEWARE_ERROR: NEXT_PUBLIC_SUPABASE_ANON_KEY is missing, empty, or still a placeholder. Check your .env file or deployment environment variables.');
  }

  const supabase = createServerClient<Database>(
    supabaseUrl!, // Using non-null assertion as Supabase client will error out if these are truly missing
    supabaseAnonKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value, options))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). It's easy to introduce bugs with session handling here.

  const {
    data: { user },
    error: getUserError, // Capture error from getUser
  } = await supabase.auth.getUser();

  if (getUserError) {
    console.error("MIDDLEWARE_ERROR: Error getting user from Supabase:", getUserError.message);
    // Depending on the error, you might want to redirect to login or an error page.
    // For now, we'll let it proceed and rely on client-side handling or subsequent checks.
  }

  const publicPaths = ['/login', '/signup', '/auth/callback', '/awaiting-approval'];
  const isPublicPath = publicPaths.some(path => request.nextUrl.pathname.startsWith(path));

  if (!user && !isPublicPath) {
    // No user, and it's not a public path, redirect to login
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    console.log(`Middleware: No user found on protected path ${request.nextUrl.pathname}. Redirecting to /login.`);
    return NextResponse.redirect(url);
  }

  // If user is logged in but trying to access login/signup, redirect them to dashboard
  // This prevents logged-in users from seeing auth pages unnecessarily.
  if (user && (request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/signup'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/'; // Redirect to dashboard or home
    console.log(`Middleware: Authenticated user tried to access ${request.nextUrl.pathname}. Redirecting to /.`);
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
