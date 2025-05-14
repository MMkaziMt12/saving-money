
"use client";

import type { Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { NotificationSender } from "@/components/admin/NotificationSender";
import { Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const supabase = createClient();

async function fetchUsersForNotifications(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_approved')
    .eq('is_approved', true)
    .order('full_name', { ascending: true });
  if (error) throw new Error(`Error fetching users for notifications: ${error.message}`);
  return data || [];
}

export function NotificationSenderTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users, isLoading, error } = useQuery<Profile[], Error>({
    queryKey: ['approvedUsersForNotifications'],
    queryFn: fetchUsersForNotifications,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading user data for notifications...</p>
      </div>
    );
  }

  if (error) {
     return (
      <div className="flex flex-col items-center justify-center py-10">
        <p className="text-destructive">Error fetching users: {error.message}</p>
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['approvedUsersForNotifications'] })} className="mt-2 text-blue-500">Try again</button>
      </div>
    );
  }

  return <NotificationSender users={users || []} />;
}
