
// "use client"; // Remove this if present, as these functions might be called from server

import { createClient as createClientComponentClient } from "@/lib/supabase/client";
import type { MonthlyContribution, EmergencyRequest } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Helper to get a Supabase client: uses provided or creates a new client-side one
const getSupabaseClient = (providedClient?: SupabaseClient) => {
  return providedClient || createClientComponentClient();
};

export interface PaginatedData<T> {
  data: T[];
  count: number | null;
}

export type UserContributionForTable = Pick<MonthlyContribution, 'id' | 'payment_date' | 'month' | 'year' | 'amount'>;

export async function fetchUserContributionsForDashboard(
  supabaseClient: SupabaseClient, // Made mandatory for server-side, client passes its own
  userId: string | undefined,
  page: number,
  itemsPerPage: number,
  searchTerm: string
): Promise<PaginatedData<UserContributionForTable>> {
  if (!userId) return { data: [], count: 0 };

  const from = (page - 1) * itemsPerPage;
  const to = from + itemsPerPage - 1;

  let query = supabaseClient
    .from("monthly_contributions")
    .select("id, payment_date, month, year, amount", { count: "exact" })
    .eq("user_id", userId);

  if (searchTerm) {
    const numericSearchTerm = parseInt(searchTerm);
    if (!isNaN(numericSearchTerm)) {
      query = query.eq("year", numericSearchTerm);
    }
  }
  
  query = query.order("year", { ascending: false })
    .order("month", { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error("API: Error fetching user contributions for dashboard:", JSON.stringify(error, null, 2));
    throw error;
  }
  return { data: data || [], count };
}

export type FamilyEmergencyRequestForTable = Pick<EmergencyRequest, 'id' | 'user_id' | 'amount_requested' | 'reason' | 'requested_at' | 'return_date' | 'status' | 'amount_returned' | 'is_fully_repaid'> & { user_name?: string };
type RawFamilyEmergencyRequest = Pick<EmergencyRequest, 'id' | 'user_id' | 'amount_requested' | 'reason' | 'requested_at' | 'return_date' | 'status' | 'amount_returned' | 'is_fully_repaid'> & { profile_user: { full_name: string | null } | null };

export async function fetchAllFamilyEmergencyRequestsForDashboard(
  supabaseClient: SupabaseClient, // Made mandatory
  page: number,
  itemsPerPage: number,
  searchTerm: string
): Promise<PaginatedData<FamilyEmergencyRequestForTable>> {
  const from = (page - 1) * itemsPerPage;
  const to = from + itemsPerPage - 1;

  let query = supabaseClient
    .from("emergency_requests")
    .select(`
      id, user_id, amount_requested, reason, requested_at, return_date, status, amount_returned, is_fully_repaid,
      profile_user:profiles!emergency_requests_user_id_fkey(full_name)
    `, { count: "exact" });
  
  if (searchTerm) {
    query = query.or(
        `reason.ilike.%${searchTerm}%,status.ilike.%${searchTerm}%,profile_user:full_name.ilike.%${searchTerm}%${",overdue".includes(searchTerm.toLowerCase()) ? ",return_date.lt.now(),is_fully_repaid.is.false" : ""}${"repaid".includes(searchTerm.toLowerCase()) ? ",is_fully_repaid.is.true" : ""}`,
        { referencedTable: "profiles" } 
    );
  }
  
  query = query.order("requested_at", { ascending: false }).range(from, to);

  const { data: rawRequests, error, count } = await query.returns<RawFamilyEmergencyRequest[]>();

  if (error) {
    console.error("API: Error fetching all family emergency requests for dashboard:", JSON.stringify(error, null, 2));
    throw error;
  }
  
  const formattedData: FamilyEmergencyRequestForTable[] = rawRequests?.map(req => ({
      ...req,
      user_name: req.profile_user?.full_name || req.user_id, 
  })) || [];
  return { data: formattedData, count };
}

export async function fetchTotalFamilySavingsRPC(supabaseClient: SupabaseClient): Promise<number> {
  console.log("API: Fetching total family savings via RPC...");
  const { data, error } = await supabaseClient.rpc('get_total_family_savings');
  if (error) {
    console.error("API: Error fetching total family savings via RPC:", JSON.stringify(error, null, 2));
    if (data !== undefined) {
        console.log("API: RPC 'get_total_family_savings' raw data received (on error):", data);
    }
    throw error;
  }
  if (data === null || data === undefined) {
    console.warn("API: RPC 'get_total_family_savings' returned null or undefined. Defaulting to 0.");
    return 0;
  }
  const savings = Number(data);
  if (isNaN(savings)) {
    console.warn(`API: RPC 'get_total_family_savings' returned a non-numeric value: ${data}. Defaulting to 0.`);
    return 0;
  }
  console.log("API: Total family savings fetched:", savings);
  return savings;
}

export type UserContributionForStatus = Pick<MonthlyContribution, 'amount'>;

export async function fetchAllUserContributionsForStatus(supabaseClient: SupabaseClient, userId: string | undefined): Promise<UserContributionForStatus[]> {
  if (!userId) return [];
  const { data, error } = await supabaseClient
    .from("monthly_contributions")
    .select("amount") 
    .eq("user_id", userId);
  if (error) {
    console.error("API: Error fetching all user contributions for status:", JSON.stringify(error, null, 2));
    throw error;
  }
  return data || [];
}
