
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
      console.warn("AuthContext: fetchProfile called with no userId.");
      return null;
    }
    try {
      const { data, error, status } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, avatar_url, role, is_approved, created_at, updated_at, is_active, last_login')
        .eq('id', userId)
        .single();

      if (error) {
        if (status === 406) { // Profile not found
          console.warn(`AuthContext: Profile not found for user ID: ${userId}. Status: ${status}. This is expected for new users before profile creation.`);
          return null; // Return null, not an error, if profile simply doesn't exist yet.
        } else {
          console.error(`AuthContext: Error fetching profile for user ID: ${userId}. Status: ${status}. Message: ${error.message}.`, error);
          throw error; // Re-throw other database errors.
        }
      }
      
      if (!data && status !== 406) { // Should not happen if no error and status isn't 406
          console.warn(`AuthContext: No profile data returned for user ID: ${userId}, even without a database error (status ${status}).`);
      }
      return data;
    } catch (catchedError: any) {
      console.error(`AuthContext: Exception during fetchProfile for user ID: ${userId}:`, catchedError.message, catchedError);
      // Do not toast here as this function is called internally during auth flow.
      // Re-throw the error so calling code (like useQuery) can handle it.
      throw catchedError;
    }
  }, []); // supabase and toast are stable, no need to include if not directly used in useCallback's logic that changes

  useEffect(() => {
    setIsLoading(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        console.log('AuthContext: Auth State Change Event:', event, 'Session:', session);
        const currentUser = session?.user ?? null;
        if (currentUser) {
          try {
            const fetchedProfileData = await fetchProfile(currentUser.id);
            setUser({ ...currentUser, profile: fetchedProfileData } as AppUser); // Cast to AppUser
            setProfile(fetchedProfileData);
          } catch (error) {
            console.error("AuthContext: Failed to fetch profile during onAuthStateChange:", error);
            // User might be authenticated but profile fetch failed. Set user, profile to null.
            setUser(currentUser as AppUser); // User might still be useful even if profile fetch fails
            setProfile(null);
            // Optionally toast an error, but be mindful of multiple toasts during auth flow.
          }
        } else {
          setUser(null);
          setProfile(null);
        }
        setIsLoading(false);
      }
    );

    // Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('AuthContext: Initial getSession result:', session);
      if (session) {
        try {
          const fetchedProfileData = await fetchProfile(session.user.id);
          setUser({ ...session.user, profile: fetchedProfileData } as AppUser); // Cast to AppUser
          setProfile(fetchedProfileData);
        } catch (error) {
            console.error("AuthContext: Failed to fetch profile during initial getSession:", error);
            setUser(session.user as AppUser);
            setProfile(null);
        }
      }
      setIsLoading(false);
    }).catch(error => {
        console.error("AuthContext: Error in initial getSession promise:", error);
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
    // No need to setIsLoading(false) here if onAuthStateChange handles it,
    // but to be safe and immediate:
    setIsLoading(false); 
  };
  
  const value = {
    user,
    profile,
    isLoading,
    isAdmin: profile?.role === 'admin',
    isApproved: !!profile?.is_approved, // Ensure boolean
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
