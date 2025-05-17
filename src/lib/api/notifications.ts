
// This file can be used by both server and client.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Notification as AppNotification } from "@/types";

export type NotificationForDisplay = Pick<AppNotification, 'id' | 'message' | 'created_at' | 'read_at' | 'link' | 'type'>;
export async function fetchUserNotifications(supabaseClient: SupabaseClient, userId: string | undefined): Promise<NotificationForDisplay[]> {
  if (!userId) {
    console.log("API: fetchUserNotifications called with no userId. Returning empty array.");
    return [];
  }
  console.log(`API: Fetching notifications for user ${userId}`);
  const { data, error } = await supabaseClient
    .from("notifications")
    .select("id, message, created_at, read_at, link, type") 
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("API: Error fetching notifications:", JSON.stringify(error, null, 2));
    throw error;
  }
  console.log(`API: Notifications for user ${userId} fetched:`, data?.length || 0);
  return data || [];
}

export type MarkedNotificationResult = Pick<AppNotification, 'id' | 'read_at'>;
export async function markNotificationsAsRead(supabaseClient: SupabaseClient, userId: string, notificationIds?: string[]): Promise<MarkedNotificationResult[]> {
  if (!userId) {
    console.error("API: markAsReadMutation cannot run, user ID missing.");
    throw new Error("User ID missing");
  }
  console.log(`API: Marking notifications as read for user ${userId}. IDs:`, notificationIds || "all unread");
  let query = supabaseClient
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);

  if (notificationIds && notificationIds.length > 0) {
    query = query.in("id", notificationIds);
  }

  const { data, error } = await query.select('id, read_at').returns<MarkedNotificationResult[]>();

  if (error) {
    console.error("API: Error marking notifications as read:", JSON.stringify(error, null, 2));
    throw error;
  }
  console.log("API: Notifications marked as read, server response:", data);
  return data || [];
}
