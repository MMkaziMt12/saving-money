
-- Ensure the Realtime and RLS features are enabled in your Supabase project settings.

-- Drop existing policies and functions if re-running to avoid "already exists" errors.
-- Note: Be cautious with DROP statements in a production environment.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.is_admin(uuid);

-- Helper function to check if a user is an admin
-- SECURITY DEFINER allows this function to bypass RLS for its internal query on 'profiles'
create or replace function public.is_admin(user_id uuid)
returns boolean
language plpgsql
security definer -- Crucial for RLS checks without recursion
set search_path = public -- Explicitly set search_path
as $$
declare
  admin_role text;
begin
  if user_id is null then
    return false;
  end if;
  select role into admin_role from public.profiles where id = user_id;
  return admin_role = 'admin';
exception
  when no_data_found then
    return false; -- User profile not found, so not an admin
  when too_many_rows then
    -- This should not happen if 'id' is primary key, but good for robustness
    return false;
end;
$$;

-- Table for User Profiles
-- The `joined_at` column has been removed, relying on `created_at`.
create table if not exists public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  full_name TEXT,
  email TEXT, -- Often populated from auth.users, can be a display field
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_approved BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE -- Added for soft deactivation
);
comment on column public.profiles.email is 'User''s email, can be synced from auth.users or be a contact email.';
comment on column public.profiles.role is 'User role, e.g., ''user'' or ''admin''';

-- Trigger function to create a profile entry when a new user signs up in auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer -- Crucial: Allows the trigger to insert into profiles table, bypassing RLS for this specific action.
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role, is_approved, is_active, created_at, updated_at)
  values (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name', -- Attempt to get full_name from OAuth provider metadata
    NEW.raw_user_meta_data->>'avatar_url', -- Attempt to get avatar_url from OAuth provider metadata
    'user',  -- Default role
    FALSE,   -- Default approval status
    TRUE,    -- Default active status
    now(),
    now()
  );
  return NEW;
end;
$$;

-- Trigger to call handle_new_user after a new user is inserted into auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS Policies for 'profiles' table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by users who created them." ON public.profiles
FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Profiles are updateable by users who created them." ON public.profiles
FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
-- Note: Users should typically not be able to change their own 'role' or 'is_approved' status.
-- This should be enforced by application logic (e.g., not showing these fields in their profile edit form).

CREATE POLICY "Users can delete their own profile." ON public.profiles -- Consider if users should be able to delete their own profiles.
FOR DELETE TO authenticated USING (auth.uid() = id);

-- This single policy gives admins full control (SELECT, INSERT, UPDATE, DELETE) over the profiles table.
CREATE POLICY "Admins can manage all profiles" ON public.profiles
FOR ALL -- This covers SELECT, INSERT, UPDATE, DELETE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


-- Table for Monthly Contributions
create table if not exists public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  recorded_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policies for 'monthly_contributions'
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own contributions." ON public.monthly_contributions
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all contributions." ON public.monthly_contributions
FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


-- Table for Emergency Requests
create table if not exists public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
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

-- RLS Policies for 'emergency_requests'
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own emergency requests." ON public.emergency_requests
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can create emergency requests for themselves." ON public.emergency_requests
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all emergency requests." ON public.emergency_requests
FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


-- Table for Notifications (Optional, if storing notifications in DB)
create table if not exists public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT, -- e.g., 'contribution_reminder', 'emergency_update', 'approval_status', 'general'
  channel TEXT, -- e.g., 'email', 'in_app'
  is_read BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policies for 'notifications'
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications." ON public.notifications
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can mark their own notifications as read/unread." ON public.notifications
FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- Admins might send notifications (handled by application logic using service role or admin privileges if inserting directly)
-- For direct admin insert via RLS (less common for notifications, usually done via backend/service_role):
CREATE POLICY "Admins can create notifications." ON public.notifications
FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
-- Admins might need to view all notifications for auditing:
CREATE POLICY "Admins can view all notifications." ON public.notifications
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


-- Enable pgvector extension if you plan to use vector embeddings
-- CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- Function to update `updated_at` timestamp automatically
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to relevant tables
CREATE TRIGGER set_timestamp_profiles
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TRIGGER set_timestamp_monthly_contributions
BEFORE UPDATE ON public.monthly_contributions
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TRIGGER set_timestamp_emergency_requests
BEFORE UPDATE ON public.emergency_requests
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- (No updated_at for notifications in the current definition, add if needed)

-- Grant usage on schema public to anon and authenticated roles
-- These are often default but good to be explicit if issues arise.
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant specific table permissions (RLS will further restrict)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon; -- Anon role might only need to select if you have public data, otherwise restrict further.

-- For sequences, if any are used explicitly (gen_random_uuid is generally preferred)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

