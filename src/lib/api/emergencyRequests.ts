
"use client";

import { createClient } from "@/lib/supabase/client";
import type { EmergencyRequest, Profile, Notification as AppNotification } from "@/types";

const supabase = createClient();

// For user's own emergency request form page
export type UserActiveEmergencyRequest = Pick<EmergencyRequest, 'id' | 'amount_requested' | 'reason' | 'requested_at' | 'return_date' | 'status' | 'is_fully_repaid' | 'amount_returned'>;
export async function fetchCurrentUserActiveEmergencyRequests(userId: string | undefined): Promise<UserActiveEmergencyRequest[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("emergency_requests")
    .select("id, amount_requested, reason, requested_at, return_date, status, is_fully_repaid, amount_returned")
    .eq("user_id", userId)
    .in("status", ["pending", "approved"]) 
    .order("requested_at", { ascending: false });

  if (error) {
    console.error("API: Error fetching user's active emergency requests:", JSON.stringify(error, null, 2));
    throw error;
  }
  return data || [];
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
export async function fetchEmergencyRequestDetails(requestId: string): Promise<EmergencyRequestDetail | null> {
  if (!requestId) return null;
  const { data, error } = await supabase
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
    console.error("API: Error fetching emergency request details:", JSON.stringify(error, null, 2));
    throw error;
  }
  return data as EmergencyRequestDetail | null; 
}

export type RelatedNotificationForRequest = Pick<AppNotification, 'id' | 'message' | 'created_at' | 'read_at' | 'link'>;
export async function fetchRelatedNotificationsForRequest(requestId: string): Promise<RelatedNotificationForRequest[]> {
  if (!requestId) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("id, message, created_at, read_at, link")
    .eq("related_request_id", requestId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("API: Error fetching related notifications for request:", JSON.stringify(error, null, 2));
    throw error;
  }
  return data || [];
}
