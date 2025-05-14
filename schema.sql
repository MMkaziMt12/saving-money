-- Enable the pgvector extension if not already enabled
-- create extension if not exists vector;

-- Table for User Profiles
create table if not exists profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  full_name TEXT,
  email TEXT UNIQUE, -- Ensure email is unique if used as a login identifier
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_approved BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(), -- redundant with created_at but kept if used
  last_login TIMESTAMP WITH TIME ZONE
);

-- Function to create a profile for a new user
-- IMPORTANT: Ensure this function is SECURITY DEFINER to bypass RLS for the insert operation.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Executes with the privileges of the function owner, bypassing RLS for this function's operations.
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, is_approved, joined_at)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name', -- From Google OAuth or signup metadata
    NEW.raw_user_meta_data->>'avatar_url', -- From Google OAuth or signup metadata
    'user',  -- Default role
    FALSE,   -- Default approval status
    now()    -- Set joined_at timestamp
  );
  RETURN NEW;
END;
$$;

-- Trigger to call handle_new_user on new auth.users entry
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for Profiles table

-- First, ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile.
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Policy: Users can update their own profile.
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- To allow admins to manage all profiles without recursion, we need a helper function.
-- This function should be SECURITY DEFINER to bypass RLS for its internal query.
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  admin_role TEXT;
BEGIN
  SELECT role INTO admin_role FROM public.profiles WHERE id = user_id;
  RETURN admin_role = 'admin';
EXCEPTION WHEN NO_DATA_FOUND THEN
  RETURN FALSE; -- User profile might not exist yet or no role found
END;
$$;

-- Policy: Admins can view all profiles.
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (is_admin(auth.uid()));

-- Policy: Admins can update any profile.
CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid())); -- Optional: check if admin status is maintained

-- Policy: Admins can delete profiles (be cautious with this).
CREATE POLICY "Admins can delete profiles"
ON public.profiles FOR DELETE
USING (is_admin(auth.uid()));

-- Note: INSERT policies for 'profiles' are typically not needed if the 'handle_new_user' trigger
-- handles profile creation. If users could create their own profiles directly (e.g. if trigger fails),
-- you might add: CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
-- However, relying on the trigger is common.


-- Table for Monthly Contributions
create table if not exists monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  recorded_by_admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own monthly contributions"
ON public.monthly_contributions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all monthly contributions"
ON public.monthly_contributions FOR ALL -- Covers SELECT, INSERT, UPDATE, DELETE
USING (is_admin(auth.uid()));


-- Table for Emergency Requests
create table if not exists emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount_requested NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reviewed_by_admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  admin_notes TEXT
);

ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own emergency requests"
ON public.emergency_requests FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create emergency requests for themselves"
ON public.emergency_requests FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all emergency requests"
ON public.emergency_requests FOR ALL -- Covers SELECT, INSERT, UPDATE, DELETE
USING (is_admin(auth.uid()));


-- Table for Notifications
create table if not exists notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    message TEXT,
    type TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    channel TEXT,
    is_read BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can mark their own notifications as read"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Admins might send notifications, but typically via a secure function rather than direct insert policy for all.
-- If direct admin insert is needed:
-- CREATE POLICY "Admins can create notifications"
-- ON public.notifications FOR INSERT
-- WITH CHECK (is_admin(auth.uid()));


-- Ensure the handle_new_user trigger is correctly re-applied if it was dropped or modified
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

