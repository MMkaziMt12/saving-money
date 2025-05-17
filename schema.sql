-- Family Fund Tracker Supabase Schema
-- Version: Incorporating all features including detailed notifications and robust RLS.

-- Extensions (Enable if not already enabled in your Supabase project)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- For gen_random_uuid()
-- CREATE EXTENSION IF NOT EXISTS "moddatetime"; -- For updated_at triggers (using custom function instead)
-- CREATE EXTENSION IF NOT EXISTS "pgvector"; -- If you plan to use vector embeddings

--------------------------------------------------------------------------------
-- Helper Functions
--------------------------------------------------------------------------------

-- Function to check if the current user is an admin
-- SECURITY DEFINER allows this function to bypass RLS for the internal SELECT on profiles.
CREATE OR REPLACE FUNCTION public.is_admin(user_id_to_check UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = user_id_to_check;
  RETURN user_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users so they can call is_admin if needed (though primarily used within RLS)
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;


-- Function to automatically update 'updated_at' timestamps
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


--------------------------------------------------------------------------------
-- Tables
--------------------------------------------------------------------------------

-- Table for User Profiles
-- Links to auth.users table and stores application-specific user data.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  full_name TEXT,
  email TEXT UNIQUE, -- Email should be unique
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')), -- Enforce roles
  is_approved BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP WITH TIME ZONE
);

-- Trigger for 'profiles' updated_at
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();


-- Table for Monthly Contributions
CREATE TABLE IF NOT EXISTS public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100), -- Basic year range check
  recorded_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Trigger for 'monthly_contributions' updated_at
DROP TRIGGER IF EXISTS set_monthly_contributions_updated_at ON public.monthly_contributions;
CREATE TRIGGER set_monthly_contributions_updated_at
BEFORE UPDATE ON public.monthly_contributions
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();


-- Table for Emergency Requests
CREATE TABLE IF NOT EXISTS public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_requested NUMERIC NOT NULL CHECK (amount_requested > 0),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  return_date TIMESTAMP WITH TIME ZONE, -- Expected return date set by user
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  amount_returned NUMERIC DEFAULT 0 CHECK (amount_returned >= 0),
  last_return_date TIMESTAMP WITH TIME ZONE,
  is_fully_repaid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Trigger for 'emergency_requests' updated_at
DROP TRIGGER IF EXISTS set_emergency_requests_updated_at ON public.emergency_requests;
CREATE TRIGGER set_emergency_requests_updated_at
BEFORE UPDATE ON public.emergency_requests
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();


-- Table for Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'general', -- e.g., 'general', 'contribution_reminder', 'emergency_update'
  link TEXT, -- Optional URL to navigate to
  related_request_id UUID NULL REFERENCES public.emergency_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL -- Null if unread, timestamp when read
  -- 'updated_at' might not be necessary for notifications unless they are editable
);


--------------------------------------------------------------------------------
-- Function & Trigger to Create Profile on New Auth User
--------------------------------------------------------------------------------
-- This function is called by a trigger when a new user signs up in auth.users.
-- It creates a corresponding row in public.profiles.
-- SECURITY DEFINER is used to allow this function to write to public.profiles,
-- as the new user wouldn't yet have RLS permissions to do so.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, is_approved, created_at, updated_at, last_login)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name', -- Attempt to get full_name from provider metadata
    NEW.raw_user_meta_data->>'avatar_url', -- Attempt to get avatar_url from provider metadata
    'user',  -- Default role
    FALSE,   -- Default approval status
    NOW(),   -- Set created_at
    NOW(),    -- Set updated_at
    NOW() -- Set last_login on creation
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call handle_new_user on new user creation in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--------------------------------------------------------------------------------
-- RPC Function for Dashboard Calculation
--------------------------------------------------------------------------------
-- Function to get the net total family savings balance
-- (Total Contributions) - (Total Approved Emergency Funds Requested) + (Total Emergency Funds Returned)
CREATE OR REPLACE FUNCTION public.get_total_family_savings()
RETURNS NUMERIC AS $$
DECLARE
  total_contributions NUMERIC;
  total_disbursed NUMERIC;
  total_returned NUMERIC;
BEGIN
  -- Calculate total contributions
  SELECT COALESCE(SUM(amount), 0)
  INTO total_contributions
  FROM public.monthly_contributions;

  -- Calculate total amount requested for approved emergency requests
  SELECT COALESCE(SUM(amount_requested), 0)
  INTO total_disbursed
  FROM public.emergency_requests
  WHERE status = 'approved';

  -- Calculate total amount returned for emergency requests (only those that were approved)
  SELECT COALESCE(SUM(amount_returned), 0)
  INTO total_returned
  FROM public.emergency_requests
  WHERE status = 'approved' AND amount_returned IS NOT NULL;

  RETURN total_contributions - total_disbursed + total_returned;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users so they can call this function
GRANT EXECUTE ON FUNCTION public.get_total_family_savings() TO authenticated;


--------------------------------------------------------------------------------
-- Row Level Security (RLS) Policies
--------------------------------------------------------------------------------

-- PROFILES Table RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view basic info of all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by users who created them." ON public.profiles;
DROP POLICY IF EXISTS "Profiles are updateable by users who created them." ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view basic info of all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true); -- Allows selection of specific columns (id, full_name, avatar_url) as defined in your API queries

CREATE POLICY "Profiles are viewable by users who created them."
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Profiles are updateable by users who created them."
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can manage all profiles"
ON public.profiles FOR ALL -- Covers SELECT, INSERT, UPDATE, DELETE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


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
DROP POLICY IF EXISTS "Authenticated users can view all emergency_requests" ON public.emergency_requests;
DROP POLICY IF EXISTS "Authenticated users can insert their own emergency_requests" ON public.emergency_requests;
DROP POLICY IF EXISTS "Admins can manage all emergency_requests" ON public.emergency_requests;

CREATE POLICY "Authenticated users can view all emergency_requests"
ON public.emergency_requests FOR SELECT
TO authenticated
USING (true); -- Allows all authenticated users to see all requests (for dashboard view)

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
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins can view all notifications" ON public.notifications; -- More specific admin SELECT
DROP POLICY IF EXISTS "Admins can manage all notifications" ON public.notifications; -- Broader admin ALL

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
    -- RLS on emergency_requests is implicitly checked here for the user.
  )
);

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all notifications"
ON public.notifications FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


--------------------------------------------------------------------------------
-- STORAGE ROW LEVEL SECURITY for 'profile-pic' bucket
-- Assumes bucket 'profile-pic' exists and is public or private as needed.
-- These policies assume files are stored like: `user_id/filename.png`
--------------------------------------------------------------------------------

-- Policy: Users can view their own profile pictures
DROP POLICY IF EXISTS "User can view their own profile pictures" ON storage.objects;
CREATE POLICY "User can view their own profile pictures"
    FOR SELECT
    USING (bucket_id = 'profile-pic' AND auth.uid() = (storage.foldername(name))[1]::uuid);

-- Policy: Users can upload to their own folder in 'profile-pic'
DROP POLICY IF EXISTS "User can upload to their own profile picture folder" ON storage.objects;
CREATE POLICY "User can upload to their own profile picture folder"
    FOR INSERT
    WITH CHECK (bucket_id = 'profile-pic' AND auth.uid() = (storage.foldername(name))[1]::uuid);

-- Policy: Users can update their own profile pictures
DROP POLICY IF EXISTS "User can update their own profile pictures" ON storage.objects;
CREATE POLICY "User can update their own profile pictures"
    FOR UPDATE
    USING (bucket_id = 'profile-pic' AND auth.uid() = (storage.foldername(name))[1]::uuid)
    WITH CHECK (bucket_id = 'profile-pic' AND auth.uid() = (storage.foldername(name))[1]::uuid);

-- Policy: Users can delete their own profile pictures
DROP POLICY IF EXISTS "User can delete their own profile pictures" ON storage.objects;
CREATE POLICY "User can delete their own profile pictures"
    FOR DELETE
    USING (bucket_id = 'profile-pic' AND auth.uid() = (storage.foldername(name))[1]::uuid);

-- Policy: Admins can manage all objects in 'profile-pic' bucket
DROP POLICY IF EXISTS "Admins can manage all profile pictures" ON storage.objects;
CREATE POLICY "Admins can manage all profile pictures"
    FOR ALL -- SELECT, INSERT, UPDATE, DELETE
    USING (bucket_id = 'profile-pic' AND public.is_admin(auth.uid()))
    WITH CHECK (bucket_id = 'profile-pic' AND public.is_admin(auth.uid()));


--------------------------------------------------------------------------------
-- Potential Database Indexes (Uncomment and adapt as needed based on query performance)
--------------------------------------------------------------------------------
/*
-- Profiles table
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Monthly Contributions table
CREATE INDEX IF NOT EXISTS idx_monthly_contributions_user_id ON public.monthly_contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_monthly_contributions_payment_date ON public.monthly_contributions(payment_date);
CREATE INDEX IF NOT EXISTS idx_monthly_contributions_year_month ON public.monthly_contributions(year, month);

-- Emergency Requests table
CREATE INDEX IF NOT EXISTS idx_emergency_requests_user_id ON public.emergency_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_status ON public.emergency_requests(status);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_requested_at ON public.emergency_requests(requested_at);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_return_date ON public.emergency_requests(return_date);

-- Notifications table
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_related_request_id ON public.notifications(related_request_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read_at ON public.notifications(user_id, read_at);
*/

-- End of Schema
