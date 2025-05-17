
"use client";

import type { ReactNode, Dispatch, SetStateAction } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  AuthChangeEvent,
  Session,
  User as SupabaseUser,
} from "@supabase/supabase-js";
import type { Profile, AuthenticatedUser as AppUser } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { fetchUserProfileFromServer as fetchProfileApi } from "@/lib/api/profile"; // Renamed import

const supabase = createClient();
const PROFILE_CACHE_KEY = "fft_user_profile";
const PROFILE_CACHE_TIMESTAMP_KEY = "fft_user_profile_timestamp";
const PROFILE_CACHE_MAX_AGE_MS = 2 * 60 * 1000; // 2 minutes cache validity

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
  const prevUserRef = useRef<SupabaseUser | null>(null);
  const { toast } = useToast();

  const loadProfileFromCache = useCallback((userIdToMatch?: string): Profile | null => {
    if (typeof window !== 'undefined') {
      try {
        const cachedProfileData = localStorage.getItem(PROFILE_CACHE_KEY);
        const cachedTimestampData = localStorage.getItem(PROFILE_CACHE_TIMESTAMP_KEY);

        if (cachedProfileData && cachedTimestampData) {
          const cachedTimestamp = parseInt(cachedTimestampData, 10);
          if (Date.now() - cachedTimestamp > PROFILE_CACHE_MAX_AGE_MS) {
            console.log("AuthContext: Cached profile is stale. Clearing.");
            localStorage.removeItem(PROFILE_CACHE_KEY);
            localStorage.removeItem(PROFILE_CACHE_TIMESTAMP_KEY);
            return null;
          }
          const parsedProfile = JSON.parse(cachedProfileData) as Profile;
          if (userIdToMatch && parsedProfile.id !== userIdToMatch) {
            console.log("AuthContext: Cached profile user ID mismatch. Clearing cache.");
            localStorage.removeItem(PROFILE_CACHE_KEY);
            localStorage.removeItem(PROFILE_CACHE_TIMESTAMP_KEY);
            return null;
          }
          console.log("AuthContext: Profile loaded from cache for user:", parsedProfile.id);
          return parsedProfile;
        }
      } catch (e) {
        console.warn("AuthContext: Failed to parse cached profile, removing.", e);
        localStorage.removeItem(PROFILE_CACHE_KEY);
        localStorage.removeItem(PROFILE_CACHE_TIMESTAMP_KEY);
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

      if (!forceRefresh) {
        const cachedProfile = loadProfileFromCache(userId);
        if (cachedProfile) {
          console.log(`AuthContext: Using cached profile for ${userId} in publicFetchProfile (cache valid).`);
          return cachedProfile;
        }
      }

      console.log(`AuthContext: Fetching fresh profile for ${userId} from server (via fetchProfileApi).`);
      try {
        // Using the imported fetchProfileApi which might internally use a client-side Supabase client
        const fetchedProfile = await fetchProfileApi(userId); 
        if (fetchedProfile && typeof window !== 'undefined') {
          if (fetchedProfile.id === userId) {
            localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(fetchedProfile));
            localStorage.setItem(PROFILE_CACHE_TIMESTAMP_KEY, Date.now().toString());
            console.log(`AuthContext: Profile for ${userId} cached in localStorage.`);
          } else {
            console.warn(`AuthContext: Fetched profile ID ${fetchedProfile.id} does not match requested ID ${userId}. Not caching.`);
          }
        } else if (!fetchedProfile && typeof window !== 'undefined') {
          const cached = loadProfileFromCache(userId);
          if (cached && cached.id === userId) {
            localStorage.removeItem(PROFILE_CACHE_KEY);
            localStorage.removeItem(PROFILE_CACHE_TIMESTAMP_KEY);
            console.log(`AuthContext: Cleared cache for ${userId} as server fetch returned null.`);
          }
        }
        return fetchedProfile;
      } catch (error: any) {
        console.error(`AuthContext: Error in publicFetchProfile calling fetchProfileApi for ${userId}:`, error.message, error);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(PROFILE_CACHE_KEY);
          localStorage.removeItem(PROFILE_CACHE_TIMESTAMP_KEY);
        }
        throw error; // Re-throw so useQuery or callers can handle it
      }
    },
    [loadProfileFromCache] 
  );

  const processUserAndProfile = useCallback(
    async (supaUser: SupabaseUser | null, event?: AuthChangeEvent) => {
      console.log(`AuthContext: Processing user. SupaUser ID: ${supaUser?.id}, Event: ${event}`);
      let currentAppUser: AppUser | null = null;
      let newProfileData: Profile | null = null;

      if (supaUser) {
        currentAppUser = { ...supaUser, profile: null } as AppUser; // Initialize with null profile

        // Determine if profile needs force refresh
        const isActualNewLogin = event === 'SIGNED_IN' && (!prevUserRef.current || prevUserRef.current.id !== supaUser.id);
        const shouldForceRefreshProfile = isActualNewLogin || event === 'USER_UPDATED' || (event === 'SIGNED_IN' && !initialLoadComplete);
        
        try {
          newProfileData = await publicFetchProfile(supaUser.id, shouldForceRefreshProfile);
        } catch (profileError) {
          console.error("AuthContext: Error fetching profile during processUserAndProfile:", profileError);
          // newProfileData remains null
        }
        if (currentAppUser) currentAppUser.profile = newProfileData;
      }

      const userChanged = user?.id !== currentAppUser?.id;
      const profileChanged = JSON.stringify(profileState) !== JSON.stringify(newProfileData);

      if (userChanged || profileChanged) {
        console.log("AuthContext: Updating user/profile state due to change.", { userChanged, profileChanged, newUserId: currentAppUser?.id, newProfileName: newProfileData?.full_name });
        setUser(currentAppUser);
        setProfileState(newProfileData);
      } else {
        console.log("AuthContext: User and profile state unchanged after processing.");
      }

      if (!initialLoadComplete) {
        setIsLoading(false);
        setInitialLoadComplete(true);
        console.log("AuthContext: Initial load process complete. isLoading set to false.");
      }
    },
    [publicFetchProfile, user, profileState, initialLoadComplete] // Added user, profileState, initialLoadComplete
  );

  useEffect(() => {
    let didUnsubscribe = false;

    if (!initialLoadComplete) {
      console.log("AuthContext: Main useEffect triggered. Initial load phase, setIsLoading(true).");
      setIsLoading(true);
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (didUnsubscribe) return;
      console.log("AuthContext: Initial getSession completed. User:", session?.user?.id);
      // prevUserRef.current is set in onAuthStateChange, for getSession, it might be the first time we see the user
      await processUserAndProfile(session?.user ?? null, 'INITIAL_SESSION');
    }).catch(error => {
      if (didUnsubscribe) return;
      console.error("AuthContext: Error in initial getSession():", error);
      processUserAndProfile(null, 'INITIAL_SESSION_ERROR'); // Will set loading false if !initialLoadComplete
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (didUnsubscribe) return;
        console.log(`AuthContext: onAuthStateChange event: ${event}, User:`, session?.user?.id);

        const userActuallyChanged = prevUserRef.current?.id !== session?.user?.id;

        if (
          (!initialLoadComplete && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) ||
          event === 'SIGNED_OUT' ||
          event === 'USER_DELETED' ||
          (event === 'SIGNED_IN' && userActuallyChanged)
        ) {
          console.log("AuthContext: Significant auth event or initial load, setting isLoading true.", { event, initialLoadComplete, prevUserId: prevUserRef.current?.id, newUserId: session?.user?.id });
          setIsLoading(true);
        }
        
        await processUserAndProfile(session?.user ?? null, event);
        prevUserRef.current = session?.user ?? null; // Update ref *after* processing and comparison

        // If it was a significant event that set isLoading to true, but initial load is complete, ensure it gets reset
        // This is mostly for SIGNED_OUT or USER_DELETED after initial load.
        // processUserAndProfile handles resetting isLoading for initialLoadComplete path.
        if (isLoading && initialLoadComplete && (event === 'SIGNED_OUT' || event === 'USER_DELETED' || (event === 'SIGNED_IN' && userActuallyChanged))) {
            setIsLoading(false);
            console.log("AuthContext: Resetting isLoading to false after significant event (post-initial load).");
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
  }, [processUserAndProfile, initialLoadComplete]); // processUserAndProfile is key dependency

  const handleSetProfileContext = useCallback((profileData: Profile | null | ((prevState: Profile | null) => Profile | null)) => {
    setProfileState(prevInternalProfile => {
      const resolvedNewProfile = typeof profileData === 'function'
        ? profileData(prevInternalProfile)
        : profileData;

      if (typeof window !== 'undefined') {
        if (resolvedNewProfile === null) {
          console.log("AuthContext: handleSetProfileContext clearing profile from cache.");
          localStorage.removeItem(PROFILE_CACHE_KEY);
          localStorage.removeItem(PROFILE_CACHE_TIMESTAMP_KEY);
        } else {
          if (user && user.id === resolvedNewProfile.id) {
            console.log(`AuthContext: handleSetProfileContext caching profile for user: ${resolvedNewProfile.id}`);
            localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(resolvedNewProfile));
            localStorage.setItem(PROFILE_CACHE_TIMESTAMP_KEY, Date.now().toString());
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
  }, [user]); // Depends on user for correct caching logic

  const signOut = async () => {
    console.log("AuthContext: signOut initiated.");
    setIsLoading(true);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(PROFILE_CACHE_KEY);
      localStorage.removeItem(PROFILE_CACHE_TIMESTAMP_KEY);
      console.log("AuthContext: Profile cache cleared on signOut.");
    }
    const { error } = await supabase.auth.signOut();
    // onAuthStateChange will handle setUser(null) and setProfileState(null)
    // and also resetting initialLoadComplete if needed.
    if (error) {
      console.error("AuthContext: Error during signOut:", error);
      toast({ title: "Logout Error", description: error.message, variant: "destructive" });
      setIsLoading(false); 
    }
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

