
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
import { fetchUserProfileFromServer as fetchProfileApi } from "@/lib/api/profile";

const supabase = createClient();

interface AuthContextType {
  user: AppUser | null; // Supabase user with potentially embedded profile
  profile: Profile | null; // The application-specific profile
  isLoading: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  // setProfile is removed from public API to simplify and make profile fetching more controlled
  fetchProfile: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>; // For explicit refresh if needed by components
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profileState, setProfileState] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true); // True until initial auth check is complete
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const prevUserRef = useRef<SupabaseUser | null>(null);
  const { toast } = useToast();

  const publicFetchProfile = useCallback(
    async (userId: string, forceRefresh: boolean = false): Promise<Profile | null> => {
      if (!userId) {
        console.log("AuthContext: publicFetchProfile called with no userId. Returning null.");
        return null;
      }
      console.log(`AuthContext: publicFetchProfile called for ${userId}, forceRefresh: ${forceRefresh}`);

      // No localStorage caching within AuthContext itself.
      // Components can use TanStack Query for caching if needed.
      try {
        const fetchedProfile = await fetchProfileApi(userId, supabase); // Pass client-side supabase
        return fetchedProfile;
      } catch (error: any) {
        console.error(`AuthContext: Error in publicFetchProfile calling fetchProfileApi for ${userId}:`, error);
        toast({
          title: "Profile Fetch Error",
          description: error.message || "Could not load profile.",
          variant: "destructive",
        });
        throw error; // Re-throw so useQuery or callers can handle it
      }
    },
    [toast] // toast is stable
  );

  const processUserAndProfile = useCallback(
    async (supaUser: SupabaseUser | null, event?: AuthChangeEvent, forceProfileRefresh: boolean = false) => {
      console.log(`AuthContext: Processing user. SupaUser ID: ${supaUser?.id}, Event: ${event}, ForceRefresh: ${forceProfileRefresh}`);
      let currentAppUser: AppUser | null = null;
      let newProfileData: Profile | null = null;

      if (supaUser) {
        currentAppUser = { ...supaUser, profile: profileState } as AppUser; // Use existing profileState initially

        if (forceProfileRefresh || !profileState || profileState.id !== supaUser.id) {
          try {
            console.log(`AuthContext: Attempting to fetch profile for ${supaUser.id}. Forced: ${forceProfileRefresh}. Current profile ID: ${profileState?.id}`);
            newProfileData = await publicFetchProfile(supaUser.id, true); // Always force for this internal critical update
          } catch (profileError) {
            console.error("AuthContext: Error fetching profile during processUserAndProfile:", profileError);
          }
        } else {
          newProfileData = profileState; // Keep existing profile if not forced and ID matches
          console.log(`AuthContext: Reusing existing profile state for user ${supaUser.id}`);
        }
        
        if (currentAppUser) currentAppUser.profile = newProfileData;
      }

      const userChanged = user?.id !== currentAppUser?.id;
      const profileDataChanged = JSON.stringify(profileState) !== JSON.stringify(newProfileData);

      if (userChanged) {
        console.log(`AuthContext: User identity changed. New User ID: ${currentAppUser?.id}. Updating user and profile state.`);
        setUser(currentAppUser);
        setProfileState(newProfileData);
      } else if (profileDataChanged) {
        console.log(`AuthContext: Profile data changed for user ${currentAppUser?.id}. Updating user and profile state.`);
        setUser(currentAppUser); // Update user object with new profile
        setProfileState(newProfileData);
      } else {
        // Update user object if SupabaseUser changed (e.g. token) even if ID and profile are same
        if (supaUser && user && JSON.stringify(supaUser) !== JSON.stringify( (({profile, ...rest}) => rest)(user) ) ) {
            console.log("AuthContext: SupabaseUser object changed (e.g., token), updating user state but profile remains.");
            setUser({ ...supaUser, profile: profileState } as AppUser);
        } else if (!supaUser && user) { // Logged out
            console.log("AuthContext: User logged out, clearing states.");
            setUser(null);
            setProfileState(null);
        } else {
             console.log("AuthContext: User and profile state effectively unchanged after processing.");
        }
      }

      if (!initialLoadComplete) {
        setIsLoading(false);
        setInitialLoadComplete(true);
        console.log("AuthContext: Initial auth processing complete. isLoading set to false.");
      }
    },
    [publicFetchProfile, profileState, user, initialLoadComplete]
  );

  useEffect(() => {
    let didUnsubscribe = false;

    if (!initialLoadComplete) {
      console.log("AuthContext: Initializing session and auth state listener. Setting isLoading = true.");
      setIsLoading(true);
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (didUnsubscribe) return;
      console.log("AuthContext: Initial getSession completed. User:", session?.user?.id);
      // For initial session, force profile refresh only if no profile yet for this user
      const forceInitialProfileRefresh = !profileState || (session?.user && profileState.id !== session.user.id);
      await processUserAndProfile(session?.user ?? null, 'INITIAL_SESSION', forceInitialProfileRefresh);
    }).catch(error => {
      if (didUnsubscribe) return;
      console.error("AuthContext: Error in initial getSession():", error);
      processUserAndProfile(null, 'INITIAL_SESSION_ERROR'); // Will set isLoading false
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (didUnsubscribe) return;
        console.log(`AuthContext: onAuthStateChange event: ${event}, User:`, session?.user?.id);

        const userActuallyChanged = prevUserRef.current?.id !== session?.user?.id;

        if (
          (!initialLoadComplete && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) ||
          event === 'SIGNED_OUT' ||
          event === 'USER_DELETED' ||
          (event === 'SIGNED_IN' && userActuallyChanged)
        ) {
          console.log("AuthContext: Significant auth event or initial load, setting isLoading true.", { event, initialLoadComplete, prevUserId: prevUserRef.current?.id, newUserId: session?.user?.id });
          if(!isLoading) setIsLoading(true); // Only set if not already loading
        }
        
        // Determine if profile needs a forced refresh
        // Force refresh if user ID changed, or it's an explicit USER_UPDATED event,
        // or if it's the very first SIGNED_IN as part of initial load.
        const shouldForceRefreshProfile =
          userActuallyChanged ||
          event === 'USER_UPDATED' ||
          (event === 'SIGNED_IN' && !initialLoadComplete);

        await processUserAndProfile(session?.user ?? null, event, shouldForceRefreshProfile);
        
        prevUserRef.current = session?.user ?? null;

        // Ensure loading is false after processing significant events if initial load is complete
        if (initialLoadComplete && (event === 'SIGNED_OUT' || event === 'USER_DELETED' || (event === 'SIGNED_IN' && userActuallyChanged))) {
           if(isLoading) setIsLoading(false);
           console.log("AuthContext: isLoading set to false after significant auth event (post-initial load).");
        }
      }
    );

    return () => {
      didUnsubscribe = true;
      if (authListener?.subscription) {
        console.log("AuthContext: Unsubscribing from onAuthStateChange.");
        authListener.subscription.unsubscribe();
      }
    };
  }, [processUserAndProfile, initialLoadComplete, isLoading]); // Added isLoading to deps


  const signOut = async () => {
    console.log("AuthContext: signOut initiated.");
    setIsLoading(true);
    setProfileState(null);
    setUser(null);
    prevUserRef.current = null;

    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("AuthContext: Error during signOut:", error);
      toast({ title: "Logout Error", description: error.message, variant: "destructive" });
      // The onAuthStateChange listener (SIGNED_OUT event) will handle setting isLoading to false.
    }
    // No need to set initialLoadComplete to false here
  };

  const value: AuthContextType = {
    user,
    profile: profileState,
    isLoading,
    isAdmin: profileState?.role === "admin",
    isApproved: !!profileState?.is_approved,
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

    