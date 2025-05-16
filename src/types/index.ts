
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { Database, Tables } from './supabase'; // Assuming this is correctly generated

// Base profile type directly from DB schema, all fields potentially nullable as per DB
type BaseProfile = Tables<'profiles'>;

// Profile type used in most of the app, representing fetched data
// Ensure this matches common select statements.
export type Profile = Pick<
  BaseProfile,
  'id' | 'full_name' | 'email' | 'phone' | 'avatar_url' | 'role' | 'is_approved' | 'created_at' | 'updated_at' | 'is_active' | 'last_login'
>;

export interface AuthenticatedUser extends SupabaseUser {
  profile: Profile | null;
}

// For Monthly Contributions
export type MonthlyContribution = Pick<Tables<'monthly_contributions'>, 'id' | 'payment_date' | 'month' | 'year' | 'amount'> & {
  user_id: string; // Foreign key
  recorded_by_admin_id: string | null; // Foreign key
  user_name?: string; // From joined profiles table
  recorded_by_admin_name?: string; // From joined profiles table (admin)
};

// For Emergency Requests
// This type is more comprehensive, often used where joins occur
export type EmergencyRequest = Pick<
  Tables<'emergency_requests'>,
  'id' | 'amount_requested' | 'amount_returned' | 'reason' | 'requested_at' | 'return_date' | 'status' | 'is_fully_repaid' | 'last_return_date' | 'admin_notes' | 'reviewed_at'
> & {
  user_id: string; // Foreign key
  reviewed_by_admin_id: string | null; // Foreign key
  user_name?: string; // Derived from profile_user join
  reviewed_by_admin_name?: string; // Derived from profile_admin join
  profile_user?: Pick<Profile, 'full_name' | 'avatar_url'> | null; // Specifically selected fields from joined user
  profile_admin?: Pick<Profile, 'full_name'> | null; // Specifically selected fields from joined admin
};

// For Notifications
export type Notification = Pick<Tables<'notifications'>, 'id' | 'message' | 'created_at' | 'read_at' | 'link' | 'type' | 'related_request_id'> & {
  user_id: string; // Foreign key, non-nullable as notifications are user-specific
};
