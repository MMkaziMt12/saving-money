
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
      const { data, error, status } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (status === 406) {
          // 406: "Not Acceptable", Supabase uses this when .single() finds no rows.
          console.warn(`Profile not found for user ID: ${userId}. Status: ${status}. This can be normal for new users if profile creation is pending or failed, or if RLS prevents access.`);
          // Intentionally not showing a global error toast for "not found" as it might be an expected state.
        } else {
          console.error(`Error fetching profile for user ID: ${userId}. Status: ${status}. Message: ${error.message}. Details: ${error.details || 'N/A'}. Hint: ${error.hint || 'N/A'}`);
          toast({
            title: `Profile Fetch Error (Status ${status})`,
            description: `Failed to load profile: ${error.message}`,
            variant: "destructive",
          });
        }
        return null; // Return null on any database error
      }
      
      // Even if no DB error, data could be null if RLS returns 0 rows without erroring.
      if (!data) {
        console.warn(`No profile data returned for user ID: ${userId}, even without a database error (status ${status}). This might indicate an RLS issue or the profile genuinely does not exist.`);
        return null;
      }

      return data; // Successfully fetched profile data
    } catch (catchedError: any) {
      console.error(`Exception during fetchProfile for user ID: ${userId}:`, catchedError.message, catchedError);
      toast({
        title: "Profile Fetch Exception",
        description: "An unexpected error occurred while fetching your profile.",
        variant: "destructive",
      });
      return null;
    }
  }, [supabase, toast]); // Added supabase to dependencies

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

    // Initial check
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
  }, [fetchProfile]); // fetchProfile is a dependency

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
