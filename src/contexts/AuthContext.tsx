
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
const PROFILE_CACHE_KEY = "fft_user_profile"; // Using a more specific key

interface AuthContextType {
  user: AppUser | null;
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  setProfile: Dispatch<SetStateAction<Profile | null>>; // For manual updates, e.g., after profile edit page
  fetchProfile: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>; // Added forceRefresh
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
          if (status !== 406) { // 406 means "Not Acceptable", Supabase uses it for "No rows found" with .single()
            console.error(`AuthContext: Error fetching profile from server for ${userId}. Status: ${status}`, error);
            toast({
              title: "Profile Fetch Error",
              description: error.message || "Could not load user profile.",
              variant: "destructive",
            });
          } else {
            console.warn(`AuthContext: No profile found on server for ${userId}. This might be expected for new users.`);
          }
          if (typeof window !== 'undefined') {
            localStorage.removeItem(PROFILE_CACHE_KEY); // Clear stale cache if server fetch fails or returns no profile
          }
          return null;
        }

        if (data && typeof window !== 'undefined') {
          localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
          console.log(`AuthContext: Profile for ${userId} fetched and cached.`);
        }
        return data;
      } catch (err: any) {
        console.error(`AuthContext: Unexpected error in fetchProfileFromServer for ${userId}:`, err);
        toast({
          title: "Profile Operation Failed",
          description: err.message || "An unexpected error occurred while handling profile data.",
          variant: "destructive",
        });
        if (typeof window !== 'undefined') {
            localStorage.removeItem(PROFILE_CACHE_KEY); // Clear cache on unexpected error
        }
        throw err; // Re-throw to allow calling TanStack Query hooks to handle error state
      }
    },
    [toast]
  );

  const loadProfileFromCache = useCallback((): Profile | null => {
    if (typeof window !== 'undefined') {
      try {
        const cachedProfileData = localStorage.getItem(PROFILE_CACHE_KEY);
        if (cachedProfileData) {
          const parsedProfile = JSON.parse(cachedProfileData) as Profile;
          console.log("AuthContext: Profile loaded from cache:", parsedProfile.id);
          return parsedProfile;
        }
      } catch (e) {
        console.warn("AuthContext: Failed to parse cached profile, removing.", e);
        localStorage.removeItem(PROFILE_CACHE_KEY);
      }
    }
    return null;
  }, []);

  // Public fetchProfile that can be used by components, with forceRefresh option
  const fetchProfile = useCallback(
    async (userId: string, forceRefresh: boolean = false): Promise<Profile | null> => {
      if (!userId) return null;
      if (!forceRefresh) {
        const cached = loadProfileFromCache();
        if (cached && cached.id === userId) { // Ensure cache is for the correct user
          return cached;
        }
      }
      // If no cache, cache is for different user, or forceRefresh is true
      return fetchProfileFromServer(userId);
    },
    [loadProfileFromCache, fetchProfileFromServer]
  );


  useEffect(() => {
    let didUnsubscribe = false;
    setIsLoading(true);
    console.log("AuthContext: Initializing, setting isLoading to true.");

    const handleUserSession = async (currentSupabaseUser: SupabaseUser | null) => {
      if (didUnsubscribe) return;

      if (currentSupabaseUser) {
        console.log("AuthContext: User session found/changed. User ID:", currentSupabaseUser.id);
        let userProfile = loadProfileFromCache();

        // Verify cached profile belongs to the current user
        if (userProfile && userProfile.id !== currentSupabaseUser.id) {
            console.warn("AuthContext: Cached profile user ID mismatch. Clearing cache.");
            localStorage.removeItem(PROFILE_CACHE_KEY);
            userProfile = null;
        }
        
        // If no valid cache, or if it's an auth change event (implying potential update), fetch fresh.
        // For initial getSession, if cache exists and matches user, we can use it to speed up initial UI.
        // For onAuthStateChange, always fetching fresh is safer.
        const isInitialSessionCheck = !user; // Heuristic: if context user is null, it's likely initial check

        if (!userProfile || !isInitialSessionCheck) {
            console.log("AuthContext: No valid cache or auth state change, fetching profile from server for", currentSupabaseUser.id);
            userProfile = await fetchProfileFromServer(currentSupabaseUser.id);
        } else {
            console.log("AuthContext: Using cached profile for initial load:", currentSupabaseUser.id);
             // Optionally, still refresh profile in background after initial load with cache
            fetchProfileFromServer(currentSupabaseUser.id).then(freshProfile => {
              if (freshProfile && !didUnsubscribe) {
                setProfile(freshProfile); // Update with fresh data non-blockingly
                setUser(prevUser => prevUser ? ({ ...prevUser, profile: freshProfile } as AppUser) : null);
              }
            }).catch(e => console.error("AuthContext: Background profile refresh failed", e));
        }

        if (!didUnsubscribe) {
            setProfile(userProfile);
            setUser({ ...currentSupabaseUser, profile: userProfile } as AppUser);
        }

      } else {
        console.log("AuthContext: No user session.");
        if (typeof window !== 'undefined') {
          localStorage.removeItem(PROFILE_CACHE_KEY);
        }
        if (!didUnsubscribe) {
            setProfile(null);
            setUser(null);
        }
      }
      if (!didUnsubscribe) {
        setIsLoading(false);
        console.log("AuthContext: setIsLoading to false after session/profile handling.");
      }
    };

    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("AuthContext: Initial getSession() completed.");
      handleUserSession(session?.user ?? null);
    }).catch(error => {
        console.error("AuthContext: Error in initial getSession():", error);
        if (!didUnsubscribe) setIsLoading(false);
    });

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        console.log(`AuthContext: onAuthStateChange event: ${event}`);
        if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
          await handleUserSession(session?.user ?? null);
        } else if (event === "SIGNED_OUT") {
          await handleUserSession(null);
        }
        // For INITIAL_SESSION, getSession() above handles it.
      }
    );

    return () => {
      didUnsubscribe = true;
      if (authListener && authListener.subscription) {
        console.log("AuthContext: Unsubscribing from onAuthStateChange.");
        authListener.subscription.unsubscribe();
      }
    };
  }, [fetchProfileFromServer, loadProfileFromCache, user]); // `user` dependency ensures re-evaluation if user object itself changes in a way not covered by auth events.

  const signOut = async () => {
    console.log("AuthContext: signOut initiated.");
    setIsLoading(true);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(PROFILE_CACHE_KEY);
      console.log("AuthContext: Profile cache cleared on signOut.");
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error("AuthContext: Error during signOut:", error);
        toast({title: "Logout Error", description: error.message, variant: "destructive"});
    }
    // onAuthStateChange will handle setting user and profile to null
    // and then setIsLoading(false)
    // For immediate UI feedback if onAuthStateChange is slow:
    // setUser(null); 
    // setProfile(null);
    // setIsLoading(false); 
    // However, relying on onAuthStateChange is cleaner.
  };
  
  const handleSetProfile = useCallback((newProfileData: Profile | null | ((prevState: Profile | null) => Profile | null)) => {
    setProfile(newProfileData);
    if (typeof window !== 'undefined') {
        if (newProfileData === null || typeof newProfileData === 'function') { // if null or updater function, clear cache for safety
            localStorage.removeItem(PROFILE_CACHE_KEY);
        } else {
            localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(newProfileData));
        }
    }
    setUser(prevUser => prevUser ? ({ ...prevUser, profile: typeof newProfileData === 'function' ? null : newProfileData } as AppUser) : null);
  }, []);


  const value: AuthContextType = {
    user,
    profile,
    isLoading,
    isAdmin: profile?.role === "admin",
    isApproved: !!profile?.is_approved,
    setProfile: handleSetProfile, // Use the wrapped setter
    fetchProfile, // Expose the public fetchProfile
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

