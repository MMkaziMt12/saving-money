
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
import { fetchUserProfileFromServer } from "@/lib/api/profile"; // Ensure this is correctly imported

const supabase = createClient();

interface AuthContextType {
  user: AppUser | null;
  profile: Profile | null;
  isLoadingAuth: boolean; // True during initial auth check or significant auth state changes
  isAuthenticated: boolean; // Derived: user exists AND profile is approved
  isApproved: boolean;    // Derived: profile exists and is_approved is true
  isAdmin: boolean;       // Derived: profile exists and role is 'admin'
  
  signOutUser: () => Promise<void>;
  fetchProfileInContext: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>; 
  setProfileContext: (profile: Profile | null) => void; // Kept for profile page updates
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  initialUser: AppUser | null; // User object from server, may or may not have profile embedded
  initialProfile: Profile | null; // Profile object from server
}

export const AuthProvider = ({ children, initialUser, initialProfile }: AuthProviderProps) => {
  // Initialize state from server-passed props
  const [user, setUser] = useState<AppUser | null>(() => {
    if (initialUser && initialProfile) {
      return { ...initialUser, profile: initialProfile } as AppUser;
    }
    return initialUser;
  });
  const [profileState, setProfileState] = useState<Profile | null>(initialProfile);
  // isLoadingAuth is true if server couldn't provide initialUser, so client needs to check.
  // If initialUser is provided, initial auth check is considered done by server for that user.
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(!initialUser);
  
  const { toast } = useToast();
  const initialClientAuthCheckComplete = useRef<boolean>(!!initialUser); // If server provides user, client check is initially "done"
  const previousUserIdRef = useRef<string | null>(initialUser?.id || null);

  const internalFetchAndSetProfile = useCallback(async (userId: string | null, isNewLogin: boolean = false): Promise<Profile | null> => {
    if (!userId) {
      console.log("AuthContext: internalFetchAndSetProfile - No user ID, clearing profile if it exists.");
      if (profileState !== null) {
        setProfileState(null);
        setUser(prevUser => prevUser ? { ...prevUser, profile: null } as AppUser : null);
      }
      return null;
    }

    // If not a new login and profile already matches current user, avoid refetch
    if (!isNewLogin && profileState && profileState.id === userId) {
      console.log(`AuthContext: internalFetchAndSetProfile - Profile for user ${userId} already in context and not a new login. Skipping fetch.`);
      // Ensure user object has profile embedded if profileState exists
      if (user && user.id === userId && (!user.profile || user.profile.id !== profileState.id)) {
         setUser(prevUser => prevUser ? { ...prevUser, profile: profileState } as AppUser : null);
      }
      return profileState;
    }
    
    console.log(`AuthContext: internalFetchAndSetProfile - Fetching profile for user ${userId}. New login: ${isNewLogin}`);
    try {
      // fetchUserProfileFromServer can be called client-side if supabase client is not passed
      const fetchedProfile = await fetchUserProfileFromServer(userId); 
      
      if (fetchedProfile) {
        console.log(`AuthContext: internalFetchAndSetProfile - Profile fetched for ${userId}:`, { id: fetchedProfile.id, name: fetchedProfile.full_name, approved: fetchedProfile.is_approved });
        setProfileState(fetchedProfile);
        setUser(prevUser => prevUser && prevUser.id === userId ? { ...prevUser, profile: fetchedProfile } as AppUser : (prevUser || null) );
      } else {
        console.warn(`AuthContext: internalFetchAndSetProfile - No profile found for ${userId}.`);
        if (profileState !== null) setProfileState(null);
        setUser(prevUser => prevUser && prevUser.id === userId ? { ...prevUser, profile: null } as AppUser : (prevUser || null));
      }
      return fetchedProfile;
    } catch (error) {
      console.error(`AuthContext: internalFetchAndSetProfile - Error fetching profile for ${userId}:`, error);
      toast({ title: "Profile Fetch Error", description: (error as Error).message, variant: "destructive" });
      if (profileState !== null) setProfileState(null);
      setUser(prevUser => prevUser && prevUser.id === userId ? { ...prevUser, profile: null } as AppUser : (prevUser || null));
      return null;
    }
  }, [toast, profileState, user]); // profileState and user are dependencies for comparison

  useEffect(() => {
    console.log("AuthContext: Mounting. Initial user from server:", initialUser?.id, "Initial profile ID:", initialProfile?.id, "Initial isLoadingAuth:", !initialUser);
    
    if (!initialClientAuthCheckComplete.current) {
      // This runs if the server didn't provide an initialUser, so client must determine auth state.
      setIsLoadingAuth(true); // Explicitly set loading
      console.log("AuthContext: No initialUser from server, client performing initial auth check.");
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        const currentSupaUser = session?.user ?? null;
        const currentSupaUserId = currentSupaUser?.id ?? null;
        console.log("AuthContext: Initial getSession() result. User ID:", currentSupaUserId);
        
        previousUserIdRef.current = currentSupaUserId; // Set this early
        setUser(currentSupaUser ? { ...currentSupaUser, profile: null } as AppUser : null); // Set SupaUser first

        if (currentSupaUser) {
          await internalFetchAndSetProfile(currentSupaUser.id, true); // Force fetch for initial determination
        } else {
          setProfileState(null); // No user, so no profile
        }
        setIsLoadingAuth(false);
        initialClientAuthCheckComplete.current = true;
        console.log("AuthContext: Initial client auth check complete. isLoadingAuth: false");
      }).catch(error => {
        console.error("AuthContext: Error in initial getSession():", error);
        setIsLoadingAuth(false);
        initialClientAuthCheckComplete.current = true;
      });
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        const currentSupaUser = session?.user ?? null;
        const currentSupaUserId = currentSupaUser?.id ?? null;
        console.log(`AuthContext: onAuthStateChange event: ${event}, User: ${currentSupaUserId}, PrevUser: ${previousUserIdRef.current}, InitialCheckDone: ${initialClientAuthCheckComplete.current}`);

        let needsProfileFetch = false;
        let isSignificantAuthChange = false; // For potentially setting global loader

        if (event === 'SIGNED_IN') {
          if (previousUserIdRef.current !== currentSupaUserId) { // User identity actually changed
            console.log("AuthContext: SIGNED_IN for new/different user. Will fetch profile.");
            isSignificantAuthChange = true;
            needsProfileFetch = true;
          } else if (!profileState && currentSupaUserId) { // Same user, but profile somehow missing
            console.log("AuthContext: SIGNED_IN for same user, but profile is missing. Will attempt to fetch profile.");
            needsProfileFetch = true; 
          } else {
            console.log("AuthContext: SIGNED_IN for same user (token refresh or re-auth). SupabaseUser object will be updated. Profile not re-fetched by default here.");
          }
           // Always update the Supabase user object in state for session freshness
          setUser(currentSupaUser ? { ...currentSupaUser, profile: profileState } as AppUser : null);
        } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          console.log(`AuthContext: ${event}. Clearing user and profile.`);
          isSignificantAuthChange = true;
          setUser(null);
          setProfileState(null);
        } else if (event === 'USER_UPDATED') {
          console.log("AuthContext: USER_UPDATED. Will fetch profile.");
          setUser(currentSupaUser ? { ...currentSupaUser, profile: profileState } as AppUser : null);
          needsProfileFetch = true;
        } else if (event === 'TOKEN_REFRESHED') {
           console.log("AuthContext: TOKEN_REFRESHED. Updating SupabaseUser object.");
           // Update user object if it's different (e.g. new token)
           if (user?.id !== currentSupaUser?.id || user?.aud !== currentSupaUser?.aud) {
              setUser(currentSupaUser ? { ...currentSupaUser, profile: profileState } as AppUser : null);
           }
        } else if (event === 'INITIAL_SESSION' && !initialClientAuthCheckComplete.current) {
           console.log("AuthContext: INITIAL_SESSION (listener fired before getSession completed). Processing.");
           isSignificantAuthChange = true; // This IS significant for initial setup
           needsProfileFetch = !!currentSupaUser;
           setUser(currentSupaUser ? { ...currentSupaUser, profile: null } as AppUser : null);
        }

        if (isSignificantAuthChange && !initialClientAuthCheckComplete.current) {
          setIsLoadingAuth(true);
          console.log("AuthContext: Significant event during initial phase, isLoadingAuth: true");
        }
        
        if (needsProfileFetch && currentSupaUserId) {
          await internalFetchAndSetProfile(currentSupaUserId, true); // Force fresh profile for significant changes
        }
        
        previousUserIdRef.current = currentSupaUserId;

        if (isSignificantAuthChange && !initialClientAuthCheckComplete.current) {
          setIsLoadingAuth(false);
          initialClientAuthCheckComplete.current = true;
          console.log("AuthContext: Post-event initial phase processing, isLoadingAuth: false, initialClientAuthCheckComplete: true");
        } else if (isSignificantAuthChange && initialClientAuthCheckComplete.current && (event === 'SIGNED_OUT' || event === 'USER_DELETED' || (event === 'SIGNED_IN' && previousUserIdRef.current !== currentSupaUserId))) {
          // If it's a user switch after initial load, ensure loader is managed.
          // This might require a brief isLoading toggle if not already handled.
          // For now, profile fetch handles its own errors; major state changes are done.
        }
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
      console.log("AuthContext: Unsubscribed from onAuthStateChange.");
    };
  // initialUser, initialProfile are used for initial state, not direct dependencies for effect re-runs.
  // internalFetchAndSetProfile is memoized.
  }, [internalFetchAndSetProfile, toast]); 


  const signOutUser = async () => {
    console.log("AuthContext: signOutUser called.");
    // Set loading true only if there was a user, to show feedback for logout action
    if(user) setIsLoadingAuth(true); 
    previousUserIdRef.current = null; // Clear previous user before Supabase event
    setUser(null); 
    setProfileState(null);
    await supabase.auth.signOut();
    // The onAuthStateChange listener will fire with SIGNED_OUT.
    // It will then ensure isLoadingAuth is false and initialClientAuthCheckComplete is true (if it wasn't already).
    console.log("AuthContext: Supabase signOut complete. isLoadingAuth might still be true until SIGNED_OUT event fully processed by listener.");
  };

  const fetchProfileInContext = useCallback(async (userId: string, forceRefresh: boolean = false): Promise<Profile | null> => {
      if (!userId) return null;
      console.log(`AuthContext: fetchProfileInContext called for ${userId}, forceRefresh: ${forceRefresh}`);
      // If not forcing refresh, and profile for this user exists and is considered fresh enough, return it
      if (!forceRefresh && profileState && profileState.id === userId) {
          console.log("AuthContext: fetchProfileInContext - Returning existing profile from context state.");
          return profileState;
      }
      // Otherwise, call the internal fetcher which will update context state
      return internalFetchAndSetProfile(userId, true); // Force new fetch if explicitly asked
  }, [profileState, internalFetchAndSetProfile]);
  
  const handleSetProfileContext = useCallback((newProfile: Profile | null) => {
      console.log("AuthContext: setProfileContext called with:", newProfile ? {id: newProfile.id, name: newProfile.full_name} : null);
      setProfileState(newProfile);
      if (user) {
          setUser(prevUser => prevUser ? { ...prevUser, profile: newProfile } as AppUser : null);
      }
  }, [user]);


  const derivedIsAdmin = profileState?.role === "admin";
  const derivedIsApproved = !!profileState?.is_approved;
  // isAuthenticated means user exists AND profile is loaded AND profile is approved.
  const derivedIsAuthenticated = !!user && !!profileState && derivedIsApproved; 

  useEffect(() => {
    console.log("AuthContext: Derived states updated:", { derivedIsAuthenticated, derivedIsApproved, derivedIsAdmin, isLoadingAuth, userId: user?.id, profileId: profileState?.id });
  }, [derivedIsAuthenticated, derivedIsApproved, derivedIsAdmin, isLoadingAuth, user?.id, profileState?.id]);

  const value: AuthContextType = {
    user, // This user object will have profile embedded after successful fetch
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

    