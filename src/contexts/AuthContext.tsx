
"use client";

import type { ReactNode } from "react";
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
import { fetchUserProfileFromServer as fetchProfileApi } from "@/lib/api/profile";

const supabase = createClient(); // Client for auth listener and explicit profile fetches if needed by context

interface AuthContextType {
  user: AppUser | null;
  profile: Profile | null;
  isLoading: boolean; // Global loading for major auth state changes
  isAdmin: boolean;
  isApproved: boolean;
  fetchProfile: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>; // For explicit component-driven refresh
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profileState, setProfileState] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true); // True until initial auth check + profile fetch is done
  const [initialAuthCheckComplete, setInitialAuthCheckComplete] = useState(false);
  const prevUserRef = useRef<string | null>(null); // Store previous user ID
  const { toast } = useToast();

  const internalFetchAndSetProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    console.log(`AuthContext: internalFetchAndSetProfile for userId: ${userId}`);
    if (!userId) {
      setProfileState(null);
      return null;
    }
    try {
      const fetchedProfile = await fetchProfileApi(userId, supabase); // Use the context's supabase client
      console.log(`AuthContext: Profile fetched in internalFetchAndSetProfile for ${userId}:`, fetchedProfile ? 'Profile Data' : 'null');
      setProfileState(fetchedProfile);
      return fetchedProfile;
    } catch (error: any) {
      console.error(`AuthContext: Error in internalFetchAndSetProfile for ${userId}:`, error);
      toast({
        title: "Profile Fetch Error",
        description: error.message || "Could not load profile during session setup.",
        variant: "destructive",
      });
      setProfileState(null); // Ensure profile is null on error
      return null;
    }
  }, [toast]); // supabase client is stable from module scope

  // Exposed fetchProfile for components to manually refresh if needed
  const publicFetchProfile = useCallback(
    async (userId: string, forceRefresh: boolean = false): Promise<Profile | null> => {
      console.log(`AuthContext: publicFetchProfile called for ${userId}, forceRefresh: ${forceRefresh}`);
      if (!userId) return null;

      // If not forcing refresh and we have a profile for this user, return it (basic cache)
      if (!forceRefresh && profileState && profileState.id === userId) {
        console.log(`AuthContext: publicFetchProfile returning existing profileState for ${userId}`);
        return profileState;
      }
      // Otherwise, fetch fresh
      return internalFetchAndSetProfile(userId);
    },
    [profileState, internalFetchAndSetProfile]
  );

  useEffect(() => {
    let didUnsubscribe = false;
    console.log("AuthContext: Mounting and setting up auth listener. isLoading set to true.");
    setIsLoading(true); // Start loading on mount

    const processInitialSession = async (sessionUser: SupabaseUser | null) => {
      if (didUnsubscribe) return;
      console.log("AuthContext: Processing initial session. User ID:", sessionUser?.id);
      let currentProfile: Profile | null = null;
      if (sessionUser) {
        currentProfile = await internalFetchAndSetProfile(sessionUser.id);
        setUser({ ...sessionUser, profile: currentProfile } as AppUser);
      } else {
        setUser(null);
        setProfileState(null);
      }
      prevUserRef.current = sessionUser?.id || null;
      setIsLoading(false);
      setInitialAuthCheckComplete(true);
      console.log("AuthContext: Initial session processing complete. isLoading set to false. initialAuthCheckComplete set to true.");
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      processInitialSession(session?.user ?? null);
    }).catch(error => {
      if (didUnsubscribe) return;
      console.error("AuthContext: Error in initial getSession():", error);
      processInitialSession(null); // Treat as no session
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (didUnsubscribe) return;
        console.log(`AuthContext: onAuthStateChange event: ${event}, User ID: ${session?.user?.id}, Previous User ID: ${prevUserRef.current}`);

        const currentSupaUser = session?.user ?? null;
        const currentSupaUserId = currentSupaUser?.id || null;

        if (event === 'SIGNED_IN') {
          if (prevUserRef.current !== currentSupaUserId) {
            // User identity has actually changed (new login or first login)
            console.log("AuthContext: SIGNED_IN - User identity changed or initial sign-in. Setting isLoading true.");
            setIsLoading(true);
            const newProfile = await internalFetchAndSetProfile(currentSupaUserId!);
            setUser({ ...currentSupaUser!, profile: newProfile } as AppUser);
            setIsLoading(false);
            console.log("AuthContext: SIGNED_IN - Profile fetched and state updated. isLoading set to false.");
          } else {
            // User ID is the same, likely a token refresh. Only update the Supabase user object.
            // Do NOT set global isLoading. Do NOT re-fetch profile here.
            console.log("AuthContext: SIGNED_IN - Token refresh or session revalidation for same user. Updating Supabase user object only.");
            if (user && currentSupaUser && JSON.stringify(user ? (({profile, ...rest}) => rest)(user) : null) !== JSON.stringify(currentSupaUser)) {
               setUser({ ...currentSupaUser, profile: profileState } as AppUser); // Keep current profileState
            }
          }
        } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          console.log(`AuthContext: ${event} - Clearing user session. Setting isLoading true.`);
          setIsLoading(true);
          setUser(null);
          setProfileState(null);
          setIsLoading(false);
          console.log(`AuthContext: ${event} - Session cleared. isLoading set to false.`);
        } else if (event === 'USER_UPDATED') {
          // User metadata might have changed, good to refresh profile.
          // Don't set global isLoading if initial check is complete.
          console.log("AuthContext: USER_UPDATED - Refreshing profile.");
          if (currentSupaUser) {
            const updatedProfile = await internalFetchAndSetProfile(currentSupaUser.id);
            setUser({ ...currentSupaUser, profile: updatedProfile } as AppUser);
          }
        } else if (event === 'TOKEN_REFRESHED' || event === 'PASSWORD_RECOVERY') {
            console.log(`AuthContext: Event ${event} received. Updating Supabase user object if necessary.`);
            if (user && currentSupaUser && JSON.stringify(user ? (({profile, ...rest}) => rest)(user) : null) !== JSON.stringify(currentSupaUser)) {
               setUser({ ...currentSupaUser, profile: profileState } as AppUser); // Keep current profileState
            }
        }
        prevUserRef.current = currentSupaUserId;
      }
    );

    return () => {
      didUnsubscribe = true;
      if (authListener?.subscription) {
        console.log("AuthContext: Unsubscribing from onAuthStateChange.");
        authListener.subscription.unsubscribe();
      }
    };
  }, [internalFetchAndSetProfile, toast, user, profileState]); // Dependencies: internalFetchAndSetProfile, toast. user, profileState for comparison.

  const signOut = async () => {
    console.log("AuthContext: signOut initiated. Setting isLoading true.");
    setIsLoading(true);
    const { error } = await supabase.auth.signOut();
    // The onAuthStateChange 'SIGNED_OUT' event will handle clearing user/profile and setting isLoading false.
    if (error) {
      console.error("AuthContext: Error during signOut:", error);
      toast({ title: "Logout Error", description: error.message, variant: "destructive" });
      setIsLoading(false); // Ensure loading is false if event doesn't fire or is delayed
    }
  };

  const value: AuthContextType = {
    user,
    profile: profileState,
    isLoading,
    isAdmin: profileState?.role === "admin",
    isApproved: !!profileState?.is_approved,
    fetchProfile: publicFetchProfile, // Expose the one that can force refresh if needed
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

    