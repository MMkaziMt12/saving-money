
"use client";

import { useMemo, useState, useCallback } from "react";
import type { EmergencyRequest, Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EmergencyRequestManagementTable } from "@/components/admin/EmergencyRequestManagementTable";
import { Loader2, Search, RefreshCw, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { parseISO, isPast } from "date-fns";

const supabase = createClient();
const ITEMS_PER_PAGE_REQUESTS = 10;

type AdminProfileForEmergency = Pick<Profile, 'id' | 'full_name'>;

async function fetchAdminProfilesForEmergency(): Promise<AdminProfileForEmergency[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name');
  if (error) {
    console.error("Error fetching admin profiles for emergency:", JSON.stringify(error, null, 2));
    throw error;
  }
  return data || [];
}

type AdminEmergencyRequest = EmergencyRequest & {
  user_name?: string;
  reviewed_by_admin_name?: string;
};

async function fetchAdminEmergencyRequests(): Promise<AdminEmergencyRequest[]> {
  const { data: rawRequests, error } = await supabase
    .from('emergency_requests')
    .select(`
      id, user_id, amount_requested, reason, status, requested_at, return_date,
      amount_returned, is_fully_repaid, last_return_date, admin_notes, reviewed_at, reviewed_by_admin_id,
      profile_user:profiles!emergency_requests_user_id_fkey(full_name),
      profile_admin:profiles!emergency_requests_reviewed_by_admin_id_fkey(full_name)
    `)
    .order('requested_at', { ascending: false });

  if (error) {
    console.error("Error fetching admin emergency requests:", JSON.stringify(error, null, 2));
    throw error;
  }
  
  const typedData = rawRequests as (EmergencyRequest & {
    profile_user: { full_name: string | null } | null;
    profile_admin: { full_name: string | null } | null;
  })[] | null;

  return typedData?.map(req => ({
      ...req,
      user_name: req.profile_user?.full_name,
      reviewed_by_admin_name: req.profile_admin?.full_name,
  })) || [];
}

type UpdateRequestPayload = {
  requestId: string;
  status: 'approved' | 'rejected';
  adminProfileId: string;
};

type UpdatedRequestStatus = Pick<EmergencyRequest, 'id' | 'status' | 'user_id'>;

async function updateEmergencyRequestStatus({ requestId, status, adminProfileId }: UpdateRequestPayload): Promise<UpdatedRequestStatus> {
  const { data, error } = await supabase
    .from('emergency_requests')
    .update({ 
      status, 
      reviewed_by_admin_id: adminProfileId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString() 
    })
    .eq('id', requestId)
    .select('id, status, user_id')
    .single();
  if (error) {
    console.error("Error updating emergency request status:", JSON.stringify(error, null, 2));
    throw error;
  }
  if (!data) throw new Error("Failed to update request, no data returned.");
  return data; 
}

type RecordRepaymentPayload = {
  requestId: string;
  amountRepaid: number;
  repaymentDate: Date;
  adminProfileId: string; 
};

type RecordedRepaymentResult = Pick<EmergencyRequest, 'id' | 'user_id' | 'amount_returned' | 'is_fully_repaid' | 'last_return_date'>;

async function recordRepayment({ requestId, amountRepaid, repaymentDate }: RecordRepaymentPayload): Promise<RecordedRepaymentResult> {
  const { data: existingRequest, error: fetchError } = await supabase
    .from('emergency_requests')
    .select('amount_requested, amount_returned, user_id')
    .eq('id', requestId)
    .single();

  if (fetchError || !existingRequest) {
    console.error("Error fetching existing request for repayment:", JSON.stringify(fetchError, null, 2));
    throw fetchError || new Error("Could not find existing request to record repayment.");
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
    .select('id, user_id, amount_returned, is_fully_repaid, last_return_date')
    .single();

  if (error) {
    console.error("Error recording repayment:", JSON.stringify(error, null, 2));
    throw error;
  }
  if (!data) throw new Error("Failed to record repayment, no data returned.");
  return data;
}


export function EmergencyRequestManagementTab() {
  const { toast } = useToast();
  const { profile: adminProfile } = useAuth();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const { 
    data: users, 
    isLoading: isLoadingUsers, 
    isError: isUsersError,
    error: usersErrorObj,
    refetch: refetchUsers
  } = useQuery<AdminProfileForEmergency[], Error>({
    queryKey: ['adminProfilesForEmergency'],
    queryFn: fetchAdminProfilesForEmergency,
  });

  const { 
    data: requests, 
    isLoading: isLoadingRequests, 
    isError: isRequestsError,
    error: requestsErrorObj,
    refetch: refetchRequests
  } = useQuery<AdminEmergencyRequest[], Error>({
    queryKey: ['adminEmergencyRequests'],
    queryFn: fetchAdminEmergencyRequests,
  });

  const updateRequestMutation = useMutation<UpdatedRequestStatus, Error, UpdateRequestPayload>({
    mutationFn: updateEmergencyRequestStatus,
    onSuccess: (updatedRequestData, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminEmergencyRequests'] });
      queryClient.invalidateQueries({ queryKey: ['allFamilyEmergencyRequests'] }); 
      queryClient.invalidateQueries({ queryKey: ['totalFamilySavings'] }); 
      queryClient.invalidateQueries({ queryKey: ['totalFamilySavingsForRequestForm'] }); 
      queryClient.invalidateQueries({ queryKey: ['currentUserActiveEmergencyRequests', updatedRequestData.user_id]}); 
      queryClient.invalidateQueries({ queryKey: ["emergencyRequestDetails", variables.requestId] });
      queryClient.invalidateQueries({ queryKey: ["userEmergencyRequestsForAdmin", updatedRequestData.user_id] }); 
      toast({ title: "Success", description: `Emergency request ${updatedRequestData.status}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error updating request", description: error.message, variant: "destructive" });
    },
  });

  const recordRepaymentMutation = useMutation<RecordedRepaymentResult, Error, RecordRepaymentPayload>({
    mutationFn: recordRepayment,
    onSuccess: (updatedRequestData, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminEmergencyRequests'] });
      queryClient.invalidateQueries({ queryKey: ['allFamilyEmergencyRequests'] });
      queryClient.invalidateQueries({ queryKey: ['totalFamilySavings'] });
      queryClient.invalidateQueries({ queryKey: ['totalFamilySavingsForRequestForm'] });
      queryClient.invalidateQueries({ queryKey: ['currentUserActiveEmergencyRequests', updatedRequestData.user_id]});
      queryClient.invalidateQueries({ queryKey: ["emergencyRequestDetails", variables.requestId] });
      queryClient.invalidateQueries({ queryKey: ["userEmergencyRequestsForAdmin", updatedRequestData.user_id] });
      const repaidThisTime = variables.amountRepaid;
      toast({ title: "Success", description: `Repayment of ${repaidThisTime.toLocaleString()} recorded.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error recording repayment", description: error.message, variant: "destructive" });
    },
  });

  const handleUpdateRequest = useCallback((requestId: string, status: 'approved' | 'rejected') => {
    if (!adminProfile?.id) {
      toast({ title: "Error", description: "Admin profile not found.", variant: "destructive"});
      return;
    }
    updateRequestMutation.mutate({ requestId, status, adminProfileId: adminProfile.id });
  }, [adminProfile, updateRequestMutation, toast]);

  const handleRecordRepayment = useCallback(async (requestId: string, amountRepaid: number, repaymentDate: Date) => {
    if (!adminProfile?.id) {
      toast({ title: "Error", description: "Admin profile not found.", variant: "destructive" });
      throw new Error("Admin profile not found");
    }
    await recordRepaymentMutation.mutateAsync({ requestId, amountRepaid, repaymentDate, adminProfileId: adminProfile.id });
  }, [adminProfile, recordRepaymentMutation, toast]);


  const filteredRequests = useMemo(() => {
    if (!requests || !users) return [];
    return requests.filter(req => {
      const userName = users.find(u => u.id === req.user_id)?.full_name || "";
      const searchTermLower = searchTerm.toLowerCase();
      return (
        userName.toLowerCase().includes(searchTermLower) ||
        req.reason.toLowerCase().includes(searchTermLower) ||
        req.status?.toLowerCase().includes(searchTermLower) ||
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

  const combinedIsLoading = (isLoadingUsers && !users && !isUsersError) || (isLoadingRequests && !requests && !isRequestsError);
  const combinedError = usersErrorObj || requestsErrorObj;

  if (combinedIsLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading emergency requests data...</p>
      </div>
    );
  }

  if (combinedError && (!users || !requests)) {
     return (
      <div className="flex flex-col items-center justify-center py-10 text-center px-4">
        <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
        <p className="text-destructive mb-2">Error loading data for emergency requests.</p>
        <p className="text-sm text-muted-foreground mb-4">{combinedError.message || "An unknown error occurred."}</p>
        <Button onClick={() => {
          if(usersErrorObj) refetchUsers();
          if(requestsErrorObj) refetchRequests();
        }} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" /> Try again
        </Button>
      </div>
    );
  }
  
  const showUsersLoader = isLoadingUsers && !!users; 
  const showRequestsLoader = isLoadingRequests && !!requests; 

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
          disabled={showUsersLoader || showRequestsLoader}
        />
      </div>
       {(showUsersLoader || showRequestsLoader) && (
         <div className="py-4 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2"/> Refreshing request list...
        </div>
       )}
      <div className="overflow-x-auto rounded-md border">
        <EmergencyRequestManagementTable 
          requests={paginatedRequests} 
          users={users || []} 
          onApproveRequest={handleUpdateRequest} 
          onRecordRepayment={handleRecordRepayment}
        />
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-end space-x-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1 || showUsersLoader || showRequestsLoader}
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
            disabled={currentPage === totalPages || showUsersLoader || showRequestsLoader}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
