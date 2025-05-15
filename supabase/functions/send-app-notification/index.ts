// supabase/functions/send-app-notification/index.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors';



interface NotificationPayload {
  targetUserIds: string[];
  message: string;
  type?: string;
  link?: string;
}

console.log('Function send-app-notification loading...');

// These environment variables must be set in your Supabase project's Function settings via the dashboard
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl) {
  console.error('FATAL: SUPABASE_URL environment variable is not set.');
}
if (!supabaseServiceRoleKey) {
  console.error('FATAL: SUPABASE_SERVICE_ROLE_KEY environment variable is not set.');
}

// Initialize Supabase client with service_role key for admin privileges
const supabaseAdmin: SupabaseClient = createClient(supabaseUrl!, supabaseServiceRoleKey!);
console.log('Supabase admin client initialized for send-app-notification.');

Deno.serve(async (req: Request) => {
  console.log(`send-app-notification received a ${req.method} request from ${req.headers.get('origin')}`);
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    console.log('Responding to OPTIONS request');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: NotificationPayload = await req.json();
    console.log('Received payload:', payload);
    const { targetUserIds, message, type = 'general', link } = payload;

    if (!targetUserIds || !Array.isArray(targetUserIds) || targetUserIds.length === 0 || !message) {
      console.error('Invalid payload:', { targetUserIds, message });
      return new Response(JSON.stringify({ error: 'Missing targetUserIds (array) or message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const notificationsToInsert = targetUserIds.map(userId => ({
      user_id: userId,
      message: message,
      type: type,
      link: link,
      // created_at will be set by default now() in the database
    }));

    console.log('Attempting to insert notifications:', notificationsToInsert);

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert(notificationsToInsert)
      .select();

    if (error) {
      console.error('Supabase error inserting notifications:', error);
      return new Response(JSON.stringify({ error: `Failed to insert notifications: ${error.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    console.log('Successfully inserted notifications:', data);
    return new Response(JSON.stringify({ success: true, createdNotifications: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('Critical error in send-app-notification function:', err.message, err.stack);
    return new Response(JSON.stringify({ error: `Server error: ${err.message}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});