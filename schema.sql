
-- Enable vector extension (optional, if you plan to use vector embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- Function to automatically update 'updated_at' timestamps
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION public.trigger_set_timestamp() IS 'Automatically sets the updated_at timestamp on row update.';

-- =======================================================================
-- TABLE DEFINITIONS
-- =======================================================================

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  full_name TEXT,
  email TEXT UNIQUE, -- Ensure email is unique if it's a primary identifier
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' NOT NULL CHECK (role IN ('user', 'admin')),
  is_approved BOOLEAN DEFAULT FALSE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  last_login TIMESTAMP WITH TIME ZONE
);
COMMENT ON TABLE public.profiles IS 'User profile information, extending auth.users data with application-specific fields.';

-- Trigger for profiles updated_at
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- Indexes for profiles table
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_approved ON public.profiles(is_approved);

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

-- Indexes for monthly_contributions table
CREATE INDEX IF NOT EXISTS idx_mc_user_id ON public.monthly_contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_mc_payment_date ON public.monthly_contributions(payment_date);
CREATE INDEX IF NOT EXISTS idx_mc_year_month ON public.monthly_contributions(year, month);
CREATE INDEX IF NOT EXISTS idx_mc_recorded_by_admin_id ON public.monthly_contributions(recorded_by_admin_id);


-- 3. EMERGENCY REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_requested NUMERIC NOT NULL CHECK (amount_requested > 0),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'repaid', 'overdue')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  return_date TIMESTAMP WITH TIME ZONE, -- Expected return date
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  amount_returned NUMERIC DEFAULT 0 CHECK (amount_returned >= 0),
  last_return_date TIMESTAMP WITH TIME ZONE,
  is_fully_repaid BOOLEAN DEFAULT FALSE NOT NULL,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
COMMENT ON TABLE public.emergency_requests IS 'Manages emergency fund requests, their statuses, and repayment tracking.';

-- Trigger for emergency_requests updated_at
DROP TRIGGER IF EXISTS set_emergency_requests_updated_at ON public.emergency_requests;
CREATE TRIGGER set_emergency_requests_updated_at
BEFORE UPDATE ON public.emergency_requests
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- Indexes for emergency_requests table
CREATE INDEX IF NOT EXISTS idx_er_user_id ON public.emergency_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_er_status ON public.emergency_requests(status);
CREATE INDEX IF NOT EXISTS idx_er_requested_at ON public.emergency_requests(requested_at);
CREATE INDEX IF NOT EXISTS idx_er_return_date ON public.emergency_requests(return_date);
CREATE INDEX IF NOT EXISTS idx_er_reviewed_by_admin_id ON public.emergency_requests(reviewed_by_admin_id);
CREATE INDEX IF NOT EXISTS idx_er_is_fully_repaid ON public.emergency_requests(is_fully_repaid);


-- 4. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'general', -- e.g., 'general', 'contribution_reminder', 'emergency_update'
  link TEXT, -- Optional URL to navigate to
  related_request_id UUID REFERENCES public.emergency_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL -- Null if unread, timestamp when read
);
COMMENT ON TABLE public.notifications IS 'Stores in-app notifications for users, potentially linked to specific requests.';

-- Indexes for notifications table
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read_at ON public.notifications(user_id, read_at); -- Good for fetching unread notifications for a user
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC); -- For sorting by newest
CREATE INDEX IF NOT EXISTS idx_notifications_related_request_id ON public.notifications(related_request_id);


-- =======================================================================
-- HELPER FUNCTIONS & TRIGGERS
-- =======================================================================

-- Function to check if a user is an admin (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_admin(user_id_to_check UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id_to_check AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
COMMENT ON FUNCTION public.is_admin(UUID) IS 'Checks if a given user_id has the admin role. SECURITY DEFINER for safe RLS usage.';

-- Function to automatically create a profile for new auth.users (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  raw_meta jsonb;
  user_full_name text;
  user_avatar_url text;
  user_email text;
BEGIN
  raw_meta := new.raw_user_meta_data;
  user_email := new.email; -- Directly from auth.users

  -- Attempt to get full_name from common OAuth keys
  user_full_name := raw_meta->>'full_name';
  IF user_full_name IS NULL THEN
    user_full_name := raw_meta->>'name';
  END IF;

  -- Attempt to get avatar_url from common OAuth keys
  user_avatar_url := raw_meta->>'avatar_url';
  IF user_avatar_url IS NULL THEN
    user_avatar_url := raw_meta->>'picture';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, avatar_url, role, is_approved, is_active)
  VALUES (
    new.id,
    user_full_name,
    user_email,
    user_avatar_url,
    'user',  -- Default role
    FALSE,   -- Default approval status
    TRUE     -- Default active status
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates a profile in public.profiles for new entries in auth.users. SECURITY DEFINER.';

-- Trigger to call handle_new_user on new auth.users entry
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- Dashboard Function: Total Family Savings (SECURITY DEFINER)
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

-- Grant execute permission for the RPC function to authenticated users
GRANT EXECUTE ON FUNCTION public.get_total_family_savings() TO authenticated;


-- =======================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =======================================================================

-- PROFILES Table RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own full profile." ON public.profiles;
CREATE POLICY "Users can view their own full profile."
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can manage all profiles." ON public.profiles;
CREATE POLICY "Admins can manage all profiles."
ON public.profiles FOR ALL TO authenticated -- ALL covers SELECT, INSERT, UPDATE, DELETE
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view basic info of all profiles." ON public.profiles;
CREATE POLICY "Authenticated users can view basic info of all profiles."
ON public.profiles FOR SELECT TO authenticated
USING (true); -- Note: This means any logged-in user can SELECT. The actual columns returned are controlled by your SELECT query.
              -- For showing names in lists, ensure your SELECT queries only pick `id`, `full_name`, `avatar_url`.

-- MONTHLY CONTRIBUTIONS Table RLS
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own monthly contributions." ON public.monthly_contributions;
CREATE POLICY "Users can view their own monthly contributions."
ON public.monthly_contributions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage monthly contributions." ON public.monthly_contributions;
CREATE POLICY "Admins can manage monthly contributions."
ON public.monthly_contributions FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


-- EMERGENCY REQUESTS Table RLS
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view all emergency_requests." ON public.emergency_requests;
CREATE POLICY "Authenticated users can view all emergency_requests."
ON public.emergency_requests FOR SELECT TO authenticated
USING (true); -- Allows any authenticated user to read all rows for dashboard display

DROP POLICY IF EXISTS "Authenticated users can insert their own emergency_requests." ON public.emergency_requests;
CREATE POLICY "Authenticated users can insert their own emergency_requests."
ON public.emergency_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all emergency_requests." ON public.emergency_requests;
CREATE POLICY "Admins can manage all emergency_requests."
ON public.emergency_requests FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


-- NOTIFICATIONS Table RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their direct notifications." ON public.notifications;
CREATE POLICY "Users can view their direct notifications."
ON public.notifications FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view notifications for accessible emergency requests." ON public.notifications;
CREATE POLICY "Users can view notifications for accessible emergency requests."
ON public.notifications FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.emergency_requests er
    WHERE er.id = public.notifications.related_request_id -- RLS on 'er' applies here
  )
);

DROP POLICY IF EXISTS "Users can update their own notifications (mark as read)." ON public.notifications;
CREATE POLICY "Users can update their own notifications (mark as read)."
ON public.notifications FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all notifications." ON public.notifications;
CREATE POLICY "Admins can manage all notifications."
ON public.notifications FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


-- =======================================================================
-- STORAGE ROW LEVEL SECURITY for 'profile-pic' bucket
-- =======================================================================
-- Ensure the 'profile-pic' bucket exists in your Supabase Storage.

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
    WITH CHECK (auth.uid() = (storage.foldername(name))[1]::uuid);

-- Policy: Users can delete their own profile pictures
DROP POLICY IF EXISTS "User can delete their own profile pictures" ON storage.objects;
CREATE POLICY "User can delete their own profile pictures" ON storage.objects
    FOR DELETE
    USING (bucket_id = 'profile-pic' AND auth.uid() = (storage.foldername(name))[1]::uuid);

-- Policy: Admins can manage all objects in 'profile-pic' bucket
DROP POLICY IF EXISTS "Admins can manage all profile pictures" ON storage.objects;
CREATE POLICY "Admins can manage all profile pictures" ON storage.objects
    FOR ALL -- SELECT, INSERT, UPDATE, DELETE
    USING (bucket_id = 'profile-pic' AND public.is_admin(auth.uid()))
    WITH CHECK (bucket_id = 'profile-pic' AND public.is_admin(auth.uid()));

