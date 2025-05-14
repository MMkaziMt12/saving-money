-- Enable the pgvector extension if not already enabled
-- create extension if not exists vector;

-- Function to check if a user is an admin (SECURITY DEFINER for safe RLS checks)
CREATE OR REPLACE FUNCTION public.is_admin(user_id_to_check UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = user_id_to_check;
  RETURN user_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on is_admin to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;


-- Table for User Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  full_name TEXT,
  email TEXT UNIQUE, -- Added unique constraint for email
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')), -- Added CHECK constraint for role
  is_approved BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP WITH TIME ZONE
);

-- Trigger function to automatically create a profile when a new user signs up in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url, role, is_approved)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    'user', -- Default role
    FALSE   -- Default approval status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; -- SECURITY DEFINER is important for triggers modifying other tables

-- Drop existing trigger if it exists to avoid conflicts
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- RLS Policies for Profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop old policies to ensure clean application
DROP POLICY IF EXISTS "Profiles are viewable by users who created them." ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile data" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view all profiles for joins" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view basic public profile info" ON public.profiles;


-- 1. Authenticated users can view all profiles (needed for joins to display names, etc.)
CREATE POLICY "Authenticated users can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- 2. Users can update their OWN profile.
CREATE POLICY "Users can update their own profile data"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 3. Admins can perform ANY action on ANY profile.
CREATE POLICY "Admins can manage all profiles"
ON public.profiles
FOR ALL -- Covers SELECT, INSERT, UPDATE, DELETE
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));


-- Table for Monthly Contributions
CREATE TABLE IF NOT EXISTS public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= date_part('year', now()) + 5),
  recorded_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policies for Monthly Contributions
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only view their own monthly contributions." ON public.monthly_contributions;
DROP POLICY IF EXISTS "Admins can manage monthly contributions." ON public.monthly_contributions;

CREATE POLICY "Users can only view their own monthly contributions"
ON public.monthly_contributions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage monthly contributions"
ON public.monthly_contributions
FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));


-- Table for Emergency Requests
CREATE TABLE IF NOT EXISTS public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_requested NUMERIC NOT NULL CHECK (amount_requested > 0),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'repaid')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  return_date TIMESTAMP WITH TIME ZONE,
  amount_returned NUMERIC DEFAULT 0 CHECK (amount_returned >= 0),
  last_return_date TIMESTAMP WITH TIME ZONE,
  is_fully_repaid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policies for Emergency Requests
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to ensure clean application
DROP POLICY IF EXISTS "Users can only view their own emergency requests." ON public.emergency_requests;
DROP POLICY IF EXISTS "Admins can manage all emergency requests" ON public.emergency_requests;
DROP POLICY IF EXISTS "Authenticated users can view all emergency_requests" ON public.emergency_requests;
DROP POLICY IF EXISTS "Authenticated users can insert their own emergency_requests" ON public.emergency_requests;
DROP POLICY IF EXISTS "Admins can update emergency requests for repayments" ON public.emergency_requests;
DROP POLICY IF EXISTS "Admins can manage all emergency_requests" ON public.emergency_requests; -- common older name
DROP POLICY IF EXISTS "Users can create emergency requests" ON public.emergency_requests;

-- 1. Admins can do anything with emergency requests
CREATE POLICY "Admins can manage all emergency_requests"
ON public.emergency_requests
FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- 2. All authenticated users can VIEW all emergency requests (for the dashboard global view)
CREATE POLICY "Authenticated users can view all emergency_requests"
ON public.emergency_requests
FOR SELECT
TO authenticated
USING (true);

-- 3. Authenticated users can INSERT only their OWN emergency requests
CREATE POLICY "Authenticated users can insert their own emergency_requests"
ON public.emergency_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);


-- Table for Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type TEXT, -- e.g., 'contribution_reminder', 'emergency_update', 'general'
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    channel TEXT -- e.g., 'email', 'in_app', 'sms'
);

-- RLS Policies for Notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins can send notifications (insert only)" ON public.notifications;

CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins might need to insert notifications. Select/Update/Delete might be more restricted or via functions.
CREATE POLICY "Admins can send notifications (insert only)"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));


-- Function to get total family savings (Net Balance)
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

  -- Calculate total amount returned for approved emergency requests
  SELECT COALESCE(SUM(COALESCE(amount_returned, 0)), 0) -- Ensure amount_returned is treated as 0 if NULL
  INTO total_returned
  FROM public.emergency_requests
  WHERE status = 'approved'; -- Or consider all requests where amount_returned > 0

  RETURN total_contributions - total_disbursed + total_returned;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on get_total_family_savings to authenticated users
GRANT EXECUTE ON FUNCTION public.get_total_family_savings() TO authenticated;


-- Storage RLS Policies for 'profile-pic' bucket
-- Ensure the 'profile-pic' bucket exists in your Supabase Storage.

-- Allow authenticated users to view any file in 'profile-pic' (common for public avatars)
-- If you want avatars to be private, you'd restrict this further based on user_id in path.
CREATE POLICY "Authenticated users can view profile pictures"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'profile-pic');

-- Users can insert their own profile picture into a folder named with their user_id
CREATE POLICY "Users can upload their own profile picture"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-pic' AND
  auth.uid() = (storage.foldername(name))[1]::uuid -- Assumes folder structure like: user_id/filename.ext
);

-- Users can update their own profile picture
CREATE POLICY "Users can update their own profile picture"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-pic' AND
  auth.uid() = (storage.foldername(name))[1]::uuid
);

-- Users can delete their own profile picture
CREATE POLICY "Users can delete their own profile picture"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-pic' AND
  auth.uid() = (storage.foldername(name))[1]::uuid
);

-- Admins can manage all files in 'profile-pic' bucket
CREATE POLICY "Admins can manage all profile pictures"
ON storage.objects FOR ALL -- SELECT, INSERT, UPDATE, DELETE
TO authenticated
USING (
  bucket_id = 'profile-pic' AND
  is_admin(auth.uid()) -- Relies on your is_admin function
)
WITH CHECK (
  bucket_id = 'profile-pic' AND
  is_admin(auth.uid())
);
