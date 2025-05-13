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
  user_name?: string; // For display purposes in admin views
  recorded_by_admin_name?: string; // For display
}

export interface EmergencyRequest extends Tables<'emergency_requests'> {
   user_name?: string; // For display
   reviewed_by_admin_name?: string; // For display
}


export interface Notification {
  id: string;
  user_id: string; 
  message: string;
  type: "contribution_reminder" | "emergency_update" | "approval_status" | "general";
  sent_at: string; // ISO date string
  channel: "email" | "whatsapp" | "app"; 
}
