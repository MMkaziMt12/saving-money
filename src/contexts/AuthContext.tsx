
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
import { fetchUserProfileFromServer } from "@/lib/api/profile"; // Ensure this uses the isomorphic version

const supabase = createClient();

export interface AuthContextType { // Exporting the type for use in useAuth.ts
  user: AppUser | null;
  profile: Profile | null;
  isLoadingAuth: boolean;
  isAuthenticated: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  signOutUser: () => Promise<void>;
  fetchProfile: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>;
}

// Ensure AuthContext itself is exported
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  initialUser: AppUser | null; // Passed from server-rendered (app)/layout.tsx
  initialProfile: Profile | null; // Passed from server-rendered (app)/layout.tsx
}

export const AuthProvider = ({ children, initialUser, initialProfile }: AuthProviderProps) => {
  const [user, setUser] = useState<AppUser | null>(initialUser);
  const [profileState, setProfileState] = useState<Profile | null>(initialProfile);
  // isLoadingAuth is true if server didn't provide a user (client must check),
  // or if explicitly set during auth transitions.
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(!initialUser);

  const { toast } = useToast();
  const initialClientAuthCheckComplete = useRef<boolean>(!!initialUser);
  const previousUserIdRef = useRef<string | null>(initialUser?.id || null);

  const internalFetchAndSetProfile = useCallback(
    async (userId: string | null, isNewLoginOrUpdate: boolean = false): Promise<Profile | null> => {
      if (!userId) {
        console.log("AuthContext: internalFetchAndSetProfile - No user ID, clearing profile.");
        if (profileState !== null) setProfileState(null);
        // Ensure user object doesn't hold stale profile
        setUser(prevUser => prevUser ? { ...prevUser, profile: null } as AppUser : null);
        return null;
      }

      // If not a new login/update and profile for this user already exists, return existing.
      if (!isNewLoginOrUpdate && profileState && profileState.id === userId) {
        console.log(`AuthContext: internalFetchAndSetProfile - Profile for user ${userId} already in context. Re-embedding if needed.`);
        if (user && (!user.profile || user.profile.id !== profileState.id)) {
           setUser(prevSupaUser => prevSupaUser ? { ...prevSupaUser, profile: profileState } as AppUser : null);
        }
        return profileState;
      }
      
      console.log(`AuthContext: internalFetchAndSetProfile - Fetching profile for user ${userId}. Is new login/update: ${isNewLoginOrUpdate}`);
      try {
        // Client-side fetches use the client-side Supabase instance.
        const fetchedProfile = await fetchUserProfileFromServer(userId, supabase); 
        
        if (fetchedProfile) {
          console.log(`AuthContext: internalFetchAndSetProfile - Profile fetched for ${userId}:`, { id: fetchedProfile.id, approved: fetchedProfile.is_approved });
          if (JSON.stringify(profileState) !== JSON.stringify(fetchedProfile)) {
            setProfileState(fetchedProfile);
          }
          setUser(prevSupaUser => {
            if (prevSupaUser && prevSupaUser.id === userId) {
              return { ...prevSupaUser, profile: fetchedProfile } as AppUser;
            }
            // This case should be rare if supaUser was already set before calling this
            return prevSupaUser; 
          });
        } else {
          console.warn(`AuthContext: internalFetchAndSetProfile - No profile found for ${userId}.`);
          if (profileState !== null) setProfileState(null);
          setUser(prevSupaUser => prevSupaUser && prevSupaUser.id === userId ? { ...prevSupaUser, profile: null } as AppUser : (prevSupaUser || null));
        }
        return fetchedProfile;
      } catch (error: any) {
        console.error(`AuthContext: internalFetchAndSetProfile - Error fetching profile for ${userId}:`, error);
        toast({
          title: "Profile Fetch Error",
          description: error.message || "Could not load user profile.",
          variant: "destructive",
        });
        if (profileState !== null) setProfileState(null);
        setUser(prevSupaUser => prevSupaUser && prevSupaUser.id === userId ? { ...prevSupaUser, profile: null } as AppUser : (prevSupaUser || null));
        return null;
      }
    },
    [toast, profileState, user] // Dependencies for comparison and toast
  );

  useEffect(() => {
    let isMounted = true;
    console.log("AuthContext: Main useEffect running. Initial user from server:", initialUser?.id);

    const handleInitialClientSideAuth = async () => {
      if (!initialUser && !initialClientAuthCheckComplete.current) {
        console.log("AuthContext: No initialUser from server, client performing initial getSession(). Setting isLoadingAuth true.");
        if (isMounted) setIsLoadingAuth(true);
        
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const currentSupaUser = session?.user ?? null;
          console.log("AuthContext: Initial getSession() result. User ID:", currentSupaUser?.id);
          
          if (isMounted) {
            setUser(currentSupaUser ? { ...currentSupaUser, profile: null } as AppUser : null);
            if (currentSupaUser) {
              await internalFetchAndSetProfile(currentSupaUser.id, true);
            } else {
              if (profileState !== null) setProfileState(null);
            }
          }
        } catch (error) {
          console.error("AuthContext: Error during initial getSession():", error);
           if (isMounted && profileState !== null) setProfileState(null); // Clear profile on error
        } finally {
          if (isMounted) {
            setIsLoadingAuth(false);
            initialClientAuthCheckComplete.current = true;
            console.log("AuthContext: Initial client-side auth check complete. isLoadingAuth: false");
          }
        }
      } else if (initialUser && !initialClientAuthCheckComplete.current) {
        // Server provided user, profile should also be from server. Mark client check complete.
        console.log("AuthContext: Server provided initialUser. Marking client auth check complete. isLoadingAuth should be false.");
        if (isMounted && isLoadingAuth) setIsLoadingAuth(false); // Should already be false from useState init
        initialClientAuthCheckComplete.current = true;
        previousUserIdRef.current = initialUser.id;
      }
    };

    handleInitialClientSideAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!isMounted) return;

        const currentSupaUser = session?.user ?? null;
        const currentSupaUserId = currentSupaUser?.id || null;
        console.log(`AuthContext: onAuthStateChange event: ${event}, User: ${currentSupaUserId}, PrevUser: ${previousUserIdRef.current}, InitialClientCheckDone: ${initialClientAuthCheckComplete.current}`);
        
        let profileNeedsForceRefresh = false;
        let setGlobalLoading = false;

        if (event === 'SIGNED_IN') {
          if (!initialClientAuthCheckComplete.current || previousUserIdRef.current !== currentSupaUserId) {
            console.log("AuthContext: SIGNED_IN for new user or during initial client check. Setting global loading, forcing profile refresh.");
            setGlobalLoading = true; // Full loading for new user or first determination
            profileNeedsForceRefresh = true;
          }
          setUser(currentSupaUser ? { ...currentSupaUser, profile: getProfileForUser(currentSupaUserId) } as AppUser : null);
        } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          console.log(`AuthContext: ${event}. Clearing user and profile.`);
          if (user || profileState) setGlobalLoading = true;
          setUser(null);
          setProfileState(null);
        } else if (event === 'USER_UPDATED') {
          console.log("AuthContext: USER_UPDATED. Forcing profile refresh.");
          profileNeedsForceRefresh = true;
           // Update SupaUser object, keep existing profile momentarily
          if(currentSupaUser) setUser({ ...currentSupaUser, profile: getProfileForUser(currentSupaUserId) } as AppUser);
        } else if (event === 'TOKEN_REFRESHED') {
           console.log("AuthContext: TOKEN_REFRESHED. Updating SupabaseUser object.");
           // Update SupaUser object, keep existing profile
           if(currentSupaUser) setUser({ ...currentSupaUser, profile: getProfileForUser(currentSupaUserId) } as AppUser);
        } else if (event === 'INITIAL_SESSION' && !initialClientAuthCheckComplete.current) {
           console.log("AuthContext: INITIAL_SESSION (listener). Setting global loading, forcing profile refresh.");
           setGlobalLoading = true;
           profileNeedsForceRefresh = true;
           setUser(currentSupaUser ? { ...currentSupaUser, profile: null } as AppUser : null);
        }
        
        if (isMounted && setGlobalLoading) setIsLoadingAuth(true);

        if (profileNeedsForceRefresh && currentSupaUserId) {
          await internalFetchAndSetProfile(currentSupaUserId, true);
        }
        
        if (isMounted) {
            previousUserIdRef.current = currentSupaUserId;
            if (setGlobalLoading || (event === 'INITIAL_SESSION' && !initialClientAuthCheckComplete.current)) {
                setIsLoadingAuth(false);
                if(event === 'INITIAL_SESSION' && !initialClientAuthCheckComplete.current) initialClientAuthCheckComplete.current = true;
                console.log("AuthContext: Post-event processing complete. isLoadingAuth: false", {event});
            } else if (isLoadingAuth && initialClientAuthCheckComplete.current && !profileNeedsForceRefresh && event !== 'SIGNED_OUT' && event !== 'USER_DELETED') {
                 setIsLoadingAuth(false); // Ensure loading reset for other cases if it was somehow true
            }
        }
      }
    );

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
      console.log("AuthContext: Unsubscribed from onAuthStateChange.");
    };
  }, [initialUser, internalFetchAndSetProfile, toast, isLoadingAuth, profileState, user]); // Dependencies reviewed

  const getProfileForUser = (targetUserId: string | null) => {
    if (!targetUserId) return null;
    return user?.id === targetUserId && user?.profile ? user.profile : (profileState?.id === targetUserId ? profileState : null);
  };


  const signOutUser = async () => {
    console.log("AuthContext: signOutUser called.");
    if (user || profileState) setIsLoadingAuth(true); 
    await supabase.auth.signOut();
    // onAuthStateChange will handle setting user/profile to null and then isLoadingAuth to false.
    previousUserIdRef.current = null;
  };

  const publicFetchProfile = useCallback(async (userId: string, forceRefresh: boolean = false): Promise<Profile | null> => {
      if (!userId) return null;
      console.log(`AuthContext: publicFetchProfile called for ${userId}, forceRefresh: ${forceRefresh}`);
      
      if (!forceRefresh && profileState && profileState.id === userId) {
          console.log("AuthContext: publicFetchProfile - Returning existing profile from context state.");
          return profileState;
      }
      return internalFetchAndSetProfile(userId, true); 
  }, [profileState, internalFetchAndSetProfile]);

  const derivedIsAdmin = profileState?.role === "admin";
  const derivedIsApproved = !!profileState?.is_approved;
  // isAuthenticated means user is logged in AND profile loaded AND profile is approved
  const derivedIsAuthenticated = !!user && !!profileState && derivedIsApproved;

  useEffect(() => {
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

// useAuth hook remains the same, as it consumes the context correctly.
// The error was in the context definition/export.
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    // This error means useAuth is used outside of AuthProvider
    console.error("useAuth must be used within an AuthProvider. AuthContext was undefined.");
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

    