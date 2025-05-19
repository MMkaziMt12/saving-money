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
  isLoadingAuth: boolean; // True during initial auth check or significant auth changes
  isAuthenticated: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  signOutUser: () => Promise<void>;
  fetchProfile: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>; // Exposed for explicit refresh
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  initialUser: AppUser | null; // Passed from server-rendered (app)/layout.tsx
  initialProfile: Profile | null; // Passed from server-rendered (app)/layout.tsx
}

export const AuthProvider = ({ children, initialUser, initialProfile }: AuthProviderProps) => {
  // Initialize state from server-provided props
  const [user, setUser] = useState<AppUser | null>(initialUser);
  const [profileState, setProfileState] = useState<Profile | null>(initialProfile);
  // If server provides user, client doesn't need to be in loading state initially for that part.
  // It becomes true if client needs to do its own check or on logout/login.
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(!initialUser);

  const { toast } = useToast();
  const initialClientAuthCheckComplete = useRef<boolean>(!!initialUser); // If server provided user, client initial check is considered done.
  const previousUserIdRef = useRef<string | null>(initialUser?.id || null);

  const internalFetchAndSetProfile = useCallback(
    async (userId: string | null, isNewLogin: boolean = false): Promise<Profile | null> => {
      if (!userId) {
        console.log("AuthContext: internalFetchAndSetProfile - No user ID, clearing profile.");
        if (profileState !== null) setProfileState(null); // Only update if different
        if (user && user.profile !== null) setUser(prev => prev ? { ...prev, profile: null } as AppUser : null);
        return null;
      }

      // If not a new login and profile for this user already exists and is not stale, don't refetch
      if (!isNewLogin && profileState && profileState.id === userId) {
        console.log(`AuthContext: internalFetchAndSetProfile - Profile for user ${userId} already in context. Re-embedding.`);
        if (user && (!user.profile || user.profile.id !== profileState.id)) {
             setUser(prevSupaUser => prevSupaUser ? { ...prevSupaUser, profile: profileState } as AppUser : null);
        }
        return profileState;
      }
      
      console.log(`AuthContext: internalFetchAndSetProfile - Fetching profile for user ${userId}. Is new login/forced: ${isNewLogin}`);
      try {
        // Use the client-side Supabase instance for fetches initiated by AuthContext
        const fetchedProfile = await fetchUserProfileFromServer(userId, supabase);
        if (fetchedProfile) {
          console.log(`AuthContext: internalFetchAndSetProfile - Profile fetched for ${userId}:`, { id: fetchedProfile.id, approved: fetchedProfile.is_approved });
          if (JSON.stringify(profileState) !== JSON.stringify(fetchedProfile)) setProfileState(fetchedProfile);
          setUser(prevSupaUser => prevSupaUser && prevSupaUser.id === userId ? { ...prevSupaUser, profile: fetchedProfile } as AppUser : (prevSupaUser || null) );
        } else {
          console.warn(`AuthContext: internalFetchAndSetProfile - No profile found for ${userId}.`);
          if (profileState !== null) setProfileState(null);
          setUser(prevSupaUser => prevSupaUser && prevSupaUser.id === userId ? { ...prevSupaUser, profile: null } as AppUser : (prevSupaUser || null));
        }
        return fetchedProfile;
      } catch (error) {
        console.error(`AuthContext: internalFetchAndSetProfile - Error fetching profile for ${userId}:`, error);
        // Do not toast here, let consuming components or specific actions handle UI for fetch errors
        if (profileState !== null) setProfileState(null);
        setUser(prevSupaUser => prevSupaUser && prevSupaUser.id === userId ? { ...prevSupaUser, profile: null } as AppUser : (prevSupaUser || null));
        return null;
      }
    },
    [profileState, user] // Dependencies for comparison and toast
  );

  useEffect(() => {
    let isMounted = true;
    console.log("AuthContext: Running main useEffect. initialUser ID:", initialUser?.id, "initialProfile ID:", initialProfile?.id, "isLoadingAuth initial:", isLoadingAuth);

    // This function handles the initial session check if the server didn't provide a user.
    // The primary onAuthStateChange listener will handle subsequent changes.
    const performInitialClientSideAuthCheck = async () => {
      if (!initialUser && !initialClientAuthCheckComplete.current) {
        console.log("AuthContext: No initialUser from server, client performing initial getSession(). Setting isLoadingAuth true.");
        if (isMounted) setIsLoadingAuth(true);
        
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const currentSupaUser = session?.user ?? null;
          console.log("AuthContext: Initial getSession() result. User ID:", currentSupaUser?.id);
          
          if (isMounted) {
            setUser(currentSupaUser ? { ...currentSupaUser, profile: null } as AppUser : null); // Set SupaUser first
            previousUserIdRef.current = currentSupaUser?.id || null;
            if (currentSupaUser) {
              await internalFetchAndSetProfile(currentSupaUser.id, true); // Force as it's initial determination
            } else {
              if (profileState !== null) setProfileState(null); // No user, so no profile
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
        // Server provided user, client side listener is just setting up.
        // Profile should already be set from initialProfile.
        // Mark client check as complete.
        console.log("AuthContext: Server provided initialUser. Marking client auth check complete.");
        initialClientAuthCheckComplete.current = true;
        if (isLoadingAuth && isMounted) setIsLoadingAuth(false); // Ensure loading is false if server provided data
      }
    };

    performInitialClientSideAuthCheck();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!isMounted) return;
        const currentSupaUser = session?.user ?? null;
        const currentSupaUserId = currentSupaUser?.id || null;
        console.log(`AuthContext: onAuthStateChange event: ${event}, User: ${currentSupaUserId}, PrevUser: ${previousUserIdRef.current}, InitialClientCheckDone: ${initialClientAuthCheckComplete.current}`);
        
        let profileNeedsUpdate = false;

        if (event === 'SIGNED_IN') {
          if (previousUserIdRef.current !== currentSupaUserId || !profileState) {
            console.log("AuthContext: SIGNED_IN for new user or profile missing. Will fetch profile.");
            profileNeedsUpdate = true;
            // Only set global loading if it's part of the very initial auth flow determined by client
            if (!initialClientAuthCheckComplete.current && isMounted) {
                setIsLoadingAuth(true);
            }
          }
          // Always update the Supabase user object for SIGNED_IN
           if (JSON.stringify(user?.id) !== JSON.stringify(currentSupaUser?.id) || user?.aud !== currentSupaUser?.aud) {
             setUser(currentSupaUser ? { ...currentSupaUser, profile: profileState } as AppUser : null);
           }
        } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          console.log(`AuthContext: ${event}. Clearing user and profile.`);
          if (isMounted) {
            if(user || profileState) setIsLoadingAuth(true); // Show loader briefly
            setUser(null);
            setProfileState(null);
            previousUserIdRef.current = null;
            if(user || profileState) setIsLoadingAuth(false);
          }
          return; // No further profile processing needed
        } else if (event === 'USER_UPDATED') {
          console.log("AuthContext: USER_UPDATED. Will fetch profile.");
          if (JSON.stringify(user?.id) !== JSON.stringify(currentSupaUser?.id) || user?.aud !== currentSupaUser?.aud) {
             setUser(currentSupaUser ? { ...currentSupaUser, profile: profileState } as AppUser : null); // Update SupaUser, keep old profile momentarily
          }
          profileNeedsUpdate = true;
        } else if (event === 'TOKEN_REFRESHED') {
           console.log("AuthContext: TOKEN_REFRESHED. Updating SupabaseUser object.");
           if (user?.id !== currentSupaUser?.id || user?.aud !== currentSupaUser?.aud) {
             setUser(currentSupaUser ? { ...currentSupaUser, profile: profileState } as AppUser : null);
           }
        } else if (event === 'INITIAL_SESSION' && !initialClientAuthCheckComplete.current) {
           console.log("AuthContext: INITIAL_SESSION (listener). Will fetch profile if user exists.");
           setUser(currentSupaUser ? { ...currentSupaUser, profile: null } as AppUser : null);
           profileNeedsUpdate = !!currentSupaUser;
           if (isMounted) setIsLoadingAuth(true);
        }
        
        if (profileNeedsUpdate && currentSupaUserId) {
          await internalFetchAndSetProfile(currentSupaUserId, true); // Force refresh for significant events
        }
        
        if (isMounted) {
            if (previousUserIdRef.current !== currentSupaUserId) {
                 previousUserIdRef.current = currentSupaUserId;
            }
            // Ensure loading is false if this was an initial setup event handled by the listener
            if ((event === 'INITIAL_SESSION' || (event === 'SIGNED_IN' && profileNeedsUpdate)) && !initialClientAuthCheckComplete.current) {
                setIsLoadingAuth(false);
                initialClientAuthCheckComplete.current = true;
                console.log("AuthContext: Post-event initial auth/profile sequence complete (listener). isLoadingAuth: false");
            } else if (isLoadingAuth && initialClientAuthCheckComplete.current && !profileNeedsUpdate && event !== 'SIGNED_OUT' && event !== 'USER_DELETED') {
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
  }, [internalFetchAndSetProfile, initialUser, toast, user, profileState, isLoadingAuth]); // Dependencies reviewed

  const signOutUser = async () => {
    console.log("AuthContext: signOutUser called.");
    setIsLoadingAuth(true); // Show loader briefly for sign out action
    await supabase.auth.signOut();
    // onAuthStateChange will handle setting user/profile to null and isLoadingAuth to false.
    previousUserIdRef.current = null; // Reset previous user on explicit signout
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

  const derivedIsAdmin = profileState?.role === "admin";
  const derivedIsApproved = !!profileState?.is_approved;
  // isAuthenticated means user is logged in AND profile loaded AND profile is approved
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
