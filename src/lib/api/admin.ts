
// "use client"; // Removed as these can be called server-side

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, MonthlyContribution, EmergencyRequest } from "@/types";
import type { AddContributionFormValues } from "@/components/admin/ContributionManagement";
import { MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants";
import type { Tables } from "@/types/supabase"; // Assuming Tables type is available

// For UserManagementTab
export async function fetchAdminUsers(supabase: SupabaseClient): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, avatar_url, role, is_approved, created_at, updated_at, is_active')
    .order('created_at', { ascending: false });
  if (error) {
    console.error("API: Error fetching admin users:", JSON.stringify(error, null, 2));
    throw error;
  }
  return data || [];
}

export async function updateUserProfileAdmin(supabase: SupabaseClient, userId: string, updates: Partial<Profile>): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id, full_name, email, phone, avatar_url, role, is_approved, created_at, updated_at, is_active')
    .single();
  if (error) {
    console.error("API: Error updating user profile (admin):", JSON.stringify(error, null, 2));
    throw error;
  }
  if (!data) throw new Error("API: User profile not found after update (admin).");
  return data;
}

export async function deleteUserProfileAdmin(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from('profiles').delete().eq('id', userId);
  if (error) {
    console.error("API: Error deleting user profile (admin):", JSON.stringify(error, null, 2));
    throw error;
  }
}

// For ContributionManagementTab
export type AdminProfileForContribution = Pick<Profile, 'id' | 'full_name' | 'email' | 'is_approved'>;
export async function fetchAdminProfilesForContributions(supabase: SupabaseClient): Promise<AdminProfileForContribution[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_approved')
    .order('full_name', { ascending: true });
  if (error) {
    console.error("API: Error fetching admin profiles for contributions:", JSON.stringify(error, null, 2));
    throw error;
  }
  return data || [];
}

export type AdminContribution = Pick<MonthlyContribution, 'id' | 'payment_date' | 'month' | 'year' | 'amount' | 'user_id' | 'recorded_by_admin_id'> & {
  user_name?: string | null;
  recorded_by_admin_name?: string | null;
};
type RawAdminContribution = Pick<Tables<'monthly_contributions'>, 'id' | 'payment_date' | 'month' | 'year' | 'amount' | 'user_id' | 'recorded_by_admin_id'> & {
    profile_user: { full_name: string | null } | null;
    profile_admin: { full_name: string | null } | null;
};
export async function fetchAdminContributions(supabase: SupabaseClient): Promise<AdminContribution[]> {
  const { data: rawContributions, error } = await supabase
    .from('monthly_contributions')
    .select(`
      id, user_id, payment_date, month, year, amount, recorded_by_admin_id,
      profile_user:profiles!monthly_contributions_user_id_fkey(full_name),
      profile_admin:profiles!monthly_contributions_recorded_by_admin_id_fkey(full_name)
    `)
    .order('payment_date', { ascending: false });

  if (error) {
    console.error("API: Error fetching admin contributions:", JSON.stringify(error, null, 2));
    throw error;
  }
  const typedData = rawContributions as RawAdminContribution[] | null;
  return typedData?.map(c => ({
    ...c,
    user_name: c.profile_user?.full_name,
    recorded_by_admin_name: c.profile_admin?.full_name,
  })) || [];
}

export type AddContributionPayload = {
  formData: AddContributionFormValues;
  adminProfileId: string;
};
export type AddedContributionId = Pick<MonthlyContribution, 'id'>;
export async function addContributionsAdmin(supabase: SupabaseClient, { formData, adminProfileId }: AddContributionPayload): Promise<AddedContributionId[]> {
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
    console.error("API: Error adding contribution(s) (admin):", JSON.stringify(error, null, 2));
    throw error;
  }
  if (!data) throw new Error("API: Failed to add contribution(s), no data returned (admin).");
  return data;
}

// For EmergencyRequestManagementTab
export type AdminProfileForEmergency = Pick<Profile, 'id' | 'full_name'>;
export async function fetchAdminProfilesForEmergency(supabase: SupabaseClient): Promise<AdminProfileForEmergency[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name');
  if (error) {
    console.error("API: Error fetching admin profiles for emergency:", JSON.stringify(error, null, 2));
    throw error;
  }
  return data || [];
}

export type AdminEmergencyRequest = Pick<EmergencyRequest, 'id' | 'user_id' | 'amount_requested' | 'reason' | 'status' | 'requested_at' | 'return_date' | 'amount_returned' | 'is_fully_repaid' | 'last_return_date' | 'admin_notes' | 'reviewed_at' | 'reviewed_by_admin_id'> & {
  user_name?: string | null;
  reviewed_by_admin_name?: string | null;
};
type RawAdminEmergencyRequest = AdminEmergencyRequest & {
    profile_user: { full_name: string | null } | null;
    profile_admin: { full_name: string | null } | null;
};
export async function fetchAdminEmergencyRequests(supabase: SupabaseClient): Promise<AdminEmergencyRequest[]> {
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
    console.error("API: Error fetching admin emergency requests:", JSON.stringify(error, null, 2));
    throw error;
  }
  const typedData = rawRequests as RawAdminEmergencyRequest[] | null;
  return typedData?.map(req => ({
      ...req,
      user_name: req.profile_user?.full_name,
      reviewed_by_admin_name: req.profile_admin?.full_name,
  })) || [];
}

export type UpdateRequestPayloadAdmin = {
  requestId: string;
  status: 'approved' | 'rejected';
  adminProfileId: string;
};
export type UpdatedRequestStatusAdmin = Pick<EmergencyRequest, 'id' | 'status' | 'user_id'>;
export async function updateEmergencyRequestStatusAdmin(supabase: SupabaseClient, { requestId, status, adminProfileId }: UpdateRequestPayloadAdmin): Promise<UpdatedRequestStatusAdmin> {
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
    console.error("API: Error updating emergency request status (admin):", JSON.stringify(error, null, 2));
    throw error;
  }
  if (!data) throw new Error("API: Failed to update request, no data returned (admin).");
  return data; 
}

export type RecordRepaymentPayloadAdmin = {
  requestId: string;
  amountRepaid: number;
  repaymentDate: Date;
  adminProfileId: string; 
};
export type RecordedRepaymentResultAdmin = Pick<EmergencyRequest, 'id' | 'user_id' | 'amount_returned' | 'is_fully_repaid' | 'last_return_date'>;
export async function recordRepaymentAdmin(supabase: SupabaseClient, { requestId, amountRepaid, repaymentDate }: RecordRepaymentPayloadAdmin): Promise<RecordedRepaymentResultAdmin> {
  const { data: existingRequest, error: fetchError } = await supabase
    .from('emergency_requests')
    .select('amount_requested, amount_returned, user_id')
    .eq('id', requestId)
    .single();
  if (fetchError || !existingRequest) {
    console.error("API: Error fetching existing request for repayment (admin):", JSON.stringify(fetchError, null, 2));
    throw fetchError || new Error("API: Could not find existing request to record repayment (admin).");
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
    console.error("API: Error recording repayment (admin):", JSON.stringify(error, null, 2));
    throw error;
  }
  if (!data) throw new Error("API: Failed to record repayment, no data returned (admin).");
  return data;
}

// For NotificationSenderTab
export type UserForNotificationAdmin = Pick<Profile, 'id' | 'full_name' | 'email' | 'is_approved'>;
export async function fetchUsersForNotificationsAdmin(supabase: SupabaseClient): Promise<UserForNotificationAdmin[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_approved')
    .order('full_name', { ascending: true });
  if (error) {
    console.error("API: Error fetching users for notifications (admin):", JSON.stringify(error, null, 2));
    throw error;
  }
  return data || [];
}

export type EmergencyRequestForNotificationListAdmin = Pick<EmergencyRequest, 'id' | 'user_id' | 'reason' | 'amount_requested' | 'status' | 'requested_at'> & { user_name?: string | null };
type RawEmergencyRequestForNotificationListAdmin = Pick<EmergencyRequest, 'id' | 'user_id' | 'reason' | 'amount_requested' | 'status' | 'requested_at'> & { profile_user: { full_name: string | null } | null };

export async function fetchAllEmergencyRequestsForNotificationsListAdmin(supabase: SupabaseClient): Promise<EmergencyRequestForNotificationListAdmin[]> {
  const { data: rawRequests, error } = await supabase
    .from('emergency_requests')
    .select('id, user_id, reason, amount_requested, status, requested_at, profile_user:profiles!emergency_requests_user_id_fkey(full_name)')
    .order('requested_at', { ascending: false });

  if (error) {
    console.error("API: Error fetching emergency requests for notifications list (admin):", JSON.stringify(error, null, 2));
    throw error;
  }
  const typedData = rawRequests as RawEmergencyRequestForNotificationListAdmin[] | null;
  return typedData?.map(req => ({
    ...req,
    user_name: req.profile_user?.full_name || req.user_id,
  })) || [];
}

// For user detail page in admin
export async function fetchUserProfileForAdmin(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select('id, full_name, email, phone, avatar_url, role, is_approved, created_at, updated_at, is_active')
    .eq("id", userId)
    .single<Profile>();
  if (error) {
    console.error("API: Error fetching user profile for admin detail page:", JSON.stringify(error, null, 2));
    throw error;
  }
  return data;
}

export type UserContributionForAdminDetail = Pick<MonthlyContribution, 'id' | 'payment_date' | 'month' | 'year' | 'amount' | 'recorded_by_admin_id'> & {
  recorded_by_admin_name?: string | null;
};
type RawUserContributionForAdminDetail = Pick<Tables<'monthly_contributions'>, 'id' | 'payment_date' | 'month' | 'year' | 'amount' | 'recorded_by_admin_id'> & {
  profile_admin: { full_name: string | null } | null;
};
export async function fetchUserContributionsForAdmin(supabase: SupabaseClient, userId: string): Promise<UserContributionForAdminDetail[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("monthly_contributions")
    .select(`
      id, 
      payment_date, 
      month, 
      year, 
      amount, 
      recorded_by_admin_id,
      profile_admin:profiles!monthly_contributions_recorded_by_admin_id_fkey(full_name)
    `) 
    .eq("user_id", userId)
    .order("payment_date", { ascending: false });

  if (error) {
    const errorMsg = `API: Error fetching user contributions for admin (user ID ${userId}): ${error.message} (Code: ${error.code})`;
    console.error(errorMsg, JSON.stringify(error, null, 2));
    throw new Error(errorMsg);
  }
  const typedData = data as RawUserContributionForAdminDetail[] | null;
  return typedData?.map(item => ({
    id: item.id,
    payment_date: item.payment_date,
    month: item.month,
    year: item.year,
    amount: item.amount,
    recorded_by_admin_id: item.recorded_by_admin_id,
    recorded_by_admin_name: item.profile_admin?.full_name || undefined,
  })) || [];
}

export type UserEmergencyRequestForAdminDetail = Pick<EmergencyRequest, 'id' | 'amount_requested' | 'amount_returned' | 'reason' | 'requested_at' | 'return_date' | 'status' | 'is_fully_repaid' | 'last_return_date' | 'admin_notes'>;
export async function fetchUserEmergencyRequestsForAdminDetail(supabase: SupabaseClient, userId: string): Promise<UserEmergencyRequestForAdminDetail[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("emergency_requests")
    .select("id, amount_requested, amount_returned, reason, requested_at, return_date, status, is_fully_repaid, last_return_date, admin_notes")
    .eq("user_id", userId)
    .order("requested_at", { ascending: false });

  if (error) {
    console.error("API: Error fetching user emergency requests for admin detail page:", JSON.stringify(error, null, 2));
    throw error;
  }
  return data || [];
}
