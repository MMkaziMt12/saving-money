
"use client";

import type { Profile, EmergencyRequest } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { NotificationSender } from "@/components/admin/NotificationSender";
import { Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NotificationFormValues } from "@/components/admin/NotificationSender";

const supabase = createClient();

async function fetchUsersForNotifications(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_approved')
    .order('full_name', { ascending: true });
  if (error) throw new Error(`Error fetching users for notifications: ${error.message}`);
  return data || [];
}

async function fetchAllEmergencyRequestsForNotifications(): Promise<EmergencyRequest[]> {
  const { data: rawRequests, error } = await supabase
    .from('emergency_requests')
    .select('id, user_id, reason, amount_requested, status, requested_at, profile_user:profiles!emergency_requests_user_id_fkey(full_name)')
    .order('requested_at', { ascending: false });

  if (error) {
    console.error("Error fetching emergency requests for notifications:", error);
    throw new Error(`Error fetching emergency requests for notifications: ${error.message}`);
  }
  
  return rawRequests?.map(req => ({
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
  relatedRequestId?: string | null; // Ensure this is part of the payload type
}

export function NotificationSenderTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users, isLoading: isLoadingUsers, error: usersError } = useQuery<Profile[], Error>({
    queryKey: ['allUsersForNotifications'],
    queryFn: fetchUsersForNotifications,
  });

  const { data: emergencyRequests, isLoading: isLoadingEmergencyRequests, error: emergencyRequestsError } = useQuery<EmergencyRequest[], Error>({
    queryKey: ['allEmergencyRequestsForNotifications'],
    queryFn: fetchAllEmergencyRequestsForNotifications,
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
        throw new Error(error.message || "Failed to send notification via Edge Function.");
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
    },
    onError: (error: Error) => {
      toast({
        title: "Sending Failed",
        description: error.message || "Could not send notification.",
        variant: "destructive",
      });
    },
  });

  const handleSendNotification = async (formData: NotificationFormValues) => {
    if (!users) {
      toast({ title: "Error", description: "User list not loaded yet. Cannot send notification.", variant: "destructive" });
      console.error("NotificationSenderTab: Users array is not available.");
      return;
    }

    let targetUserIds: string[] = [];
    const selectedTarget = formData.targetUser;

    console.log("NotificationSenderTab: Preparing to send notification. Form data:", formData);
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
        finalLink = `/requests/${formData.selectedEmergencyRequestId}`; // Auto-generate link
        relatedRequestIdValue = formData.selectedEmergencyRequestId; // Set relatedRequestId
        console.log(`NotificationSenderTab: Emergency request selected. Link: ${finalLink}, Related Request ID: ${relatedRequestIdValue}`);
    }


    const payload: SendNotificationPayload = {
      targetUserIds,
      message: messageToSend,
      type: formData.messageType,
      link: finalLink,
      subject: formData.customSubject || null,
      relatedRequestId: relatedRequestIdValue, // Pass the related request ID
    };
    
    console.log("NotificationSenderTab: Final payload for Edge Function:", JSON.stringify(payload, null, 2));

    if (payload.targetUserIds.length === 0) {
      toast({ title: "No Targets", description: "No users to send the notification to.", variant: "destructive" });
      return;
    }
    
    try {
      await sendNotificationMutation.mutateAsync(payload);
    } catch (error) {
      console.error("NotificationSenderTab: Error caught during sendNotificationMutation.mutateAsync call:", error);
      // Toast for error is handled by the mutation's onError.
    }
  };

  const isLoading = isLoadingUsers || isLoadingEmergencyRequests || sendNotificationMutation.isPending;
  const queryError = usersError || emergencyRequestsError;

  if (isLoadingUsers || (isLoadingEmergencyRequests && (!emergencyRequests || !users))) { 
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading data for notifications...</p>
      </div>
    );
  }

  if (queryError) {
     return (
      <div className="flex flex-col items-center justify-center py-10">
        <p className="text-destructive">Error: {queryError.message}</p>
        <button 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['allUsersForNotifications', 'allEmergencyRequestsForNotifications'] })} 
            className="mt-2 text-primary hover:underline"
        >
            Try again
        </button>
      </div>
    );
  }

  return (
    <NotificationSender 
        users={users || []} 
        emergencyRequests={emergencyRequests || []}
        onSend={handleSendNotification} 
        isSending={sendNotificationMutation.isPending} 
    />
  );
}

