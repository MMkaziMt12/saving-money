
-- Ensure the necessary extensions are enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS "vector"; -- pgvector, if needed for future embedding features

-- Table for User Profiles
-- Stores application-specific user data, linked to Supabase auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  full_name TEXT,
  email TEXT UNIQUE, -- Email should be unique, often managed by auth
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_approved BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP WITH TIME ZONE
);
COMMENT ON TABLE public.profiles IS 'Stores application-specific user data, linked to auth.users.';

-- Helper function to check if the current user is an admin
-- SECURITY DEFINER allows this function to bypass RLS of the calling user for its internal query
CREATE OR REPLACE FUNCTION public.is_admin(user_id_to_check UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = user_id_to_check;
  RETURN user_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
COMMENT ON FUNCTION public.is_admin(UUID) IS 'Checks if a given user ID has the admin role. SECURITY DEFINER.';

-- Trigger function to automatically create a profile when a new user signs up in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url, role, is_approved, last_login)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name', -- Attempt to get full_name from metadata (e.g., Google OAuth)
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url', -- Attempt to get avatar_url from metadata
    'user',  -- Default role
    FALSE,   -- Default approval status
    now()    -- Set initial last_login
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates a profile for new auth.users. Populates name/avatar from metadata if available. SECURITY DEFINER.';

-- Trigger to execute handle_new_user after a new user is inserted into auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Row Level Security (RLS) for profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view all profiles" -- Changed to allow viewing all for joins
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can manage all profiles"
ON public.profiles FOR ALL -- Covers SELECT, INSERT, UPDATE, DELETE for admins
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));


-- Table for Monthly Contributions
CREATE TABLE IF NOT EXISTS public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  recorded_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
COMMENT ON TABLE public.monthly_contributions IS 'Tracks monthly contributions from users.';

-- RLS for monthly_contributions
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own contributions" ON public.monthly_contributions;
DROP POLICY IF EXISTS "Admins can manage all contributions" ON public.monthly_contributions;

CREATE POLICY "Users can view their own contributions"
ON public.monthly_contributions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all contributions"
ON public.monthly_contributions FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));


-- Table for Emergency Requests
CREATE TABLE IF NOT EXISTS public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_requested NUMERIC NOT NULL CHECK (amount_requested > 0),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')), -- Added CHECK constraint
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  return_date TIMESTAMP WITH TIME ZONE, -- Expected return date
  amount_returned NUMERIC DEFAULT 0 CHECK (amount_returned >= 0),
  last_return_date TIMESTAMP WITH TIME ZONE,
  is_fully_repaid BOOLEAN DEFAULT FALSE,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
COMMENT ON TABLE public.emergency_requests IS 'Tracks emergency fund requests from users.';

-- RLS for emergency_requests
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view all emergency_requests" ON public.emergency_requests;
DROP POLICY IF EXISTS "Users can insert their own emergency_requests" ON public.emergency_requests;
DROP POLICY IF EXISTS "Admins can manage all emergency_requests" ON public.emergency_requests;

CREATE POLICY "Authenticated users can view all emergency_requests"
ON public.emergency_requests FOR SELECT
TO authenticated
USING (true); -- Allows all authenticated users to see all requests for dashboard display

CREATE POLICY "Users can insert their own emergency_requests"
ON public.emergency_requests FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all emergency_requests"
ON public.emergency_requests FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));


-- Table for Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'general',
  link TEXT,
  related_request_id UUID REFERENCES public.emergency_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);
COMMENT ON TABLE public.notifications IS 'Stores in-app notifications for users.';

-- RLS for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their direct notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view notifications for accessible emergency requests" ON public.notifications;
DROP POLICY IF EXISTS "Admins can view all notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins can manage all notifications (main)" ON public.notifications;


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
    -- RLS on emergency_requests table will apply here implicitly
  )
);

CREATE POLICY "Users can update their own notifications" -- Primarily for marking as read
ON public.notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all notifications (main)"
ON public.notifications FOR ALL -- SELECT, INSERT, UPDATE, DELETE
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));


-- Supabase Function for calculating total family savings
-- (Total Contributions) - (Total Approved Emergency Funds Requested) + (Total Emergency Funds Returned)
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
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
COMMENT ON FUNCTION public.get_total_family_savings() IS 'Calculates the net current balance of the family fund. SECURITY DEFINER.';
GRANT EXECUTE ON FUNCTION public.get_total_family_savings() TO authenticated;


-- Storage RLS Policies for 'profile-pic' bucket
-- Ensure bucket 'profile-pic' exists and is public or private as per your needs.
-- If private, you'll need to generate signed URLs for access.
-- Assuming public for simplicity, but RLS still controls CRUD.

-- Policy: Allow users to view their own profile pictures.
DROP POLICY IF EXISTS "Allow own read access on profile-pic" ON storage.objects;
CREATE POLICY "Allow own read access on profile-pic"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'profile-pic' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Policy: Allow users to upload their own profile pictures.
-- Path will be like: user_id/filename.png
DROP POLICY IF EXISTS "Allow own insert access on profile-pic" ON storage.objects;
CREATE POLICY "Allow own insert access on profile-pic"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-pic' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Policy: Allow users to update their own profile pictures.
DROP POLICY IF EXISTS "Allow own update access on profile-pic" ON storage.objects;
CREATE POLICY "Allow own update access on profile-pic"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-pic' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Policy: Allow users to delete their own profile pictures.
DROP POLICY IF EXISTS "Allow own delete access on profile-pic" ON storage.objects;
CREATE POLICY "Allow own delete access on profile-pic"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'profile-pic' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Policy: Admins can manage all objects in 'profile-pic' bucket
DROP POLICY IF EXISTS "Admin full access to profile-pic" ON storage.objects;
CREATE POLICY "Admin full access to profile-pic"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'profile-pic' AND is_admin(auth.uid()))
WITH CHECK (bucket_id = 'profile-pic' AND is_admin(auth.uid()));

-- Ensure the 'updated_at' column is automatically updated
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_monthly_contributions_updated_at ON public.monthly_contributions;
CREATE TRIGGER set_monthly_contributions_updated_at
BEFORE UPDATE ON public.monthly_contributions
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_emergency_requests_updated_at ON public.emergency_requests;
CREATE TRIGGER set_emergency_requests_updated_at
BEFORE UPDATE ON public.emergency_requests
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- Note: 'notifications' table doesn't have an 'updated_at' column in the current schema.
-- If you add one, you can create a similar trigger for it.

-- Grant usage on schema public to supabase_functions_admin to allow Edge Functions to operate
-- This is often needed if Edge Functions interact with tables beyond what anon/authenticated roles can do
-- And your Edge Function uses the service_role key.
-- GRANT USAGE ON SCHEMA public TO supabase_functions_admin;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO supabase_functions_admin;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO supabase_functions_admin;
-- GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO supabase_functions_admin;
-- The above grants are very broad; typically, the service_role key bypasses RLS, making these explicit grants less critical
-- for functions using service_role, but good for functions impersonating other roles or needing specific schema usage.

-- Consider adding indexes for frequently queried columns, e.g.:
-- CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
-- CREATE INDEX IF NOT EXISTS idx_monthly_contributions_user_id ON public.monthly_contributions(user_id);
-- CREATE INDEX IF NOT EXISTS idx_monthly_contributions_payment_date ON public.monthly_contributions(payment_date);
-- CREATE INDEX IF NOT EXISTS idx_emergency_requests_user_id ON public.emergency_requests(user_id);
-- CREATE INDEX IF NOT EXISTS idx_emergency_requests_status ON public.emergency_requests(status);
-- CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
-- CREATE INDEX IF NOT EXISTS idx_notifications_related_request_id ON public.notifications(related_request_id);

