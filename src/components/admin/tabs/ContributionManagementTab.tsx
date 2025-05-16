
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

type AdminProfileForContribution = Pick<Profile, 'id' | 'full_name' | 'email' | 'is_approved'>;

async function fetchAdminProfiles(): Promise<AdminProfileForContribution[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_approved')
    .order('full_name', { ascending: true });
  if (error) {
    console.error("Error fetching admin profiles for contributions:", JSON.stringify(error, null, 2));
    throw error;
  }
  return data || [];
}

type AdminContribution = MonthlyContribution & {
  user_name?: string;
  recorded_by_admin_name?: string;
};

async function fetchAdminContributions(): Promise<AdminContribution[]> {
  const { data: rawContributions, error } = await supabase
    .from('monthly_contributions')
    .select(`
      id, user_id, payment_date, month, year, amount, recorded_by_admin_id,
      profile_user:profiles!monthly_contributions_user_id_fkey(full_name),
      profile_admin:profiles!monthly_contributions_recorded_by_admin_id_fkey(full_name)
    `)
    .order('payment_date', { ascending: false });

  if (error) {
    console.error("Error fetching admin contributions:", JSON.stringify(error, null, 2));
    throw error;
  }

  const typedData = rawContributions as (Pick<Tables<'monthly_contributions'>, 'id' | 'payment_date' | 'month' | 'year' | 'amount'> & {
    user_id: string;
    recorded_by_admin_id: string | null;
    profile_user: { full_name: string | null } | null;
    profile_admin: { full_name: string | null } | null;
  })[] | null;

  return typedData?.map(c => ({
    ...c,
    user_name: c.profile_user?.full_name, // Use undefined if null
    recorded_by_admin_name: c.profile_admin?.full_name, // Use undefined if null
  })) || [];
}

type AddContributionPayload = {
  formData: AddContributionFormValues;
  adminProfileId: string;
};

type AddedContributionId = Pick<MonthlyContribution, 'id'>;

async function addContributions({ formData, adminProfileId }: AddContributionPayload): Promise<AddedContributionId[]> {
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
    .select('id')
    .returns<AddedContributionId[]>();

  if (error) {
    console.error("Error adding contribution(s):", JSON.stringify(error, null, 2));
    throw error;
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
    isError: isUsersError,
    error: usersErrorObj,
    refetch: refetchUsers
  } = useQuery<AdminProfileForContribution[], Error>({
    queryKey: ['adminProfilesForContributions'],
    queryFn: fetchAdminProfiles,
  });

  const { 
    data: contributions, 
    isLoading: isLoadingContributions, 
    isError: isContributionsError,
    error: contributionsErrorObj,
    refetch: refetchContributions
  } = useQuery<AdminContribution[], Error>({
    queryKey: ['adminContributions'],
    queryFn: fetchAdminContributions,
  });

  const addContributionMutation = useMutation<AddedContributionId[], Error, AddContributionFormValues>({
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
      queryClient.invalidateQueries({ queryKey: ['allUserContributionsForStatus', variables.userId]});
      queryClient.invalidateQueries({ queryKey: ['totalFamilySavings']}); 
      queryClient.invalidateQueries({ queryKey: ["userProfile", variables.userId] }); 
      toast({ title: "Success", description: `${variables.numberOfMonths} contribution(s) for ${MONTHLY_CONTRIBUTION_AMOUNT} each recorded for ${users?.find(u => u.id === variables.userId)?.full_name}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error adding contribution(s)", description: error.message, variant: "destructive" });
    },
  });

  const handleAddContribution = useCallback(async (formData: AddContributionFormValues) => {
    await addContributionMutation.mutateAsync(formData);
  }, [addContributionMutation]);

  const combinedIsLoading = (isLoadingUsers && !users && !isUsersError) || (isLoadingContributions && !contributions && !isContributionsError);
  const combinedError = usersErrorObj || contributionsErrorObj;

  if (combinedIsLoading) {
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
        <p className="text-sm text-muted-foreground mb-4">{combinedError.message}</p>
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
      isLoadingUsers={isLoadingUsers && !!users}
      isErrorUsers={isUsersError}
      usersErrorMsg={usersErrorObj?.message}
      isLoadingContributions={isLoadingContributions && !!contributions}
      isErrorContributions={isContributionsError}
      contributionsErrorMsg={contributionsErrorObj?.message}
    />
  );
}
