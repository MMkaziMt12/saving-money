
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
    if (!userId) {
      console.warn("fetchProfile called with no userId.");
      return null;
    }
    try {
      // Optimized: Select only necessary profile fields
      const { data, error, status } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, avatar_url, role, is_approved, created_at, updated_at, is_active, last_login')
        .eq('id', userId)
        .single();

      if (error) {
        if (status === 406) {
          console.warn(`Profile not found for user ID: ${userId}. Status: ${status}.`);
        } else {
          console.error(`Error fetching profile for user ID: ${userId}. Status: ${status}. Message: ${error.message}.`);
          toast({
            title: `Profile Fetch Error (Status ${status})`,
            description: `Failed to load profile: ${error.message}`,
            variant: "destructive",
          });
        }
        return null;
      }
      
      if (!data) {
        console.warn(`No profile data returned for user ID: ${userId}, even without a database error (status ${status}).`);
        return null;
      }
      return data;
    } catch (catchedError: any) {
      console.error(`Exception during fetchProfile for user ID: ${userId}:`, catchedError.message, catchedError);
      toast({
        title: "Profile Fetch Exception",
        description: "An unexpected error occurred while fetching your profile.",
        variant: "destructive",
      });
      return null;
    }
  }, [toast]); // Removed supabase from dependencies as it's stable from createClient()

  useEffect(() => {
    setIsLoading(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        console.log('Auth State Change Event:', event, 'Session:', session);
        const currentUser = session?.user ?? null;
        if (currentUser) {
          const fetchedProfileData = await fetchProfile(currentUser.id);
          setUser({ ...currentUser, profile: fetchedProfileData } as AppUser);
          setProfile(fetchedProfileData);
        } else {
          setUser(null);
          setProfile(null);
        }
        setIsLoading(false);
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('Initial getSession:', session);
      if (session) {
        const fetchedProfileData = await fetchProfile(session.user.id);
        setUser({ ...session.user, profile: fetchedProfileData } as AppUser);
        setProfile(fetchedProfileData);
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
    setProfile, 
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
