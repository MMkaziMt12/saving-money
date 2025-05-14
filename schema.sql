-- Enable the pgvector extension if you plan to use vector embeddings
-- create extension if not exists vector;

-- Function to check if a user is an admin
-- This function is SECURITY DEFINER to bypass RLS for the internal check, preventing recursion.
create or replace function is_admin(user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_role text;
begin
  select role into admin_role from public.profiles where id = user_id;
  return admin_role = 'admin';
exception
  when no_data_found then
    return false;
  when too_many_rows then
    return false;
end;
$$;

-- Table for User Profiles
create table if not exists public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  full_name TEXT,
  email TEXT UNIQUE, -- Ensuring email is unique if used for lookups
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_approved BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP WITH TIME ZONE
);

-- Comments for clarity
COMMENT ON COLUMN public.profiles.role IS 'User role: ''user'' or ''admin''';
COMMENT ON COLUMN public.profiles.is_approved IS 'Whether the user account has been approved by an admin';
COMMENT ON COLUMN public.profiles.is_active IS 'Whether the user account is currently active';

-- RLS Policies for profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by users who created them." ON public.profiles;
CREATE POLICY "Profiles are viewable by users who created them." ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles are updateable by users who created them." ON public.profiles;
CREATE POLICY "Profiles are updateable by users who created them." ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL -- Applies to SELECT, INSERT, UPDATE, DELETE
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Table for Monthly Contributions
create table if not exists public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= extract(year from now()) + 5),
  recorded_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policies for monthly_contributions table
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only view their own monthly contributions." ON public.monthly_contributions;
CREATE POLICY "Users can only view their own monthly contributions." ON public.monthly_contributions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage monthly contributions." ON public.monthly_contributions;
CREATE POLICY "Admins can manage monthly contributions." ON public.monthly_contributions
  FOR ALL USING (is_admin(auth.uid()));


-- Table for Emergency Requests
create table if not exists public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount_requested NUMERIC NOT NULL CHECK (amount_requested > 0),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policies for emergency_requests table
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create and view their own emergency requests." ON public.emergency_requests;
CREATE POLICY "Users can create and view their own emergency requests." ON public.emergency_requests
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own emergency_requests" ON public.emergency_requests
    FOR INSERT WITH CHECK (auth.uid() = user_id);


DROP POLICY IF EXISTS "Admins can manage emergency requests." ON public.emergency_requests;
CREATE POLICY "Admins can manage emergency requests." ON public.emergency_requests
  FOR ALL USING (is_admin(auth.uid()));


-- Table for Notifications
create table if not exists public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    message TEXT NOT NULL,
    type TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    channel TEXT,
    is_read BOOLEAN DEFAULT FALSE
);
COMMENT ON COLUMN public.notifications.is_read IS 'Whether the notification has been read by the user';

-- RLS Policies for notifications table
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications." ON public.notifications;
CREATE POLICY "Users can view their own notifications." ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can send notifications (insert)." ON public.notifications;
CREATE POLICY "Admins can send notifications (insert)." ON public.notifications
  FOR INSERT -- Admins can only insert, not typically select/update/delete all unless a specific policy allows
  WITH CHECK (is_admin(auth.uid()));
-- If admins need to view/manage all notifications, add a broader policy:
-- CREATE POLICY "Admins can manage all notifications." ON public.notifications
--   FOR ALL USING (is_admin(auth.uid()));


-- Trigger function to create a profile when a new user signs up in auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer -- IMPORTANT: Allows the function to write to public.profiles
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url, role, is_approved, joined_at)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name', -- Attempt to get full_name from provider
    new.email,                             -- Email from auth.users
    new.raw_user_meta_data->>'avatar_url', -- Attempt to get avatar_url from provider
    'user',                                -- Default role
    false,                                 -- Default approval status
    now()                                  -- Set joined_at
  );
  return new;
exception
  when unique_violation then
    -- Handle cases where a profile might already exist (e.g., due to retries or specific auth flows)
    -- For instance, you could update the existing profile or log the event.
    -- For now, we'll just let it pass, assuming the existing profile is intended.
    return new;
  when others then
    -- Log other errors if necessary
    raise warning 'Error in handle_new_user trigger: %', sqlerrm;
    return new;
end;
$$;

-- Drop existing trigger if it exists, then create it
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- STORAGE RLS POLICIES for 'profile-pic' bucket

-- Make sure the 'profile-pic' bucket exists. Create it in Supabase Dashboard > Storage if not.

-- Policy: Allow users to view their own profile pictures.
-- Assumes file path is <user_id>/<filename>
DROP POLICY IF EXISTS "User can view their own profile pictures" ON storage.objects;
CREATE POLICY "User can view their own profile pictures"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'profile-pic' AND
    auth.uid() = (string_to_array(name, '/'))[1]::uuid
  );

-- Policy: Allow users to upload their own profile picture.
-- Path must be <user_id>/<filename>
DROP POLICY IF EXISTS "User can upload to their own profile folder" ON storage.objects;
CREATE POLICY "User can upload to their own profile folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-pic' AND
    auth.uid() = (string_to_array(name, '/'))[1]::uuid
  );

-- Policy: Allow users to update their own profile picture.
DROP POLICY IF EXISTS "User can update their own profile picture" ON storage.objects;
CREATE POLICY "User can update their own profile picture"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profile-pic' AND
    auth.uid() = (string_to_array(name, '/'))[1]::uuid
  );

-- Policy: Allow users to delete their own profile picture.
DROP POLICY IF EXISTS "User can delete their own profile picture" ON storage.objects;
CREATE POLICY "User can delete their own profile picture"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profile-pic' AND
    auth.uid() = (string_to_array(name, '/'))[1]::uuid
  );

-- Policy: Admins can manage all profile pictures in the 'profile-pic' bucket.
DROP POLICY IF EXISTS "Admins can manage all profile pictures" ON storage.objects;
CREATE POLICY "Admins can manage all profile pictures"
  ON storage.objects FOR ALL -- SELECT, INSERT, UPDATE, DELETE
  USING (
    bucket_id = 'profile-pic' AND
    is_admin(auth.uid()) -- Uses the helper function
  )
  WITH CHECK ( -- Ensure admins are also inserting/updating into the correct bucket
    bucket_id = 'profile-pic' AND
    is_admin(auth.uid())
  );

-- Seed an admin user (optional, for testing)
-- Replace with your actual admin user's ID and details after they sign up.
-- This is commented out; you should typically manage admin roles through your app or Supabase UI.
/*
WITH admin_user AS (
  SELECT id FROM auth.users WHERE email = 'admin@example.com' -- Replace with your admin's email
)
UPDATE public.profiles
SET role = 'admin', is_approved = TRUE
WHERE id = (SELECT id FROM admin_user) AND EXISTS (SELECT 1 FROM admin_user);

-- Verify admin user
SELECT id, email, role, is_approved FROM public.profiles WHERE email = 'admin@example.com';
*/

-- Note: It's generally recommended to set the default `is_approved` to `false`
-- for new users and have an admin approve them, which is the current setup.
-- The `handle_new_user` trigger now includes logic for `raw_user_meta_data`
-- to pull `full_name` and `avatar_url` if provided by OAuth (like Google).
