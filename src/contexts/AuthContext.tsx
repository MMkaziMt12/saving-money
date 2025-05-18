
"use client";

import type { ReactNode, Dispatch, SetStateAction } from "react";
import React, {
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
import { fetchUserProfileFromServer } from "@/lib/api/profile"; // Using the API function

// Create a single Supabase client instance for the context
const supabase = createClient();

interface AuthContextType {
  user: AppUser | null;
  profile: Profile | null;
  isLoadingAuth: boolean; // Renamed for clarity
  isAuthenticated: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  signOut: () => Promise<void>;
  // We remove explicit setProfile and fetchProfile from context to simplify and centralize logic
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profileState, setProfileState] = useState<Profile | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true); // True until initial auth check is done
  const [initialAuthCheckComplete, setInitialAuthCheckComplete] = useState(false);
  const previousUserIdRef = useRef<string | null>(null); // To track if user identity changes

  const { toast } = useToast();

  // Internal function to fetch profile and update states
  const fetchAndSetProfile = useCallback(async (userId: string | null): Promise<Profile | null> => {
    if (!userId) {
      console.log("AuthContext: fetchAndSetProfile - No userId, clearing profile.");
      setProfileState(null);
      return null;
    }
    console.log(`AuthContext: fetchAndSetProfile - Fetching profile for userId: ${userId}`);
    try {
      // Uses the API function, which can create its own client-side client
      const fetchedProfile = await fetchUserProfileFromServer(userId);
      console.log(`AuthContext: fetchAndSetProfile - Profile fetched for ${userId}:`, fetchedProfile ? 'Profile Data' : 'null');
      setProfileState(fetchedProfile);
      return fetchedProfile;
    } catch (error: any) {
      console.error(`AuthContext: fetchAndSetProfile - Error fetching profile for ${userId}:`, error);
      toast({
        title: "Profile Fetch Error",
        description: error.message || "Could not load profile.",
        variant: "destructive",
      });
      setProfileState(null);
      return null;
    }
  }, [toast]);


  useEffect(() => {
    let didUnsubscribe = false;
    console.log("AuthContext: Mounting. Setting up initial session check and auth listener.");
    setIsLoadingAuth(true); // Start loading on mount

    const handleInitialSession = async () => {
      if (didUnsubscribe) return;
      console.log("AuthContext: handleInitialSession - Performing initial getSession()");
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (didUnsubscribe) return;
      if (sessionError) {
        console.error("AuthContext: handleInitialSession - Error getting initial session:", sessionError);
        setUser(null);
        setProfileState(null);
      } else {
        const supaUser = session?.user ?? null;
        console.log("AuthContext: handleInitialSession - Initial SupaUser:", supaUser?.id);
        if (supaUser) {
          const fetchedProfile = await fetchAndSetProfile(supaUser.id);
          setUser({ ...supaUser, profile: fetchedProfile } as AppUser);
        } else {
          setUser(null);
          setProfileState(null);
        }
      }
      previousUserIdRef.current = session?.user?.id || null;
      setIsLoadingAuth(false);
      setInitialAuthCheckComplete(true);
      console.log("AuthContext: handleInitialSession - Initial auth check complete. isLoadingAuth:", false);
    };

    handleInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (didUnsubscribe) return;
        const currentSupaUser = session?.user ?? null;
        const currentSupaUserId = currentSupaUser?.id || null;

        console.log(`AuthContext: onAuthStateChange event: ${event}, User: ${currentSupaUserId}, Prev User: ${previousUserIdRef.current}, InitialComplete: ${initialAuthCheckComplete}`);

        if (event === 'SIGNED_IN') {
          if (previousUserIdRef.current !== currentSupaUserId || !initialAuthCheckComplete) {
            // User identity changed OR it's the initial sign-in being caught by listener
            console.log("AuthContext: SIGNED_IN - User identity changed or initial sign-in. Fetching profile.");
            if (!initialAuthCheckComplete) setIsLoadingAuth(true); // Only set global loading if it's part of initial setup
            const newProfile = await fetchAndSetProfile(currentSupaUserId!);
            setUser({ ...currentSupaUser!, profile: newProfile } as AppUser);
            if (!initialAuthCheckComplete) {
                setIsLoadingAuth(false);
                setInitialAuthCheckComplete(true);
            }
          } else {
            // Same user, likely token refresh. Only update SupabaseUser object.
            console.log("AuthContext: SIGNED_IN - Same user (token refresh). Updating SupaUser, profile preserved.");
            setUser(prevUser => prevUser ? { ...currentSupaUser!, profile: prevUser.profile } as AppUser : { ...currentSupaUser!, profile: null } as AppUser);
          }
        } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          console.log(`AuthContext: ${event} - Clearing user session.`);
          setIsLoadingAuth(true); // Briefly set loading for UI to react
          setUser(null);
          setProfileState(null);
          setIsLoadingAuth(false);
        } else if (event === 'USER_UPDATED') {
          console.log("AuthContext: USER_UPDATED - User metadata changed. Updating SupaUser and re-fetching profile.");
          if (currentSupaUser) {
            // Don't set global loading if app already loaded
            const updatedProfile = await fetchAndSetProfile(currentSupaUser.id);
            setUser({ ...currentSupaUser, profile: updatedProfile } as AppUser);
          }
        } else if (event === 'TOKEN_REFRESHED') {
            console.log("AuthContext: TOKEN_REFRESHED - Updating SupaUser, profile preserved.");
            // Only update user object, keep existing profile state if user is the same
            if (user && currentSupaUser && user.id === currentSupaUser.id) {
              setUser({ ...currentSupaUser, profile: profileState } as AppUser);
            } else if (currentSupaUser) { // If user object somehow became null
              const refreshedProfile = await fetchAndSetProfile(currentSupaUser.id);
              setUser({ ...currentSupaUser, profile: refreshedProfile } as AppUser);
            }
        } else if (event === 'INITIAL_SESSION' && !initialAuthCheckComplete) {
            console.log("AuthContext: INITIAL_SESSION event and initial check not complete. Processing.");
            setIsLoadingAuth(true);
            if (currentSupaUser) {
                const initialProfile = await fetchAndSetProfile(currentSupaUser.id);
                setUser({ ...currentSupaUser, profile: initialProfile } as AppUser);
            } else {
                setUser(null);
                setProfileState(null);
            }
            setIsLoadingAuth(false);
            setInitialAuthCheckComplete(true);
        }
        previousUserIdRef.current = currentSupaUserId;
      }
    );

    return () => {
      didUnsubscribe = true;
      if (authListener?.subscription) {
        console.log("AuthContext: Unsubscribing from onAuthStateChange.");
        authListener.subscription.unsubscribe();
      }
    };
  }, [fetchAndSetProfile, toast, initialAuthCheckComplete, user, profileState]); // Added user, profileState to dependencies due to their use in TOKEN_REFRESHED


  const signOut = async () => {
    console.log("AuthContext: signOut initiated.");
    setIsLoadingAuth(true); // Show loader during sign out
    const { error } = await supabase.auth.signOut();
    // onAuthStateChange with 'SIGNED_OUT' will handle clearing user/profile state
    // and setting isLoadingAuth to false eventually.
    if (error) {
      console.error("AuthContext: Error during signOut:", error);
      toast({ title: "Logout Error", description: error.message, variant: "destructive" });
      setIsLoadingAuth(false); // Ensure loading is false if event doesn't fire quickly
    }
  };

  const value: AuthContextType = {
    user,
    profile: profileState,
    isLoadingAuth,
    isAuthenticated: !!user && !!profileState?.is_approved, // User is authenticated if user object exists and approved
    isAdmin: profileState?.role === "admin",
    isApproved: !!profileState?.is_approved,
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
