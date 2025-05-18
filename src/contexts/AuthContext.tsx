
"use client";

import type { ReactNode, Dispatch, SetStateAction } from "react";
import React, {
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
import { fetchUserProfileFromServer } from "@/lib/api/profile"; // Ensure this only selects necessary columns

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
  fetchProfile: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>; // For explicit refresh
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profileState, setProfileState] = useState<Profile | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const initialAuthCheckComplete = useRef(false); // To track if initial getSession() and profile fetch is done
  const previousUserIdRef = useRef<string | null>(null); // To track if user identity changes

  const { toast } = useToast();

  // Internal function to fetch profile and update states
  const internalFetchAndSetProfile = useCallback(async (userId: string | null): Promise<Profile | null> => {
    if (!userId) {
      console.log("AuthContext: internalFetchAndSetProfile - No userId, clearing profile.");
      setProfileState(null);
      return null;
    }
    console.log(`AuthContext: internalFetchAndSetProfile - Fetching profile for userId: ${userId}`);
    try {
      const fetchedProfile = await fetchUserProfileFromServer(userId, supabase); // Pass client
      console.log(`AuthContext: internalFetchAndSetProfile - Profile fetched for ${userId}:`, fetchedProfile ? 'Profile Data' : 'null');
      setProfileState(fetchedProfile);
      return fetchedProfile;
    } catch (error: any) {
      console.error(`AuthContext: internalFetchAndSetProfile - Error fetching profile for ${userId}:`, error);
      // Avoid toast here if it's a background refresh, handle errors in UI where fetch is initiated
      setProfileState(null);
      return null;
    }
  }, [toast]); // supabase client is stable

  // Exposed fetchProfile for components to explicitly refresh if needed
  const publicFetchProfile = useCallback(async (userId: string, forceRefresh: boolean = false): Promise<Profile | null> => {
    console.log(`AuthContext: publicFetchProfile called for ${userId}, forceRefresh: ${forceRefresh}`);
    // This function now primarily relies on internalFetchAndSetProfile
    // Caching or more complex logic could be added here if needed by specific components,
    // but for the context's internal use, internalFetchAndSetProfile is sufficient.
    // If !forceRefresh and profileState matches userId and is not null, we could return profileState.
    // However, to ensure this explicit call gets fresh data when asked, we'll fetch.
    const fetchedProfile = await internalFetchAndSetProfile(userId);
    if (user && user.id === userId) {
      setUser(prevUser => prevUser ? { ...prevUser, profile: fetchedProfile } as AppUser : null);
    }
    return fetchedProfile;
  }, [internalFetchAndSetProfile, user]);


  useEffect(() => {
    let didUnsubscribe = false;
    console.log("AuthContext: Mounting. Setting up initial session check and auth listener.");

    const handleInitialSession = async () => {
      if (didUnsubscribe || initialAuthCheckComplete.current) return;

      console.log("AuthContext: handleInitialSession - Performing initial getSession()");
      setIsLoadingAuth(true); // Start global loading for initial check

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (didUnsubscribe) return;
        if (sessionError) {
          console.error("AuthContext: handleInitialSession - Error getting initial session:", sessionError);
          setUser(null);
          setProfileState(null);
        } else {
          const supaUser = session?.user ?? null;
          console.log("AuthContext: handleInitialSession - Initial SupaUser:", supaUser?.id);
          previousUserIdRef.current = supaUser?.id || null;

          if (supaUser) {
            const fetchedProfile = await internalFetchAndSetProfile(supaUser.id);
            setUser({ ...supaUser, profile: fetchedProfile } as AppUser);
          } else {
            setUser(null);
            setProfileState(null);
          }
        }
      } catch (error) {
        console.error("AuthContext: handleInitialSession - Catch block error:", error);
        setUser(null);
        setProfileState(null);
      } finally {
        if (!didUnsubscribe) {
          setIsLoadingAuth(false);
          initialAuthCheckComplete.current = true;
          console.log("AuthContext: handleInitialSession - Initial auth check complete. isLoadingAuth:", false);
        }
      }
    };

    handleInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (didUnsubscribe) return;

        const currentSupaUser = session?.user ?? null;
        const currentSupaUserId = currentSupaUser?.id || null;

        console.log(`AuthContext: onAuthStateChange event: ${event}, User: ${currentSupaUserId}, Prev User: ${previousUserIdRef.current}, InitialComplete: ${initialAuthCheckComplete.current}`);

        switch (event) {
          case 'SIGNED_IN':
          case 'INITIAL_SESSION': // Treat INITIAL_SESSION similar to a SIGNED_IN for logic flow
            if (previousUserIdRef.current !== currentSupaUserId || !initialAuthCheckComplete.current) {
              // User identity changed or it's the first sign-in after app load
              console.log("AuthContext: SIGNED_IN/INITIAL_SESSION - User identity changed or initial. Fetching profile.");
              if (!initialAuthCheckComplete.current) setIsLoadingAuth(true);

              const newProfile = await internalFetchAndSetProfile(currentSupaUserId!);
              setUser({ ...currentSupaUser!, profile: newProfile } as AppUser);

              if (!initialAuthCheckComplete.current) {
                setIsLoadingAuth(false);
                initialAuthCheckComplete.current = true;
              }
            } else {
              // Same user, likely token refresh or session re-validation after initial load
              console.log("AuthContext: SIGNED_IN/INITIAL_SESSION - Same user (token refresh/re-eval). Updating SupaUser, profile preserved from state.");
              // Only update the SupabaseUser object, keep the existing profile from profileState
              setUser(prevUser => currentSupaUser ? { ...currentSupaUser, profile: prevUser?.profile || profileState } as AppUser : null);
            }
            break;

          case 'SIGNED_OUT':
          case 'USER_DELETED':
            console.log(`AuthContext: ${event} - Clearing user session.`);
            if (!initialAuthCheckComplete.current) setIsLoadingAuth(true); // If sign out happens before initial load finishes
            else if (user) setIsLoadingAuth(true); // Only set loading if there was a user

            setUser(null);
            setProfileState(null);
            // localStorage.removeItem(PROFILE_KEY); // If we were using localStorage
            // localStorage.removeItem(PROFILE_CACHE_TIMESTAMP_KEY);
            
            if (!initialAuthCheckComplete.current || user) setIsLoadingAuth(false);
            if (!initialAuthCheckComplete.current) initialAuthCheckComplete.current = true; // Mark initial check done
            break;

          case 'USER_UPDATED':
            console.log("AuthContext: USER_UPDATED - User metadata may have changed. Updating SupaUser and re-fetching profile.");
            if (currentSupaUser) {
              // Do not set global isLoadingAuth if initial load is complete
              const updatedProfile = await internalFetchAndSetProfile(currentSupaUser.id);
              setUser({ ...currentSupaUser, profile: updatedProfile } as AppUser);
            }
            break;

          case 'TOKEN_REFRESHED':
             console.log("AuthContext: TOKEN_REFRESHED - Updating SupaUser object, profile preserved from state.");
             // Only update user object to ensure Supabase client has latest session, keep existing profile state
             if (currentSupaUser && user?.id === currentSupaUser.id) {
                setUser(prevUser => ({ ...currentSupaUser, profile: prevUser?.profile || profileState } as AppUser));
             } else if (currentSupaUser) { // User context was lost but token refreshed for someone
                const refreshedProfile = await internalFetchAndSetProfile(currentSupaUser.id);
                setUser({ ...currentSupaUser, profile: refreshedProfile } as AppUser);
             }
            break;
          
          case 'PASSWORD_RECOVERY':
            console.log("AuthContext: PASSWORD_RECOVERY event. Session might be null or new.");
            // Typically leads to a new session or requires user to sign in again.
            // Let SIGNED_IN or SIGNED_OUT handle the state.
            break;
          
          default:
            console.log(`AuthContext: Unhandled auth event: ${event}`);
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
  }, [internalFetchAndSetProfile, toast, user, profileState]); // Added user & profileState as they are read in some event handlers


  const signOut = async () => {
    console.log("AuthContext: signOut initiated.");
    if (user) setIsLoadingAuth(true); // Only show loader if there was a user
    
    const { error } = await supabase.auth.signOut();
    // onAuthStateChange with 'SIGNED_OUT' will handle clearing user/profile state
    // and eventually setting isLoadingAuth to false.
    if (error) {
      console.error("AuthContext: Error during signOut:", error);
      toast({ title: "Logout Error", description: error.message, variant: "destructive" });
      if (user) setIsLoadingAuth(false); // Ensure loading is false if event doesn't fire quickly
    }
  };

  const isAuthenticated = !!user && !!profileState?.is_approved;
  const isAdmin = profileState?.role === "admin";
  const isApproved = !!profileState?.is_approved;

  // Log final context values for debugging
  // useEffect(() => {
  //   console.log("AuthContext values updated:", { user, profileState, isLoadingAuth, isAuthenticated, isAdmin, isApproved });
  // }, [user, profileState, isLoadingAuth, isAuthenticated, isAdmin, isApproved]);

  const value: AuthContextType = {
    user,
    profile: profileState,
    isLoadingAuth,
    isAuthenticated,
    isAdmin,
    isApproved,
    signOut,
    fetchProfile: publicFetchProfile,
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


    