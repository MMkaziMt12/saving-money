
"use client";

import type { MonthlyContribution, Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ContributionManagement } from "@/components/admin/ContributionManagement";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { AddContributionFormValues } from "@/components/admin/ContributionManagement"; // Ensure this type matches the form
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants"; // Import constant

const supabase = createClient();

async function fetchAdminProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name', { ascending: true });
  if (error) throw new Error(`Error fetching users: ${error.message}`);
  return data || [];
}

async function fetchAdminContributions(): Promise<MonthlyContribution[]> {
  const { data: rawContributions, error } = await supabase
    .from('monthly_contributions')
    .select(`
      *,
      profile_user:profiles!monthly_contributions_user_id_fkey(full_name),
      profile_admin:profiles!monthly_contributions_recorded_by_admin_id_fkey(full_name)
    `)
    .order('payment_date', { ascending: false });
  if (error) throw new Error(`Error fetching contributions: ${error.message}`);

  return rawContributions?.map(c => ({
    ...c,
    user_name: (c.profile_user as unknown as Profile)?.full_name || c.user_id,
    recorded_by_admin_name: (c.profile_admin as unknown as Profile)?.full_name || c.recorded_by_admin_id,
  })) || [];
}

type AddContributionPayload = {
  formData: AddContributionFormValues; // This now contains totalAmountReceived and numberOfMonths
  adminProfileId: string;
};

async function addContributions({ formData, adminProfileId }: AddContributionPayload): Promise<MonthlyContribution[]> {
  // Validation is now primarily handled by Zod schema, but a server-side check can be good.
  // For example, if formData.totalAmountReceived !== formData.numberOfMonths * MONTHLY_CONTRIBUTION_AMOUNT, throw error.
  // However, Zod should prevent this state if configured correctly.

  const contributionsToInsert = [];
  let currentMonth = formData.month;
  let currentYear = formData.year;

  for (let i = 0; i < formData.numberOfMonths; i++) {
    contributionsToInsert.push({
      user_id: formData.userId,
      amount: MONTHLY_CONTRIBUTION_AMOUNT, // Always record the standard monthly amount per entry
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
    .select();

  if (error) throw new Error(`Error adding contribution(s): ${error.message}`);
  if (!data) throw new Error("Failed to add contribution(s), no data returned.");
  return data as MonthlyContribution[];
}


export function ContributionManagementTab() {
  const { toast } = useToast();
  const { profile: adminProfile } = useAuth();
  const queryClient = useQueryClient();

  const { data: users, isLoading: isLoadingUsers, error: usersError } = useQuery<Profile[], Error>({
    queryKey: ['adminProfilesForContributions'],
    queryFn: fetchAdminProfiles,
  });

  const { data: contributions, isLoading: isLoadingContributions, error: contributionsError } = useQuery<MonthlyContribution[], Error>({
    queryKey: ['adminContributions'],
    queryFn: fetchAdminContributions,
  });

  const addContributionMutation = useMutation<MonthlyContribution[], Error, AddContributionFormValues>({
    mutationFn: (formData) => {
      if (!adminProfile?.id) throw new Error("Admin profile not found for recording contribution.");
      return addContributions({ formData, adminProfileId: adminProfile.id });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminContributions'] });
      queryClient.invalidateQueries({ queryKey: ['userContributions', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['totalFamilySavings']});
      toast({ title: "Success", description: `${variables.numberOfMonths} contribution(s) for ${MONTHLY_CONTRIBUTION_AMOUNT} each recorded for ${users?.find(u => u.id === variables.userId)?.full_name}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error adding contribution(s)", description: error.message, variant: "destructive" });
    },
  });

  const isLoading = isLoadingUsers || isLoadingContributions;
  const queryError = usersError || contributionsError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading contributions data...</p>
      </div>
    );
  }

  if (queryError) {
     return (
      <div className="flex flex-col items-center justify-center py-10">
        <p className="text-destructive">Error: {queryError.message}</p>
        <button onClick={() => queryClient.invalidateQueries({queryKey: ["adminContributions", "adminProfilesForContributions"]})} className="mt-2 text-primary hover:underline">Try again</button>
      </div>
    );
  }

  return (
    <ContributionManagement
      users={users || []}
      contributions={contributions || []}
      onAddContribution={async (formData) => {
         await addContributionMutation.mutateAsync(formData);
      }}
    />
  );
}
