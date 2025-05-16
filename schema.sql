-- Enable the pgvector extension (if not already enabled)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Table for User Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  full_name TEXT,
  email TEXT UNIQUE, -- Added unique constraint for email
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' NOT NULL, -- Ensure role is not null
  is_approved BOOLEAN DEFAULT FALSE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  last_login TIMESTAMP WITH TIME ZONE
);

-- Table for Monthly Contributions
CREATE TABLE IF NOT EXISTS public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  recorded_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table for Emergency Requests
CREATE TABLE IF NOT EXISTS public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_requested NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL, -- e.g., pending, approved, rejected, repaid
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  return_date TIMESTAMP WITH TIME ZONE, -- Expected return date set by user
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  amount_returned NUMERIC DEFAULT 0,
  last_return_date TIMESTAMP WITH TIME ZONE,
  is_fully_repaid BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table for Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'general', -- e.g., 'general', 'contribution_reminder', 'emergency_update'
    link TEXT, -- Optional URL to navigate to
    related_request_id UUID NULL REFERENCES public.emergency_requests(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL -- Null if unread, timestamp when read
);

-- Helper function to check if a user is an admin (SECURITY DEFINER for safe RLS usage)
CREATE OR REPLACE FUNCTION public.is_admin(user_id_to_check UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = user_id_to_check AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Grant execute permission (if not already granted)
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated, service_role;


-- Trigger function to create a profile entry when a new user signs up in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  meta_data JSONB;
  user_email TEXT;
  user_full_name TEXT;
  user_avatar_url TEXT;
BEGIN
  meta_data := NEW.raw_user_meta_data;
  user_email := NEW.email; -- Get email from auth.users table
  
  -- Attempt to get full_name from raw_user_meta_data (common for OAuth providers)
  user_full_name := meta_data->>'full_name';
  IF user_full_name IS NULL THEN
    -- Fallback for some providers or if not available
    user_full_name := meta_data->>'name'; 
  END IF;
  
  -- Attempt to get avatar_url from raw_user_meta_data
  user_avatar_url := meta_data->>'avatar_url';
  IF user_avatar_url IS NULL THEN
    user_avatar_url := meta_data->>'picture'; -- Common alternative key for avatar
  END IF;

  INSERT INTO public.profiles (id, full_name, email, avatar_url, role, is_approved, created_at, updated_at, last_login)
  VALUES (
    NEW.id,
    COALESCE(user_full_name, 'New User'), -- Use 'New User' if name not found
    user_email,
    user_avatar_url,
    'user',  -- Default role
    FALSE,   -- Default approval status
    now(),
    now(),
    now()    -- Set last_login on profile creation
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to execute handle_new_user on new auth.users entry
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Function to get total family savings (Net Balance)
CREATE OR REPLACE FUNCTION public.get_total_family_savings()
RETURNS NUMERIC AS $$
DECLARE
  total_contributions NUMERIC;
  total_disbursed NUMERIC;
  total_returned NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO total_contributions
  FROM public.monthly_contributions;

  SELECT COALESCE(SUM(amount_requested), 0)
  INTO total_disbursed
  FROM public.emergency_requests
  WHERE status = 'approved';

  SELECT COALESCE(SUM(amount_returned), 0)
  INTO total_returned
  FROM public.emergency_requests
  WHERE status = 'approved' AND amount_returned IS NOT NULL;

  RETURN total_contributions - total_disbursed + total_returned;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.get_total_family_savings() TO authenticated, service_role;


-- Auto-update 'updated_at' timestamp functions and triggers
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for profiles
DROP TRIGGER IF EXISTS handle_updated_at_profiles ON public.profiles;
CREATE TRIGGER handle_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Triggers for monthly_contributions
DROP TRIGGER IF EXISTS handle_updated_at_monthly_contributions ON public.monthly_contributions;
CREATE TRIGGER handle_updated_at_monthly_contributions
  BEFORE UPDATE ON public.monthly_contributions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Triggers for emergency_requests
DROP TRIGGER IF EXISTS handle_updated_at_emergency_requests ON public.emergency_requests;
CREATE TRIGGER handle_updated_at_emergency_requests
  BEFORE UPDATE ON public.emergency_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- (No updated_at for notifications as they are typically immutable after creation, except for read_at)


-- Row Level Security (RLS) Policies

-- PROFILES Table RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by users who created them." ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles." ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view basic info of all profiles" ON public.profiles;

CREATE POLICY "Profiles are viewable by users who created them."
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile."
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Authenticated users can view basic info of all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true); -- Allows SELECT of id, full_name, avatar_url by any authenticated user, controlled by Supabase column permissions.

CREATE POLICY "Admins can manage all profiles."
  ON public.profiles FOR ALL -- SELECT, INSERT, UPDATE, DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Grant select on specific columns for "Authenticated users can view basic info of all profiles"
-- Note: Column-level permissions are applied AFTER RLS. RLS determines which rows are visible.
-- Then column permissions determine which of those visible rows' columns can be read/updated.
-- For the policy "Authenticated users can view basic info of all profiles" to be effective,
-- you must grant SELECT permission on at least id, full_name, avatar_url to the 'authenticated' role.
-- This is typically done in Supabase Dashboard: Authentication -> Policies -> profiles -> select 'authenticated' role.
-- Alternatively, via SQL (but dashboard UI is often easier for column grants):
-- REVOKE SELECT ON public.profiles FROM authenticated; -- Revoke broad select first if it exists
-- GRANT SELECT (id, full_name, email, avatar_url, role, is_approved, created_at) ON public.profiles TO authenticated; -- Grant specific columns


-- MONTHLY_CONTRIBUTIONS Table RLS
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can only view their own monthly contributions." ON public.monthly_contributions;
DROP POLICY IF EXISTS "Admins can manage monthly contributions." ON public.monthly_contributions;

CREATE POLICY "Users can only view their own monthly contributions."
  ON public.monthly_contributions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage monthly contributions."
  ON public.monthly_contributions FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));


-- EMERGENCY_REQUESTS Table RLS
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own requests, Admins can view all" ON public.emergency_requests;
DROP POLICY IF EXISTS "Authenticated users can view all emergency_requests" ON public.emergency_requests;
DROP POLICY IF EXISTS "Authenticated users can insert their own emergency_requests" ON public.emergency_requests;
DROP POLICY IF EXISTS "Admins can manage all emergency_requests" ON public.emergency_requests;


CREATE POLICY "Authenticated users can view all emergency_requests"
  ON public.emergency_requests FOR SELECT
  TO authenticated
  USING (true); -- Allows all authenticated users to see all requests for the dashboard view

CREATE POLICY "Authenticated users can insert their own emergency_requests"
  ON public.emergency_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all emergency_requests"
  ON public.emergency_requests FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));


-- NOTIFICATIONS Table RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their direct notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view notifications for accessible emergency requests" ON public.notifications;
DROP POLICY IF EXISTS "Admins can view all notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins can manage all notifications_new" ON public.notifications; -- Old name if exists


CREATE POLICY "Users can view their direct notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view notifications for accessible emergency requests"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.emergency_requests er
      WHERE er.id = public.notifications.related_request_id
      -- RLS on emergency_requests will apply here for the subquery
    )
  );

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id); -- For marking as read

CREATE POLICY "Admins can manage all notifications"
  ON public.notifications FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));


-- Supabase Storage RLS for 'profile-pic' bucket
-- Ensure the bucket 'profile-pic' exists and RLS is enabled on it via Supabase Dashboard.

-- Policy: Allow users to view their own profile picture
DROP POLICY IF EXISTS "User can view own profile picture" ON storage.objects;
CREATE POLICY "User can view own profile picture"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Allow users to upload their own profile picture
DROP POLICY IF EXISTS "User can upload own profile picture" ON storage.objects;
CREATE POLICY "User can upload own profile picture"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Allow users to update/replace their own profile picture
DROP POLICY IF EXISTS "User can update own profile picture" ON storage.objects;
CREATE POLICY "User can update own profile picture"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Allow users to delete their own profile picture
DROP POLICY IF EXISTS "User can delete own profile picture" ON storage.objects;
CREATE POLICY "User can delete own profile picture"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Admins can manage all files in 'profile-pic' bucket
DROP POLICY IF EXISTS "Admins can manage all profile pictures" ON storage.objects;
CREATE POLICY "Admins can manage all profile pictures"
  ON storage.objects FOR ALL -- SELECT, INSERT, UPDATE, DELETE
  USING (bucket_id = 'profile-pic' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'profile-pic' AND public.is_admin(auth.uid()));

-- Recommended Indexes (add more based on query patterns)
-- Foreign Keys are usually indexed automatically by Supabase/Postgres.
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_monthly_contributions_user_id_year_month ON public.monthly_contributions(user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_user_id_status ON public.emergency_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_status ON public.emergency_requests(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_related_request_id ON public.notifications(related_request_id);

-- Ensure the authenticated role has USAGE permission on the public schema
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
-- Grant SELECT on tables for authenticated users (RLS will then filter rows)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role; -- service_role for functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- For admins, RLS policies using is_admin() will grant broader access.
-- Ensure the postgres user (or role running migrations) has permissions to create these.
-- Supabase web interface usually handles default grants well.
```
  </change>

  <change>
    <file>/src/contexts/AuthContext.tsx</file>
    <content><![CDATA[
"use client";

import type { ReactNode, Dispatch, SetStateAction } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  AuthChangeEvent,
  Session,
  User as SupabaseUser,
} from "@supabase/supabase-js";
import type { Profile, AuthenticatedUser as AppUser } from "@/types";
import { useToast } from "@/hooks/use-toast";

const supabase = createClient();
const PROFILE_CACHE_KEY = "fft_user_profile"; // More specific key

interface AuthContextType {
  user: AppUser | null;
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  setProfile: Dispatch<SetStateAction<Profile | null>>; // For direct profile updates from components
  fetchProfile: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchProfileFromServer = useCallback(
    async (userId: string): Promise<Profile | null> => {
      if (!userId) {
        console.warn("AuthContext: fetchProfileFromServer called with no userId.");
        return null;
      }
      console.log(`AuthContext: Attempting to fetch profile from server for user: ${userId}`);
      try {
        const { data, error, status } = await supabase
          .from("profiles")
          .select( // Select only necessary fields for general context
            "id, full_name, email, phone, avatar_url, role, is_approved, created_at, is_active, last_login"
          )
          .eq("id", userId)
          .single();

        if (error) {
          const errorMessage = error.message || `Supabase error (Code: ${error.code || status})`;
          console.error(`AuthContext: Error fetching profile from server for ${userId}. Status: ${status}`, JSON.stringify(error, null, 2));
          if (status !== 406) { // 406 means "No rows found" with .single() which is a valid scenario if profile creation failed
            toast({
              title: "Profile Fetch Error",
              description: errorMessage,
              variant: "destructive",
            });
          }
          if (typeof window !== 'undefined') { // Clear potentially stale cache on error
            localStorage.removeItem(PROFILE_CACHE_KEY);
          }
          throw new Error(errorMessage);
        }
        
        if (data) {
          console.log(`AuthContext: Profile successfully fetched from server for ${userId}:`, data);
          if (typeof window !== 'undefined') {
            localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
          }
        } else {
           console.warn(`AuthContext: No profile data returned from server for ${userId}, though no explicit error. Status: ${status}`);
           if (typeof window !== 'undefined') { // Clear cache if no profile found
             localStorage.removeItem(PROFILE_CACHE_KEY);
           }
        }
        return data;
      } catch (err: any) {
        console.error(`AuthContext: Unexpected error in fetchProfileFromServer for ${userId}:`, err);
        // Toast is likely handled by the specific error block above, or if not, by TanStack Query elsewhere
        if (typeof window !== 'undefined') {
            localStorage.removeItem(PROFILE_CACHE_KEY);
        }
        throw err; // Re-throw for TanStack Query or other handlers
      }
    },
    [toast]
  );

  const loadProfileFromCache = useCallback((userId?: string): Profile | null => {
    if (typeof window !== 'undefined') {
      try {
        const cachedProfileData = localStorage.getItem(PROFILE_CACHE_KEY);
        if (cachedProfileData) {
          const parsedProfile = JSON.parse(cachedProfileData) as Profile;
          if (userId && parsedProfile.id !== userId) {
            console.warn("AuthContext: Cached profile user ID mismatch. Clearing cache.");
            localStorage.removeItem(PROFILE_CACHE_KEY);
            return null;
          }
          console.log("AuthContext: Profile loaded from cache for user:", parsedProfile.id);
          return parsedProfile;
        }
      } catch (e) {
        console.warn("AuthContext: Failed to parse cached profile, removing.", e);
        localStorage.removeItem(PROFILE_CACHE_KEY);
      }
    }
    return null;
  }, []);


  const publicFetchProfile = useCallback(
    async (userId: string, forceRefresh: boolean = false): Promise<Profile | null> => {
      if (!userId) return null;
      if (!forceRefresh) {
        const cached = loadProfileFromCache(userId);
        if (cached) {
          return cached;
        }
      }
      return fetchProfileFromServer(userId);
    },
    [loadProfileFromCache, fetchProfileFromServer]
  );

  useEffect(() => {
    let didUnsubscribe = false;
    setIsLoading(true);
    console.log("AuthContext: Initializing auth state check.");

    const processSession = async (supaUser: SupabaseUser | null, eventType?: AuthChangeEvent) => {
      if (didUnsubscribe) return;

      let newProfileData: Profile | null = null;
      let newAppUser: AppUser | null = null;

      if (supaUser) {
        let cachedProfile: Profile | null = null;
        // For SIGNED_IN or USER_UPDATED, always prefer fresh data. For other events or initial load, cache is fine.
        const shouldForceRefresh = eventType === 'SIGNED_IN' || eventType === 'USER_UPDATED';

        if (!shouldForceRefresh && typeof window !== 'undefined') {
          cachedProfile = loadProfileFromCache(supaUser.id);
        }
        
        if (cachedProfile && !shouldForceRefresh) {
          newProfileData = cachedProfile;
          console.log(`AuthContext: Using cached profile for ${supaUser.id} during ${eventType || 'initial load'}`);
        } else {
          try {
            console.log(`AuthContext: Fetching fresh profile for ${supaUser.id} due to ${eventType || 'initial load/no cache'}`);
            newProfileData = await fetchProfileFromServer(supaUser.id);
          } catch (e) {
            console.error(`AuthContext: Error fetching profile during session processing for ${supaUser.id}:`, e);
            // Keep supaUser, profile will be null
          }
        }
        newAppUser = { ...supaUser, profile: newProfileData } as AppUser;
      } else {
        // No Supabase user
        if (typeof window !== 'undefined') {
          localStorage.removeItem(PROFILE_CACHE_KEY);
        }
      }

      if (didUnsubscribe) return;

      // Conditional state updates
      const currentProfileString = profile ? JSON.stringify(profile) : null;
      const newProfileString = newProfileData ? JSON.stringify(newProfileData) : null;

      if (user?.id !== newAppUser?.id || currentProfileString !== newProfileString) {
        console.log("AuthContext: State change detected. Updating user and profile.", { oldUserId: user?.id, newUserId: newAppUser?.id, profileChanged: currentProfileString !== newProfileString });
        setUser(newAppUser);
        setProfile(newProfileData);
      } else {
        console.log("AuthContext: No significant state change detected for user/profile.");
      }
      setIsLoading(false);
    };

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("AuthContext: Initial getSession() completed.");
      processSession(session?.user ?? null, 'INITIAL_LOAD');
    }).catch(error => {
        console.error("AuthContext: Error in initial getSession():", error);
        if (!didUnsubscribe) {
            setUser(null);
            setProfile(null);
            setIsLoading(false);
        }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (didUnsubscribe) return;
        console.log(`AuthContext: onAuthStateChange event: ${event}, session:`, !!session);
        setIsLoading(true);
        await processSession(session?.user ?? null, event);
      }
    );

    return () => {
      didUnsubscribe = true;
      if (authListener && authListener.subscription) {
        console.log("AuthContext: Unsubscribing from onAuthStateChange.");
        authListener.subscription.unsubscribe();
      }
    };
  }, [fetchProfileFromServer, loadProfileFromCache, toast]); // Dependencies are stable callbacks


  const handleSetProfileContext = useCallback((newProfileData: Profile | null | ((prevState: Profile | null) => Profile | null)) => {
    setProfile(prevProfile => {
        const resolvedNewProfile = typeof newProfileData === 'function' 
            ? (newProfileData as (prevState: Profile | null) => Profile | null)(prevProfile) 
            : newProfileData;

        if (typeof window !== 'undefined') {
            if (resolvedNewProfile === null) {
                localStorage.removeItem(PROFILE_CACHE_KEY);
            } else {
                localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(resolvedNewProfile));
            }
        }
        
        setUser(prevUser => prevUser ? ({ ...prevUser, profile: resolvedNewProfile } as AppUser) : null);
        return resolvedNewProfile;
    });
  }, []);


  const signOut = async () => {
    console.log("AuthContext: signOut initiated.");
    setIsLoading(true);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error("AuthContext: Error during signOut:", error);
        toast({title: "Logout Error", description: error.message, variant: "destructive"});
    }
    // onAuthStateChange will handle setting user/profile to null.
    // Explicitly setting here for faster UI feedback is okay too.
    setUser(null);
    setProfile(null);
    setIsLoading(false); // Ensure loading is false after sign out attempt
  };
  
  const value: AuthContextType = {
    user,
    profile,
    isLoading,
    isAdmin: profile?.role === "admin",
    isApproved: !!profile?.is_approved,
    setProfile: handleSetProfileContext,
    fetchProfile: publicFetchProfile,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

    