
"use client";

import { useMemo, useState } from "react";
import type { EmergencyRequest, Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EmergencyRequestManagementTable } from "@/components/admin/EmergencyRequestManagementTable";
import { Loader2, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import { format, formatDistanceToNow, parseISO, isPast } from "date-fns";

const supabase = createClient();
const ITEMS_PER_PAGE_REQUESTS = 10;

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
      user_name: req.profile_user?.full_name || req.user_id,
      reviewed_by_admin_name: req.profile_admin?.full_name || req.reviewed_by_admin_id,
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

type RecordRepaymentPayload = {
  requestId: string;
  amountRepaid: number;
  repaymentDate: Date;
  adminProfileId: string;
};

async function recordRepayment({ requestId, amountRepaid, repaymentDate, adminProfileId }: RecordRepaymentPayload): Promise<EmergencyRequest> {
  const { data: existingRequest, error: fetchError } = await supabase
    .from('emergency_requests')
    .select('amount_requested, amount_returned')
    .eq('id', requestId)
    .single();

  if (fetchError || !existingRequest) {
    throw new Error(fetchError?.message || "Could not find existing request to record repayment.");
  }

  const currentAmountReturned = existingRequest.amount_returned || 0;
  const newAmountReturned = currentAmountReturned + amountRepaid;
  const isFullyRepaid = newAmountReturned >= (existingRequest.amount_requested || 0);

  const { data, error } = await supabase
    .from('emergency_requests')
    .update({
      amount_returned: newAmountReturned,
      last_return_date: repaymentDate.toISOString(),
      is_fully_repaid: isFullyRepaid,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw new Error(`Error recording repayment: ${error.message}`);
  if (!data) throw new Error("Failed to record repayment, no data returned.");
  return data as EmergencyRequest;
}


export function EmergencyRequestManagementTab() {
  const { toast } = useToast();
  const { profile: adminProfile } = useAuth();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

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
      queryClient.invalidateQueries({ queryKey: ['allFamilyEmergencyRequests'] }); // For dashboard
      queryClient.invalidateQueries({ queryKey: ['totalFamilySavings'] }); // For dashboard
      queryClient.invalidateQueries({ queryKey: ['totalFamilySavingsForRequestForm'] }); // For request page
      toast({ title: "Success", description: `Emergency request ${data.status}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error updating request", description: error.message, variant: "destructive" });
    },
  });

  const recordRepaymentMutation = useMutation<EmergencyRequest, Error, RecordRepaymentPayload>({
    mutationFn: recordRepayment,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminEmergencyRequests'] });
      queryClient.invalidateQueries({ queryKey: ['allFamilyEmergencyRequests'] }); // For dashboard
      queryClient.invalidateQueries({ queryKey: ['totalFamilySavings'] }); // For dashboard
      queryClient.invalidateQueries({ queryKey: ['totalFamilySavingsForRequestForm'] }); // For request page
       const repaidThisTime = variables.amountRepaid;
      toast({ title: "Success", description: `Repayment of ${CURRENCY_SYMBOL}${repaidThisTime.toLocaleString()} recorded.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error recording repayment", description: error.message, variant: "destructive" });
    },
  });


  const handleUpdateRequest = (requestId: string, status: 'approved' | 'rejected') => {
    if (!adminProfile?.id) {
      toast({ title: "Error", description: "Admin profile not found.", variant: "destructive"});
      return;
    }
    updateRequestMutation.mutate({ requestId, status, adminProfileId: adminProfile.id });
  };

  const handleRecordRepayment = async (requestId: string, amountRepaid: number, repaymentDate: Date) => {
    if (!adminProfile?.id) {
      toast({ title: "Error", description: "Admin profile not found.", variant: "destructive" });
      throw new Error("Admin profile not found");
    }
    await recordRepaymentMutation.mutateAsync({ requestId, amountRepaid, repaymentDate, adminProfileId: adminProfile.id });
  };


  const filteredRequests = useMemo(() => {
    if (!requests || !users) return [];
    return requests.filter(req => {
      const userName = users.find(u => u.id === req.user_id)?.full_name || "";
      const searchTermLower = searchTerm.toLowerCase();
      return (
        userName.toLowerCase().includes(searchTermLower) ||
        req.reason.toLowerCase().includes(searchTermLower) ||
        req.status.toLowerCase().includes(searchTermLower) ||
        (req.is_fully_repaid && "repaid".includes(searchTermLower)) ||
        (!req.is_fully_repaid && req.status === 'approved' && req.return_date && isPast(parseISO(req.return_date)) && "overdue".includes(searchTermLower))
      );
    });
  }, [requests, users, searchTerm]);

  const paginatedRequests = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE_REQUESTS;
    return filteredRequests.slice(startIndex, startIndex + ITEMS_PER_PAGE_REQUESTS);
  }, [filteredRequests, currentPage]);

  const totalPages = Math.ceil(filteredRequests.length / ITEMS_PER_PAGE_REQUESTS);

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
        <button onClick={() => queryClient.invalidateQueries({queryKey: ['adminProfilesForEmergency', 'adminEmergencyRequests']})} className="mt-2 text-primary hover:underline">Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input 
          type="search"
          placeholder="Search requests (user, reason, status, overdue, repaid)..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="pl-10 w-full md:w-1/2 lg:w-1/3"
        />
      </div>
      <EmergencyRequestManagementTable 
        requests={paginatedRequests} 
        users={users || []} 
        onApproveRequest={(requestId) => handleUpdateRequest(requestId, 'approved')} 
        onRejectRequest={(requestId) => handleUpdateRequest(requestId, 'rejected')} 
        onRecordRepayment={handleRecordRepayment}
      />
      {totalPages > 1 && (
        <div className="flex items-center justify-end space-x-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
