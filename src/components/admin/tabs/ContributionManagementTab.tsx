
"use client";

import type { MonthlyContribution, Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ContributionManagement } from "@/components/admin/ContributionManagement";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { AddContributionFormValues } from "@/components/admin/ContributionManagement";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";

const supabase = createClient();

async function fetchAdminProfiles(): Promise<Pick<Profile, 'id' | 'full_name' | 'email' | 'is_approved'>[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_approved') // Specific columns
    .order('full_name', { ascending: true });
  if (error) {
    console.error("Error fetching admin profiles for contributions:", error);
    throw error; // Propagate error
  }
  return data || [];
}

async function fetchAdminContributions(): Promise<MonthlyContribution[]> {
  const { data: rawContributions, error } = await supabase
    .from('monthly_contributions')
    .select(`
      id, user_id, payment_date, month, year, amount, recorded_by_admin_id,
      profile_user:profiles!monthly_contributions_user_id_fkey(full_name),
      profile_admin:profiles!monthly_contributions_recorded_by_admin_id_fkey(full_name)
    `) // Specific columns from contributions and joined tables
    .order('payment_date', { ascending: false });
  if (error) {
    console.error("Error fetching admin contributions:", error);
    throw error; // Propagate error
  }

  return rawContributions?.map(c => ({
    ...c,
    user_name: (c.profile_user as Pick<Profile, 'full_name'>)?.full_name || c.user_id,
    recorded_by_admin_name: (c.profile_admin as Pick<Profile, 'full_name'>)?.full_name || c.recorded_by_admin_id,
  })) || [];
}

type AddContributionPayload = {
  formData: AddContributionFormValues;
  adminProfileId: string;
};

async function addContributions({ formData, adminProfileId }: AddContributionPayload): Promise<MonthlyContribution[]> {
  const contributionsToInsert = [];
  let currentMonth = formData.month;
  let currentYear = formData.year;

  for (let i = 0; i < formData.numberOfMonths; i++) {
    contributionsToInsert.push({
      user_id: formData.userId,
      amount: MONTHLY_CONTRIBUTION_AMOUNT,
      payment_date: formData.paymentDate.toISOString(),
      month: currentMonth,
      year: currentYear,
      recorded_by_admin_id: adminProfileId,
      // created_at and updated_at are handled by Supabase defaults
    });

    currentMonth += 1;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear += 1;
    }
  }

  const { data, error } = await supabase
    .from('monthly_contributions')
    .insert(contributionsToInsert)
    .select('id, user_id, payment_date, month, year, amount, recorded_by_admin_id') // Select specific columns
    .returns<MonthlyContribution[]>(); // Ensure correct return type

  if (error) {
    console.error("Error adding contribution(s):", error);
    throw error; // Propagate error
  }
  if (!data) throw new Error("Failed to add contribution(s), no data returned.");
  return data;
}


export function ContributionManagementTab() {
  const { toast } = useToast();
  const { profile: adminProfile } = useAuth();
  const queryClient = useQueryClient();

  const { 
    data: users, 
    isLoading: isLoadingUsers, 
    error: usersError,
    refetch: refetchUsers
  } = useQuery<Pick<Profile, 'id' | 'full_name' | 'email' | 'is_approved'>[], Error>({
    queryKey: ['adminProfilesForContributions'],
    queryFn: fetchAdminProfiles,
  });

  const { 
    data: contributions, 
    isLoading: isLoadingContributions, 
    error: contributionsError,
    refetch: refetchContributions
  } = useQuery<MonthlyContribution[], Error>({
    queryKey: ['adminContributions'],
    queryFn: fetchAdminContributions,
  });

  const addContributionMutation = useMutation<MonthlyContribution[], Error, AddContributionFormValues>({
    mutationFn: (formData) => {
      if (!adminProfile?.id) {
        const err = new Error("Admin profile not found for recording contribution.");
        console.error(err);
        throw err;
      }
      return addContributions({ formData, adminProfileId: adminProfile.id });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminContributions'] });
      queryClient.invalidateQueries({ queryKey: ['userContributions', variables.userId] }); 
      queryClient.invalidateQueries({ queryKey: ['allUserContributionsForTotal', variables.userId]}); 
      queryClient.invalidateQueries({ queryKey: ['totalFamilySavings']}); 
      queryClient.invalidateQueries({ queryKey: ["userProfile", variables.userId] }); // Invalidate user detail page contributions
      toast({ title: "Success", description: `${variables.numberOfMonths} contribution(s) for ${MONTHLY_CONTRIBUTION_AMOUNT} each recorded for ${users?.find(u => u.id === variables.userId)?.full_name}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error adding contribution(s)", description: error.message, variant: "destructive" });
    },
  });

  const handleAddContribution = useCallback(async (formData: AddContributionFormValues) => {
    await addContributionMutation.mutateAsync(formData);
  }, [addContributionMutation]);

  if ((isLoadingUsers && !users) || (isLoadingContributions && !contributions)) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading contributions data...</p>
      </div>
    );
  }

  const queryError = usersError || contributionsError;
  if (queryError) {
     return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
        <p className="text-destructive mb-2">Error loading data.</p>
        <p className="text-sm text-muted-foreground mb-4">{queryError.message}</p>
        <Button onClick={() => {
          if (usersError) refetchUsers();
          if (contributionsError) refetchContributions();
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
