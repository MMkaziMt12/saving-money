
"use client";

import type { Profile } from "@/types";
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
    // .eq('is_approved', true) // Fetch all to let admin decide, filtering can happen if needed
    .order('full_name', { ascending: true });
  if (error) throw new Error(`Error fetching users for notifications: ${error.message}`);
  return data || [];
}

interface SendNotificationPayload {
  targetUserIds: string[];
  message: string;
  type?: string;
  link?: string | null; // Link can be null if not provided
  subject?: string | null; // Subject/Title can be null
}

export function NotificationSenderTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users, isLoading: isLoadingUsers, error: usersError } = useQuery<Profile[], Error>({
    queryKey: ['allUsersForNotifications'], // Changed queryKey to reflect fetching all users
    queryFn: fetchUsersForNotifications,
  });

  const sendNotificationMutation = useMutation<unknown, Error, SendNotificationPayload>({
    mutationFn: async (payload) => {
      console.log("NotificationSenderTab: Invoking 'send-app-notification' Edge Function with payload:", payload);
      const { data, error } = await supabase.functions.invoke('send-app-notification', {
        body: payload,
      });

      if (error) {
        console.error("NotificationSenderTab: Error invoking 'send-app-notification' function:", error);
        throw new Error(error.message || "Failed to send notification via Edge Function.");
      }
      console.log("NotificationSenderTab: Edge Function response data:", data);
      return data; // Return data which might include { success: true, createdNotifications: [...] }
    },
    onSuccess: (data: any) => { // Added type for data
      toast({
        title: "Notification Sent!",
        description: `Notifications dispatched. ${data?.createdNotifications?.length || 0} notifications created.`,
      });
      // queryClient.invalidateQueries({ queryKey: ['adminNotifications'] }); // Optional
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
    console.log("NotificationSenderTab: Available users for targeting (raw):", users);

    if (selectedTarget === "all_users") {
      targetUserIds = users.filter(u => u.is_approved).map(u => u.id); // Send only to approved users for "all_users"
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
    }

    if (targetUserIds.length === 0 && selectedTarget !== "all_pending_contribution") { // Avoid error if pending feature is selected
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

    const payload: SendNotificationPayload = {
      targetUserIds,
      message: messageToSend,
      type: formData.messageType,
      link: formData.link || null, // Pass the link, ensure it's null if empty string
      subject: formData.customSubject || null, // Pass subject
    };
    
    console.log("NotificationSenderTab: Final payload for Edge Function:", payload);

    try {
      await sendNotificationMutation.mutateAsync(payload);
    } catch (error) {
      console.error("NotificationSenderTab: Error caught during sendNotificationMutation.mutateAsync call:", error);
      // Toast is handled by mutation's onError
    }
  };

  if (isLoadingUsers) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading user data for notifications...</p>
      </div>
    );
  }

  if (usersError) {
     return (
      <div className="flex flex-col items-center justify-center py-10">
        <p className="text-destructive">Error fetching users: {usersError.message}</p>
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['allUsersForNotifications'] })} className="mt-2 text-blue-500">Try again</button>
      </div>
    );
  }

  return <NotificationSender users={users || []} onSend={handleSendNotification} isSending={sendNotificationMutation.isPending} />;
}

    