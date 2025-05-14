
"use client";

import type { EmergencyRequest, Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EmergencyRequestManagementTable } from "@/components/admin/EmergencyRequestManagementTable";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const supabase = createClient();

async function fetchAdminProfilesForEmergency(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name');
  if (error) throw new Error(`Error fetching users: ${error.message}`);
  return data || [];
}

async function fetchAdminEmergencyRequests(): Promise<EmergencyRequest[]> {
  const { data: rawRequests, error } = await supabase
    .from('emergency_requests')
    .select(`
      *,
      profile_user:profiles!emergency_requests_user_id_fkey(full_name),
      profile_admin:profiles!emergency_requests_reviewed_by_admin_id_fkey(full_name)
    `)
    .order('requested_at', { ascending: false });
  if (error) throw new Error(`Error fetching emergency requests: ${error.message}`);
  
  return rawRequests?.map(req => ({
      ...req,
      user_name: (req.profile_user as unknown as Profile)?.full_name || req.user_id,
      reviewed_by_admin_name: (req.profile_admin as unknown as Profile)?.full_name || req.reviewed_by_admin_id,
  })) || [];
}

type UpdateRequestPayload = {
  requestId: string;
  status: 'approved' | 'rejected';
  adminProfileId: string;
};

async function updateEmergencyRequestStatus({ requestId, status, adminProfileId }: UpdateRequestPayload): Promise<EmergencyRequest> {
  const { data, error } = await supabase
    .from('emergency_requests')
    .update({ 
      status, 
      reviewed_by_admin_id: adminProfileId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString() 
    })
    .eq('id', requestId)
    .select()
    .single();
  if (error) throw new Error(`Error updating request: ${error.message}`);
  if (!data) throw new Error("Failed to update request, no data returned.");
  return data as EmergencyRequest;
}


export function EmergencyRequestManagementTab() {
  const { toast } = useToast();
  const { profile: adminProfile } = useAuth();
  const queryClient = useQueryClient();

  const { data: users, isLoading: isLoadingUsers, error: usersError } = useQuery<Profile[], Error>({
    queryKey: ['adminProfilesForEmergency'],
    queryFn: fetchAdminProfilesForEmergency,
  });

  const { data: requests, isLoading: isLoadingRequests, error: requestsError } = useQuery<EmergencyRequest[], Error>({
    queryKey: ['adminEmergencyRequests'],
    queryFn: fetchAdminEmergencyRequests,
  });

  const updateRequestMutation = useMutation<EmergencyRequest, Error, UpdateRequestPayload>({
    mutationFn: updateEmergencyRequestStatus,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['adminEmergencyRequests'] });
      toast({ title: "Success", description: `Emergency request ${data.status}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error updating request", description: error.message, variant: "destructive" });
    },
  });

  const handleUpdateRequest = (requestId: string, status: 'approved' | 'rejected') => {
    if (!adminProfile?.id) {
      toast({ title: "Error", description: "Admin profile not found.", variant: "destructive"});
      return;
    }
    updateRequestMutation.mutate({ requestId, status, adminProfileId: adminProfile.id });
  };

  const isLoading = isLoadingUsers || isLoadingRequests;
  const queryError = usersError || requestsError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading emergency requests data...</p>
      </div>
    );
  }

  if (queryError) {
     return (
      <div className="flex flex-col items-center justify-center py-10">
        <p className="text-destructive">Error: {queryError.message}</p>
        <button onClick={() => queryClient.invalidateQueries()} className="mt-2 text-blue-500">Try again</button>
      </div>
    );
  }

  return (
    <EmergencyRequestManagementTable 
      requests={requests || []} 
      users={users || []} 
      onApproveRequest={(requestId) => handleUpdateRequest(requestId, 'approved')} 
      onRejectRequest={(requestId) => handleUpdateRequest(requestId, 'rejected')} 
    />
  );
}
