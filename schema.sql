
-- Enable the pgvector extension if not already enabled
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Create a helper function to check if a user is an admin
-- This function is SECURITY DEFINER to bypass RLS for the role check itself, preventing recursion.
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = user_id;
  RETURN user_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Table for User Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  full_name TEXT,
  email TEXT UNIQUE, -- Ensure email is unique if used for display/login hints
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' NOT NULL CHECK (role IN ('user', 'admin')),
  is_approved BOOLEAN DEFAULT FALSE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL, -- Added active status
  last_login TIMESTAMP WITH TIME ZONE -- Track last login, can be updated by a trigger or app logic
);

COMMENT ON TABLE public.profiles IS 'Stores user profile information, extending auth.users.';
COMMENT ON COLUMN public.profiles.role IS 'User role, either ''user'' or ''admin''.';
COMMENT ON COLUMN public.profiles.is_approved IS 'Indicates if the user''s membership is approved by an admin.';

-- Enable Row Level Security for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies for profiles table
DROP POLICY IF EXISTS "Users can view their own profile." ON public.profiles;
CREATE POLICY "Users can view their own profile."
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
CREATE POLICY "Users can update their own profile."
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can manage all profiles." ON public.profiles;
CREATE POLICY "Admins can manage all profiles."
  ON public.profiles FOR ALL
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));


-- Function to automatically create a profile when a new user signs up in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  meta_full_name TEXT;
  meta_avatar_url TEXT;
  meta_email TEXT;
BEGIN
  -- Extract full_name and avatar_url from raw_user_meta_data if available (common for OAuth)
  meta_full_name := NEW.raw_user_meta_data->>'full_name';
  IF meta_full_name IS NULL OR meta_full_name = '' THEN
    meta_full_name := NEW.raw_user_meta_data->>'name'; -- Fallback for some providers
  END IF;

  meta_avatar_url := NEW.raw_user_meta_data->>'avatar_url';
  IF meta_avatar_url IS NULL OR meta_avatar_url = '' THEN
     meta_avatar_url := NEW.raw_user_meta_data->>'picture'; -- Fallback for some providers (like Google)
  END IF;

  meta_email := NEW.email;
  IF meta_email IS NULL OR meta_email = '' THEN
     meta_email := NEW.raw_user_meta_data->>'email';
  END IF;


  INSERT INTO public.profiles (id, full_name, email, avatar_url, role, is_approved)
  VALUES (
    NEW.id,
    meta_full_name,
    meta_email, -- Use the email from auth.users table
    meta_avatar_url,
    'user',  -- Default role
    FALSE    -- Default approval status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; -- SECURITY DEFINER allows this function to write to profiles table regardless of RLS

-- Trigger to call handle_new_user on new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Table for Monthly Contributions
CREATE TABLE IF NOT EXISTS public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL, -- Using DATE as time is likely not relevant
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100), -- Reasonable year range
  recorded_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.monthly_contributions IS 'Records monthly financial contributions by users.';

-- Enable Row Level Security for monthly_contributions
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;

-- Policies for monthly_contributions table
DROP POLICY IF EXISTS "Users can view their own contributions." ON public.monthly_contributions;
CREATE POLICY "Users can view their own contributions."
  ON public.monthly_contributions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all contributions." ON public.monthly_contributions;
CREATE POLICY "Admins can manage all contributions."
  ON public.monthly_contributions FOR ALL
  USING (is_admin(auth.uid()));


-- Table for Emergency Requests
CREATE TABLE IF NOT EXISTS public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_requested NUMERIC NOT NULL CHECK (amount_requested > 0),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT, -- Admin can add notes for review
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.emergency_requests IS 'Manages emergency fund requests from users.';

-- Enable Row Level Security for emergency_requests
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;

-- Policies for emergency_requests table
DROP POLICY IF EXISTS "Users can create emergency requests for themselves." ON public.emergency_requests;
CREATE POLICY "Users can create emergency requests for themselves."
  ON public.emergency_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own emergency requests." ON public.emergency_requests;
CREATE POLICY "Users can view their own emergency requests."
  ON public.emergency_requests FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own pending emergency requests." ON public.emergency_requests;
CREATE POLICY "Users can update their own pending emergency requests."
  ON public.emergency_requests FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Admins can manage all emergency requests." ON public.emergency_requests;
CREATE POLICY "Admins can manage all emergency requests."
  ON public.emergency_requests FOR ALL
  USING (is_admin(auth.uid()));


-- Table for Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT, -- e.g., 'contribution_reminder', 'emergency_update', 'approval_status', 'general'
  channel TEXT, -- e.g., 'email', 'in_app'
  is_read BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.notifications IS 'Stores notifications for users.';

-- Enable Row Level Security for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policies for notifications table
DROP POLICY IF EXISTS "Users can view their own notifications." ON public.notifications;
CREATE POLICY "Users can view their own notifications."
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can mark their own notifications as read." ON public.notifications;
CREATE POLICY "Users can mark their own notifications as read."
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all notifications." ON public.notifications;
CREATE POLICY "Admins can manage all notifications." -- Primarily for viewing or debugging, actual sending should be backend logic
  ON public.notifications FOR ALL -- Consider restricting to SELECT and DELETE for admins if direct insert/update isn't needed.
  USING (is_admin(auth.uid()));


-- Function to update `updated_at` timestamp
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to automatically update `updated_at` on table modifications
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

-- Note: Notifications might not need an `updated_at` trigger if they are mostly immutable after creation,
-- or if 'is_read' is the only typical update. If other fields become updatable, add a trigger.

-- Grant USAGE on schema public to anon and authenticated roles (if not already granted)
-- These are typically default but good to be explicit.
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant necessary permissions on tables to anon and authenticated roles (RLS will further restrict)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated; -- RLS policies will control actual access

GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;


-- Seed initial admin user (optional, replace with your admin's details if needed)
-- This is an example. You would typically make a user an admin via the app or directly in Supabase table editor.
-- Ensure the user exists in auth.users first (e.g., after they sign up).
-- Then update their profile:
-- UPDATE public.profiles SET role = 'admin', is_approved = TRUE WHERE email = 'your_admin_email@example.com';

-- Example: Make the first user an admin if they exist and are not already an admin.
-- This is just an example and might not be suitable for all production scenarios.
-- DO $$
-- DECLARE
--   first_user_id UUID;
-- BEGIN
--   SELECT id INTO first_user_id FROM auth.users LIMIT 1;
--   IF first_user_id IS NOT NULL THEN
--     UPDATE public.profiles
--     SET role = 'admin', is_approved = TRUE
--     WHERE id = first_user_id AND role != 'admin';
--   END IF;
-- END $$;


SELECT نسل_الامان_على_مستوى_الصف('public', 'profiles');
SELECT نسل_الامان_على_مستوى_الصف('public', 'monthly_contributions');
SELECT نسل_الامان_على_مستوى_الصف('public', 'emergency_requests');
SELECT نسل_الامان_على_مستوى_الصف('public', 'notifications');

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.monthly_contributions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Ensure default values and constraints are set for new tables
-- This is generally handled by the CREATE TABLE statements above, but re-iterate for clarity
-- Profiles: role defaults to 'user', is_approved defaults to FALSE
-- Monthly Contributions: amount > 0, month 1-12, year 2000-2100
-- Emergency Requests: amount_requested > 0, status defaults to 'pending' and in ('pending', 'approved', 'rejected')
-- Notifications: is_read defaults to FALSE

    