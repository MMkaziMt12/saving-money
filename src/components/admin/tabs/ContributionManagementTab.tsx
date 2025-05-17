
"use client";

import React, { useCallback } from "react";
import type { Profile } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { ContributionManagement } from "@/components/admin/ContributionManagement";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { AddContributionFormValues } from "@/components/admin/ContributionManagement";
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
import { createClient } from "@/lib/supabase/client"; // For mutations & client-side fetches

export function ContributionManagementTab() {
  const { toast } = useToast();
  const { profile: adminProfile } = useAuth();
  const queryClient = useQueryClient();
  const supabase = createClient(); // Client for client-side operations

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

  const addContributionMutation = useMutation<AddedContributionId[], Error, AddContributionFormValues>({
    mutationFn: (formData) => {
      if (!adminProfile?.id) {
        const err = new Error("Admin profile not found for recording contribution.");
        console.error(err);
        throw err;
      }
      // Pass client-side supabase for mutation
      return addContributionsAdmin(supabase, { formData, adminProfileId: adminProfile.id });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminContributions'] });
      queryClient.invalidateQueries({ queryKey: ['userContributionsForDashboard', variables.userId] }); 
      queryClient.invalidateQueries({ queryKey: ['allUserContributionsForStatus', variables.userId]});
      queryClient.invalidateQueries({ queryKey: ['totalFamilySavings']}); 
      queryClient.invalidateQueries({ queryKey: ["userProfileForAdmin", variables.userId] }); 
      queryClient.invalidateQueries({ queryKey: ["userContributionsForAdmin", variables.userId] });
      toast({ title: "Success", description: `${variables.numberOfMonths} contribution(s) recorded for ${users?.find(u => u.id === variables.userId)?.full_name}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error adding contribution(s)", description: error.message, variant: "destructive" });
    },
  });

  const handleAddContribution = useCallback(async (formData: AddContributionFormValues) => {
    await addContributionMutation.mutateAsync(formData);
  }, [addContributionMutation]);

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
          if (usersErrorObj) refetchUsers();
          if (contributionsErrorObj) refetchContributions();
        }} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" /> Try again
        </Button>
      </div>
    );
  }

  return (
    <ContributionManagement
      users={users || []}
      contributions={contributions || []}
      onAddContribution={handleAddContribution}
    />
  );
}
