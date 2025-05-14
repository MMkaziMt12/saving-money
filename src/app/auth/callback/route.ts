
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  // Log incoming search parameters for debugging
  console.log('OAuth Callback - Incoming URL:', request.url);
  console.log('OAuth Callback - Code:', code);
  
  const errorParam = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');
  const stateParam = requestUrl.searchParams.get('state'); // PKCE state

  console.log('OAuth Callback - Error Param:', errorParam);
  console.log('OAuth Callback - Error Description:', errorDescription);
  console.log('OAuth Callback - State Param:', stateParam);

  if (errorParam) {
    console.error(`OAuth Error from provider: ${errorParam}, Description: ${errorDescription}`);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorParam)}&error_description=${encodeURIComponent(errorDescription || 'Unknown error from provider')}`);
  }

  if (code) {
    const supabase = createClient();
    console.log('Attempting to exchange code for session...');
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('Error exchanging code for session:', exchangeError.message, exchangeError);
      // The error "invalid flow state, no valid flow state found" often originates here.
      // This means the PKCE verification failed, likely due to missing/mismatched pkce_verifier cookie.
      return NextResponse.redirect(`${origin}/login?error=OAuth callback failed: ${encodeURIComponent(exchangeError.message)}`);
    }
    console.log('Successfully exchanged code for session.');
  } else {
    console.error('No authorization code found in OAuth callback parameters and no explicit error from provider.');
    return NextResponse.redirect(`${origin}/login?error=OAuth callback failed: No authorization code found.`);
  }

  // URL to redirect to after sign in process completes successfully
  console.log('OAuth successful, redirecting to /');
  return NextResponse.redirect(`${origin}/`);
}
