
"use client";

import { useState, useEffect, useCallback } from "react";
import type { MonthlyContribution, Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ContributionManagement } from "@/components/admin/ContributionManagement";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { AddContributionFormValues } from "@/components/admin/ContributionManagement"; // Import the form values type

export function ContributionManagementTab() {
  const supabase = createClient();
  const { toast } = useToast();
  const { profile: adminProfile } = useAuth();

  const [users, setUsers] = useState<Profile[]>([]);
  const [contributions, setContributions] = useState<MonthlyContribution[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name', { ascending: true });
    if (error) {
      toast({ title: "Error fetching users", description: error.message, variant: "destructive" });
      return [];
    }
    return data || [];
  }, [supabase, toast]);

  const fetchContributions = useCallback(async () => {
    // Fetch contributions and enrich with user and admin names
    const { data: rawContributions, error } = await supabase
      .from('monthly_contributions')
      .select(`
        *,
        profile_user:profiles!monthly_contributions_user_id_fkey(full_name),
        profile_admin:profiles!monthly_contributions_recorded_by_admin_id_fkey(full_name)
      `)
      .order('payment_date', { ascending: false });

    if (error) {
      toast({ title: "Error fetching contributions", description: error.message, variant: "destructive" });
      return [];
    }
    
    // Map to include user_name and recorded_by_admin_name
    const enrichedContributions = rawContributions?.map(c => ({
        ...c,
        user_name: (c.profile_user as unknown as Profile)?.full_name || c.user_id,
        recorded_by_admin_name: (c.profile_admin as unknown as Profile)?.full_name || c.recorded_by_admin_id,
    })) || [];

    return enrichedContributions;

  }, [supabase, toast]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const fetchedUsers = await fetchUsers();
    const fetchedContributions = await fetchContributions();
    setUsers(fetchedUsers);
    setContributions(fetchedContributions as MonthlyContribution[]);
    setIsLoading(false);
  }, [fetchUsers, fetchContributions]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddContribution = async (formData: AddContributionFormValues) => {
    if (!adminProfile) {
        toast({ title: "Error", description: "Admin profile not found.", variant: "destructive"});
        return;
    }
    const { error } = await supabase
      .from('monthly_contributions')
      .insert({
        user_id: formData.userId,
        amount: formData.amount,
        payment_date: formData.paymentDate.toISOString(),
        month: formData.month,
        year: formData.year,
        recorded_by_admin_id: adminProfile.id, 
      });

    if (error) {
      toast({ title: "Error adding contribution", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Contribution recorded." });
      loadData(); // Re-fetch to update the list
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading contributions data...</p>
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
