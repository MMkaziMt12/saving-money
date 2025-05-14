
"use client";

import type { MonthlyContribution, Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ContributionManagement } from "@/components/admin/ContributionManagement";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { AddContributionFormValues } from "@/components/admin/ContributionManagement";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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

async function addContribution(payload: { formData: AddContributionFormValues; adminProfileId: string }): Promise<MonthlyContribution> {
  const { formData, adminProfileId } = payload;
  const { data, error } = await supabase
    .from('monthly_contributions')
    .insert({
      user_id: formData.userId,
      amount: formData.amount,
      payment_date: formData.paymentDate.toISOString(),
      month: formData.month,
      year: formData.year,
      recorded_by_admin_id: adminProfileId,
    })
    .select()
    .single();
  if (error) throw new Error(`Error adding contribution: ${error.message}`);
  if (!data) throw new Error("Failed to add contribution, no data returned.");
  return data as MonthlyContribution;
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

  const addContributionMutation = useMutation<MonthlyContribution, Error, AddContributionFormValues>({
    mutationFn: (formData) => {
      if (!adminProfile?.id) throw new Error("Admin profile not found for recording contribution.");
      return addContribution({ formData, adminProfileId: adminProfile.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminContributions'] });
      toast({ title: "Success", description: "Contribution recorded." });
    },
    onError: (error: Error) => {
      toast({ title: "Error adding contribution", description: error.message, variant: "destructive" });
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
        <button onClick={() => queryClient.invalidateQueries()} className="mt-2 text-blue-500">Try again</button>
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
