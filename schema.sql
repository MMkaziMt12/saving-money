-- Enable the pgvector extension
-- create extension vector;

-- Function to check if a user is an admin (SECURITY DEFINER to bypass RLS for this check)
CREATE OR REPLACE FUNCTION public.is_admin(user_id_to_check uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin_role boolean;
BEGIN
  SELECT role = 'admin'
  INTO is_admin_role
  FROM public.profiles
  WHERE id = user_id_to_check;
  RETURN COALESCE(is_admin_role, false);
END;
$$;

-- Grant execute permission on is_admin to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;


-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url, role, is_approved, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    'user',  -- Default role
    FALSE,   -- Default approval status
    now(),
    now()
  );
  RETURN NEW;
END;
$$;

-- Trigger to call handle_new_user on new auth.users entry
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Table for User Profiles
create table public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  full_name TEXT,
  email TEXT UNIQUE, -- Ensure email is unique at DB level
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' NOT NULL,
  is_approved BOOLEAN DEFAULT FALSE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  last_login TIMESTAMP WITH TIME ZONE
);

-- RLS for Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by users who created them." ON public.profiles;
CREATE POLICY "Profiles are viewable by users who created them."
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles are updateable by users who created them." ON public.profiles;
CREATE POLICY "Profiles are updateable by users who created them."
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles"
ON public.profiles FOR ALL -- Covers SELECT, INSERT, UPDATE, DELETE
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));


-- Table for Monthly Contributions
create table public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  recorded_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS for Monthly Contributions
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only view their own monthly contributions." ON public.monthly_contributions;
CREATE POLICY "Users can only view their own monthly contributions."
ON public.monthly_contributions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Combined admin policy for monthly_contributions
DROP POLICY IF EXISTS "Admins can manage monthly contributions." ON public.monthly_contributions;
CREATE POLICY "Admins can manage monthly contributions."
ON public.monthly_contributions FOR ALL
TO authenticated
USING (is_admin(auth.uid()));


-- Table for Emergency Requests
create table public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount_requested NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  return_date TIMESTAMP WITH TIME ZONE, -- Made mandatory by form validation, can be NULL in DB initially if needed
  status TEXT DEFAULT 'pending' NOT NULL, -- e.g., pending, approved, rejected, repaid
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  amount_returned NUMERIC DEFAULT 0,
  last_return_date TIMESTAMP WITH TIME ZONE,
  is_fully_repaid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS for Emergency Requests
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to ensure clean application
DROP POLICY IF EXISTS "Users can only view their own emergency requests" ON public.emergency_requests;
DROP POLICY IF EXISTS "Admins can manage all emergency requests" ON public.emergency_requests;
DROP POLICY IF EXISTS "Users can create emergency requests" ON public.emergency_requests;
DROP POLICY IF EXISTS "Authenticated users can view all emergency_requests" ON public.emergency_requests;
DROP POLICY IF EXISTS "Admins can update emergency requests for repayments" ON public.emergency_requests;
DROP POLICY IF EXISTS "Authenticated users can insert their own emergency_requests" ON public.emergency_requests;


-- Policy: Admins can do anything with emergency requests
CREATE POLICY "Admins can manage all emergency_requests"
ON public.emergency_requests
FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Policy: All authenticated users (non-admins included) can VIEW all emergency requests
CREATE POLICY "Authenticated users can view all emergency_requests"
ON public.emergency_requests
FOR SELECT
TO authenticated
USING (true);

-- Policy: Authenticated users can INSERT only their OWN emergency requests
CREATE POLICY "Authenticated users can insert their own emergency_requests"
ON public.emergency_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);


-- Table for Notifications
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- Target user
    message TEXT NOT NULL,
    type TEXT, -- e.g., 'contribution_reminder', 'request_approved', 'general_announcement'
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    channel TEXT -- e.g., 'in_app', 'email' (for future use)
);

-- RLS for Notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications." ON public.notifications;
CREATE POLICY "Users can view their own notifications."
ON public.notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can send notifications." ON public.notifications;
CREATE POLICY "Admins can send notifications."
ON public.notifications FOR INSERT -- Admins can create notifications
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid())); -- Admins can insert, check ensures they are admin


-- Storage RLS for profile-pic bucket
-- Ensure 'profile-pic' bucket is created in Supabase Storage dashboard.

-- Policy: Allow users to view their own profile picture
DROP POLICY IF EXISTS "Allow individual user read access to their own folder" ON storage.objects;
CREATE POLICY "Allow individual user read access to their own folder"
FOR SELECT ON storage.objects
USING (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Allow users to upload to their own folder
DROP POLICY IF EXISTS "Allow individual user insert access to their own folder" ON storage.objects;
CREATE POLICY "Allow individual user insert access to their own folder"
FOR INSERT ON storage.objects
WITH CHECK (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Allow users to update their own profile picture
DROP POLICY IF EXISTS "Allow individual user update access to their own folder" ON storage.objects;
CREATE POLICY "Allow individual user update access to their own folder"
FOR UPDATE ON storage.objects
USING (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Allow users to delete their own profile picture
DROP POLICY IF EXISTS "Allow individual user delete access to their own folder" ON storage.objects;
CREATE POLICY "Allow individual user delete access to their own folder"
FOR DELETE ON storage.objects
USING (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Admins have full access to the profile-pic bucket
DROP POLICY IF EXISTS "Allow admin full access to profile-pic bucket" ON storage.objects;
CREATE POLICY "Allow admin full access to profile-pic bucket"
FOR ALL ON storage.objects -- ALL covers SELECT, INSERT, UPDATE, DELETE
USING (bucket_id = 'profile-pic' AND is_admin(auth.uid()))
WITH CHECK (bucket_id = 'profile-pic' AND is_admin(auth.uid()));


-- Function to get total family savings
-- This function is SECURITY DEFINER to bypass RLS for summing all contributions.
CREATE OR REPLACE FUNCTION public.get_total_family_savings()
RETURNS NUMERIC AS $$
BEGIN
  RETURN (
    SELECT COALESCE(SUM(amount), 0)
    FROM public.monthly_contributions
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users so they can call this function
GRANT EXECUTE ON FUNCTION public.get_total_family_savings() TO authenticated;
