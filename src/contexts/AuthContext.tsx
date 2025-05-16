
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
          .select(
            "id, full_name, email, phone, avatar_url, role, is_approved, created_at, updated_at, is_active, last_login"
          )
          .eq("id", userId)
          .single<Profile>(); // Specify return type for better type inference

        if (error) {
          const errorMessage = error.message || `Supabase error (Code: ${error.code || status})`;
          console.error(`AuthContext: Error fetching profile from server for ${userId}. Status: ${status}`, JSON.stringify(error, null, 2));
          if (status !== 406 && typeof window !== 'undefined') { // 406 means no rows, often expected
             // toast({ title: "Profile Fetch Error", description: errorMessage, variant: "destructive" });
          }
          if (typeof window !== 'undefined') {
            localStorage.removeItem(PROFILE_CACHE_KEY);
          }
          throw error; // Re-throw for TanStack Query or other handlers
        }
        
        if (data) {
          console.log(`AuthContext: Profile successfully fetched from server for ${userId}.`);
          if (typeof window !== 'undefined') {
            localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
          }
        } else {
           console.warn(`AuthContext: No profile data returned from server for ${userId}, though no explicit error. Status: ${status}`);
           if (typeof window !== 'undefined') {
             localStorage.removeItem(PROFILE_CACHE_KEY);
           }
        }
        return data;
      } catch (err: any) {
        console.error(`AuthContext: Unexpected error in fetchProfileFromServer for ${userId}:`, err);
        if (typeof window !== 'undefined') {
            localStorage.removeItem(PROFILE_CACHE_KEY);
        }
        throw err; 
      }
    },
    [] // toast removed as it's not used for explicit error throwing here
  );

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
      return fetchProfileFromServer(userId);
    },
    [loadProfileFromCache, fetchProfileFromServer]
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
                } else if (!user) { // Allow caching if no user is logged in (e.g. after logout)
                    localStorage.removeItem(PROFILE_CACHE_KEY);
                }
            }
        }
        
        setUser(prevUser => {
            if (prevUser && resolvedNewProfile && prevUser.id === resolvedNewProfile.id) {
                return { ...prevUser, profile: resolvedNewProfile } as AppUser;
            }
            return prevUser; // Or null if resolvedNewProfile is null and matches user.id
        });
        return resolvedNewProfile;
    });
  }, [user]); // Added user to dependency array

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
        
        if (!forceRefreshProfile) {
          newProfileData = loadProfileFromCache(supaUser.id);
          if (newProfileData) {
             console.log(`AuthContext: Using cached profile for ${supaUser.id}.`);
          }
        }

        if (!newProfileData || forceRefreshProfile) {
          try {
            console.log(`AuthContext: ${forceRefreshProfile ? 'Force fetching' : 'Fetching (no cache/stale)'} profile for ${supaUser.id}.`);
            newProfileData = await fetchProfileFromServer(supaUser.id);
          } catch (e) {
            console.error(`AuthContext: Error fetching profile during session processing for ${supaUser.id}:`, e);
            // Profile remains null
          }
        }
        newAppUser.profile = newProfileData; // Update embedded profile
      } else {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(PROFILE_CACHE_KEY);
        }
      }

      if (didUnsubscribe) return;

      // More careful state updates
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
        setIsLoading(true); // Set loading true at the start of processing an auth event
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
  }, [fetchProfileFromServer, loadProfileFromCache, profile, user]); // Added profile and user to deps for conditional setProfile


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
