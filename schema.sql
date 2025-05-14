-- Enable the pgvector extension if not already enabled (optional, for future use)
CREATE EXTENSION IF NOT EXISTS vector;

-- Function to safely check if a user is an admin (SECURITY DEFINER to bypass RLS for this specific check)
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
DROP TABLE IF EXISTS public.profiles CASCADE; -- Ensure clean slate if re-running
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  full_name TEXT,
  email TEXT UNIQUE, -- Make email unique at DB level
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_approved BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP WITH TIME ZONE
);

-- Trigger function to create a profile entry when a new user signs up in auth.users
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
$$ LANGUAGE plpgsql SECURITY DEFINER; -- SECURITY DEFINER is crucial here

-- Drop existing trigger if it exists, then create the new one
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for Profiles
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
DROP TABLE IF EXISTS public.monthly_contributions CASCADE;
CREATE TABLE public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  recorded_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies for Monthly Contributions
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own monthly contributions." ON public.monthly_contributions;
CREATE POLICY "Users can view their own monthly contributions."
  ON public.monthly_contributions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all monthly contributions." ON public.monthly_contributions;
CREATE POLICY "Admins can manage all monthly contributions."
  ON public.monthly_contributions FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));


-- Table for Emergency Requests
DROP TABLE IF EXISTS public.emergency_requests CASCADE;
CREATE TABLE public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_requested NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'repaid')), -- Consider 'repaid' status
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  return_date TIMESTAMP WITH TIME ZONE, -- User specified expected return date
  amount_returned NUMERIC DEFAULT 0,
  last_return_date TIMESTAMP WITH TIME ZONE,
  is_fully_repaid BOOLEAN DEFAULT FALSE,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies for Emergency Requests
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all emergency_requests" ON public.emergency_requests;
CREATE POLICY "Admins can manage all emergency_requests"
  ON public.emergency_requests FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view all emergency_requests" ON public.emergency_requests;
CREATE POLICY "Authenticated users can view all emergency_requests"
  ON public.emergency_requests FOR SELECT
  TO authenticated
  USING (true); -- Allows any authenticated user to read all rows

DROP POLICY IF EXISTS "Authenticated users can insert their own emergency_requests" ON public.emergency_requests;
CREATE POLICY "Authenticated users can insert their own emergency_requests"
  ON public.emergency_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Table for Notifications
DROP TABLE IF EXISTS public.notifications CASCADE;
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT, -- e.g., 'contribution_reminder', 'emergency_update', 'general'
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  channel TEXT -- e.g., 'in-app', 'email' (for future use)
);

-- RLS Policies for Notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications." ON public.notifications;
CREATE POLICY "Users can view their own notifications."
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can send notifications (insert)." ON public.notifications;
CREATE POLICY "Admins can send notifications (insert)."
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (is_admin(auth.uid()));


-- Function to get NET total family savings (balance)
-- This function is SECURITY DEFINER to bypass RLS for summing all contributions and requests.
CREATE OR REPLACE FUNCTION public.get_total_family_savings()
RETURNS NUMERIC AS $$
DECLARE
  total_contributions NUMERIC;
  total_disbursed NUMERIC;
  total_repaid NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total_contributions FROM public.monthly_contributions;

  SELECT COALESCE(SUM(amount_requested), 0) INTO total_disbursed
  FROM public.emergency_requests
  WHERE status = 'approved'; -- Only count approved requests as disbursed

  SELECT COALESCE(SUM(amount_returned), 0) INTO total_repaid
  FROM public.emergency_requests
  WHERE status = 'approved'; -- Only count repayments against approved requests

  RETURN total_contributions - total_disbursed + total_repaid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users so they can call this function
GRANT EXECUTE ON FUNCTION public.get_total_family_savings() TO authenticated;


-- RLS for Supabase Storage bucket: 'profile-pic'
-- Bucket: profile-pic
-- Make sure this bucket exists in your Supabase Storage.

-- Policy: Allow users to view their own profile picture.
DROP POLICY IF EXISTS "User can view own profile picture" ON storage.objects;
CREATE POLICY "User can view own profile picture"
  FOR SELECT
  ON storage.objects
  USING (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Allow users to upload/insert their profile picture.
-- File path must start with their user_id.
DROP POLICY IF EXISTS "User can upload own profile picture" ON storage.objects;
CREATE POLICY "User can upload own profile picture"
  FOR INSERT
  ON storage.objects
  WITH CHECK (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Allow users to update their profile picture.
DROP POLICY IF EXISTS "User can update own profile picture" ON storage.objects;
CREATE POLICY "User can update own profile picture"
  FOR UPDATE
  ON storage.objects
  USING (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Allow users to delete their own profile picture.
DROP POLICY IF EXISTS "User can delete own profile picture" ON storage.objects;
CREATE POLICY "User can delete own profile picture"
  FOR DELETE
  ON storage.objects
  USING (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Admins have full access to the profile-pic bucket.
-- This assumes the is_admin(uuid) function is defined and working.
DROP POLICY IF EXISTS "Admin full access to profile-pic bucket" ON storage.objects;
CREATE POLICY "Admin full access to profile-pic bucket"
  FOR ALL -- SELECT, INSERT, UPDATE, DELETE
  ON storage.objects
  USING (bucket_id = 'profile-pic' AND is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'profile-pic' AND is_admin(auth.uid()));

-- Make bucket public if it's intended to be (usually profile pictures are)
-- If you created the bucket as private, and want image URLs to work directly, make it public.
-- Otherwise, you'll need to generate signed URLs.
-- Example: Update this based on your bucket settings.
-- If your bucket is already public, this isn't strictly necessary but good for explicitness.
-- You can manage bucket public/private status in the Supabase Dashboard.
-- For this example, assuming you want profile pictures to be publicly accessible via their URL once RLS allows access to the metadata.
-- Note: RLS still controls WHO can see the *existence* of a file and its metadata. Public bucket means if someone has the URL, they can view the file.
-- Consider if your `avatar_url` in `profiles` stores the direct public URL or if you construct it.

-- Function to get profile path for a user
CREATE OR REPLACE FUNCTION get_profile_avatar_path(user_id_to_check UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN user_id_to_check || '/';
END;
$$ LANGUAGE plpgsql STABLE;
GRANT EXECUTE ON FUNCTION get_profile_avatar_path(UUID) TO authenticated;
