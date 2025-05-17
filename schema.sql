
-- Enable CUID extension if you plan to use CUIDs for IDs instead of UUIDs (optional)
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- For gen_random_uuid() if not enabled by default

-- Enable pgvector extension (if you plan to use vector embeddings, not strictly needed for current features)
CREATE EXTENSION IF NOT EXISTS vector;

-- Function to automatically update 'updated_at' timestamps
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. PROFILES TABLE
-- Stores user profile information, extending the auth.users table.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  full_name TEXT,
  email TEXT UNIQUE, -- Ensure email is unique if you're copying it here
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' NOT NULL CHECK (role IN ('user', 'admin')),
  is_approved BOOLEAN DEFAULT FALSE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  last_login TIMESTAMP WITH TIME ZONE
);
COMMENT ON TABLE public.profiles IS 'User profile information, extending auth.users.';

-- Trigger for 'updated_at' on profiles table
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- 2. MONTHLY CONTRIBUTIONS TABLE
-- Tracks monthly contributions made by users.
CREATE TABLE IF NOT EXISTS public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100), -- Adjust range as needed
  recorded_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Admin who recorded it
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
COMMENT ON TABLE public.monthly_contributions IS 'Tracks monthly financial contributions from users.';

-- Trigger for 'updated_at' on monthly_contributions table
DROP TRIGGER IF EXISTS set_monthly_contributions_updated_at ON public.monthly_contributions;
CREATE TRIGGER set_monthly_contributions_updated_at
BEFORE UPDATE ON public.monthly_contributions
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- 3. EMERGENCY REQUESTS TABLE
-- Manages emergency fund requests from users.
CREATE TABLE IF NOT EXISTS public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_requested NUMERIC NOT NULL CHECK (amount_requested > 0),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'repaid', 'overdue')), -- Consider 'repaid' and 'overdue' for clarity
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  return_date TIMESTAMP WITH TIME ZONE, -- Expected return date
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  amount_returned NUMERIC DEFAULT 0 CHECK (amount_returned >= 0),
  last_return_date TIMESTAMP WITH TIME ZONE,
  is_fully_repaid BOOLEAN DEFAULT FALSE NOT NULL,
  admin_notes TEXT, -- Notes from admin during review or management
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
COMMENT ON TABLE public.emergency_requests IS 'Manages emergency fund requests and their lifecycle.';

-- Trigger for 'updated_at' on emergency_requests table
DROP TRIGGER IF EXISTS set_emergency_requests_updated_at ON public.emergency_requests;
CREATE TRIGGER set_emergency_requests_updated_at
BEFORE UPDATE ON public.emergency_requests
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- 4. NOTIFICATIONS TABLE
-- Stores notifications for users.
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'general', -- e.g., 'general', 'contribution_reminder', 'emergency_update'
  link TEXT, -- Optional URL to navigate to when notification is clicked
  related_request_id UUID REFERENCES public.emergency_requests(id) ON DELETE SET NULL, -- Link to specific request
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL -- Null if unread, timestamp when read
  -- 'updated_at' is not typically needed for notifications unless they are editable
);
COMMENT ON TABLE public.notifications IS 'Stores in-app notifications for users.';


-- HELPER FUNCTIONS & TRIGGERS FOR AUTH AND ROLES

-- Function to check if a user is an admin (SECURITY DEFINER to bypass RLS for this check)
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
COMMENT ON FUNCTION public.is_admin(UUID) IS 'Checks if a given user_id has the admin role. SECURITY DEFINER.';

-- Trigger function to create a profile when a new user signs up in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  raw_meta jsonb;
  user_full_name text;
  user_avatar_url text;
  user_email text;
BEGIN
  raw_meta := new.raw_user_meta_data;
  user_email := new.email; -- Get email from auth.users

  -- Attempt to get full_name and avatar_url from raw_user_meta_data (common with OAuth providers like Google)
  user_full_name := raw_meta->>'full_name';
  IF user_full_name IS NULL THEN
    user_full_name := raw_meta->>'name'; -- Some providers might use 'name'
  END IF;
  user_avatar_url := raw_meta->>'avatar_url';
  IF user_avatar_url IS NULL THEN
    user_avatar_url := raw_meta->>'picture'; -- Some providers might use 'picture'
  END IF;

  INSERT INTO public.profiles (id, full_name, email, avatar_url, role, is_approved, is_active)
  VALUES (
    new.id,
    user_full_name,
    user_email,
    user_avatar_url,
    'user',  -- Default role
    FALSE, -- Default not approved
    TRUE   -- Default active
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates a profile for new auth.users. SECURITY DEFINER.';

-- Trigger to call handle_new_user on new auth.users entries
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- RPC FUNCTION FOR DASHBOARD
-- Function to get the net total family savings balance
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
COMMENT ON FUNCTION public.get_total_family_savings() IS 'Calculates the net current balance of the family fund. SECURITY DEFINER.';

-- Grant execute permission for the RPC
GRANT EXECUTE ON FUNCTION public.get_total_family_savings() TO authenticated;


-- ROW LEVEL SECURITY (RLS) POLICIES

-- 1. PROFILES RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- Users can view their own full profile.
DROP POLICY IF EXISTS "Profiles are viewable by users who created them." ON public.profiles;
CREATE POLICY "Profiles are viewable by users who created them."
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Users can update their own profile.
DROP POLICY IF EXISTS "Profiles are updateable by users who created them." ON public.profiles;
CREATE POLICY "Profiles are updateable by users who created them."
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Admins can manage (view, insert, update, delete) all profiles.
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles"
ON public.profiles FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Authenticated users can view basic info (id, full_name, avatar_url) of all profiles (e.g., for lists).
DROP POLICY IF EXISTS "Authenticated users can view basic info of all profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view basic info of all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true); -- This allows selecting specific columns mentioned above, but the actual column access is still governed by the query.


-- 2. MONTHLY CONTRIBUTIONS RLS
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;
-- Users can view their own contributions.
DROP POLICY IF EXISTS "Users can view their own monthly contributions." ON public.monthly_contributions;
CREATE POLICY "Users can view their own monthly contributions."
ON public.monthly_contributions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can manage all monthly contributions.
DROP POLICY IF EXISTS "Admins can manage monthly contributions." ON public.monthly_contributions;
CREATE POLICY "Admins can manage monthly contributions."
ON public.monthly_contributions FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


-- 3. EMERGENCY REQUESTS RLS
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;
-- All authenticated users can view all emergency requests (for dashboard transparency).
DROP POLICY IF EXISTS "Authenticated users can view all emergency_requests" ON public.emergency_requests;
CREATE POLICY "Authenticated users can view all emergency_requests"
ON public.emergency_requests FOR SELECT
TO authenticated
USING (true);

-- Users can insert their own emergency requests.
DROP POLICY IF EXISTS "Authenticated users can insert their own emergency_requests" ON public.emergency_requests;
CREATE POLICY "Authenticated users can insert their own emergency_requests"
ON public.emergency_requests FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Admins can manage all emergency requests.
DROP POLICY IF EXISTS "Admins can manage all emergency_requests" ON public.emergency_requests;
CREATE POLICY "Admins can manage all emergency_requests"
ON public.emergency_requests FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


-- 4. NOTIFICATIONS RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
-- Users can view notifications specifically sent to them.
DROP POLICY IF EXISTS "Users can view their direct notifications" ON public.notifications;
CREATE POLICY "Users can view their direct notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can view notifications linked to an emergency request they are allowed to see.
DROP POLICY IF EXISTS "Users can view notifications for accessible emergency requests" ON public.notifications;
CREATE POLICY "Users can view notifications for accessible emergency requests"
ON public.notifications FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.emergency_requests er
    WHERE er.id = public.notifications.related_request_id
    -- RLS on emergency_requests (er) table is implicitly applied here by Supabase
  )
);

-- Users can update their own notifications (primarily to mark as read).
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Admins can manage all notifications.
DROP POLICY IF EXISTS "Admins can manage all notifications" ON public.notifications;
CREATE POLICY "Admins can manage all notifications"
ON public.notifications FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


-- STORAGE RLS POLICIES for 'profile-pic' bucket

-- Policy: Allow authenticated users to view files in 'profile-pic' bucket.
-- This is a broad read access; adjust if more specific path-based read access is needed.
DROP POLICY IF EXISTS "Authenticated users can view profile pictures" ON storage.objects;
CREATE POLICY "Authenticated users can view profile pictures"
FOR SELECT ON storage.objects
TO authenticated
USING (bucket_id = 'profile-pic');

-- Policy: Allow users to upload to their own folder within 'profile-pic' bucket.
-- Assumes files are stored like: profile-pic/{user_id}/filename.ext
DROP POLICY IF EXISTS "Users can upload their own profile pictures" ON storage.objects;
CREATE POLICY "Users can upload their own profile pictures"
FOR INSERT ON storage.objects
TO authenticated
WITH CHECK (
  bucket_id = 'profile-pic' AND
  auth.uid() = (storage.foldername(name))[1]::UUID -- Extracts user_id from path like 'user_id/file.png'
  -- For simpler paths like '{user_id}.png', the check might be different or use metadata.
  -- If paths are just '{user_id}/avatar.png', this works.
  -- OR: auth.uid() = (string_to_array(name, '/'))[1]::UUID -- if your path is like `user_id/avatar.png`
);

-- Policy: Allow users to update/delete their own files in 'profile-pic'.
DROP POLICY IF EXISTS "Users can update_delete their own profile pictures" ON storage.objects;
CREATE POLICY "Users can update_delete their own profile pictures"
FOR UPDATE, DELETE ON storage.objects
TO authenticated
USING (
  bucket_id = 'profile-pic' AND
  auth.uid() = (storage.foldername(name))[1]::UUID
);


-- Policy: Admins can manage all files in 'profile-pic' bucket.
DROP POLICY IF EXISTS "Admins can manage all profile pictures" ON storage.objects;
CREATE POLICY "Admins can manage all profile pictures"
FOR ALL ON storage.objects -- SELECT, INSERT, UPDATE, DELETE
TO authenticated
USING (
  bucket_id = 'profile-pic' AND
  public.is_admin(auth.uid())
)
WITH CHECK (
  bucket_id = 'profile-pic' AND
  public.is_admin(auth.uid())
);


-- Ensure public read access for the bucket 'profile-pic' if avatars are to be displayed via public URLs.
-- If you've already made the bucket public via the dashboard, this SQL isn't strictly necessary
-- but included for completeness if setting up from scratch via SQL.
-- Note: Making a bucket public means RLS policies for SELECT are bypassed for anonymous access via public URLs.
-- However, RLS still applies for direct SELECT queries via the API by authenticated users.
-- If you want public URLs to respect RLS, the bucket must be private, and you'd use signed URLs.
-- For profile pictures, public is common.
-- Example to potentially make bucket public if NOT already (via dashboard is easier):
-- UPDATE storage.buckets SET public = TRUE WHERE id = 'profile-pic';
-- This is commented out as it's usually a one-time dashboard setting.


-- Final comments
COMMENT ON SCHEMA public IS 'Standard public schema';
-- Ensure functions are owned by supabase_admin or a role that bypasses RLS if they access restricted tables
-- For SECURITY DEFINER functions, this is critical.
-- The default owner during creation through SQL editor as a superuser is usually fine.

-- Grant usage on schema and select on tables for service roles if needed for specific backend processes
-- (though service_role typically bypasses RLS).
-- GRANT USAGE ON SCHEMA public TO service_role;
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;


SELECT 'Database schema setup script completed.';
