
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
import { fetchUserProfileFromServer } from "@/lib/api/profile";

const supabase = createClient();

interface AuthContextType {
  user: AppUser | null;
  profile: Profile | null;
  isLoadingAuth: boolean; // True during initial auth check or significant auth state changes
  isAuthenticated: boolean; // Derived: user exists AND profile is approved
  isApproved: boolean;    // Derived: profile exists and is_approved is true
  isAdmin: boolean;       // Derived: profile exists and role is 'admin'
  
  signOutUser: () => Promise<void>;
  // Exposed for components that might need to explicitly refresh the profile in context
  fetchProfileInContext: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>; 
  // Internal state setter, exposed if absolutely needed but generally managed by context
  setProfileContext: (profile: Profile | null) => void; 
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  initialUser: AppUser | null;
  initialProfile: Profile | null;
}

export const AuthProvider = ({ children, initialUser, initialProfile }: AuthProviderProps) => {
  const [user, setUser] = useState<AppUser | null>(initialUser);
  const [profileState, setProfileState] = useState<Profile | null>(initialProfile);
  // isLoadingAuth is true if server couldn't provide initialUser, so client needs to check.
  // If initialUser is provided, initial auth check is considered done by server.
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(!initialUser); 
  const { toast } = useToast();

  // Ref to track if the very first client-side auth check sequence has completed
  const initialClientAuthCheckComplete = useRef<boolean>(!!initialUser); 
  const previousUserIdRef = useRef<string | null>(initialUser?.id || null);

  const internalFetchAndSetProfile = useCallback(async (userId: string | null, isNewLogin: boolean = false): Promise<Profile | null> => {
    if (!userId) {
      console.log("AuthContext: internalFetchAndSetProfile - No user ID, clearing profile.");
      if (profileState !== null) { // Only update if it's actually changing
        setProfileState(null);
        setUser(prevUser => prevUser ? { ...prevUser, profile: null } as AppUser : null);
      }
      return null;
    }

    // If it's not a new login and profile already matches current user, avoid refetch
    if (!isNewLogin && profileState && profileState.id === userId) {
      console.log(`AuthContext: internalFetchAndSetProfile - Profile for user ${userId} already in context. Skipping fetch.`);
      return profileState;
    }
    
    console.log(`AuthContext: internalFetchAndSetProfile - Fetching profile for user ${userId}. New login: ${isNewLogin}`);
    try {
      const fetchedProfile = await fetchUserProfileFromServer(userId, supabase); // Use client-side supabase
      if (fetchedProfile) {
        console.log(`AuthContext: internalFetchAndSetProfile - Profile fetched for ${userId}:`, { id: fetchedProfile.id, name: fetchedProfile.full_name });
        setProfileState(fetchedProfile);
        setUser(prevUser => prevUser && prevUser.id === userId ? { ...prevUser, profile: fetchedProfile } as AppUser : prevUser);
      } else {
        console.warn(`AuthContext: internalFetchAndSetProfile - No profile found for ${userId}.`);
        if (profileState !== null) setProfileState(null); // Clear if previously existed
        setUser(prevUser => prevUser && prevUser.id === userId ? { ...prevUser, profile: null } as AppUser : prevUser);
      }
      return fetchedProfile;
    } catch (error) {
      console.error(`AuthContext: internalFetchAndSetProfile - Error fetching profile for ${userId}:`, error);
      toast({ title: "Profile Fetch Error", description: (error as Error).message, variant: "destructive" });
      if (profileState !== null) setProfileState(null);
      setUser(prevUser => prevUser && prevUser.id === userId ? { ...prevUser, profile: null } as AppUser : prevUser);
      return null;
    }
  }, [toast, profileState]); // profileState added to check if fetch is needed


  useEffect(() => {
    console.log("AuthContext: Mounting. Initial user from server:", initialUser ? initialUser.id : null);
    if (!initialClientAuthCheckComplete.current) {
      // This means the server didn't provide an initialUser, so client must determine auth state.
      setIsLoadingAuth(true);
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        const currentSupaUser = session?.user ?? null;
        const currentSupaUserId = currentSupaUser?.id ?? null;
        console.log(`AuthContext: onAuthStateChange event: ${event}, User: ${currentSupaUserId}, PrevUser: ${previousUserIdRef.current}`);

        let needsProfileFetch = false;
        let isSignificantAuthChange = false;

        if (event === 'SIGNED_IN') {
          if (previousUserIdRef.current !== currentSupaUserId || !profileState || profileState.id !== currentSupaUserId) {
            console.log("AuthContext: SIGNED_IN for new/different user or profile missing. Will fetch profile.");
            needsProfileFetch = true;
            isSignificantAuthChange = true;
            if (!initialClientAuthCheckComplete.current) setIsLoadingAuth(true);
          } else {
            console.log("AuthContext: SIGNED_IN for same user (token refresh). Updating SupaUser object.");
             if (user?.id !== currentSupaUser?.id || user?.aud !== currentSupaUser?.aud) { // Check if user object really changed
                setUser(currentSupaUser ? { ...currentSupaUser, profile: profileState } as AppUser : null);
             }
          }
        } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          console.log(`AuthContext: ${event}. Clearing user and profile.`);
          isSignificantAuthChange = true;
          if (!initialClientAuthCheckComplete.current || user) setIsLoadingAuth(true); // Only show loader if there was a user or initial check pending
          setUser(null);
          setProfileState(null);
        } else if (event === 'USER_UPDATED') {
          console.log("AuthContext: USER_UPDATED. Will fetch profile.");
          setUser(currentSupaUser ? { ...currentSupaUser, profile: profileState } as AppUser : null); // Update user object first
          needsProfileFetch = true;
        } else if (event === 'TOKEN_REFRESHED') {
          console.log("AuthContext: TOKEN_REFRESHED. Updating SupaUser object.");
          if (user?.id !== currentSupaUser?.id || user?.aud !== currentSupaUser?.aud) {
            setUser(currentSupaUser ? { ...currentSupaUser, profile: profileState } as AppUser : null);
          }
        } else if (event === 'INITIAL_SESSION' && !initialClientAuthCheckComplete.current) {
           console.log("AuthContext: INITIAL_SESSION event from listener (client must have missed server initial user).");
           isSignificantAuthChange = true;
           setIsLoadingAuth(true);
           if (currentSupaUser) {
             setUser(currentSupaUser ? { ...currentSupaUser, profile: null } as AppUser : null); // Set user first
             needsProfileFetch = true;
           }
        }

        if (needsProfileFetch && currentSupaUserId) {
          await internalFetchAndSetProfile(currentSupaUserId, true);
        }
        
        previousUserIdRef.current = currentSupaUserId;

        if (isSignificantAuthChange || !initialClientAuthCheckComplete.current) {
            console.log("AuthContext: Setting isLoadingAuth to false and initialClientAuthCheckComplete to true after event:", event);
            setIsLoadingAuth(false);
            initialClientAuthCheckComplete.current = true;
        }
      }
    );
    
    // If initialUser wasn't provided by server, and onAuthStateChange hasn't fired yet for INITIAL_SESSION
    // ensure loading is set to false after a small delay, assuming no session.
    if (!initialUser && !initialClientAuthCheckComplete.current) {
        const timer = setTimeout(() => {
            if (!initialClientAuthCheckComplete.current) { // Check again in case listener fired
                 console.log("AuthContext: Timeout, no initial session from listener, setting loading false.");
                 setIsLoadingAuth(false);
                 initialClientAuthCheckComplete.current = true;
            }
        }, 1500); // Adjust timeout as needed
         return () => {
            clearTimeout(timer);
            authListener?.subscription.unsubscribe();
            console.log("AuthContext: Unsubscribed from onAuthStateChange.");
        };
    }


    return () => {
      authListener?.subscription.unsubscribe();
      console.log("AuthContext: Unsubscribed from onAuthStateChange.");
    };
  }, [internalFetchAndSetProfile, initialUser, profileState, user]); // Added profileState and user to ensure consistency of embedded profile

  const signOutUser = async () => {
    console.log("AuthContext: signOutUser called.");
    if (user) setIsLoadingAuth(true); // Show loader during sign out
    setUser(null); // Optimistically clear client state
    setProfileState(null);
    previousUserIdRef.current = null;
    await supabase.auth.signOut();
    // onAuthStateChange will fire with SIGNED_OUT and handle final isLoadingAuth = false
    console.log("AuthContext: Supabase signOut complete.");
  };

  const fetchProfileInContext = useCallback(async (userId: string, forceRefresh: boolean = true): Promise<Profile | null> => {
      if (!userId) return null;
      console.log(`AuthContext: fetchProfileInContext called for ${userId}, forceRefresh: ${forceRefresh}`);
      if (!forceRefresh && profileState && profileState.id === userId) {
          console.log("AuthContext: fetchProfileInContext - Returning existing profile from context state.");
          return profileState;
      }
      return internalFetchAndSetProfile(userId, forceRefresh);
  }, [internalFetchAndSetProfile, profileState]);
  
  const handleSetProfileContext = useCallback((newProfile: Profile | null) => {
      console.log("AuthContext: setProfileContext called with:", newProfile ? {id: newProfile.id, name: newProfile.full_name} : null);
      setProfileState(newProfile);
      if (user) {
          setUser(prevUser => prevUser ? { ...prevUser, profile: newProfile } as AppUser : null);
      }
  }, [user]);


  const derivedIsAdmin = profileState?.role === "admin";
  const derivedIsApproved = !!profileState?.is_approved;
  const derivedIsAuthenticated = !!user && derivedIsApproved; // User must exist AND be approved

  // Log derived state changes for debugging
  useEffect(() => {
    console.log("AuthContext: Derived states updated:", { derivedIsAuthenticated, derivedIsApproved, derivedIsAdmin, isLoadingAuth, userId: user?.id });
  }, [derivedIsAuthenticated, derivedIsApproved, derivedIsAdmin, isLoadingAuth, user?.id]);

  const value: AuthContextType = {
    user,
    profile: profileState,
    isLoadingAuth,
    isAdmin: derivedIsAdmin,
    isApproved: derivedIsApproved,
    isAuthenticated: derivedIsAuthenticated,
    signOutUser,
    fetchProfileInContext,
    setProfileContext: handleSetProfileContext,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

    