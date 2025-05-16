import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Define CORS headers directly
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
console.log('Function send-app-notification loading (Dashboard Version with relatedRequestId)...');
// These environment variables MUST be set as SECRETS for this function in the Supabase Dashboard
const projectSupabaseUrl = Deno.env.get('PROJECT_SUPABASE_URL');
const projectSupabaseServiceRoleKey = Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE_KEY');
if (!projectSupabaseUrl) {
  console.error('FATAL: PROJECT_SUPABASE_URL environment variable (secret) is not set for this function.');
}
if (!projectSupabaseServiceRoleKey) {
  console.error('FATAL: PROJECT_SUPABASE_SERVICE_ROLE_KEY environment variable (secret) is not set for this function.');
}
const supabaseAdmin = createClient(projectSupabaseUrl, projectSupabaseServiceRoleKey);
console.log('Supabase admin client initialized for send-app-notification (Dashboard Version).');
Deno.serve(async (req)=>{
  console.log(`send-app-notification (Dashboard) received a ${req.method} request from ${req.headers.get('origin')}`);
  if (req.method === 'OPTIONS') {
    console.log('Responding to OPTIONS request (Dashboard Version)');
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const payload = await req.json();
    console.log('Received payload (Dashboard Version):', payload);
    // Destructure relatedRequestId from the payload
    const { targetUserIds, message, type = 'general', link, relatedRequestId } = payload;
    if (!targetUserIds || !Array.isArray(targetUserIds) || targetUserIds.length === 0 || !message) {
      console.error('Invalid payload (Dashboard Version):', {
        targetUserIds,
        message
      });
      return new Response(JSON.stringify({
        error: 'Missing targetUserIds (array) or message'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    const notificationsToInsert = targetUserIds.map((userId)=>({
        user_id: userId,
        message: message,
        type: type,
        link: link,
        related_request_id: relatedRequestId
      }));
    console.log('Attempting to insert notifications (Dashboard Version):', notificationsToInsert);
    const { data, error } = await supabaseAdmin.from('notifications').insert(notificationsToInsert).select();
    if (error) {
      console.error('Supabase error inserting notifications (Dashboard Version):', error);
      return new Response(JSON.stringify({
        error: `Failed to insert notifications: ${error.message}`
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
    console.log('Successfully inserted notifications (Dashboard Version):', data);
    return new Response(JSON.stringify({
      success: true,
      createdNotifications: data
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (err) {
    console.error('Critical error in send-app-notification function (Dashboard Version):', err.message, err.stack);
    return new Response(JSON.stringify({
      error: `Server error: ${err.message}`
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
