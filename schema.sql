-- Enable the pgvector extension
create extension if not exists vector;

-- Table for User Profiles
create table if not exists public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  full_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user',
  is_approved BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE, -- Added active status
  last_login TIMESTAMP WITH TIME ZONE -- Track last login
);

-- Enable Row Level Security on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Function to check if a user is an admin (SECURITY DEFINER to prevent recursion)
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;


-- Policies for profiles table
DROP POLICY IF EXISTS "Profiles are viewable by users who created them." ON public.profiles;
CREATE POLICY "Authenticated users can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true); -- Allows any authenticated user to read all profile data for joining names etc.

DROP POLICY IF EXISTS "Profiles are updateable by users who created them." ON public.profiles;
CREATE POLICY "Profiles are updateable by users who created them."
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles"
ON public.profiles FOR ALL -- SELECT, INSERT, UPDATE, DELETE
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));


-- Function to handle new user signup and create a profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url, role, is_approved)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name', -- Extract from provider if available
    NEW.email,
    NEW.raw_user_meta_data ->> 'avatar_url', -- Extract from provider if available
    'user',  -- Default role
    FALSE    -- Default not approved
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; -- Crucial for bypassing RLS during initial profile insert

-- Trigger to call handle_new_user on new auth.users entries
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Table for Monthly Contributions
create table if not exists public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  recorded_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for monthly_contributions
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only view their own monthly contributions." ON public.monthly_contributions;
CREATE POLICY "Users can only view their own monthly contributions."
ON public.monthly_contributions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage monthly contributions." ON public.monthly_contributions;
CREATE POLICY "Admins can manage monthly contributions."
ON public.monthly_contributions FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));


-- Table for Emergency Requests
create table if not exists public.emergency_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_requested NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- e.g., pending, approved, rejected, repaid, overdue
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reviewed_by_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT, -- Admin can add notes for review
  return_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  amount_returned NUMERIC DEFAULT 0,
  last_return_date TIMESTAMP WITH TIME ZONE,
  is_fully_repaid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for emergency_requests
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view all emergency_requests" ON public.emergency_requests;
CREATE POLICY "Authenticated users can view all emergency_requests"
ON public.emergency_requests FOR SELECT
TO authenticated
USING (true); -- Allows any authenticated user to read all requests for dashboard/detail page.

DROP POLICY IF EXISTS "Authenticated users can insert their own emergency_requests" ON public.emergency_requests;
CREATE POLICY "Authenticated users can insert their own emergency_requests"
ON public.emergency_requests FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all emergency_requests" ON public.emergency_requests;
CREATE POLICY "Admins can manage all emergency_requests"
ON public.emergency_requests FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));


-- Table for Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'general', -- e.g., 'general', 'contribution_reminder', 'emergency_update'
    link TEXT, -- Optional URL to navigate to
    related_request_id UUID NULL REFERENCES public.emergency_requests(id) ON DELETE SET NULL, -- Link to specific emergency request
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL -- Null if unread, timestamp when read
);

-- Enable Row Level Security on the notifications table
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Users can update their own notifications (e.g., to mark them as read)
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can view notifications for requests they are authorized to see.
DROP POLICY IF EXISTS "Users can view notifications for visible requests" ON public.notifications;
CREATE POLICY "Users can view notifications for visible requests"
ON public.notifications FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.emergency_requests er
    WHERE er.id = public.notifications.related_request_id
    -- This implicitly relies on the RLS for emergency_requests.
    -- If a user can see the request (due to being an admin or their own request, or broad view policy),
    -- they can see notifications linked to it.
  )
);


-- Policy: Admins can manage all notifications
DROP POLICY IF EXISTS "Admins can manage all notifications" ON public.notifications;
CREATE POLICY "Admins can manage all notifications"
ON public.notifications
FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));


-- Function to get the net total family savings balance
-- (Total Contributions) - (Total Approved Emergency Funds Requested) + (Total Emergency Funds Returned)
CREATE OR REPLACE FUNCTION public.get_total_family_savings()
RETURNS NUMERIC AS $$
DECLARE
  total_contributions NUMERIC;
  total_disbursed NUMERIC;
  total_returned NUMERIC;
BEGIN
  -- Calculate total contributions
  SELECT COALESCE(SUM(amount), 0)
  INTO total_contributions
  FROM public.monthly_contributions;

  -- Calculate total amount requested for approved emergency requests
  SELECT COALESCE(SUM(amount_requested), 0)
  INTO total_disbursed
  FROM public.emergency_requests
  WHERE status = 'approved';

  -- Calculate total amount returned for emergency requests
  SELECT COALESCE(SUM(amount_returned), 0)
  INTO total_returned
  FROM public.emergency_requests
  WHERE status = 'approved' AND amount_returned IS NOT NULL; -- Only sum if there are returns

  RETURN total_contributions - total_disbursed + total_returned;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_total_family_savings() TO authenticated;

-- STORAGE RLS for profile-pic bucket
-- Ensure the 'profile-pic' bucket exists. These policies apply to it.

-- Policy: Allow users to view their own profile pictures.
DROP POLICY IF EXISTS "Users can view their own profile pictures" ON storage.objects;
CREATE POLICY "Users can view their own profile pictures"
FOR SELECT ON storage.objects
USING (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Allow users to insert their own profile pictures.
DROP POLICY IF EXISTS "Users can insert their own profile pictures" ON storage.objects;
CREATE POLICY "Users can insert their own profile pictures"
FOR INSERT ON storage.objects
WITH CHECK (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Allow users to update their own profile pictures.
DROP POLICY IF EXISTS "Users can update their own profile pictures" ON storage.objects;
CREATE POLICY "Users can update their own profile pictures"
FOR UPDATE ON storage.objects
USING (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Allow users to delete their own profile pictures.
DROP POLICY IF EXISTS "Users can delete their own profile pictures" ON storage.objects;
CREATE POLICY "Users can delete their own profile pictures"
FOR DELETE ON storage.objects
USING (bucket_id = 'profile-pic' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Admins have full access to the profile-pic bucket.
DROP POLICY IF EXISTS "Admins can manage all profile pictures" ON storage.objects;
CREATE POLICY "Admins can manage all profile pictures"
FOR ALL ON storage.objects -- ALL covers SELECT, INSERT, UPDATE, DELETE
USING (bucket_id = 'profile-pic' AND is_admin(auth.uid()))
WITH CHECK (bucket_id = 'profile-pic' AND is_admin(auth.uid()));
