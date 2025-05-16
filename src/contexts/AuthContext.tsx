
"use client";

import type { ReactNode, Dispatch, SetStateAction } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  AuthChangeEvent,
  Session,
  User as SupabaseUser,
} from "@supabase/supabase-js";
import type { Profile, AuthenticatedUser as AppUser } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { fetchUserProfileFromServer } from "@/lib/api/profile"; // Updated import

const supabase = createClient();
const PROFILE_CACHE_KEY = "fft_user_profile";

interface AuthContextType {
  user: AppUser | null;
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  setProfile: (profileData: Profile | null | ((prevState: Profile | null) => Profile | null)) => void;
  fetchProfile: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const loadProfileFromCache = useCallback((userIdToMatch?: string): Profile | null => {
    if (typeof window !== 'undefined') {
      try {
        const cachedProfileData = localStorage.getItem(PROFILE_CACHE_KEY);
        if (cachedProfileData) {
          const parsedProfile = JSON.parse(cachedProfileData) as Profile;
          if (userIdToMatch && parsedProfile.id !== userIdToMatch) {
            console.warn("AuthContext: Cached profile user ID mismatch with current user. Clearing cache.");
            localStorage.removeItem(PROFILE_CACHE_KEY);
            return null;
          }
          console.log("AuthContext: Profile loaded from cache for user:", parsedProfile.id);
          return parsedProfile;
        }
      } catch (e) {
        console.warn("AuthContext: Failed to parse cached profile, removing.", e);
        localStorage.removeItem(PROFILE_CACHE_KEY);
      }
    }
    return null;
  }, []);

  const publicFetchProfile = useCallback(
    async (userId: string, forceRefresh: boolean = false): Promise<Profile | null> => {
      if (!userId) return null;
      console.log(`AuthContext: publicFetchProfile called for ${userId}, forceRefresh: ${forceRefresh}`);
      if (!forceRefresh) {
        const cached = loadProfileFromCache(userId);
        if (cached) {
          console.log(`AuthContext: Using cached profile for ${userId} in publicFetchProfile.`);
          return cached;
        }
      }
      console.log(`AuthContext: Fetching fresh profile for ${userId} in publicFetchProfile.`);
      try {
        const fetchedProfile = await fetchUserProfileFromServer(userId); // Uses imported function
        return fetchedProfile;
      } catch (error) {
        // fetchUserProfileFromServer already logs and throws, so we just catch and return null here if needed
        // or rethrow if the consuming component should handle the error display
        console.error(`AuthContext: Error in publicFetchProfile calling fetchUserProfileFromServer for ${userId}`, error);
        return null;
      }
    },
    [loadProfileFromCache] // Removed fetchUserProfileFromServer as it's imported and stable
  );

  const handleSetProfileContext = useCallback((profileData: Profile | null | ((prevState: Profile | null) => Profile | null)) => {
    setProfileState(prevProfile => {
        const resolvedNewProfile = typeof profileData === 'function' 
            ? profileData(prevProfile) 
            : profileData;

        if (typeof window !== 'undefined') {
            if (resolvedNewProfile === null) {
                localStorage.removeItem(PROFILE_CACHE_KEY);
            } else {
                 // Ensure the profile being cached matches the current user if a user is logged in
                 if (user && user.id === resolvedNewProfile.id) {
                    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(resolvedNewProfile));
                } else if (!user && resolvedNewProfile === null) { 
                    localStorage.removeItem(PROFILE_CACHE_KEY);
                } else if (user && user.id !== resolvedNewProfile.id) {
                    console.warn("AuthContext: Attempted to cache profile for a different user. Cache not updated.");
                }
            }
        }
        
        setUser(prevUser => {
            if (prevUser && resolvedNewProfile && prevUser.id === resolvedNewProfile.id) {
                return { ...prevUser, profile: resolvedNewProfile } as AppUser;
            }
             if (prevUser && resolvedNewProfile === null && prevUser.id) { // Profile cleared for existing user
                return { ...prevUser, profile: null } as AppUser;
            }
            return prevUser;
        });
        return resolvedNewProfile;
    });
  }, [user]); // user dependency is important here for caching logic

  useEffect(() => {
    let didUnsubscribe = false;
    setIsLoading(true);
    console.log("AuthContext: Initializing auth state check.");

    const processSession = async (supaUser: SupabaseUser | null, eventType?: AuthChangeEvent) => {
      if (didUnsubscribe) return;
      console.log(`AuthContext: Processing session for event: ${eventType || 'INITIAL_LOAD'}, User ID: ${supaUser?.id}`);
    
      let newProfileData: Profile | null = null;
      let newAppUser: AppUser | null = null;
    
      if (supaUser) {
        newAppUser = { ...supaUser, profile: null } as AppUser; // Initialize with null profile
        
        const forceRefreshProfile = eventType === 'SIGNED_IN' || eventType === 'USER_UPDATED' || eventType === 'TOKEN_REFRESHED';
        
        if (!forceRefreshProfile && typeof window !== 'undefined') {
          newProfileData = loadProfileFromCache(supaUser.id);
          if (newProfileData) {
             console.log(`AuthContext: Using cached profile for ${supaUser.id}.`);
          }
        }
    
        if (!newProfileData || forceRefreshProfile) {
          try {
            console.log(`AuthContext: ${forceRefreshProfile ? 'Force fetching' : 'Fetching (no cache/stale)'} profile for ${supaUser.id}.`);
            newProfileData = await fetchUserProfileFromServer(supaUser.id); // Uses imported function
          } catch (e: any) {
            console.error(`AuthContext: Error fetching profile during session processing for ${supaUser.id}:`, e.message);
            // toast({ title: "Profile Load Failed", description: e.message, variant: "destructive"});
            // Profile remains null
          }
        }
        if (newAppUser) newAppUser.profile = newProfileData; // Update embedded profile
      } else {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(PROFILE_CACHE_KEY);
        }
      }
    
      if (didUnsubscribe) return;
    
      const currentProfileString = profile ? JSON.stringify(profile) : null;
      const newProfileString = newProfileData ? JSON.stringify(newProfileData) : null;
    
      if (user?.id !== newAppUser?.id || currentProfileString !== newProfileString) {
        console.log("AuthContext: User/Profile state change detected. Updating context.", { oldUserId: user?.id, newUserId: newAppUser?.id, profileChanged: currentProfileString !== newProfileString });
        setUser(newAppUser);
        setProfileState(newProfileData);
      } else {
         console.log("AuthContext: No significant user/profile state change detected for context update.");
      }
      setIsLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("AuthContext: Initial getSession() completed.");
      processSession(session?.user ?? null, 'INITIAL_LOAD');
    }).catch(error => {
        console.error("AuthContext: Error in initial getSession():", error);
        if (!didUnsubscribe) {
            setUser(null);
            setProfileState(null);
            setIsLoading(false);
        }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (didUnsubscribe) return;
        console.log(`AuthContext: onAuthStateChange event: ${event}, Session present:`, !!session);
        setIsLoading(true); 
        await processSession(session?.user ?? null, event);
      }
    );

    return () => {
      didUnsubscribe = true;
      if (authListener?.subscription) {
        console.log("AuthContext: Unsubscribing from onAuthStateChange.");
        authListener.subscription.unsubscribe();
      }
    };
  }, [loadProfileFromCache, toast, user, profile]); // Added user and profile to deps for the conditional setProfile in processSession

  const signOut = async () => {
    console.log("AuthContext: signOut initiated.");
    setIsLoading(true);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error("AuthContext: Error during signOut:", error);
        toast({title: "Logout Error", description: error.message, variant: "destructive"});
    }
    setUser(null);
    setProfileState(null);
    setIsLoading(false);
  };
  
  const value: AuthContextType = {
    user,
    profile,
    isLoading,
    isAdmin: profile?.role === "admin",
    isApproved: !!profile?.is_approved,
    setProfile: handleSetProfileContext,
    fetchProfile: publicFetchProfile,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
