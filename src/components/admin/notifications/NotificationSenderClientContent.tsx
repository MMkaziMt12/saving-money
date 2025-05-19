
"use client";

import React, { useCallback } from "react";
import { createClient as createClientComponentClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { NotificationSender } from "@/components/admin/NotificationSender";
import type { NotificationFormValues } from "@/components/admin/NotificationSender";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { 
  fetchUsersForNotificationsAdmin, 
  fetchAllEmergencyRequestsForNotificationsListAdmin,
  type UserForNotificationAdmin,
  type EmergencyRequestForNotificationListAdmin
} from "@/lib/api/admin";

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

export function NotificationSenderClientContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = createClientComponentClient();

  const { 
    data: users, 
    isLoading: isLoadingUsers, 
    isError: isUsersError,
    error: usersErrorObj,
    refetch: refetchUsers
  } = useQuery<UserForNotificationAdmin[], Error>({
    queryKey: ['allUsersForNotificationsAdmin'],
    queryFn: () => fetchUsersForNotificationsAdmin(supabase),
  });

  const { 
    data: emergencyRequests, 
    isLoading: isLoadingEmergencyRequests, 
    isError: isEmergencyRequestsError,
    error: emergencyRequestsErrorObj,
    refetch: refetchEmergencyRequests
  } = useQuery<EmergencyRequestForNotificationListAdmin[], Error>({
    queryKey: ['allEmergencyRequestsForNotificationsListAdmin'],
    queryFn: () => fetchAllEmergencyRequestsForNotificationsListAdmin(supabase),
  });

  const sendNotificationMutation = useMutation<EdgeFunctionResponse, Error, SendNotificationPayload>({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse>('send-app-notification', {
        body: payload,
      });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      if (!data || !data.success) throw new Error("Notification sending failed or returned unexpected response.");
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
            if (notif.related_request_id) {
                queryClient.invalidateQueries({ queryKey: ["relatedNotificationsForRequest", notif.related_request_id] });
            }
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
    if (!users) {
      toast({ title: "Error", description: "User list not loaded yet.", variant: "destructive" });
      return;
    }

    let targetUserIds: string[] = [];
    const selectedTarget = formData.targetUser;

    if (selectedTarget === "all_users") {
      targetUserIds = users.filter(u => u.is_approved).map(u => u.id);
    } else if (selectedTarget === "all_pending_contribution") {
      toast({ title: "Info", description: "Targeting 'Users with Pending Contributions' is not yet implemented."});
      return; 
    } else if (selectedTarget) { 
        targetUserIds = [selectedTarget];
    } else if (formData.messageType === 'emergencyRequestUpdate' && formData.selectedEmergencyRequestId) {
        const request = emergencyRequests?.find(r => r.id === formData.selectedEmergencyRequestId);
        if (request?.user_id) targetUserIds = [request.user_id];
    }

    if (targetUserIds.length === 0 && selectedTarget !== "all_pending_contribution") {
      toast({ title: "No Targets", description: "No valid users selected or found.", variant: "destructive" });
      return;
    }

    if (!formData.customMessage.trim()) {
      toast({ title: "Error", description: "Message content cannot be empty.", variant: "destructive" });
      return;
    }

    let finalLink: string | null = formData.link || null;
    let relatedRequestIdValue: string | null = null;

    if (formData.messageType === 'emergencyRequestUpdate' && formData.selectedEmergencyRequestId) {
        finalLink = `/requests/${formData.selectedEmergencyRequestId}`; 
        relatedRequestIdValue = formData.selectedEmergencyRequestId;
    }

    const payload: SendNotificationPayload = {
      targetUserIds,
      message: formData.customMessage,
      type: formData.messageType,
      link: finalLink,
      subject: formData.customSubject || null,
      relatedRequestId: relatedRequestIdValue,
    };
    
    if (payload.targetUserIds.length === 0) {
      toast({ title: "No Targets", description: "No users to send the notification to.", variant: "destructive" });
      return;
    }
    
    sendNotificationMutation.mutate(payload);
  }, [users, emergencyRequests, sendNotificationMutation, toast, queryClient]);

  const combinedIsLoading = (isLoadingUsers && !users) || (isLoadingEmergencyRequests && !emergencyRequests);
  const combinedError = usersErrorObj || emergencyRequestsErrorObj;

  if (combinedIsLoading && !combinedError) { 
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading data for notifications...</p>
      </div>
    );
  }

  if (combinedError && (!users || (isLoadingEmergencyRequests && !emergencyRequests))) { 
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
