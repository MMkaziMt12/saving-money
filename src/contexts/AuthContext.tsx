
"use client";

import type { ReactNode, Dispatch, SetStateAction } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef, // Added useRef
} from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  AuthChangeEvent,
  Session,
  User as SupabaseUser,
} from "@supabase/supabase-js";
import type { Profile, AuthenticatedUser as AppUser } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { fetchUserProfileFromServer } from "@/lib/api/profile"; // Ensure this is the correct path

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
  const [profileState, setProfileState] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const prevUserRef = useRef<SupabaseUser | null>(null); // To track if user identity changes
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
      if (!userId) {
        console.log("AuthContext: publicFetchProfile called with no userId. Returning null.");
        return null;
      }
      console.log(`AuthContext: publicFetchProfile called for ${userId}, forceRefresh: ${forceRefresh}`);

      if (!forceRefresh && typeof window !== 'undefined') {
        const cachedProfile = loadProfileFromCache(userId);
        if (cachedProfile) {
          console.log(`AuthContext: Using cached profile for ${userId} in publicFetchProfile.`);
          return cachedProfile;
        }
      }

      console.log(`AuthContext: Fetching fresh profile for ${userId} from server (via fetchUserProfileFromServer).`);
      try {
        const fetchedProfile = await fetchUserProfileFromServer(userId); // Pass Supabase client if needed by server variant
        if (fetchedProfile && typeof window !== 'undefined') {
          if(fetchedProfile.id === userId) { // Double check we are caching for the right user
            localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(fetchedProfile));
            console.log(`AuthContext: Profile for ${userId} cached in localStorage.`);
          } else {
            console.warn(`AuthContext: Fetched profile ID ${fetchedProfile.id} does not match requested ID ${userId}. Not caching.`);
          }
        } else if (!fetchedProfile && typeof window !== 'undefined') {
          const cached = loadProfileFromCache(userId); // Check if a stale cache exists for this specific user
          if (cached && cached.id === userId) {
            localStorage.removeItem(PROFILE_CACHE_KEY);
            console.log(`AuthContext: Cleared cache for ${userId} as server fetch returned null.`);
          }
        }
        return fetchedProfile;
      } catch (error: any) {
        console.error(`AuthContext: Error in publicFetchProfile calling fetchUserProfileFromServer for ${userId}:`, error.message, error);
        if (typeof window !== 'undefined') {
            localStorage.removeItem(PROFILE_CACHE_KEY); // Clear cache on error
        }
        throw error;
      }
    },
    [loadProfileFromCache]
  );

  const handleSetProfileContext = useCallback((profileData: Profile | null | ((prevState: Profile | null) => Profile | null)) => {
    setProfileState(prevInternalProfile => {
        const resolvedNewProfile = typeof profileData === 'function'
            ? profileData(prevInternalProfile)
            : profileData;

        if (typeof window !== 'undefined') {
            if (resolvedNewProfile === null) {
                console.log("AuthContext: handleSetProfileContext clearing profile from cache.");
                localStorage.removeItem(PROFILE_CACHE_KEY);
            } else {
                 // Cache only if the profile being set matches the current authenticated user (if any)
                if (user && user.id === resolvedNewProfile.id) {
                    console.log(`AuthContext: handleSetProfileContext caching profile for user: ${resolvedNewProfile.id}`);
                    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(resolvedNewProfile));
                } else if (!user && resolvedNewProfile.id) {
                    // This case is tricky: if no user is set yet but we're trying to set a profile.
                    // It might happen during initial load if profile comes from somewhere else.
                    // Caching here could be risky if 'user' is not yet aligned.
                    console.warn("AuthContext: handleSetProfileContext called with profile data but no authenticated user context. Caching cautiously.");
                    // localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(resolvedNewProfile)); // Decide if this is safe
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
            console.log("AuthContext: handleSetProfileContext updating profileState.");
            return resolvedNewProfile;
        }
        return prevInternalProfile;
    });
  }, [user]); // Depends on user state for correct caching logic

  useEffect(() => {
    console.log("AuthContext: Main useEffect triggered. initialLoadComplete:", initialLoadComplete);
    if (!initialLoadComplete) {
      setIsLoading(true);
    }

    let didUnsubscribe = false;

    const processUserAndProfile = async (supaUser: SupabaseUser | null, event?: AuthChangeEvent) => {
      if (didUnsubscribe) return;
      console.log(`AuthContext: Processing user. SupaUser ID: ${supaUser?.id}, Event: ${event}`);

      let currentAppUser: AppUser | null = null;
      let newProfileData: Profile | null = null;

      if (supaUser) {
        currentAppUser = { ...supaUser, profile: null } as AppUser; // Initialize with null profile

        // Force refresh profile on explicit SIGNED_IN or USER_UPDATED, or if cache is for a different user.
        // For INITIAL_SESSION, try cache first.
        const isSignificantEventForRefresh = event === 'SIGNED_IN' || event === 'USER_UPDATED';
        let cachedProfile = null;
        if (typeof window !== 'undefined') {
            cachedProfile = loadProfileFromCache(supaUser.id);
        }

        if (isSignificantEventForRefresh || !cachedProfile) {
          try {
            console.log(`AuthContext: Fetching fresh profile for ${supaUser.id} due to event: ${event} or no/mismatched cache.`);
            newProfileData = await publicFetchProfile(supaUser.id, true); // Force refresh
          } catch (profileError) {
            console.error("AuthContext: Error fetching profile during processUserAndProfile:", profileError);
          }
        } else {
          console.log(`AuthContext: Using cached profile for ${supaUser.id} during processUserAndProfile (event: ${event}).`);
          newProfileData = cachedProfile;
        }
        if (currentAppUser) currentAppUser.profile = newProfileData;
      }

      // Update user state
      setUser(prevUserState => {
        if (prevUserState?.id !== currentAppUser?.id || JSON.stringify(prevUserState?.profile) !== JSON.stringify(currentAppUser?.profile)) {
          console.log("AuthContext: Updating user state:", { prevId: prevUserState?.id, newId: currentAppUser?.id, profileChanged: JSON.stringify(prevUserState?.profile) !== JSON.stringify(currentAppUser?.profile) });
          return currentAppUser;
        }
        return prevUserState;
      });

      // Update profile state
      setProfileState(prevProfileState => {
        if (JSON.stringify(prevProfileState) !== JSON.stringify(newProfileData)) {
          console.log("AuthContext: Updating profileState:", { prevProfileId: prevProfileState?.id, newProfileId: newProfileData?.id });
          return newProfileData;
        }
        return prevProfileState;
      });

      if (!initialLoadComplete) {
        setIsLoading(false);
        setInitialLoadComplete(true);
        console.log("AuthContext: Initial load process complete. isLoading set to false.");
      } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        setIsLoading(false); // Also set loading to false on these events
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (didUnsubscribe) return;
      console.log("AuthContext: Initial getSession completed. User:", session?.user?.id);
      prevUserRef.current = session?.user ?? null;
      processUserAndProfile(session?.user ?? null, 'INITIAL_SESSION');
    }).catch(error => {
      if (didUnsubscribe) return;
      console.error("AuthContext: Error in initial getSession():", error);
      processUserAndProfile(null, 'INITIAL_SESSION_ERROR');
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (didUnsubscribe) return;
        console.log(`AuthContext: onAuthStateChange event: ${event}, User:`, session?.user?.id);

        if (
          (!initialLoadComplete && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) ||
          event === 'SIGNED_OUT' ||
          event === 'USER_DELETED' ||
          (event === 'SIGNED_IN' && prevUserRef.current?.id !== session?.user?.id)
        ) {
          console.log("AuthContext: Significant auth event or initial load phase, setting isLoading true.", { event, initialLoadComplete, prevUserId: prevUserRef.current?.id, newUserId: session?.user?.id });
          setIsLoading(true);
        }
        prevUserRef.current = session?.user ?? null;

        await processUserAndProfile(session?.user ?? null, event);

        // If it was a significant event that set isLoading to true, ensure it's set to false after processing
        // unless initialLoadComplete handles it.
        if (isLoading && initialLoadComplete && (event === 'SIGNED_OUT' || event === 'USER_DELETED' || (event === 'SIGNED_IN' && user?.id === session?.user?.id))) {
             // This check is to ensure isLoading is false after these events IF initialLoad was already complete.
             // processUserAndProfile might not set it to false if initialLoadComplete is true.
             if (event === 'SIGNED_IN' && !user) { /* still loading */ } else {
                console.log("AuthContext: Resetting isLoading to false after significant event processed and initial load was complete.");
                setIsLoading(false);
             }
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
  }, [publicFetchProfile, loadProfileFromCache, initialLoadComplete]); // Removed toast, user, profileState


  const signOut = async () => {
    console.log("AuthContext: signOut initiated.");
    setIsLoading(true);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(PROFILE_CACHE_KEY);
      console.log("AuthContext: Profile cache cleared on signOut.");
    }
    const { error } = await supabase.auth.signOut();
    // setUser(null); // onAuthStateChange will handle this
    // setProfileState(null); // onAuthStateChange will handle this
    if (error) {
        console.error("AuthContext: Error during signOut:", error);
        toast({title: "Logout Error", description: error.message, variant: "destructive"});
        setIsLoading(false); // Reset loading on error during signout
    }
    // onAuthStateChange with SIGNED_OUT will ensure isLoading is eventually false.
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
