
-- Enable vector extension (optional, but good to have if you plan to use pg_vector)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Function to automatically update 'updated_at' timestamps
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION public.trigger_set_timestamp() IS 'Sets the updated_at column to the current UTC timestamp before an update operation.';

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  full_name TEXT,
  email TEXT UNIQUE, -- Email should be unique if used for display/lookup apart from auth.users.email
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' NOT NULL CHECK (role IN ('user', 'admin')),
  is_approved BOOLEAN DEFAULT FALSE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL, -- For soft deletes or deactivating accounts
  last_login TIMESTAMP WITH TIME ZONE -- Updated by application logic on login
);
COMMENT ON TABLE public.profiles IS 'User profile information, extending auth.users. Contains application-specific user details.';

-- Trigger for profiles updated_at
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- 2. MONTHLY CONTRIBUTIONS TABLE
CREATE TABLE IF NOT EXISTS public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100), -- Reasonable year range
  recorded_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
COMMENT ON TABLE public.monthly_contributions IS 'Tracks monthly financial contributions from users.';

-- Trigger for monthly_contributions updated_at
DROP TRIGGER IF EXISTS set_monthly_contributions_updated_at ON public.monthly_contributions;
CREATE TRIGGER set_monthly_contributions_updated_at
BEFORE UPDATE ON public.monthly_contributions
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- 3. EMERGENCY REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_requested NUMERIC NOT NULL CHECK (amount_requested > 0),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'repaid', 'overdue')), -- Consider if 'repaid' and 'overdue' are primary statuses or derived
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  return_date TIMESTAMP WITH TIME ZONE, -- Expected return date set by user or admin
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  amount_returned NUMERIC DEFAULT 0 CHECK (amount_returned >= 0),
  last_return_date TIMESTAMP WITH TIME ZONE,
  is_fully_repaid BOOLEAN DEFAULT FALSE NOT NULL,
  admin_notes TEXT, -- Notes from admin during review or repayment
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
COMMENT ON TABLE public.emergency_requests IS 'Manages emergency fund requests, their status, and repayment lifecycle.';

-- Trigger for emergency_requests updated_at
DROP TRIGGER IF EXISTS set_emergency_requests_updated_at ON public.emergency_requests;
CREATE TRIGGER set_emergency_requests_updated_at
BEFORE UPDATE ON public.emergency_requests
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- 4. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'general', -- e.g., 'general', 'contribution_reminder', 'emergency_update'
  link TEXT, -- Optional URL for the notification to link to
  related_request_id UUID REFERENCES public.emergency_requests(id) ON DELETE SET NULL, -- Link to a specific emergency request
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL -- Null if unread, timestamp when read
);
COMMENT ON TABLE public.notifications IS 'Stores in-app notifications for users, potentially linked to specific events or requests.';

-- Helper Functions --

-- Function to check if a user is an admin (SECURITY DEFINER for safe RLS usage)
CREATE OR REPLACE FUNCTION public.is_admin(user_id_to_check UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id_to_check AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE; -- STABLE as it only reads data
COMMENT ON FUNCTION public.is_admin(UUID) IS 'Checks if a given user_id has the admin role. SECURITY DEFINER.';

-- Function to automatically create a profile when a new user signs up in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  raw_meta jsonb;
  user_full_name text;
  user_avatar_url text;
  user_email text;
BEGIN
  -- Attempt to get email from new.email first (standard for email/pass and some OAuth)
  user_email := new.email;

  -- Extract metadata which varies by OAuth provider
  raw_meta := new.raw_user_meta_data;

  -- Try common keys for full name
  user_full_name := raw_meta->>'full_name';
  IF user_full_name IS NULL THEN
    user_full_name := raw_meta->>'name';
  END IF;

  -- Try common keys for avatar URL
  user_avatar_url := raw_meta->>'avatar_url';
  IF user_avatar_url IS NULL THEN
    user_avatar_url := raw_meta->>'picture';
  END IF;
  
  -- Ensure email from new.email takes precedence if raw_meta also has it.
  -- If new.email is null (e.g. phone signup), then try to get it from raw_meta
  IF user_email IS NULL THEN
    user_email := raw_meta->>'email';
  END IF;


  INSERT INTO public.profiles (id, full_name, email, avatar_url, role, is_approved, is_active, last_login)
  VALUES (
    new.id,
    user_full_name,
    user_email,
    user_avatar_url,
    'user',      -- Default role
    FALSE,       -- Default approval status
    TRUE,        -- Default active status
    timezone('utc'::text, now()) -- Set last_login on profile creation
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates a profile for new auth.users, extracting common OAuth metadata. SECURITY DEFINER.';

-- Trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();


-- Dashboard Function: Get Total Family Savings (Net Balance)
CREATE OR REPLACE FUNCTION public.get_total_family_savings()
RETURNS NUMERIC AS $$
DECLARE
  total_contributions NUMERIC;
  total_disbursed_approved NUMERIC; -- Total amount_requested for approved requests
  total_returned_for_approved NUMERIC; -- Total amount_returned for approved requests
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO total_contributions
  FROM public.monthly_contributions;

  SELECT COALESCE(SUM(amount_requested), 0)
  INTO total_disbursed_approved
  FROM public.emergency_requests
  WHERE status = 'approved';

  SELECT COALESCE(SUM(amount_returned), 0)
  INTO total_returned_for_approved
  FROM public.emergency_requests
  WHERE status = 'approved' AND amount_returned IS NOT NULL;

  RETURN total_contributions - total_disbursed_approved + total_returned_for_approved;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
COMMENT ON FUNCTION public.get_total_family_savings() IS 'Calculates the net current balance of the family fund. SECURITY DEFINER.';

-- Grant execute permission for the RPC function
GRANT EXECUTE ON FUNCTION public.get_total_family_savings() TO authenticated;


-- ROW LEVEL SECURITY (RLS) POLICIES --

-- PROFILES RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view basic info of all profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view basic info of all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (true); -- Allows reading all profiles for name/avatar display, but specific columns should be selected by app

DROP POLICY IF EXISTS "Users can view their own full profile." ON public.profiles;
CREATE POLICY "Users can view their own full profile."
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles"
ON public.profiles FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


-- MONTHLY CONTRIBUTIONS RLS
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own monthly contributions." ON public.monthly_contributions;
CREATE POLICY "Users can view their own monthly contributions."
ON public.monthly_contributions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all monthly contributions." ON public.monthly_contributions;
CREATE POLICY "Admins can manage all monthly contributions."
ON public.monthly_contributions FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


-- EMERGENCY REQUESTS RLS
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view all emergency_requests" ON public.emergency_requests;
CREATE POLICY "Authenticated users can view all emergency_requests"
ON public.emergency_requests FOR SELECT TO authenticated
USING (true); -- For dashboard display of all requests; specific details page might need further checks or rely on this

DROP POLICY IF EXISTS "Authenticated users can insert their own emergency_requests" ON public.emergency_requests;
CREATE POLICY "Authenticated users can insert their own emergency_requests"
ON public.emergency_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all emergency_requests" ON public.emergency_requests;
CREATE POLICY "Admins can manage all emergency_requests"
ON public.emergency_requests FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


-- NOTIFICATIONS RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their direct notifications" ON public.notifications;
CREATE POLICY "Users can view their direct notifications"
ON public.notifications FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view notifications for accessible emergency requests" ON public.notifications;
CREATE POLICY "Users can view notifications for accessible emergency requests"
ON public.notifications FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.emergency_requests er
    WHERE er.id = public.notifications.related_request_id
    -- RLS on emergency_requests will implicitly apply here for the user executing the query.
  )
);

DROP POLICY IF EXISTS "Users can update their own notifications (mark as read)" ON public.notifications;
CREATE POLICY "Users can update their own notifications (mark as read)"
ON public.notifications FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id); -- Can only update their own

DROP POLICY IF EXISTS "Admins can manage all notifications" ON public.notifications;
CREATE POLICY "Admins can manage all notifications"
ON public.notifications FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


-- STORAGE ROW LEVEL SECURITY for 'profile-pic' bucket
-- Ensure the bucket 'profile-pic' is created in Supabase Storage.
-- These policies assume files are stored in a path like: user_id/avatar_filename.png

-- Policy: Users can view their own profile pictures
DROP POLICY IF EXISTS "User can view their own profile pictures" ON storage.objects;
CREATE POLICY "User can view their own profile pictures" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'profile-pic' AND auth.uid() = (storage.foldername(name))[1]::uuid);

-- Policy: Users can upload to their own folder in 'profile-pic'
DROP POLICY IF EXISTS "User can upload to their own profile picture folder" ON storage.objects;
CREATE POLICY "User can upload to their own profile picture folder" ON storage.objects
    FOR INSERT
    WITH CHECK (bucket_id = 'profile-pic' AND auth.uid() = (storage.foldername(name))[1]::uuid);

-- Policy: Users can update their own profile pictures
DROP POLICY IF EXISTS "User can update their own profile pictures" ON storage.objects;
CREATE POLICY "User can update their own profile pictures" ON storage.objects
    FOR UPDATE
    USING (bucket_id = 'profile-pic' AND auth.uid() = (storage.foldername(name))[1]::uuid)
    WITH CHECK (bucket_id = 'profile-pic' AND auth.uid() = (storage.foldername(name))[1]::uuid);

-- Policy: Users can delete their own profile pictures
DROP POLICY IF EXISTS "User can delete their own profile pictures" ON storage.objects;
CREATE POLICY "User can delete their own profile pictures" ON storage.objects
    FOR DELETE
    USING (bucket_id = 'profile-pic' AND auth.uid() = (storage.foldername(name))[1]::uuid);

-- Policy: Admins can manage all objects in 'profile-pic' bucket
DROP POLICY IF EXISTS "Admins can manage all profile pictures" ON storage.objects;
CREATE POLICY "Admins can manage all profile pictures" ON storage.objects
    FOR ALL
    USING (bucket_id = 'profile-pic' AND public.is_admin(auth.uid()))
    WITH CHECK (bucket_id = 'profile-pic' AND public.is_admin(auth.uid()));

-- Add some placeholder indexes (REVIEW AND CUSTOMIZE THESE BASED ON ACTUAL QUERY PATTERNS)
-- Consider indexing foreign keys and columns frequently used in WHERE or ORDER BY clauses.
-- Supabase automatically creates indexes for PRIMARY KEYs and UNIQUE constraints.

-- Example indexes (uncomment and adapt as needed):
-- CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
-- CREATE INDEX IF NOT EXISTS idx_monthly_contributions_user_id ON public.monthly_contributions(user_id);
-- CREATE INDEX IF NOT EXISTS idx_monthly_contributions_payment_date ON public.monthly_contributions(payment_date);
-- CREATE INDEX IF NOT EXISTS idx_emergency_requests_user_id ON public.emergency_requests(user_id);
-- CREATE INDEX IF NOT EXISTS idx_emergency_requests_status ON public.emergency_requests(status);
-- CREATE INDEX IF NOT EXISTS idx_emergency_requests_requested_at ON public.emergency_requests(requested_at);
-- CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
-- CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);
-- CREATE INDEX IF NOT EXISTS idx_notifications_related_request_id ON public.notifications(related_request_id);

COMMENT ON SCHEMA public IS 'Standard public schema';
COMMENT ON EXTENSION plpgsql IS 'PL/pgSQL procedural language';
COMMENT ON EXTENSION vector IS 'pgvector extension for vector similarity search';

SELECT 'Schema setup complete.' AS status;
