
"use client";

import React, { useMemo, useState, useCallback } from "react";
import type { Profile } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { EmergencyRequestManagementTable } from "@/components/admin/EmergencyRequestManagementTable";
import { Loader2, Search, RefreshCw, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { parseISO, isPast } from "date-fns";
import { 
  fetchAdminProfilesForEmergency, 
  fetchAdminEmergencyRequests, 
  updateEmergencyRequestStatusAdmin, 
  recordRepaymentAdmin,
  type AdminProfileForEmergency,
  type AdminEmergencyRequest,
  type UpdateRequestPayloadAdmin,
  type UpdatedRequestStatusAdmin,
  type RecordRepaymentPayloadAdmin,
  type RecordedRepaymentResultAdmin
} from "@/lib/api/admin";
import { createClient } from "@/lib/supabase/client"; // For mutations & client-side fetches

const ITEMS_PER_PAGE_REQUESTS = 10;

export function EmergencyRequestManagementTab() {
  const { toast } = useToast();
  const { profile: adminProfile } = useAuth();
  const queryClient = useQueryClient();
  const supabase = createClient(); // Client for client-side operations

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
    queryFn: () => fetchAdminProfilesForEmergency(supabase),
  });

  const { 
    data: requests, 
    isLoading: isLoadingRequests, 
    isError: isRequestsError,
    error: requestsErrorObj,
    refetch: refetchRequests
  } = useQuery<AdminEmergencyRequest[], Error>({
    queryKey: ['adminEmergencyRequests'],
    queryFn: () => fetchAdminEmergencyRequests(supabase),
  });

  const updateRequestMutation = useMutation<UpdatedRequestStatusAdmin, Error, UpdateRequestPayloadAdmin>({
    mutationFn: (payload) => updateEmergencyRequestStatusAdmin(supabase, payload), // Pass client-side supabase
    onSuccess: (updatedRequestData, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminEmergencyRequests'] });
      queryClient.invalidateQueries({ queryKey: ['allFamilyEmergencyRequestsForDashboard'] }); 
      queryClient.invalidateQueries({ queryKey: ['totalFamilySavings'] }); 
      queryClient.invalidateQueries({ queryKey: ['currentUserActiveEmergencyRequests', updatedRequestData.user_id]}); 
      queryClient.invalidateQueries({ queryKey: ["emergencyRequestDetails", variables.requestId] });
      queryClient.invalidateQueries({ queryKey: ["userEmergencyRequestsForAdminDetail", updatedRequestData.user_id] }); 
      toast({ title: "Success", description: `Emergency request ${updatedRequestData.status}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error updating request", description: error.message, variant: "destructive" });
    },
  });

  const recordRepaymentMutation = useMutation<RecordedRepaymentResultAdmin, Error, RecordRepaymentPayloadAdmin>({
    mutationFn: (payload) => recordRepaymentAdmin(supabase, payload), // Pass client-side supabase
    onSuccess: (updatedRequestData, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminEmergencyRequests'] });
      queryClient.invalidateQueries({ queryKey: ['allFamilyEmergencyRequestsForDashboard'] });
      queryClient.invalidateQueries({ queryKey: ['totalFamilySavings'] });
      queryClient.invalidateQueries({ queryKey: ['currentUserActiveEmergencyRequests', updatedRequestData.user_id]});
      queryClient.invalidateQueries({ queryKey: ["emergencyRequestDetails", variables.requestId] });
      queryClient.invalidateQueries({ queryKey: ["userEmergencyRequestsForAdminDetail", updatedRequestData.user_id] });
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

  const combinedIsLoading = (isLoadingUsers && !users) || (isLoadingRequests && !requests);
  const combinedError = usersErrorObj || requestsErrorObj;

  if (combinedIsLoading && !combinedError) {
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
