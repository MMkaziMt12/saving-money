
import { createClient } from '@/lib/supabase/server'; // Using server client for callback
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('Error exchanging code for session:', error);
      // Redirect to an error page or show an error message
      return NextResponse.redirect(`${origin}/login?error=OAuth callback failed: ${error.message}`);
    }
  } else {
    console.error('No code found in OAuth callback');
     return NextResponse.redirect(`${origin}/login?error=OAuth callback failed: No authorization code provided.`);
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${origin}/`);
}
