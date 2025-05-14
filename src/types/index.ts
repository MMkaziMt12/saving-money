
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { Database, Tables } from './supabase';

export type UserRole = Tables<'profiles'>['role']; // "admin" | "user"

// This is our application's Profile type, derived from Supabase table
export type Profile = Tables<'profiles'>;

// This combines Supabase's User object with our application's Profile
export interface AuthenticatedUser extends SupabaseUser {
  profile: Profile | null; // Profile can be null if not yet fetched or doesn't exist
}

export interface MonthlyContribution extends Tables<'monthly_contributions'> {
  user_name?: string; // For display purposes, populated by joining/mapping
  recorded_by_admin_name?: string; // For display, populated by joining/mapping
}

export interface EmergencyRequest extends Tables<'emergency_requests'> {
   user_name?: string; // For display, populated by joining/mapping
   reviewed_by_admin_name?: string; // For display, populated by joining/mapping
   return_date?: string | null;
   amount_returned?: number | null;
   last_return_date?: string | null;
   is_fully_repaid?: boolean | null;
}


// Updated Notification interface to match schema.sql
export interface Notification extends Tables<'notifications'> {
  // id, user_id, message, type, link, created_at, read_at are from Tables<'notifications'>
  // Add any client-side specific properties if needed, though typically derived from Supabase types.
}
