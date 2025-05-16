
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

const supabase = createClient();
const PROFILE_CACHE_KEY = "fft_user_profile";

interface AuthContextType {
  user: AppUser | null;
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  setProfile: Dispatch<SetStateAction<Profile | null>>; // For direct profile updates from components
  fetchProfile: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>; // To be used by components if needed
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start true, set to false after initial check
  const { toast } = useToast();

  const fetchProfileFromServer = useCallback(
    async (userId: string): Promise<Profile | null> => {
      if (!userId) {
        console.warn("AuthContext: fetchProfileFromServer called with no userId.");
        return null;
      }
      try {
        console.log(`AuthContext: Fetching profile from server for user: ${userId}`);
        const { data, error, status } = await supabase
          .from("profiles")
          .select(
            "id, full_name, email, phone, avatar_url, role, is_approved, created_at, updated_at, is_active, last_login"
          )
          .eq("id", userId)
          .single();

        if (error) {
          const errorMessage = error.message || `Supabase error (Code: ${error.code})`;
          console.error(`AuthContext: Error fetching profile from server for ${userId}. Status: ${status}`, JSON.stringify(error, null, 2));
          if (status !== 406) { // 406 means "No rows found" with .single()
            toast({
              title: "Profile Fetch Error",
              description: errorMessage,
              variant: "destructive",
            });
          }
          if (typeof window !== 'undefined') {
            localStorage.removeItem(PROFILE_CACHE_KEY);
          }
          throw new Error(errorMessage); // Propagate error for TanStack Query or other handlers
        }

        if (data && typeof window !== 'undefined') {
          localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
        }
        return data;
      } catch (err: any) {
        console.error(`AuthContext: Unexpected error in fetchProfileFromServer for ${userId}:`, err);
        // Toast is likely already shown by the specific error block, or handled by TanStack Query if used elsewhere
        if (typeof window !== 'undefined') {
            localStorage.removeItem(PROFILE_CACHE_KEY);
        }
        throw err; // Re-throw
      }
    },
    [toast]
  );

  const loadProfileFromCache = useCallback((userId?: string): Profile | null => {
    if (typeof window !== 'undefined') {
      try {
        const cachedProfileData = localStorage.getItem(PROFILE_CACHE_KEY);
        if (cachedProfileData) {
          const parsedProfile = JSON.parse(cachedProfileData) as Profile;
          // If a userId is provided, ensure the cache is for that user
          if (userId && parsedProfile.id !== userId) {
            console.warn("AuthContext: Cached profile user ID mismatch. Clearing cache.");
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

  // Public fetchProfile that components can use, with forceRefresh option
  const publicFetchProfile = useCallback(
    async (userId: string, forceRefresh: boolean = false): Promise<Profile | null> => {
      if (!userId) return null;
      if (!forceRefresh) {
        const cached = loadProfileFromCache(userId);
        if (cached) {
          return cached;
        }
      }
      return fetchProfileFromServer(userId);
    },
    [loadProfileFromCache, fetchProfileFromServer]
  );

  useEffect(() => {
    let didUnsubscribe = false;
    setIsLoading(true);
    console.log("AuthContext: Mounting. Initializing auth state check.");

    const processSession = async (supaUser: SupabaseUser | null) => {
      if (didUnsubscribe) return;

      let newProfileData: Profile | null = null;
      let newAppUser: AppUser | null = null;

      if (supaUser) {
        // Try loading profile from cache first if it matches the current supaUser
        let cachedProfile = loadProfileFromCache(supaUser.id);
        
        // If cache is not valid for this user, or for specific auth events, fetch fresh
        // For simplicity now, if cache doesn't exist or is for wrong user, fetch fresh.
        // A more complex strategy could be to fetch fresh only on SIGNED_IN/USER_UPDATED
        if (!cachedProfile) {
            try {
                cachedProfile = await fetchProfileFromServer(supaUser.id);
            } catch (e) {
                console.error("AuthContext: Error fetching profile during session processing:", e);
                // Keep supaUser, profile remains null or previous state if not cleared
            }
        }
        newProfileData = cachedProfile;
        newAppUser = { ...supaUser, profile: newProfileData } as AppUser;
      } else {
        // No Supabase user
        if (typeof window !== 'undefined') {
          localStorage.removeItem(PROFILE_CACHE_KEY);
        }
      }

      // Only update state if there's an actual change to prevent loops
      if (!didUnsubscribe) {
        // Compare stringified profiles only if both are non-null, otherwise compare by existence/ID
        const profileChanged = (profile?.id !== newProfileData?.id) || 
                               (profile && newProfileData && JSON.stringify(profile) !== JSON.stringify(newProfileData)) ||
                               (!profile && newProfileData) || (profile && !newProfileData);

        if (user?.id !== newAppUser?.id || profileChanged) {
          console.log("AuthContext: Updating user/profile state.");
          setUser(newAppUser);
          setProfile(newProfileData);
        }
        setIsLoading(false);
      }
    };

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("AuthContext: Initial getSession() completed.");
      processSession(session?.user ?? null);
    }).catch(error => {
        console.error("AuthContext: Error in initial getSession():", error);
        if (!didUnsubscribe) {
            setUser(null);
            setProfile(null);
            setIsLoading(false);
        }
    });

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (didUnsubscribe) return;
        console.log(`AuthContext: onAuthStateChange event: ${event}, session:`, !!session);
        setIsLoading(true); // Set loading before processing new auth state
        await processSession(session?.user ?? null);
      }
    );

    return () => {
      didUnsubscribe = true;
      if (authListener && authListener.subscription) {
        console.log("AuthContext: Unsubscribing from onAuthStateChange.");
        authListener.subscription.unsubscribe();
      }
    };
  }, [fetchProfileFromServer, loadProfileFromCache, toast]); // Dependencies are stable callbacks.

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
    // onAuthStateChange will handle setting user/profile to null and isLoading to false.
    // For a more immediate UI update, we can set them here, but it might conflict if onAuthStateChange is quick.
    // Relying on onAuthStateChange is cleaner.
    // setUser(null); 
    // setProfile(null);
    // setIsLoading(false);
  };
  
  const handleSetProfileContext = useCallback((newProfileData: Profile | null | ((prevState: Profile | null) => Profile | null)) => {
    // This function is for components to update the profile (e.g., after an edit form)
    // It also needs to update the cache and the embedded profile in the user object
    
    setProfile(prevProfile => {
        const resolvedNewProfile = typeof newProfileData === 'function' 
            ? (newProfileData as (prevState: Profile | null) => Profile | null)(prevProfile) 
            : newProfileData;

        if (typeof window !== 'undefined') {
            if (resolvedNewProfile === null) {
                localStorage.removeItem(PROFILE_CACHE_KEY);
            } else {
                localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(resolvedNewProfile));
            }
        }
        
        setUser(prevUser => prevUser ? ({ ...prevUser, profile: resolvedNewProfile } as AppUser) : null);
        return resolvedNewProfile;
    });
  }, []);


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
