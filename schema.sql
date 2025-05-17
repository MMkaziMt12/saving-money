
-- Ensure the pg_tle extension is available if using advanced features.
-- CREATE EXTENSION IF NOT EXISTS pg_tle; -- Might require DB restart or superuser in some environments.

-- Enable the pgvector extension (if you plan to use vector embeddings, e.g., for semantic search)
CREATE EXTENSION IF NOT EXISTS vector;

-- Function to check if the current user is an admin
-- SECURITY DEFINER allows this function to bypass RLS for its internal query on profiles
CREATE OR REPLACE FUNCTION public.is_admin(user_id_to_check UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = user_id_to_check;
  RETURN user_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
COMMENT ON FUNCTION public.is_admin(UUID) IS 'Checks if the given user_id has the admin role. SECURITY DEFINER to bypass RLS for the role check.';

-- Trigger function to automatically create a profile when a new user signs up in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_full_name TEXT;
  user_avatar_url TEXT;
  user_email TEXT;
BEGIN
  -- Attempt to get full_name from raw_user_meta_data (often provided by OAuth providers)
  user_full_name := NEW.raw_user_meta_data->>'full_name';
  IF user_full_name IS NULL OR user_full_name = '' THEN
    user_full_name := NEW.raw_user_meta_data->>'name'; -- Fallback to 'name' if 'full_name' isn't there
  END IF;
  
  -- Attempt to get avatar_url from raw_user_meta_data
  user_avatar_url := NEW.raw_user_meta_data->>'avatar_url';
  IF user_avatar_url IS NULL OR user_avatar_url = '' THEN
     user_avatar_url := NEW.raw_user_meta_data->>'picture'; -- Common in Google OAuth
  END IF;

  -- Get email from auth.users table
  user_email := NEW.email;

  INSERT INTO public.profiles (id, full_name, email, avatar_url, role, is_approved, is_active, created_at, updated_at, last_login)
  VALUES (
    NEW.id,
    user_full_name, 
    user_email,
    user_avatar_url,
    'user',  -- Default role
    FALSE,   -- Default approval status
    TRUE,    -- Default active status
    NOW(),   -- Set created_at
    NOW(),   -- Set updated_at
    NOW()    -- Set last_login on profile creation
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates a profile for new auth.users. Populates name and avatar from raw_user_meta_data if available. SECURITY DEFINER to insert into profiles table.';

-- Trigger to call handle_new_user after a new user is inserted into auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to automatically update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION public.trigger_set_timestamp() IS 'Automatically updates the updated_at timestamp on a row modification.';

-- Table for User Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  full_name TEXT,
  email TEXT UNIQUE, -- Emails should ideally be unique
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_approved BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP WITH TIME ZONE
);
COMMENT ON TABLE public.profiles IS 'Stores user profile information, extending auth.users.';

-- Trigger for profiles updated_at
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

-- Table for Monthly Contributions
CREATE TABLE IF NOT EXISTS public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100), -- Reasonable year range
  recorded_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
COMMENT ON TABLE public.monthly_contributions IS 'Tracks monthly contributions made by users.';

-- Trigger for monthly_contributions updated_at
DROP TRIGGER IF EXISTS set_monthly_contributions_updated_at ON public.monthly_contributions;
CREATE TRIGGER set_monthly_contributions_updated_at
BEFORE UPDATE ON public.monthly_contributions
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

-- Table for Emergency Requests
CREATE TABLE IF NOT EXISTS public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_requested NUMERIC NOT NULL CHECK (amount_requested > 0),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')), -- Consider an ENUM type
  return_date TIMESTAMP WITH TIME ZONE,
  amount_returned NUMERIC DEFAULT 0 CHECK (amount_returned >= 0),
  last_return_date TIMESTAMP WITH TIME ZONE,
  is_fully_repaid BOOLEAN DEFAULT FALSE,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
COMMENT ON TABLE public.emergency_requests IS 'Manages emergency fund requests from users.';

-- Trigger for emergency_requests updated_at
DROP TRIGGER IF EXISTS set_emergency_requests_updated_at ON public.emergency_requests;
CREATE TRIGGER set_emergency_requests_updated_at
BEFORE UPDATE ON public.emergency_requests
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

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
COMMENT ON TABLE public.notifications IS 'Stores notifications for users.';
-- No updated_at trigger for notifications as they are typically immutable after creation, only read_at changes.

-- Function to get the net total family savings balance
CREATE OR REPLACE FUNCTION public.get_total_family_savings()
RETURNS NUMERIC AS $$
DECLARE
  total_contributions_val NUMERIC;
  total_disbursed_val NUMERIC;
  total_returned_val NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO total_contributions_val
  FROM public.monthly_contributions;

  SELECT COALESCE(SUM(amount_requested), 0)
  INTO total_disbursed_val
  FROM public.emergency_requests
  WHERE status = 'approved';

  SELECT COALESCE(SUM(amount_returned), 0)
  INTO total_returned_val
  FROM public.emergency_requests
  WHERE status = 'approved' AND amount_returned IS NOT NULL;

  RETURN total_contributions_val - total_disbursed_val + total_returned_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
COMMENT ON FUNCTION public.get_total_family_savings() IS 'Calculates the net total family savings. (Total Contributions - Total Approved Disbursed + Total Repaid). SECURITY DEFINER to sum across all records.';
GRANT EXECUTE ON FUNCTION public.get_total_family_savings() TO authenticated;


-- ROW LEVEL SECURITY (RLS) POLICIES --

-- Profiles Table RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Authenticated users can view basic info of all profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view basic info of all profiles" ON public.profiles FOR SELECT TO authenticated USING (true); -- Note: This allows SELECT of all columns. If you want to restrict to specific columns for non-admins/non-owners, you'd need a more complex setup or views. For simplicity and current needs, this is okay.
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Monthly Contributions Table RLS
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own monthly contributions" ON public.monthly_contributions;
CREATE POLICY "Users can view their own monthly contributions" ON public.monthly_contributions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can manage all monthly contributions" ON public.monthly_contributions;
CREATE POLICY "Admins can manage all monthly contributions" ON public.monthly_contributions FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Emergency Requests Table RLS
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view all emergency_requests" ON public.emergency_requests;
CREATE POLICY "Authenticated users can view all emergency_requests" ON public.emergency_requests FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert their own emergency_requests" ON public.emergency_requests;
CREATE POLICY "Authenticated users can insert their own emergency_requests" ON public.emergency_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can manage all emergency_requests" ON public.emergency_requests;
CREATE POLICY "Admins can manage all emergency_requests" ON public.emergency_requests FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Notifications Table RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their direct notifications" ON public.notifications;
CREATE POLICY "Users can view their direct notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view notifications for accessible emergency requests" ON public.notifications;
CREATE POLICY "Users can view notifications for accessible emergency requests" ON public.notifications FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.emergency_requests er
    WHERE er.id = public.notifications.related_request_id
  )
);
DROP POLICY IF EXISTS "Users can update their own notifications to mark as read" ON public.notifications;
CREATE POLICY "Users can update their own notifications to mark as read" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can manage all notifications" ON public.notifications;
CREATE POLICY "Admins can manage all notifications" ON public.notifications FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));


-- STORAGE RLS POLICIES for 'profile-pic' bucket
-- Ensure the bucket 'profile-pic' is created in Supabase Storage and set to public or private as needed.
-- These policies assume the bucket exists.

-- Allow public read access to profile pictures IF the bucket is public.
-- If private, remove this or restrict further.
-- CREATE POLICY "Profile pictures are publicly viewable."
-- ON storage.objects FOR SELECT
-- USING ( bucket_id = 'profile-pic' );

-- Users can upload their own profile picture into a folder named with their user_id.
CREATE POLICY "Users can upload their own profile_pic"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'profile-pic' AND (storage.foldername(name))[1] = auth.uid()::text );

-- Users can update their own profile picture.
CREATE POLICY "Users can update their own profile_pic"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'profile-pic' AND (storage.foldername(name))[1] = auth.uid()::text );

-- Users can delete their own profile picture.
CREATE POLICY "Users can delete their own profile_pic"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'profile-pic' AND (storage.foldername(name))[1] = auth.uid()::text );

-- Admins can manage all profile pictures.
CREATE POLICY "Admins can manage all profile_pics"
ON storage.objects FOR ALL -- Covers SELECT, INSERT, UPDATE, DELETE for admins
TO authenticated
USING ( bucket_id = 'profile-pic' AND is_admin(auth.uid()) )
WITH CHECK ( bucket_id = 'profile-pic' AND is_admin(auth.uid()) );

-- Example Indexes (Consider adding based on query patterns)
-- CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
-- CREATE INDEX IF NOT EXISTS idx_monthly_contributions_user_id ON public.monthly_contributions(user_id);
-- CREATE INDEX IF NOT EXISTS idx_emergency_requests_user_id ON public.emergency_requests(user_id);
-- CREATE INDEX IF NOT EXISTS idx_emergency_requests_status ON public.emergency_requests(status);
-- CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
-- CREATE INDEX IF NOT EXISTS idx_notifications_related_request_id ON public.notifications(related_request_id);

COMMENT ON COLUMN public.profiles.email IS 'User email, should be unique for login purposes.';
COMMENT ON COLUMN public.profiles.role IS 'User role, either ''user'' or ''admin''.';
COMMENT ON COLUMN public.emergency_requests.status IS 'Status of the request, e.g., pending, approved, rejected.';
COMMENT ON COLUMN public.notifications.type IS 'Type of notification, e.g., general, contribution_reminder, emergency_update.';
COMMENT ON COLUMN public.notifications.read_at IS 'Timestamp when the notification was marked as read by the user.';

-- Ensure the auth.users table has RLS enabled if you are doing complex joins from policies.
-- By default, auth.users is not directly queryable by users RLS.
-- If you need to join against auth.users in RLS policies for users, you might need a SECURITY DEFINER view or function.
-- However, the current setup relies on the profiles table which is linked to auth.users.

-- Update last_login timestamp on user sign-in via a trigger on auth.users
-- This requires the "supabase_auth_admin" role or direct database superuser access to create triggers on the auth schema.
-- This might be better handled by your application logic after successful login if direct auth schema modification is restricted.
-- For now, this is commented out as it might require elevated privileges to apply.
/*
CREATE OR REPLACE FUNCTION public.update_profile_last_login()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET last_login = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_signed_in ON auth.users;
CREATE TRIGGER on_user_signed_in
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at AND NEW.last_sign_in_at IS NOT NULL)
  EXECUTE FUNCTION public.update_profile_last_login();
*/
-- Instead of the trigger above, ensure your AuthContext or login logic updates profiles.last_login
-- via a standard UPDATE statement after a successful login event is detected.
-- This is generally safer and easier to manage from application code.

-- Add last_login update after user is created (from handle_new_user)
-- The handle_new_user function already sets last_login on profile creation.

Vacuum and analyze tables periodically, especially after large data changes.
-- VACUUM (ANALYZE, VERBOSE) public.profiles;
-- VACUUM (ANALYZE, VERBOSE) public.monthly_contributions;
-- VACUUM (ANALYZE, VERBOSE) public.emergency_requests;
-- VACUUM (ANALYZE, VERBOSE) public.notifications;

