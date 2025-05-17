
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
import { fetchUserProfileFromServer } from "@/lib/api/profile";

const supabase = createClient();
const PROFILE_CACHE_KEY = "fft_user_profile";

interface AuthContextType {
  user: AppUser | null;
  profile: Profile | null;
  isLoading: boolean; // Primarily for initial auth sequence
  isAdmin: boolean;
  isApproved: boolean;
  setProfile: (profileData: Profile | null | ((prevState: Profile | null) => Profile | null)) => void;
  fetchProfile: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profileState, setProfileState] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true); // True initially, set to false after first successful load or auth failure
  const [initialLoadComplete, setInitialLoadComplete] = useState(false); // Tracks if initial auth/profile attempt is done
  const { toast } = useToast();

  const loadProfileFromCache = useCallback((userIdToMatch?: string): Profile | null => {
    if (typeof window !== 'undefined') {
      try {
        const cachedProfileData = localStorage.getItem(PROFILE_CACHE_KEY);
        if (cachedProfileData) {
          const parsedProfile = JSON.parse(cachedProfileData) as Profile;
          if (userIdToMatch && parsedProfile.id !== userIdToMatch) {
            console.log("AuthContext: Cached profile user ID mismatch. Clearing cache for key:", PROFILE_CACHE_KEY);
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
        const cachedProfile = loadProfileFromCache(userId);
        if (cachedProfile) {
          console.log(`AuthContext: Using cached profile for ${userId} in publicFetchProfile.`);
          return cachedProfile;
        }
      }
      console.log(`AuthContext: Fetching fresh profile for ${userId} from server (via fetchUserProfileFromServer).`);
      try {
        // Assuming fetchUserProfileFromServer can take a Supabase client or creates one
        const fetchedProfile = await fetchUserProfileFromServer(userId); 
        if (fetchedProfile && typeof window !== 'undefined') {
          localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(fetchedProfile));
        } else if (!fetchedProfile && typeof window !== 'undefined') {
          const cached = loadProfileFromCache(userId);
          if (cached) {
            localStorage.removeItem(PROFILE_CACHE_KEY);
            console.log(`AuthContext: Cleared cache for ${userId} as server fetch returned null.`);
          }
        }
        return fetchedProfile;
      } catch (error: any) {
        console.error(`AuthContext: Error in publicFetchProfile calling fetchUserProfileFromServer for ${userId}:`, error.message, error);
        // Toasting is now handled inside fetchUserProfileFromServer if it's designed to do so,
        // or we can add it here if needed. For now, we re-throw for TanStack Query.
        if (typeof window !== 'undefined') { 
            localStorage.removeItem(PROFILE_CACHE_KEY);
        }
        throw error; 
      }
    },
    [loadProfileFromCache] // Removed toast from dependencies as fetchUserProfileFromServer might handle it
  );

  const handleSetProfileContext = useCallback((profileData: Profile | null | ((prevState: Profile | null) => Profile | null)) => {
    setProfileState(prevInternalProfile => {
        const resolvedNewProfile = typeof profileData === 'function' 
            ? profileData(prevInternalProfile) 
            : profileData;

        if (typeof window !== 'undefined') {
            if (resolvedNewProfile === null) {
                localStorage.removeItem(PROFILE_CACHE_KEY);
            } else {
                 if (user && user.id === resolvedNewProfile.id) { // Ensure caching for the correct user
                    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(resolvedNewProfile));
                }
            }
        }
        
        setUser(prevUser => {
            if (prevUser && resolvedNewProfile && prevUser.id === resolvedNewProfile.id) {
                if (JSON.stringify(prevUser.profile) !== JSON.stringify(resolvedNewProfile)) {
                    return { ...prevUser, profile: resolvedNewProfile } as AppUser;
                }
            } else if (prevUser && resolvedNewProfile === null && prevUser.profile !== null) {
                return { ...prevUser, profile: null } as AppUser;
            }
            return prevUser;
        });

        if (JSON.stringify(prevInternalProfile) !== JSON.stringify(resolvedNewProfile)) {
            return resolvedNewProfile;
        }
        return prevInternalProfile;
    });
  }, [user]); // Depends on user for caching correctly

  useEffect(() => {
    let didUnsubscribe = false;
    console.log("AuthContext: Main useEffect running. initialLoadComplete:", initialLoadComplete);

    if (!initialLoadComplete) {
      setIsLoading(true); // Set loading true for the very first run
    }

    const processUserAndProfile = async (supaUser: SupabaseUser | null, event?: AuthChangeEvent) => {
      if (didUnsubscribe) return;
      console.log(`AuthContext: Processing user. SupaUser ID: ${supaUser?.id}, Event: ${event}`);

      let currentAppUser: AppUser | null = null;
      let currentProfileData: Profile | null = null;

      if (supaUser) {
        currentAppUser = { ...supaUser, profile: null } as AppUser; // Start with null profile
        
        const forceRefresh = event === 'SIGNED_IN' || event === 'USER_UPDATED';
        try {
          currentProfileData = await publicFetchProfile(supaUser.id, forceRefresh);
          if (currentAppUser) currentAppUser.profile = currentProfileData;
        } catch (profileError) {
          console.error("AuthContext: Error fetching profile during session processing:", profileError);
          // Profile fetch failed, currentProfileData remains null
        }
      }

      if (didUnsubscribe) return;

      // Update user state if ID changed or if profile content embedded in user changed
      setUser(prevUser => {
        if (prevUser?.id !== currentAppUser?.id || JSON.stringify(prevUser?.profile) !== JSON.stringify(currentAppUser?.profile)) {
          console.log("AuthContext: Updating user state.", { newUserId: currentAppUser?.id });
          return currentAppUser;
        }
        return prevUser;
      });

      // Update profileState if its content changed
      setProfileState(prevProfile => {
        if (JSON.stringify(prevProfile) !== JSON.stringify(currentProfileData)) {
          console.log("AuthContext: Updating profileState.", { newProfileId: currentProfileData?.id });
          return currentProfileData;
        }
        return prevProfile;
      });

      if (!initialLoadComplete) {
        setIsLoading(false);
        setInitialLoadComplete(true);
        console.log("AuthContext: Initial load process complete. isLoading set to false.");
      } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        // Ensure loading is false after these events too
        setIsLoading(false);
      }
    };

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("AuthContext: Initial getSession completed. User:", session?.user?.id);
      processUserAndProfile(session?.user ?? null, 'INITIAL_LOAD');
    }).catch(error => {
      console.error("AuthContext: Error in initial getSession():", error);
      if (!didUnsubscribe) {
        processUserAndProfile(null, 'INITIAL_LOAD_ERROR'); // Process as if no user
      }
    });

    // Auth state change listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (didUnsubscribe) return;
        console.log(`AuthContext: onAuthStateChange event: ${event}, User:`, session?.user?.id);
        
        // Only set global isLoading true for explicit login/logout, not for background token refreshes
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          console.log("AuthContext: Significant auth event, setting isLoading true.");
          setIsLoading(true);
        }
        await processUserAndProfile(session?.user ?? null, event);
         // If it was SIGNED_IN, isLoading would have been set true, processUserAndProfile will set it false.
         // For other events like TOKEN_REFRESHED, if initialLoadComplete is true, isLoading won't be touched here by processUserAndProfile,
         // and we don't want to set it to true for these background events.
        if (event === 'SIGNED_IN' && !isLoading && initialLoadComplete) {
             // This ensures that after a SIGNED_IN event (and profile fetch), loading is false
             setIsLoading(false);
        }
      }
    );

    return () => {
      didUnsubscribe = true;
      if (authListener?.subscription) {
        console.log("AuthContext: Unsubscribing from onAuthStateChange.");
        authListener.subscription.unsubscribe();
      }
    };
  }, [publicFetchProfile, loadProfileFromCache, initialLoadComplete]); // Removed toast, user, profileState from here


  const signOut = async () => {
    console.log("AuthContext: signOut initiated.");
    setIsLoading(true); // Set loading true during sign out
    if (typeof window !== 'undefined') {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error("AuthContext: Error during signOut:", error);
        toast({title: "Logout Error", description: error.message, variant: "destructive"});
        setIsLoading(false); // Reset loading on error during signout
    }
    // onAuthStateChange with SIGNED_OUT event will handle setting user/profile to null and isLoading to false.
  };
  
  const value: AuthContextType = {
    user,
    profile: profileState,
    isLoading,
    isAdmin: profileState?.role === "admin",
    isApproved: !!profileState?.is_approved,
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

    