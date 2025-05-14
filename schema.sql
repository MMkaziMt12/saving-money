-- Enable the pgvector extension if not already enabled (optional, for future use)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Function to check if a user is an admin (SECURITY DEFINER to bypass RLS for this check)
CREATE OR REPLACE FUNCTION is_admin(user_id_to_check UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_role TEXT;
BEGIN
  SELECT role INTO admin_role FROM profiles WHERE id = user_id_to_check;
  RETURN admin_role = 'admin';
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RETURN FALSE;
END;
$$;

-- Table for User Profiles
DROP TABLE IF EXISTS public.profiles CASCADE; -- Cascade to drop dependent objects like policies, FKs if re-running
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  full_name TEXT,
  email TEXT UNIQUE, -- Added unique constraint for email
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')), -- Ensure role is one of the defined values
  is_approved BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP WITH TIME ZONE
);

-- Policies for Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by users who created them." ON public.profiles;
CREATE POLICY "Profiles are viewable by users who created them." ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles are updateable by users who created them." ON public.profiles;
CREATE POLICY "Profiles are updateable by users who created them." ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Trigger function to create a profile entry when a new user signs up in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Important: Allows the trigger to write to public.profiles
SET search_path = public
AS $$
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
$$;

-- Trigger to execute the function after a new user is inserted into auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Table for Monthly Contributions
DROP TABLE IF EXISTS public.monthly_contributions CASCADE;
CREATE TABLE public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= date_part('year', now()) + 5),
  recorded_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Policies for Monthly Contributions
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own contributions" ON public.monthly_contributions;
CREATE POLICY "Users can manage their own contributions"
  ON public.monthly_contributions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all contributions" ON public.monthly_contributions;
CREATE POLICY "Admins can manage all contributions"
  ON public.monthly_contributions FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Function to get total family savings (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION get_total_family_savings()
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER -- IMPORTANT: Runs with definer's privileges, bypassing RLS for the internal query
SET search_path = public -- Ensures the function can find tables in the public schema
AS $$
DECLARE
  total_sum NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total_sum FROM monthly_contributions;
  RETURN total_sum;
EXCEPTION
  WHEN OTHERS THEN -- Basic error handling
    RAISE WARNING 'Error in get_total_family_savings: %', SQLERRM;
    RETURN 0; -- Or handle as appropriate
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_total_family_savings() TO authenticated;


-- Table for Emergency Requests
DROP TABLE IF EXISTS public.emergency_requests CASCADE;
CREATE TABLE public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_requested NUMERIC NOT NULL CHECK (amount_requested > 0),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  admin_notes TEXT
);

-- Policies for Emergency Requests
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view and create their own emergency requests" ON public.emergency_requests;
CREATE POLICY "Users can view and create their own emergency requests"
  ON public.emergency_requests FOR ALL -- Allows SELECT, INSERT, UPDATE, DELETE by owner
  TO authenticated
  USING (auth.uid() = user_id AND status = 'pending') -- User can update/delete only if pending
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their non-pending requests" ON public.emergency_requests;
CREATE POLICY "Users can view their non-pending requests"
  ON public.emergency_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND status <> 'pending');


DROP POLICY IF EXISTS "Admins can manage all emergency requests" ON public.emergency_requests;
CREATE POLICY "Admins can manage all emergency requests"
  ON public.emergency_requests FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));


-- Table for Notifications
DROP TABLE IF EXISTS public.notifications CASCADE;
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT CHECK (type IN ('contribution_reminder', 'emergency_update', 'approval_status', 'general')),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  channel TEXT CHECK (channel IN ('email', 'whatsapp', 'app')),
  is_read BOOLEAN DEFAULT FALSE
);

-- Policies for Notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can mark their notifications as read" ON public.notifications;
CREATE POLICY "Users can mark their notifications as read"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND is_read = TRUE); -- Can only update to mark as read

DROP POLICY IF EXISTS "Admins can send notifications (insert)" ON public.notifications;
CREATE POLICY "Admins can send notifications (insert)"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (is_admin(auth.uid()));

-- Storage RLS for profile pictures
-- Bucket: profile-pic (ensure this bucket exists and is public or private as needed)

-- Policy for users to view their own profile picture
DROP POLICY IF EXISTS "User can view own profile picture" ON storage.objects;
CREATE POLICY "User can view own profile picture"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy for users to upload/insert their profile picture
DROP POLICY IF EXISTS "User can upload own profile picture" ON storage.objects;
CREATE POLICY "User can upload own profile picture"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy for users to update their profile picture
DROP POLICY IF EXISTS "User can update own profile picture" ON storage.objects;
CREATE POLICY "User can update own profile picture"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy for users to delete their own profile picture
DROP POLICY IF EXISTS "User can delete own profile picture" ON storage.objects;
CREATE POLICY "User can delete own profile picture"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy for admins to have full access to the profile-pic bucket
DROP POLICY IF EXISTS "Admins have full access to profile-pic bucket" ON storage.objects;
CREATE POLICY "Admins have full access to profile-pic bucket"
  ON storage.objects FOR ALL
  USING (bucket_id = 'profile-pic' AND is_admin(auth.uid()));
  
-- Ensure new users can select from their own profile upon creation by trigger
-- This is more of a safeguard. The `is_admin` function handles broader admin access.
-- The `handle_new_user` trigger runs as SECURITY DEFINER, so it can insert.
-- Individual user access is then granted by other policies.
