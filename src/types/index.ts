
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { Database, Tables } from './supabase'; // Assuming this is correctly generated

export type UserRole = Tables<'profiles'>['role'];

// Profile type matching the optimized selection often used in AuthContext
export type Profile = Pick<
  Tables<'profiles'>,
  'id' | 'full_name' | 'email' | 'phone' | 'avatar_url' | 'role' | 'is_approved' | 'created_at' | 'is_active' | 'last_login'
> & { updated_at?: string | null }; // updated_at is optional as it might not always be fetched

export interface AuthenticatedUser extends SupabaseUser {
  profile: Profile | null;
}

// For lists or general display where only name is needed from joined profile
export interface MonthlyContribution extends Omit<Tables<'monthly_contributions'>, 'user_id' | 'recorded_by_admin_id'> {
  user_id: string; // Keep the ID
  recorded_by_admin_id: string | null; // Keep the ID
  user_name?: string; 
  recorded_by_admin_name?: string;
}

export interface EmergencyRequest extends Omit<Tables<'emergency_requests'>, 'user_id' | 'reviewed_by_admin_id'> {
  user_id: string; // Keep the ID
  reviewed_by_admin_id: string | null; // Keep the ID
  user_name?: string;
  reviewed_by_admin_name?: string;
  
  // For detail pages where more profile info might be joined
  profile_user?: Pick<Profile, 'full_name' | 'avatar_url'> | null;
  profile_admin?: Pick<Profile, 'full_name'> | null;
}

export interface Notification extends Tables<'notifications'> {
  // All fields from Tables<'notifications'> are included by default
}

    