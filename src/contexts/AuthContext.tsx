
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
import { fetchUserProfileFromServer } from "@/lib/api/profile"; // Server-side capable fetcher

const supabase = createClient();

interface AuthContextType {
  user: AppUser | null;
  profile: Profile | null;
  isLoadingAuth: boolean;
  isAuthenticated: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  signOutUser: () => Promise<void>;
  fetchProfile: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>;
  setProfileContext: (profile: Profile | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  initialUser: AppUser | null; // From server component in (app)/layout
  initialProfile: Profile | null; // From server component in (app)/layout
}

export const AuthProvider = ({ children, initialUser, initialProfile }: AuthProviderProps) => {
  const [user, setUser] = useState<AppUser | null>(initialUser);
  const [profileState, setProfileState] = useState<Profile | null>(initialProfile);
  // isLoadingAuth is true if server couldn't provide initialUser OR if client needs to verify/update.
  // If initialUser IS provided, client still might do a quick update or listen.
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(!initialUser);
  
  const { toast } = useToast();
  const initialClientAuthCheckComplete = useRef<boolean>(!!initialUser); // If server provides user, client check is "initially" done.
  const previousUserIdRef = useRef<string | null>(initialUser?.id || null);

  // Internal function to fetch and set profile
  const internalFetchAndSetProfile = useCallback(async (
    userId: string | null,
    isNewLogin: boolean = false // true if it's a fresh login/user change, false for updates
  ): Promise<Profile | null> => {
    if (!userId) {
      console.log("AuthContext: internalFetchAndSetProfile - No user ID, clearing profile.");
      setProfileState(null);
      setUser(prevUser => prevUser ? { ...prevUser, profile: null } as AppUser : null);
      return null;
    }

    // If not a new login and profile for this user already exists, don't refetch unless forced (handled by public fetchProfile)
    if (!isNewLogin && profileState && profileState.id === userId) {
      console.log(`AuthContext: internalFetchAndSetProfile - Profile for user ${userId} already in context, not a new login. Re-embedding.`);
       if (user && (!user.profile || user.profile.id !== profileState.id)) {
         setUser(prevSupaUser => prevSupaUser ? { ...prevSupaUser, profile: profileState } as AppUser : null);
       }
      return profileState;
    }
    
    console.log(`AuthContext: internalFetchAndSetProfile - Fetching profile for user ${userId}. New login: ${isNewLogin}`);
    try {
      const fetchedProfile = await fetchUserProfileFromServer(userId); // Uses client-side Supabase
      if (fetchedProfile) {
        console.log(`AuthContext: internalFetchAndSetProfile - Profile fetched for ${userId}:`, { id: fetchedProfile.id, name: fetchedProfile.full_name, approved: fetchedProfile.is_approved });
        setProfileState(fetchedProfile);
        setUser(prevSupaUser => prevSupaUser && prevSupaUser.id === userId ? { ...prevSupaUser, profile: fetchedProfile } as AppUser : (prevSupaUser || null) );
      } else {
        console.warn(`AuthContext: internalFetchAndSetProfile - No profile found for ${userId}.`);
        setProfileState(null);
        setUser(prevSupaUser => prevSupaUser && prevSupaUser.id === userId ? { ...prevSupaUser, profile: null } as AppUser : (prevSupaUser || null));
      }
      return fetchedProfile;
    } catch (error) {
      console.error(`AuthContext: internalFetchAndSetProfile - Error fetching profile for ${userId}:`, error);
      toast({ title: "Profile Fetch Error", description: (error as Error).message, variant: "destructive" });
      setProfileState(null);
      setUser(prevSupaUser => prevSupaUser && prevSupaUser.id === userId ? { ...prevSupaUser, profile: null } as AppUser : (prevSupaUser || null));
      return null;
    }
  }, [toast, profileState, user]); // Dependencies for comparison and toast

  useEffect(() => {
    console.log("AuthContext: AuthProvider mounted/updated. Initial user ID from server:", initialUser?.id, "Initial profile ID from server:", initialProfile?.id);
    let isMounted = true;

    // This function handles initial session check if server didn't provide user
    const performInitialClientSideAuthCheck = async () => {
      if (!initialUser && !initialClientAuthCheckComplete.current) { // Only if server didn't provide user and client hasn't checked
        console.log("AuthContext: No initialUser from server, client performing initial getSession(). Setting isLoadingAuth true.");
        if (isMounted) setIsLoadingAuth(true);
        
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const currentSupaUser = session?.user ?? null;
          console.log("AuthContext: Initial getSession() result. User ID:", currentSupaUser?.id);
          
          if (isMounted) {
            setUser(currentSupaUser ? { ...currentSupaUser, profile: null } as AppUser : null);
            previousUserIdRef.current = currentSupaUser?.id || null;
            if (currentSupaUser) {
              await internalFetchAndSetProfile(currentSupaUser.id, true); // Force as it's initial determination
            } else {
              setProfileState(null); // No user, so no profile
            }
          }
        } catch (error) {
          console.error("AuthContext: Error during initial getSession():", error);
        } finally {
          if (isMounted) {
            setIsLoadingAuth(false);
            initialClientAuthCheckComplete.current = true;
            console.log("AuthContext: Initial client-side auth check complete. isLoadingAuth: false");
          }
        }
      } else if (initialUser && !initialClientAuthCheckComplete.current) {
        // Server provided user, but client side listener is just setting up.
        // Profile should already be set from initialProfile.
        // Mark client check as complete.
        console.log("AuthContext: Server provided initialUser. Marking client auth check complete.");
        initialClientAuthCheckComplete.current = true;
        if (isLoadingAuth) setIsLoadingAuth(false); // Ensure loading is false if server provided data
      }
    };

    performInitialClientSideAuthCheck();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!isMounted) return;
        console.log(`AuthContext: onAuthStateChange event: ${event}, User: ${session?.user?.id}, PrevUser: ${previousUserIdRef.current}, InitialClientCheckDone: ${initialClientAuthCheckComplete.current}`);
        
        const currentSupaUser = session?.user ?? null;
        const currentSupaUserId = currentSupaUser?.id || null;

        let needsProfileFetch = false;
        let isNewUserLogin = false;

        if (event === 'SIGNED_IN') {
          if (previousUserIdRef.current !== currentSupaUserId || !profileState) {
            console.log("AuthContext: SIGNED_IN for new user or profile missing. Will fetch profile.");
            needsProfileFetch = true;
            isNewUserLogin = true; // Treat as new login for profile fetching logic
            if (!initialClientAuthCheckComplete.current && isMounted) { // If initial check wasn't done by getSession
                setIsLoadingAuth(true);
            }
          } else {
            console.log("AuthContext: SIGNED_IN for same user (token refresh). Updating SupabaseUser object.");
            // Only update user object, keep existing profileState for this user
             if (user?.id !== currentSupaUser?.id || user?.aud !== currentSupaUser?.aud || !user.profile) {
                setUser(currentSupaUser ? { ...currentSupaUser, profile: profileState } as AppUser : null);
             }
          }
        } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          console.log(`AuthContext: ${event}. Clearing user and profile.`);
          if (isMounted) {
            if(user || profileState) setIsLoadingAuth(true); // Show loader briefly if clearing state
            setUser(null);
            setProfileState(null);
            if(user || profileState) setIsLoadingAuth(false);
          }
        } else if (event === 'USER_UPDATED') {
          console.log("AuthContext: USER_UPDATED. Will fetch profile.");
          setUser(currentSupaUser ? { ...currentSupaUser, profile: profileState } as AppUser : null); // Update SupaUser, keep old profile momentarily
          needsProfileFetch = true;
        } else if (event === 'TOKEN_REFRESHED') {
           console.log("AuthContext: TOKEN_REFRESHED. Updating SupabaseUser object.");
           if (user?.id !== currentSupaUser?.id || user?.aud !== currentSupaUser?.aud || !user.profile) {
              setUser(currentSupaUser ? { ...currentSupaUser, profile: profileState } as AppUser : null);
           }
        } else if (event === 'INITIAL_SESSION' && !initialClientAuthCheckComplete.current) {
           console.log("AuthContext: INITIAL_SESSION (listener). Will fetch profile if user exists.");
           setUser(currentSupaUser ? { ...currentSupaUser, profile: null } as AppUser : null);
           needsProfileFetch = !!currentSupaUser;
           isNewUserLogin = true;
           if (isMounted) setIsLoadingAuth(true);
        }
        
        if (needsProfileFetch && currentSupaUserId) {
          await internalFetchAndSetProfile(currentSupaUserId, isNewUserLogin);
        }
        
        if (isMounted) {
            previousUserIdRef.current = currentSupaUserId;
            // Ensure loading is false if this was an initial setup event
            if ((event === 'INITIAL_SESSION' || (event === 'SIGNED_IN' && isNewUserLogin)) && !initialClientAuthCheckComplete.current) {
                setIsLoadingAuth(false);
                initialClientAuthCheckComplete.current = true;
                console.log("AuthContext: Post-event initial auth/profile sequence complete. isLoadingAuth: false");
            } else if (isLoadingAuth && initialClientAuthCheckComplete.current && !isNewUserLogin && event !== 'SIGNED_OUT' && event !== 'USER_DELETED') {
                // If loading was somehow set true for a non-identity change event after initial load, reset it.
                setIsLoadingAuth(false);
            }
        }
      }
    );

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
      console.log("AuthContext: Unsubscribed from onAuthStateChange.");
    };
  }, [internalFetchAndSetProfile, toast, initialUser, isLoadingAuth, user, profileState]); // Added initialUser, user, profileState, isLoadingAuth to dependencies

  const signOutUser = async () => {
    console.log("AuthContext: signOutUser called.");
    if (isMounted) setIsLoadingAuth(true); // Show loader briefly for sign out action
    previousUserIdRef.current = null; 
    setUser(null); 
    setProfileState(null);
    await supabase.auth.signOut();
    // onAuthStateChange will handle final isLoadingAuth = false
    console.log("AuthContext: Supabase signOut complete.");
  };

  const publicFetchProfile = useCallback(async (userId: string, forceRefresh: boolean = false): Promise<Profile | null> => {
      if (!userId) return null;
      console.log(`AuthContext: publicFetchProfile called for ${userId}, forceRefresh: ${forceRefresh}`);
      
      if (!forceRefresh && profileState && profileState.id === userId) {
          console.log("AuthContext: publicFetchProfile - Returning existing profile from context state.");
          return profileState;
      }
      // Forcing refresh or if profile not in current context state for this user
      return internalFetchAndSetProfile(userId, true); // Treat explicit fetch as a "new login" for fetching logic
  }, [profileState, internalFetchAndSetProfile]);
  
  const handleSetProfileContext = useCallback((newProfile: Profile | null) => {
      console.log("AuthContext: setProfileContext (public) called with:", newProfile ? {id: newProfile.id, name: newProfile.full_name} : null);
      setProfileState(newProfile);
      if (user) { // Ensure user object also gets updated profile
          setUser(prevUser => prevUser ? { ...prevUser, profile: newProfile } as AppUser : null);
      }
  }, [user]); // Dependency: user

  const derivedIsAdmin = profileState?.role === "admin";
  const derivedIsApproved = !!profileState?.is_approved;
  const derivedIsAuthenticated = !!user && !!profileState && derivedIsApproved; 

  useEffect(() => {
    // This log helps trace derived state changes.
    console.log("AuthContext: Derived states updated:", { derivedIsAuthenticated, derivedIsApproved, derivedIsAdmin, isLoadingAuth, userId: user?.id, profileId: profileState?.id });
  }, [derivedIsAuthenticated, derivedIsApproved, derivedIsAdmin, isLoadingAuth, user?.id, profileState?.id]);


  const value: AuthContextType = {
    user,
    profile: profileState,
    isLoadingAuth,
    isAdmin: derivedIsAdmin,
    isApproved: derivedIsApproved,
    isAuthenticated: derivedIsAuthenticated,
    signOutUser,
    fetchProfile: publicFetchProfile,
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

    