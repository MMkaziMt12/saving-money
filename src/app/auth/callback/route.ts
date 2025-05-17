
import { createClient } from '@/lib/supabase/server'; // Server client
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers'; // Import cookies

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  // Log incoming search parameters for debugging
  console.log('OAuth Callback - Incoming URL:', request.url);
  console.log('OAuth Callback - Code:', code);
  
  const errorParam = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  console.log('OAuth Callback - Error Param:', errorParam);
  console.log('OAuth Callback - Error Description:', errorDescription);
  // console.log('OAuth Callback - State Param:', requestUrl.searchParams.get('state')); // PKCE state is usually handled internally by Supabase

  if (errorParam) {
    console.error(`OAuth Error from provider: ${errorParam}, Description: ${errorDescription}`);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorParam)}&error_description=${encodeURIComponent(errorDescription || 'Unknown error from provider')}`);
  }

  if (code) {
    const cookieStore = await cookies(); // Get cookie store
    const allCookies = cookieStore.getAll(); // Get all cookies
    console.log('OAuth Callback - All Cookies Received by Server:', JSON.stringify(allCookies, null, 2));

    // Attempt to find and log the Supabase PKCE verifier cookie
    // Typical name pattern: sb-<project_id>-auth-token-code-verifier or sb-local-auth-token-code-verifier (for local dev)
    // Or sometimes just sb-pkce-verifier
    const pkceCookie = allCookies.find(cookie => cookie.name.includes('auth-token-code-verifier') || cookie.name.includes('pkce-verifier'));
    
    if (pkceCookie) {
        console.log(`OAuth Callback - Found Potential PKCE Verifier Cookie (Name: ${pkceCookie.name}, Value Exists: ${!!pkceCookie.value}, HTTPOnly: ${pkceCookie.httpOnly}, Secure: ${pkceCookie.secure}, SameSite: ${pkceCookie.sameSite}, Path: ${pkceCookie.path})`);
    } else {
        console.log('OAuth Callback - PKCE Verifier Cookie NOT FOUND among server-received cookies.');
    }

    const supabase = createClient(); // This is the server client
    console.log('Attempting to exchange code for session with Supabase...');
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('Error exchanging code for session with Supabase:', exchangeError.message, exchangeError);
      console.error('Data from exchangeCodeForSession (on error):', data); // Log data even on error
      return NextResponse.redirect(`${origin}/login?error=OAuth_exchange_failed&message=${encodeURIComponent(exchangeError.message)}`);
    }
    
    console.log('Successfully exchanged code for session. Session data acquired.');
    // Avoid logging the full session/user object here in production for security, but for debugging:
    // console.log('Session object:', data.session);
    // console.log('User object:', data.user);

  } else {
    console.error('No authorization code found in OAuth callback parameters and no explicit error from provider.');
    return NextResponse.redirect(`${origin}/login?error=OAuth_callback_failed_no_code`);
  }

  // URL to redirect to after sign in process completes successfully
  console.log('OAuth successful, redirecting to /');
  return NextResponse.redirect(`${origin}/`);
}
