
-- Enable vector extension (optional, but good to have if you might use embeddings later)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- Function to automatically update 'updated_at' timestamps
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION public.trigger_set_timestamp() IS 'Updates the updated_at column to the current timestamp.';

-- 1. PROFILES TABLE
-- Stores user-specific information, extending the built-in auth.users table.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  full_name TEXT,
  email TEXT UNIQUE, -- Should match auth.users.email, unique to prevent duplicate profiles if auth user email changes.
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' NOT NULL CHECK (role IN ('user', 'admin')),
  is_approved BOOLEAN DEFAULT FALSE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL, -- For soft deletes or disabling accounts
  last_login TIMESTAMP WITH TIME ZONE -- Updated by application logic upon login
);
COMMENT ON TABLE public.profiles IS 'User profile information, extending auth.users.';

-- Trigger for profiles.updated_at
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- 2. MONTHLY CONTRIBUTIONS TABLE
-- Tracks financial contributions made by users.
CREATE TABLE IF NOT EXISTS public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100), -- Reasonable year range
  recorded_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Admin who recorded
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
COMMENT ON TABLE public.monthly_contributions IS 'Tracks monthly financial contributions from users.';

-- Trigger for monthly_contributions.updated_at
DROP TRIGGER IF EXISTS set_monthly_contributions_updated_at ON public.monthly_contributions;
CREATE TRIGGER set_monthly_contributions_updated_at
BEFORE UPDATE ON public.monthly_contributions
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- 3. EMERGENCY REQUESTS TABLE
-- Manages requests for emergency funds, their approval, and repayment.
CREATE TABLE IF NOT EXISTS public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_requested NUMERIC NOT NULL CHECK (amount_requested > 0),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'repaid', 'overdue')), -- 'repaid' and 'overdue' might be derived or set by process
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  return_date TIMESTAMP WITH TIME ZONE, -- Expected return date set by user or admin
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Admin who reviewed
  reviewed_at TIMESTAMP WITH TIME ZONE,
  amount_returned NUMERIC DEFAULT 0 CHECK (amount_returned >= 0),
  last_return_date TIMESTAMP WITH TIME ZONE,
  is_fully_repaid BOOLEAN DEFAULT FALSE NOT NULL,
  admin_notes TEXT, -- Notes by admin during review or management
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
COMMENT ON TABLE public.emergency_requests IS 'Manages emergency fund requests and their lifecycle.';

-- Trigger for emergency_requests.updated_at
DROP TRIGGER IF EXISTS set_emergency_requests_updated_at ON public.emergency_requests;
CREATE TRIGGER set_emergency_requests_updated_at
BEFORE UPDATE ON public.emergency_requests
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- 4. NOTIFICATIONS TABLE
-- Stores in-app notifications for users.
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'general', -- e.g., 'general', 'contribution_reminder', 'emergency_update'
  link TEXT, -- Optional URL to navigate to when notification is clicked
  related_request_id UUID REFERENCES public.emergency_requests(id) ON DELETE SET NULL, -- Link to a specific emergency request
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL -- Null if unread, timestamp when read
);
COMMENT ON TABLE public.notifications IS 'Stores in-app notifications for users.';
-- No updated_at trigger for notifications as they are usually immutable after creation, only 'read_at' changes.


-- Helper Functions --

-- Function to check if a user is an admin. SECURITY DEFINER to bypass RLS for this specific check.
CREATE OR REPLACE FUNCTION public.is_admin(user_id_to_check UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id_to_check AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE; -- STABLE: function cannot modify the database and always returns the same results for the same argument values within a single transaction.
COMMENT ON FUNCTION public.is_admin(UUID) IS 'Checks if a given user_id has the admin role. SECURITY DEFINER.';

-- Function to automatically create a profile when a new user signs up in auth.users.
-- SECURITY DEFINER to allow inserting into public.profiles table.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  raw_meta jsonb;
  user_full_name text;
  user_avatar_url text;
  user_email text;
BEGIN
  -- Log the raw_user_meta_data for debugging (check Supabase function logs if issues)
  -- RAISE LOG 'Handling new user. raw_user_meta_data: %', new.raw_user_meta_data;
  -- RAISE LOG 'Handling new user. Email from new.email: %', new.email;

  raw_meta := new.raw_user_meta_data;
  user_email := new.email; -- Email from auth.users is generally more reliable

  -- Attempt to get full_name from common OAuth fields
  user_full_name := raw_meta->>'full_name';
  IF user_full_name IS NULL THEN
    user_full_name := raw_meta->>'name'; -- Common fallback (e.g., Google)
  END IF;
   IF user_full_name IS NULL AND user_email IS NOT NULL THEN
    user_full_name := split_part(user_email, '@', 1); -- Fallback to part of email if name is missing
  END IF;


  -- Attempt to get avatar_url from common OAuth fields
  user_avatar_url := raw_meta->>'avatar_url';
  IF user_avatar_url IS NULL THEN
    user_avatar_url := raw_meta->>'picture'; -- Common fallback (e.g., Google)
  END IF;

  INSERT INTO public.profiles (id, full_name, email, avatar_url, role, is_approved, is_active, last_login)
  VALUES (
    new.id,
    user_full_name,
    user_email,
    user_avatar_url,
    'user',   -- Default role
    FALSE,    -- Default approval status
    TRUE,     -- Default active status
    timezone('utc'::text, now()) -- Set initial last_login
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates a profile for new auth.users. SECURITY DEFINER.';

-- Trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();


-- Dashboard Function: Total Family Savings (Net Balance)
CREATE OR REPLACE FUNCTION public.get_total_family_savings()
RETURNS NUMERIC AS $$
DECLARE
  total_contributions NUMERIC;
  total_disbursed NUMERIC;
  total_returned NUMERIC;
BEGIN
  SELECT COALESCE(SUM(mc.amount), 0)
  INTO total_contributions
  FROM public.monthly_contributions mc;

  SELECT COALESCE(SUM(er.amount_requested), 0)
  INTO total_disbursed
  FROM public.emergency_requests er
  WHERE er.status = 'approved';

  SELECT COALESCE(SUM(er.amount_returned), 0)
  INTO total_returned
  FROM public.emergency_requests er
  WHERE er.status = 'approved' AND er.amount_returned IS NOT NULL; -- Only sum actual returns

  RETURN total_contributions - total_disbursed + total_returned;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
COMMENT ON FUNCTION public.get_total_family_savings() IS 'Calculates the net current balance of the family fund. SECURITY DEFINER.';

-- Grant execute permission for the RPC to authenticated users
GRANT EXECUTE ON FUNCTION public.get_total_family_savings() TO authenticated;


-- Row Level Security (RLS) Policies --

-- PROFILES Table RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile." ON public.profiles;
CREATE POLICY "Users can view their own profile."
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
USING (true); -- Allows selecting specific columns (like name for display) by any auth user. Column-level grants are not needed if row is visible.


-- MONTHLY CONTRIBUTIONS Table RLS
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


-- EMERGENCY REQUESTS Table RLS
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view all emergency_requests." ON public.emergency_requests;
CREATE POLICY "Authenticated users can view all emergency_requests."
ON public.emergency_requests FOR SELECT TO authenticated
USING (true); -- Allows all authenticated users to see all requests (for dashboard transparency)

DROP POLICY IF EXISTS "Authenticated users can insert their own emergency_requests." ON public.emergency_requests;
CREATE POLICY "Authenticated users can insert their own emergency_requests."
ON public.emergency_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id); -- Users can only create requests for themselves

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
    SELECT 1
    FROM public.emergency_requests er -- RLS on emergency_requests applies here
    WHERE er.id = public.notifications.related_request_id
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


-- STORAGE RLS for 'profile-pic' bucket

-- Policy: Users can view their own profile pictures
DROP POLICY IF EXISTS "User can view their own profile pictures" ON storage.objects;
CREATE POLICY "User can view their own profile pictures"
    FOR SELECT
    USING (bucket_id = 'profile-pic' AND auth.uid() = (storage.foldername(name))[1]::uuid);

-- Policy: Users can upload to their own folder in 'profile-pic'
DROP POLICY IF EXISTS "User can upload to their own profile picture folder" ON storage.objects;
CREATE POLICY "User can upload to their own profile picture folder"
    FOR INSERT
    WITH CHECK (bucket_id = 'profile-pic' AND auth.uid() = (storage.foldername(name))[1]::uuid);

-- Policy: Users can update their own profile pictures
DROP POLICY IF EXISTS "User can update their own profile pictures" ON storage.objects;
CREATE POLICY "User can update their own profile pictures"
    FOR UPDATE
    USING (bucket_id = 'profile-pic' AND auth.uid() = (storage.foldername(name))[1]::uuid)
    WITH CHECK (bucket_id = 'profile-pic' AND auth.uid() = (storage.foldername(name))[1]::uuid);

-- Policy: Users can delete their own profile pictures
DROP POLICY IF EXISTS "User can delete their own profile pictures" ON storage.objects;
CREATE POLICY "User can delete their own profile pictures"
    FOR DELETE
    USING (bucket_id = 'profile-pic' AND auth.uid() = (storage.foldername(name))[1]::uuid);

-- Policy: Admins can manage all objects in 'profile-pic' bucket
DROP POLICY IF EXISTS "Admins can manage all profile pictures" ON storage.objects;
CREATE POLICY "Admins can manage all profile pictures"
    FOR ALL -- SELECT, INSERT, UPDATE, DELETE
    USING (bucket_id = 'profile-pic' AND public.is_admin(auth.uid()))
    WITH CHECK (bucket_id = 'profile-pic' AND public.is_admin(auth.uid()));

-- Placeholder for future indexes - uncomment and modify as needed based on query performance.
-- CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
-- CREATE INDEX IF NOT EXISTS idx_monthly_contributions_user_id ON public.monthly_contributions(user_id);
-- CREATE INDEX IF NOT EXISTS idx_monthly_contributions_payment_date ON public.monthly_contributions(payment_date);
-- CREATE INDEX IF NOT EXISTS idx_emergency_requests_user_id ON public.emergency_requests(user_id);
-- CREATE INDEX IF NOT EXISTS idx_emergency_requests_status ON public.emergency_requests(status);
-- CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
-- CREATE INDEX IF NOT EXISTS idx_notifications_related_request_id ON public.notifications(related_request_id);

