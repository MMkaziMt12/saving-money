
// This file can be used by both server and client.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmergencyRequest, Profile, Notification as AppNotification } from "@/types";

// For user's own emergency request form page
export type UserActiveEmergencyRequest = Pick<EmergencyRequest, 'id' | 'amount_requested' | 'reason' | 'requested_at' | 'return_date' | 'status' | 'is_fully_repaid' | 'amount_returned'>;

export async function fetchCurrentUserActiveEmergencyRequests(
  supabaseClient: SupabaseClient, 
  userId: string | undefined
): Promise<UserActiveEmergencyRequest[]> {
  console.log(`API: fetchCurrentUserActiveEmergencyRequests called for userId: ${userId} (Type: ${typeof userId})`);

  if (!userId || typeof userId !== 'string') { // Guard against invalid userId
    console.warn("API: fetchCurrentUserActiveEmergencyRequests: userId is undefined or not a string. Returning empty array.");
    return [];
  }

  try {
    const { data, error } = await supabaseClient
      .from("emergency_requests")
      .select("id, amount_requested, reason, requested_at, return_date, status, is_fully_repaid, amount_returned")
      .eq("user_id", userId)
      .in("status", ["pending", "approved"]) 
      .order("requested_at", { ascending: false });

    if (error) {
      console.error("API: Error fetching user's active emergency requests:", JSON.stringify(error, null, 2));
      throw error;
    }
    console.log(`API: Successfully fetched ${data?.length || 0} active emergency requests for user ${userId}`);
    return data || [];
  } catch (error) {
    console.error(`API: Unexpected error in fetchCurrentUserActiveEmergencyRequests for user ${userId}:`, error);
    throw error; 
  }
}


// For emergency request detail page
export type EmergencyRequestDetail = EmergencyRequest & {
    profile_user?: Pick<Profile, 'full_name' | 'avatar_url'> | null;
    profile_admin?: Pick<Profile, 'full_name'> | null;
};

type RawEmergencyRequestDetail = EmergencyRequest & {
    profile_user: { full_name: string | null, avatar_url: string | null } | null;
    profile_admin: { full_name: string | null } | null;
};

export async function fetchEmergencyRequestDetails(supabaseClient: SupabaseClient, requestId: string): Promise<EmergencyRequestDetail | null> {
  if (!requestId || typeof requestId !== 'string') {
    console.warn("API: fetchEmergencyRequestDetails: requestId is undefined or not a string. Returning null.");
    return null;
  }
  try {
    const { data, error } = await supabaseClient
      .from("emergency_requests")
      .select(`
        id, user_id, amount_requested, reason, status, requested_at, return_date,
        amount_returned, is_fully_repaid, last_return_date, admin_notes, reviewed_at, reviewed_by_admin_id,
        profile_user:profiles!emergency_requests_user_id_fkey(full_name, avatar_url),
        profile_admin:profiles!emergency_requests_reviewed_by_admin_id_fkey(full_name)
      `)
      .eq("id", requestId)
      .single<RawEmergencyRequestDetail>();
      
    if (error) {
      console.error(`API: Error fetching emergency request details for ID ${requestId}:`, JSON.stringify(error, null, 2));
      throw error;
    }
    return data as EmergencyRequestDetail | null; 
  } catch (error) {
     console.error(`API: Unexpected error in fetchEmergencyRequestDetails for ID ${requestId}:`, error);
    throw error;
  }
}

export type RelatedNotificationForRequest = Pick<AppNotification, 'id' | 'message' | 'created_at' | 'read_at' | 'link'>;
export async function fetchRelatedNotificationsForRequest(supabaseClient: SupabaseClient, requestId: string): Promise<RelatedNotificationForRequest[]> {
   if (!requestId || typeof requestId !== 'string') {
    console.warn("API: fetchRelatedNotificationsForRequest: requestId is undefined or not a string. Returning empty array.");
    return [];
  }
  try {
    const { data, error } = await supabaseClient
      .from("notifications")
      .select("id, message, created_at, read_at, link")
      .eq("related_request_id", requestId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error(`API: Error fetching related notifications for request ID ${requestId}:`, JSON.stringify(error, null, 2));
      throw error;
    }
    return data || [];
  } catch (error) {
    console.error(`API: Unexpected error in fetchRelatedNotificationsForRequest for ID ${requestId}:`, error);
    throw error;
  }
}
