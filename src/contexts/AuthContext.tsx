"use client";

import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { createContext, useContext, useEffect, useState, useCallback }  from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AuthChangeEvent, Session, User as SupabaseUser } from '@supabase/supabase-js';
import type { Profile, AuthenticatedUser as AppUser } from '@/types'; // Using AppUser to avoid name clash
import { useToast } from '@/hooks/use-toast';

const supabase = createClient();

interface AuthContextType {
  user: AppUser | null;
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  setProfile: Dispatch<SetStateAction<Profile | null>>;
  fetchProfile: (userId: string) => Promise<Profile | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    if (!userId) return null;
    try {
      const { data, error, status } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && status !== 406) { // 406 means no rows found, which is not an error here
        console.error('Error fetching profile:', error);
        toast({ title: 'Error', description: 'Could not fetch profile data.', variant: 'destructive' });
        return null;
      }
      if (data) {
        setProfile(data);
        return data;
      }
      return null;
    } catch (error) {
      console.error('Exception fetching profile:', error);
      toast({ title: 'Error', description: 'An unexpected error occurred while fetching profile.', variant: 'destructive' });
      return null;
    }
  }, [toast]);

  useEffect(() => {
    setIsLoading(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        const currentUser = session?.user ?? null;
        if (currentUser) {
          const fetchedProfile = await fetchProfile(currentUser.id);
          setUser({ ...currentUser, profile: fetchedProfile } as AppUser); // Cast as AppUser ensures profile is part of it
        } else {
          setUser(null);
          setProfile(null);
        }
        setIsLoading(false);
      }
    );

    // Initial check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const fetchedProfile = await fetchProfile(session.user.id);
        setUser({ ...session.user, profile: fetchedProfile } as AppUser);
      }
      setIsLoading(false);
    });
    

    return () => {
      subscription?.unsubscribe();
    };
  }, [fetchProfile]);

  const signOut = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setIsLoading(false);
  };
  
  const value = {
    user,
    profile,
    isLoading,
    isAdmin: profile?.role === 'admin',
    isApproved: !!profile?.is_approved,
    setProfile, // Allow components to update profile if needed after an edit
    fetchProfile,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
