
"use client";

import type { Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { NotificationSender } from "@/components/admin/NotificationSender";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NotificationFormValues } from "@/components/admin/NotificationSender";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { 
  fetchUsersForNotificationsAdmin, 
  fetchAllEmergencyRequestsForNotificationsListAdmin,
  type UserForNotificationAdmin,
  type EmergencyRequestForNotificationListAdmin
} from "@/lib/api/admin"; // Updated imports

const supabase = createClient();

interface SendNotificationPayload {
  targetUserIds: string[];
  message: string;
  type?: string;
  link?: string | null;
  subject?: string | null;
  relatedRequestId?: string | null;
}

interface EdgeFunctionResponse {
  success: boolean;
  createdNotifications?: { id: string, user_id: string, message: string }[];
  error?: string;
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
  } = useQuery<UserForNotificationAdmin[], Error>({
    queryKey: ['allUsersForNotificationsAdmin'],
    queryFn: fetchUsersForNotificationsAdmin,
  });

  const { 
    data: emergencyRequests, 
    isLoading: isLoadingEmergencyRequests, 
    isError: isEmergencyRequestsError,
    error: emergencyRequestsErrorObj,
    refetch: refetchEmergencyRequests
  } = useQuery<EmergencyRequestForNotificationListAdmin[], Error>({
    queryKey: ['allEmergencyRequestsForNotificationsListAdmin'],
    queryFn: fetchAllEmergencyRequestsForNotificationsListAdmin,
  });

  const sendNotificationMutation = useMutation<EdgeFunctionResponse, Error, SendNotificationPayload>({
    mutationFn: async (payload) => {
      console.log("NotificationSenderTab: Invoking 'send-app-notification' Edge Function with payload:", JSON.stringify(payload, null, 2));
      const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse>('send-app-notification', {
        body: payload,
      });
      console.log("NotificationSenderTab: Edge Function response raw:", { data, error });
      if (error) {
        console.error("NotificationSenderTab: Error invoking 'send-app-notification' function:", error);
        throw error;
      }
      if (data && data.error) {
        console.error("NotificationSenderTab: Error from Edge Function business logic:", data.error);
        throw new Error(data.error);
      }
      if (!data || !data.success) {
        console.error("NotificationSenderTab: Edge Function did not return success or expected data format:", data);
        throw new Error("Notification sending failed or returned unexpected response.");
      }
      console.log("NotificationSenderTab: Edge Function response data (parsed):", data);
      console.log("NotificationSenderTab: Specifically, createdNotifications:", data?.createdNotifications);
      return data;
    },
    onSuccess: (data) => {
      const createdCount = data?.createdNotifications?.length || 0;
      toast({
        title: "Notification Sent!",
        description: `Notifications dispatched. ${createdCount} notification(s) potentially created.`,
      });
      if (createdCount > 0 && data.createdNotifications) {
         data.createdNotifications.forEach(notif => {
            queryClient.invalidateQueries({ queryKey: ["userNotifications", notif.user_id] });
         });
      }
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
      if (formData.messageType !== 'emergencyRequestUpdate' || !formData.selectedEmergencyRequestId) { // Avoid double toast if target was derived from request
        toast({ title: "No Targets", description: "No valid users selected or found for notification. Please check the target audience.", variant: "destructive" });
      }
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
      console.error("NotificationSenderTab: Error caught during sendNotificationMutation.mutateAsync call:", error);
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

  if (combinedError && (!users || (isLoadingEmergencyRequests && !emergencyRequests))) { // Allow to proceed if only emergencyRequests fail but users are loaded
     return (
      <div className="flex flex-col items-center justify-center py-10 text-center px-4">
        <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
        <p className="text-destructive mb-2">Error loading data.</p>
        <p className="text-sm text-muted-foreground mb-4">{combinedError?.message || "An unknown error occurred."}</p>
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
  
  return (
    <NotificationSender 
        users={users || []} 
        emergencyRequests={emergencyRequests || []}
        onSend={handleSendNotification} 
        isSending={sendNotificationMutation.isPending} 
    />
  );
}
