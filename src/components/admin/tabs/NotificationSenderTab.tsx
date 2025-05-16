
"use client";

import type { Profile, EmergencyRequest } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { NotificationSender } from "@/components/admin/NotificationSender";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NotificationFormValues } from "@/components/admin/NotificationSender";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";

const supabase = createClient();

async function fetchUsersForNotifications(): Promise<Pick<Profile, 'id' | 'full_name' | 'email' | 'is_approved'>[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_approved') // Optimized columns
    .order('full_name', { ascending: true });
  if (error) {
    console.error("Error fetching users for notifications:", JSON.stringify(error, null, 2));
    throw error;
  }
  return data || [];
}

// Fetches specific fields for the dropdown in NotificationSender
async function fetchAllEmergencyRequestsForNotificationsList(): Promise<Pick<EmergencyRequest, 'id' | 'user_id' | 'reason' | 'amount_requested' | 'status' | 'requested_at'> & { profile_user?: Pick<Profile, 'full_name'> | null }[]> {
  const { data: rawRequests, error } = await supabase
    .from('emergency_requests')
    .select('id, user_id, reason, amount_requested, status, requested_at, profile_user:profiles!emergency_requests_user_id_fkey(full_name)') // Optimized
    .order('requested_at', { ascending: false });

  if (error) {
    console.error("Error fetching emergency requests for notifications list:", JSON.stringify(error, null, 2));
    throw error;
  }
  
  const typedData = rawRequests as (Pick<EmergencyRequest, 'id' | 'user_id' | 'reason' | 'amount_requested' | 'status' | 'requested_at'> & { profile_user: { full_name: string | null } | null })[] | null;

  return typedData?.map(req => ({
    ...req,
    user_name: req.profile_user?.full_name || req.user_id || 'Unknown User', 
  })) || [];
}

interface SendNotificationPayload {
  targetUserIds: string[];
  message: string;
  type?: string;
  link?: string | null;
  subject?: string | null;
  relatedRequestId?: string | null;
}

export function NotificationSenderTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { 
    data: users, 
    isLoading: isLoadingUsers, 
    isError: isUsersError,
    error: usersErrorObj,
    refetch: refetchUsers
  } = useQuery<Pick<Profile, 'id' | 'full_name' | 'email' | 'is_approved'>[], Error>({
    queryKey: ['allUsersForNotifications'],
    queryFn: fetchUsersForNotifications,
  });

  const { 
    data: emergencyRequests, 
    isLoading: isLoadingEmergencyRequests, 
    isError: isEmergencyRequestsError,
    error: emergencyRequestsErrorObj,
    refetch: refetchEmergencyRequests
  } = useQuery<Pick<EmergencyRequest, 'id' | 'user_id' | 'reason' | 'amount_requested' | 'status' | 'requested_at'> & { profile_user?: Pick<Profile, 'full_name'> | null }[], Error>({
    queryKey: ['allEmergencyRequestsForNotificationsList'], // Changed query key for clarity
    queryFn: fetchAllEmergencyRequestsForNotificationsList,
  });

  const sendNotificationMutation = useMutation<any, Error, SendNotificationPayload>({
    mutationFn: async (payload) => {
      console.log("NotificationSenderTab: Invoking 'send-app-notification' Edge Function with payload:", JSON.stringify(payload, null, 2));
      const { data, error } = await supabase.functions.invoke('send-app-notification', {
        body: payload,
      });

      console.log("NotificationSenderTab: Edge Function response raw:", { data, error });

      if (error) {
        console.error("NotificationSenderTab: Error invoking 'send-app-notification' function:", error);
        throw error;
      }
      console.log("NotificationSenderTab: Edge Function response data (parsed):", data);
      console.log("NotificationSenderTab: Specifically, createdNotifications:", data?.createdNotifications);
      return data;
    },
    onSuccess: (data: any) => {
      const createdCount = data?.createdNotifications?.length || 0;
      toast({
        title: "Notification Sent!",
        description: `Notifications dispatched. ${createdCount} notification(s) potentially created.`,
      });
      // If admins have a way to see sent notifications, invalidate that query here.
      // queryClient.invalidateQueries({ queryKey: ['adminSentNotifications'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sending Failed",
        description: error.message || "Could not send notification. Check Edge Function logs.",
        variant: "destructive",
      });
    },
  });

  const handleSendNotification = useCallback(async (formData: NotificationFormValues) => {
    console.log("NotificationSenderTab: Preparing to send notification. Form data:", formData);
    if (!users) {
      toast({ title: "Error", description: "User list not loaded yet. Cannot send notification.", variant: "destructive" });
      console.error("NotificationSenderTab: Users array is not available.");
      return;
    }

    let targetUserIds: string[] = [];
    const selectedTarget = formData.targetUser;

    console.log("NotificationSenderTab: Available users for targeting:", users.map(u => ({id: u.id, name: u.full_name, approved: u.is_approved})));

    if (selectedTarget === "all_users") {
      targetUserIds = users.filter(u => u.is_approved).map(u => u.id);
      console.log("NotificationSenderTab: Targeting all *approved* users. IDs:", targetUserIds);
    } else if (selectedTarget === "all_pending_contribution") {
      toast({ title: "Info", description: "Targeting 'Users with Pending Contributions' is not yet implemented.", variant: "default" });
      return; 
    } else if (selectedTarget) { 
        const targetUserExists = users.some(u => u.id === selectedTarget);
        if (targetUserExists) {
            targetUserIds = [selectedTarget];
            console.log("NotificationSenderTab: Targeting specific user. ID:", targetUserIds);
        } else {
            toast({ title: "Error", description: "Selected target user not found. Cannot send notification.", variant: "destructive" });
            console.error("NotificationSenderTab: Selected target user ID not found in the users list:", selectedTarget);
            return; 
        }
    } else if (formData.messageType === 'emergencyRequestUpdate' && formData.selectedEmergencyRequestId) {
        const request = emergencyRequests?.find(r => r.id === formData.selectedEmergencyRequestId);
        if (request?.user_id) {
            targetUserIds = [request.user_id];
            console.log("NotificationSenderTab: Targeting user from selected emergency request. ID:", targetUserIds);
        } else {
            toast({ title: "Error", description: "Could not determine target user from selected emergency request.", variant: "destructive" });
            return;
        }
    }

    if (targetUserIds.length === 0 && selectedTarget !== "all_pending_contribution") {
      console.warn("NotificationSenderTab: No target user IDs determined. Notification not sent. Selected target was:", selectedTarget);
      toast({ title: "No Targets", description: "No valid users selected or found for notification. Please check the target audience.", variant: "destructive" });
      return;
    }

    const messageToSend = formData.customMessage || "";
    if (!messageToSend.trim()) {
      toast({ title: "Error", description: "Message content cannot be empty.", variant: "destructive" });
      console.error("NotificationSenderTab: Message content is empty.");
      return;
    }

    let finalLink: string | null = formData.link || null;
    let relatedRequestIdValue: string | null = null;

    if (formData.messageType === 'emergencyRequestUpdate' && formData.selectedEmergencyRequestId) {
        finalLink = `/requests/${formData.selectedEmergencyRequestId}`;
        relatedRequestIdValue = formData.selectedEmergencyRequestId;
        console.log(`NotificationSenderTab: Emergency request selected. Link: ${finalLink}, Related Request ID: ${relatedRequestIdValue}`);
    }

    const payload: SendNotificationPayload = {
      targetUserIds,
      message: messageToSend,
      type: formData.messageType,
      link: finalLink,
      subject: formData.customSubject || null,
      relatedRequestId: relatedRequestIdValue,
    };
    
    console.log("NotificationSenderTab: Final payload for Edge Function:", JSON.stringify(payload, null, 2));

    if (payload.targetUserIds.length === 0) {
      toast({ title: "No Targets", description: "No users to send the notification to.", variant: "destructive" });
      return;
    }
    
    try {
      await sendNotificationMutation.mutateAsync(payload);
    } catch (error) {
      // Error is already handled by useMutation's onError
      console.error("NotificationSenderTab: Error caught during sendNotificationMutation.mutateAsync call (should be handled by onError):", error);
    }
  }, [users, emergencyRequests, sendNotificationMutation, toast]);

  const combinedIsLoading = (isLoadingUsers && !users && !isUsersError) || (isLoadingEmergencyRequests && !emergencyRequests && !isEmergencyRequestsError);
  const combinedError = usersErrorObj || emergencyRequestsErrorObj;

  if (combinedIsLoading) { 
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading data for notifications...</p>
      </div>
    );
  }

  if (combinedError && (!users || !emergencyRequests)) {
     return (
      <div className="flex flex-col items-center justify-center py-10 text-center px-4">
        <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
        <p className="text-destructive mb-2">Error loading data.</p>
        <p className="text-sm text-muted-foreground mb-4">{combinedError.message}</p>
        <Button 
            onClick={() => {
                if (usersErrorObj) refetchUsers();
                if (emergencyRequestsErrorObj) refetchEmergencyRequests();
            }} 
            variant="outline"
        >
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
        </Button>
      </div>
    );
  }
  
  // Pass loading states for individual queries if NotificationSender needs to disable parts of its UI
  return (
    <NotificationSender 
        users={users || []} 
        emergencyRequests={emergencyRequests || []} // Pass the full list
        onSend={handleSendNotification} 
        isSending={sendNotificationMutation.isPending} 
    />
  );
}

    