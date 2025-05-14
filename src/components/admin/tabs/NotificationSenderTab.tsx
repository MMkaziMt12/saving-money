
"use client";

import type { Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { NotificationSender } from "@/components/admin/NotificationSender"; // This component contains the form
import { Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NotificationFormValues } from "@/components/admin/NotificationSender"; // Assuming this type exists

const supabase = createClient();

async function fetchUsersForNotifications(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_approved')
    .eq('is_approved', true) // Only fetch approved users
    .order('full_name', { ascending: true });
  if (error) throw new Error(`Error fetching users for notifications: ${error.message}`);
  return data || [];
}

interface SendNotificationPayload {
  targetUserIds: string[];
  message: string;
  type?: string;
  link?: string;
}

export function NotificationSenderTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users, isLoading: isLoadingUsers, error: usersError } = useQuery<Profile[], Error>({
    queryKey: ['approvedUsersForNotifications'],
    queryFn: fetchUsersForNotifications,
  });

  const sendNotificationMutation = useMutation<unknown, Error, SendNotificationPayload>({
    mutationFn: async (payload) => {
      const { error } = await supabase.functions.invoke('send-app-notification', {
        body: payload,
      });
      if (error) {
        console.error("Error invoking send-app-notification function:", error);
        throw new Error(error.message || "Failed to send notification via Edge Function.");
      }
      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Notification Sent!",
        description: "Notifications have been dispatched via the Edge Function.",
      });
      // Optionally, invalidate queries if notifications are displayed in admin panel elsewhere
      // queryClient.invalidateQueries({ queryKey: ['adminNotifications'] });
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
      toast({ title: "Error", description: "User list not loaded yet.", variant: "destructive" });
      return;
    }

    let targetUserIds: string[] = [];
    if (formData.targetUser === "all_users") {
      targetUserIds = users.filter(u => u.is_approved).map(u => u.id);
    } else if (formData.targetUser === "all_pending_contribution") {
      // TODO: Implement logic to fetch users with pending contributions
      // This would likely involve another Supabase query or RPC
      toast({ title: "Info", description: "Targeting 'Users with Pending Contributions' is not yet implemented.", variant: "default" });
      return; // Or send to all for now as a fallback, or disable this option
    } else if (formData.targetUser) {
      targetUserIds = [formData.targetUser];
    }

    if (targetUserIds.length === 0) {
      toast({ title: "No Targets", description: "No users selected or found for notification.", variant: "destructive" });
      return;
    }

    const messageToSend = formData.customMessage || ""; // Or use AI generated message if that flow is separate
    if (!messageToSend) {
      toast({ title: "Error", description: "Message content cannot be empty.", variant: "destructive" });
      return;
    }

    await sendNotificationMutation.mutateAsync({
      targetUserIds,
      message: messageToSend,
      type: formData.messageType, // 'contributionReminder', 'emergencyRequestUpdate', 'general'
      // link: formData.link, // Add a link field to your NotificationFormValues if needed
    });
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
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['approvedUsersForNotifications'] })} className="mt-2 text-blue-500">Try again</button>
      </div>
    );
  }
  // The NotificationSender component itself needs to be adapted to call this handleSendNotification
  // Or this tab directly renders the form and uses the mutation.
  // For now, assuming NotificationSender is primarily the UI form and this tab orchestrates.
  // Let's pass users to NotificationSender and it can call the mutation.

  return <NotificationSender users={users || []} onSend={handleSendNotification} isSending={sendNotificationMutation.isPending} />;
}
