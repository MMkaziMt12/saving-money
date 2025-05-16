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
const PROFILE_CACHE_KEY = "fft_user_profile"; // More specific key

interface AuthContextType {
  user: AppUser | null;
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  setProfile: Dispatch<SetStateAction<Profile | null>>; // For direct profile updates from components
  fetchProfile: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>;
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
      console.log(`AuthContext: Attempting to fetch profile from server for user: ${userId}`);
      try {
        const { data, error, status } = await supabase
          .from("profiles")
          .select( // Select only necessary fields for general context
            "id, full_name, email, phone, avatar_url, role, is_approved, created_at, is_active, last_login"
          )
          .eq("id", userId)
          .single();

        if (error) {
          const errorMessage = error.message || `Supabase error (Code: ${error.code || status})`;
          console.error(`AuthContext: Error fetching profile from server for ${userId}. Status: ${status}`, JSON.stringify(error, null, 2));
          if (status !== 406) { // 406 means "No rows found" with .single() which is a valid scenario if profile creation failed
            toast({
              title: "Profile Fetch Error",
              description: errorMessage,
              variant: "destructive",
            });
          }
          if (typeof window !== 'undefined') { // Clear potentially stale cache on error
            localStorage.removeItem(PROFILE_CACHE_KEY);
          }
          throw new Error(errorMessage);
        }
        
        if (data) {
          console.log(`AuthContext: Profile successfully fetched from server for ${userId}:`, data);
          if (typeof window !== 'undefined') {
            localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
          }
        } else {
           console.warn(`AuthContext: No profile data returned from server for ${userId}, though no explicit error. Status: ${status}`);
           if (typeof window !== 'undefined') { // Clear cache if no profile found
             localStorage.removeItem(PROFILE_CACHE_KEY);
           }
        }
        return data;
      } catch (err: any) {
        console.error(`AuthContext: Unexpected error in fetchProfileFromServer for ${userId}:`, err);
        // Toast is likely handled by the specific error block above, or if not, by TanStack Query elsewhere
        if (typeof window !== 'undefined') {
            localStorage.removeItem(PROFILE_CACHE_KEY);
        }
        throw err; // Re-throw for TanStack Query or other handlers
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
    console.log("AuthContext: Initializing auth state check.");

    const processSession = async (supaUser: SupabaseUser | null, eventType?: AuthChangeEvent) => {
      if (didUnsubscribe) return;

      let newProfileData: Profile | null = null;
      let newAppUser: AppUser | null = null;

      if (supaUser) {
        let cachedProfile: Profile | null = null;
        // For SIGNED_IN or USER_UPDATED, always prefer fresh data. For other events or initial load, cache is fine.
        const shouldForceRefresh = eventType === 'SIGNED_IN' || eventType === 'USER_UPDATED';

        if (!shouldForceRefresh && typeof window !== 'undefined') {
          cachedProfile = loadProfileFromCache(supaUser.id);
        }
        
        if (cachedProfile && !shouldForceRefresh) {
          newProfileData = cachedProfile;
          console.log(`AuthContext: Using cached profile for ${supaUser.id} during ${eventType || 'initial load'}`);
        } else {
          try {
            console.log(`AuthContext: Fetching fresh profile for ${supaUser.id} due to ${eventType || 'initial load/no cache'}`);
            newProfileData = await fetchProfileFromServer(supaUser.id);
          } catch (e) {
            console.error(`AuthContext: Error fetching profile during session processing for ${supaUser.id}:`, e);
            // Keep supaUser, profile will be null
          }
        }
        newAppUser = { ...supaUser, profile: newProfileData } as AppUser;
      } else {
        // No Supabase user
        if (typeof window !== 'undefined') {
          localStorage.removeItem(PROFILE_CACHE_KEY);
        }
      }

      if (didUnsubscribe) return;

      // Conditional state updates
      const currentProfileString = profile ? JSON.stringify(profile) : null;
      const newProfileString = newProfileData ? JSON.stringify(newProfileData) : null;

      if (user?.id !== newAppUser?.id || currentProfileString !== newProfileString) {
        console.log("AuthContext: State change detected. Updating user and profile.", { oldUserId: user?.id, newUserId: newAppUser?.id, profileChanged: currentProfileString !== newProfileString });
        setUser(newAppUser);
        setProfile(newProfileData);
      } else {
        console.log("AuthContext: No significant state change detected for user/profile.");
      }
      setIsLoading(false);
    };

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("AuthContext: Initial getSession() completed.");
      processSession(session?.user ?? null, 'INITIAL_LOAD');
    }).catch(error => {
        console.error("AuthContext: Error in initial getSession():", error);
        if (!didUnsubscribe) {
            setUser(null);
            setProfile(null);
            setIsLoading(false);
        }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (didUnsubscribe) return;
        console.log(`AuthContext: onAuthStateChange event: ${event}, session:`, !!session);
        setIsLoading(true);
        await processSession(session?.user ?? null, event);
      }
    );

    return () => {
      didUnsubscribe = true;
      if (authListener && authListener.subscription) {
        console.log("AuthContext: Unsubscribing from onAuthStateChange.");
        authListener.subscription.unsubscribe();
      }
    };
  }, [fetchProfileFromServer, loadProfileFromCache, toast]); // Dependencies are stable callbacks


  const handleSetProfileContext = useCallback((newProfileData: Profile | null | ((prevState: Profile | null) => Profile | null)) => {
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
    // onAuthStateChange will handle setting user/profile to null.
    // Explicitly setting here for faster UI feedback is okay too.
    setUser(null);
    setProfile(null);
    setIsLoading(false); // Ensure loading is false after sign out attempt
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