
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
    .select('id, full_name, email, is_approved') // Ensure necessary fields are selected
    .order('full_name', { ascending: true });
  if (error) throw new Error(`Error fetching users for notifications: ${error.message}`);
  return data || [];
}

async function fetchAllEmergencyRequestsForNotifications(): Promise<EmergencyRequest[]> {
  const { data: rawRequests, error } = await supabase
    .from('emergency_requests')
    .select('id, user_id, reason, amount_requested, status, requested_at, profiles (full_name)') // Fetch profile name for display
    .order('requested_at', { ascending: false });
  if (error) throw new Error(`Error fetching emergency requests for notifications: ${error.message}`);
  
  // Map to include user_name directly if profile is expanded
  return rawRequests?.map(req => ({
    ...req,
    // @ts-ignore // Supabase type might not directly show nested profile
    user_name: req.profiles?.full_name || 'Unknown User', 
  })) || [];
}


interface SendNotificationPayload {
  targetUserIds: string[];
  message: string;
  type?: string;
  link?: string | null;
  subject?: string | null;
}

export function NotificationSenderTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users, isLoading: isLoadingUsers, error: usersError } = useQuery<Profile[], Error>({
    queryKey: ['allUsersForNotifications'],
    queryFn: fetchUsersForNotifications,
  });

  // Fetch emergency requests to populate the dropdown
  const { data: emergencyRequests, isLoading: isLoadingEmergencyRequests, error: emergencyRequestsError } = useQuery<EmergencyRequest[], Error>({
    queryKey: ['allEmergencyRequestsForNotifications'],
    queryFn: fetchAllEmergencyRequestsForNotifications,
    // Consider enabling only when relevant, or keep enabled for admin context
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
      return; // Early return for not-yet-implemented feature
    } else if (selectedTarget) { // Specific user selected
        const targetUserExists = users.some(u => u.id === selectedTarget);
        if (targetUserExists) {
            targetUserIds = [selectedTarget];
            console.log("NotificationSenderTab: Targeting specific user. ID:", targetUserIds);
        } else {
            toast({ title: "Error", description: "Selected target user not found. Cannot send notification.", variant: "destructive" });
            console.error("NotificationSenderTab: Selected target user ID not found in the users list:", selectedTarget);
            return; // Early return if specific user not found
        }
    } else if (formData.messageType === 'emergencyRequestUpdate' && formData.selectedEmergencyRequestId) {
        // If message type is emergency request update and a specific request is selected,
        // the notification should go to the user associated with that request.
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
      // This check might need to be more nuanced if targeting can be implicit (e.g. from selected request)
      toast({ title: "No Targets", description: "No valid users selected or found for notification.", variant: "destructive" });
      console.warn("NotificationSenderTab: No target user IDs determined. Notification not sent.");
      return;
    }

    const messageToSend = formData.customMessage || "";
    if (!messageToSend.trim()) {
      toast({ title: "Error", description: "Message content cannot be empty.", variant: "destructive" });
      console.error("NotificationSenderTab: Message content is empty.");
      return;
    }

    let finalLink = formData.link || null;
    if (formData.messageType === 'emergencyRequestUpdate' && formData.selectedEmergencyRequestId) {
        // Example: Construct a link to a request detail page (this page needs to exist)
        // finalLink = `/requests/${formData.selectedEmergencyRequestId}`;
    }


    const payload: SendNotificationPayload = {
      targetUserIds,
      message: messageToSend,
      type: formData.messageType,
      link: finalLink,
      subject: formData.customSubject || null, // Include subject
    };
    
    console.log("NotificationSenderTab: Final payload for Edge Function:", JSON.stringify(payload, null, 2));

    try {
      await sendNotificationMutation.mutateAsync(payload);
    } catch (error) {
      // Errors are handled by the mutation's onError callback
      console.error("NotificationSenderTab: Error caught during sendNotificationMutation.mutateAsync call:", error);
    }
  };

  const isLoading = isLoadingUsers || isLoadingEmergencyRequests || sendNotificationMutation.isPending;
  const queryError = usersError || emergencyRequestsError;

  if (isLoadingUsers || isLoadingEmergencyRequests && (!emergencyRequests || !users)) { // Show loader if essential data is missing
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
