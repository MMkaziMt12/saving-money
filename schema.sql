-- Enable the pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Function to check if a user is an admin
-- SECURITY DEFINER allows this function to bypass RLS for its internal query
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

-- Grant execute permission on is_admin to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;


-- Table for User Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  full_name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_approved BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP WITH TIME ZONE
);

-- RLS for Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by users who created them." ON public.profiles;
CREATE POLICY "Profiles are viewable by users who created them." ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles are updateable by users who created them." ON public.profiles;
CREATE POLICY "Profiles are updateable by users who created them." ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL -- Covers SELECT, INSERT, UPDATE, DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Trigger function to create a profile entry when a new auth.users is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  raw_meta_data JSONB;
  user_email TEXT;
  user_full_name TEXT;
  user_avatar_url TEXT;
BEGIN
  raw_meta_data := NEW.raw_user_meta_data;
  user_email := COALESCE(NEW.email, raw_meta_data->>'email');
  user_full_name := raw_meta_data->>'full_name';
  
  -- For Google, avatar URL might be in raw_user_meta_data->>'avatar_url' or raw_user_meta_data->>'picture'
  user_avatar_url := COALESCE(raw_meta_data->>'avatar_url', raw_meta_data->>'picture');

  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, is_approved)
  VALUES (
    NEW.id,
    user_email,
    user_full_name,
    user_avatar_url,
    'user', -- Default role
    FALSE   -- Default approval status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; -- SECURITY DEFINER is crucial for the trigger to write to profiles table

-- Drop existing trigger if it exists to avoid conflicts
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Table for Monthly Contributions
CREATE TABLE IF NOT EXISTS public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  recorded_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS for Monthly Contributions
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own monthly contributions." ON public.monthly_contributions;
CREATE POLICY "Users can view their own monthly contributions." ON public.monthly_contributions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all monthly contributions." ON public.monthly_contributions;
CREATE POLICY "Admins can manage all monthly contributions." ON public.monthly_contributions
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));


-- Table for Emergency Requests
CREATE TABLE IF NOT EXISTS public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_requested NUMERIC NOT NULL CHECK (amount_requested > 0),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  return_date TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- New column
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS for Emergency Requests
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create and view their own emergency requests." ON public.emergency_requests;
CREATE POLICY "Users can create and view their own emergency requests." ON public.emergency_requests
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all emergency requests." ON public.emergency_requests;
CREATE POLICY "Admins can manage all emergency requests." ON public.emergency_requests
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));


-- Table for Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT, -- e.g., 'contribution_reminder', 'emergency_update', 'general'
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  channel TEXT -- e.g., 'in_app', 'email' (future use)
);

-- RLS for Notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can access their own notifications." ON public.notifications;
CREATE POLICY "Users can access their own notifications." ON public.notifications
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all notifications (for system-wide alerts, etc.)." ON public.notifications;
CREATE POLICY "Admins can manage all notifications (for system-wide alerts, etc.)." ON public.notifications
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Function to get total family savings
CREATE OR REPLACE FUNCTION public.get_total_family_savings()
RETURNS NUMERIC AS $$
BEGIN
  RETURN (
    SELECT COALESCE(SUM(amount), 0)
    FROM public.monthly_contributions
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_total_family_savings() TO authenticated;


-- Storage RLS for profile pictures in 'profile-pic' bucket
-- Ensure bucket 'profile-pic' is created in Supabase Storage
-- Policies for 'profile-pic' bucket

-- Allow public read access for avatars (common setup, adjust if needed)
-- If you want avatars to be private and only accessible by logged-in users or specific users,
-- you would remove this public read and add more specific SELECT policies.
-- For simplicity of displaying avatars widely (e.g., admin views, user lists), public read is often used.
-- Ensure your files are uploaded with user_id prefix for user-specific policies to work.
-- CREATE POLICY "Profile pictures are publicly readable."
-- ON storage.objects FOR SELECT
-- USING ( bucket_id = 'profile-pic' );

-- Users can view their own files or files if they are admin
CREATE POLICY "Users can view their own profile pictures"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'profile-pic' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admins can view all profile pictures"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'profile-pic' AND public.is_admin(auth.uid()));


-- Users can upload to their own folder
CREATE POLICY "Users can upload their own profile picture."
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-pic' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Admins can upload any profile picture (less common, but for completeness)
CREATE POLICY "Admins can upload any profile picture."
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-pic' AND public.is_admin(auth.uid()));


-- Users can update their own profile picture
CREATE POLICY "Users can update their own profile picture."
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-pic' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Admins can update any profile picture
CREATE POLICY "Admins can update any profile picture."
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-pic' AND public.is_admin(auth.uid()));


-- Users can delete their own profile picture
CREATE POLICY "Users can delete their own profile picture."
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'profile-pic' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Admins can delete any profile picture
CREATE POLICY "Admins can delete any profile picture."
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'profile-pic' AND public.is_admin(auth.uid()));
