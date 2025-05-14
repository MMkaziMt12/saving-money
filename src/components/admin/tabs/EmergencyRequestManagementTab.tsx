
"use client";

import { useState, useEffect, useCallback } from "react";
import type { EmergencyRequest, Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EmergencyRequestManagementTable } from "@/components/admin/EmergencyRequestManagementTable";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function EmergencyRequestManagementTab() {
  const supabase = createClient();
  const { toast } = useToast();
  const { profile: adminProfile } = useAuth();

  const [requests, setRequests] = useState<EmergencyRequest[]>([]);
  const [users, setUsers] = useState<Profile[]>([]); // To map user_id to user_name
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name');
    if (error) {
      toast({ title: "Error fetching users", description: error.message, variant: "destructive" });
      return [];
    }
    return data || [];
  }, [supabase, toast]);

  const fetchEmergencyRequests = useCallback(async () => {
    // Fetch requests and enrich with user and admin names
    const { data: rawRequests, error } = await supabase
      .from('emergency_requests')
      .select(`
        *,
        profile_user:profiles!emergency_requests_user_id_fkey(full_name),
        profile_admin:profiles!emergency_requests_reviewed_by_admin_id_fkey(full_name)
      `)
      .order('requested_at', { ascending: false });

    if (error) {
      toast({ title: "Error fetching emergency requests", description: error.message, variant: "destructive" });
      return [];
    }
    
    const enrichedRequests = rawRequests?.map(req => ({
        ...req,
        user_name: (req.profile_user as unknown as Profile)?.full_name || req.user_id,
        reviewed_by_admin_name: (req.profile_admin as unknown as Profile)?.full_name || req.reviewed_by_admin_id,
    })) || [];
    
    return enrichedRequests;

  }, [supabase, toast]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const fetchedUsers = await fetchUsers();
    const fetchedRequests = await fetchEmergencyRequests();
    setUsers(fetchedUsers);
    setRequests(fetchedRequests as EmergencyRequest[]);
    setIsLoading(false);
  }, [fetchUsers, fetchEmergencyRequests]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApproveRequest = async (requestId: string) => {
    if (!adminProfile) {
      toast({ title: "Error", description: "Admin profile not found.", variant: "destructive"});
      return;
    }
    const { error } = await supabase
      .from('emergency_requests')
      .update({ 
        status: 'approved', 
        reviewed_by_admin_id: adminProfile.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString() 
      })
      .eq('id', requestId);

    if (error) {
      toast({ title: "Error approving request", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Emergency request approved." });
      loadData(); // Re-fetch to update list
    }
  };

  const handleRejectRequest = async (requestId: string) => {
     if (!adminProfile) {
      toast({ title: "Error", description: "Admin profile not found.", variant: "destructive"});
      return;
    }
    const { error } = await supabase
      .from('emergency_requests')
      .update({ 
        status: 'rejected', 
        reviewed_by_admin_id: adminProfile.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()  
      })
      .eq('id', requestId);

    if (error) {
      toast({ title: "Error rejecting request", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Emergency request rejected." });
      loadData(); // Re-fetch to update list
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading emergency requests...</p>
      </div>
    );
  }

  return (
    <EmergencyRequestManagementTable 
      requests={requests} 
      users={users} 
      onApproveRequest={handleApproveRequest} 
      onRejectRequest={handleRejectRequest} 
    />
  );
}
