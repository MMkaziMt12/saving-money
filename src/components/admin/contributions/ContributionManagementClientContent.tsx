
"use client";

import React, { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { ContributionManagement } from "@/components/admin/ContributionManagement";
import type { AddContributionFormValues } from "@/components/admin/ContributionManagement";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { 
  fetchAdminProfilesForContributions, 
  fetchAdminContributions, 
  addContributionsAdmin,
  type AdminProfileForContribution,
  type AdminContribution,
  type AddedContributionId
} from "@/lib/api/admin";
import { createClient as createClientComponentClient } from "@/lib/supabase/client";

export function ContributionManagementClientContent() {
  const { toast } = useToast();
  const { profile: adminProfile } = useAuth();
  const queryClient = useQueryClient();
  const supabase = createClientComponentClient();

  const { 
    data: users, 
    isLoading: isLoadingUsers, 
    isError: isUsersError,
    error: usersErrorObj,
    refetch: refetchUsers
  } = useQuery<AdminProfileForContribution[], Error>({
    queryKey: ['adminProfilesForContributions'],
    queryFn: () => fetchAdminProfilesForContributions(supabase),
  });

  const { 
    data: contributions, 
    isLoading: isLoadingContributions, 
    isError: isContributionsError,
    error: contributionsErrorObj,
    refetch: refetchContributions
  } = useQuery<AdminContribution[], Error>({
    queryKey: ['adminContributions'],
    queryFn: () => fetchAdminContributions(supabase),
  });

  const addContributionMutation = useMutation<AddedContributionId[], Error, { formData: AddContributionFormValues; adminProfileId: string }>({
    mutationFn: (payload) => addContributionsAdmin(supabase, payload),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminContributions'] });
      // Invalidate queries that might be affected on other pages
      queryClient.invalidateQueries({ queryKey: ['userContributionsForDashboard', variables.formData.userId] }); 
      queryClient.invalidateQueries({ queryKey: ['allUserContributionsForStatus', variables.formData.userId]});
      queryClient.invalidateQueries({ queryKey: ['totalFamilySavings']}); // Global fund balance
      queryClient.invalidateQueries({ queryKey: ["userProfileForAdmin", variables.formData.userId] }); 
      queryClient.invalidateQueries({ queryKey: ["userContributionsForAdmin", variables.formData.userId] });
      toast({ title: "Success", description: `${variables.formData.numberOfMonths} contribution(s) recorded for ${users?.find(u => u.id === variables.formData.userId)?.full_name}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error adding contribution(s)", description: error.message, variant: "destructive" });
    },
  });

  const handleAddContribution = useCallback(async (formData: AddContributionFormValues) => {
    if (!adminProfile?.id) {
      toast({ title: "Error", description: "Admin profile ID not found.", variant: "destructive" });
      throw new Error("Admin profile ID not found."); // Ensure mutation's onError is triggered
    }
    // The mutation's isPending can be used for form disabling in ContributionManagement
    await addContributionMutation.mutateAsync({ formData, adminProfileId: adminProfile.id });
  }, [addContributionMutation, adminProfile, toast, users]);

  const combinedIsLoading = (isLoadingUsers && !users) || (isLoadingContributions && !contributions);
  const combinedError = usersErrorObj || contributionsErrorObj;

  if (combinedIsLoading && !combinedError) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading contributions data...</p>
      </div>
    );
  }

  if (combinedError && (!users || !contributions)) {
     return (
      <div className="flex flex-col items-center justify-center py-10 text-center px-4">
        <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
        <p className="text-destructive mb-2">Error loading data for contributions.</p>
        <p className="text-sm text-muted-foreground mb-4">{combinedError.message || "An unknown error occurred."}</p>
        <Button onClick={() => {
          if (isUsersError) refetchUsers();
          if (isContributionsError) refetchContributions();
        }} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" /> Try again
        </Button>
      </div>
    );
  }
  
  // Ensure users and contributions are not undefined before passing to ContributionManagement
  // This should be guaranteed by the loading/error states above, but defensive check doesn't hurt.
  if (!users || !contributions) {
     return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Finalizing data...</p>
      </div>
    );
  }

  return (
    <ContributionManagement
      users={users}
      contributions={contributions}
      onAddContribution={handleAddContribution}
    />
  );
}
