
"use client";

import { useState, useEffect, useCallback } from "react";
import type { Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { NotificationSender } from "@/components/admin/NotificationSender";
import { Loader2 } from "lucide-react";

export function NotificationSenderTab() {
  const supabase = createClient();
  const { toast } = useToast();

  const [users, setUsers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    // Fetch only approved users for notification purposes usually
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, is_approved') // Fetch necessary fields
      .eq('is_approved', true) // Example: only approved users for notifications
      .order('full_name', { ascending: true });

    if (error) {
      toast({ title: "Error fetching users for notifications", description: error.message, variant: "destructive" });
      setUsers([]);
    } else {
      setUsers(data || []);
    }
    setIsLoading(false);
  }, [supabase, toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading user data for notifications...</p>
      </div>
    );
  }

  return <NotificationSender users={users} />;
}
