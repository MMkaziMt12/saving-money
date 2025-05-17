
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
  user: AppUser | null;
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  setProfile: (profileData: Profile | null | ((prevState: Profile | null) => Profile | null)) => void; // Kept for manual updates if needed
  fetchProfile: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>; // Kept for explicit fetches
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

      // Removed direct localStorage caching from this central fetch.
      // Components can use TanStack Query for caching if needed.
      try {
        const fetchedProfile = await fetchProfileApi(userId, supabase); // Pass client-side supabase
        return fetchedProfile;
      } catch (error: any) {
        console.error(`AuthContext: Error in publicFetchProfile calling fetchProfileApi for ${userId}:`, error);
        // toast({ // Toasting here might be too frequent if many components call this.
        //   title: "Profile Fetch Error",
        //   description: error.message || "Could not load profile.",
        //   variant: "destructive",
        // });
        throw error; // Re-throw so useQuery or callers can handle it
      }
    },
    [] // No dependencies as fetchProfileApi is imported and supabase client is stable in this scope
  );

  const processUserAndProfile = useCallback(
    async (supaUser: SupabaseUser | null, event?: AuthChangeEvent, forceProfileRefresh: boolean = false) => {
      console.log(`AuthContext: Processing user. SupaUser ID: ${supaUser?.id}, Event: ${event}, ForceRefresh: ${forceProfileRefresh}`);
      let currentAppUser: AppUser | null = null;
      let newProfileData: Profile | null = null;

      if (supaUser) {
        // Always set the Supabase user object
        currentAppUser = { ...supaUser, profile: profileState } as AppUser; // Use existing profileState initially

        // Fetch profile only if it's a new user, forced, or profileState is null
        if (forceProfileRefresh || !profileState || profileState.id !== supaUser.id) {
          try {
            console.log(`AuthContext: Attempting to fetch profile for ${supaUser.id}. Forced: ${forceProfileRefresh}`);
            newProfileData = await publicFetchProfile(supaUser.id, true); // Force refresh here if conditions met
          } catch (profileError) {
            console.error("AuthContext: Error fetching profile during processUserAndProfile:", profileError);
            // newProfileData remains null, user will have null profile
          }
        } else {
          newProfileData = profileState; // Keep existing profile
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
        // User is the same, but profile data changed
        console.log(`AuthContext: Profile data changed for user ${currentAppUser?.id}. Updating user and profile state.`);
        setUser(currentAppUser); // Update user object with new profile
        setProfileState(newProfileData);
      } else {
        console.log("AuthContext: User and profile state effectively unchanged after processing.");
      }

      // Manage global loading state for initial determination
      if (!initialLoadComplete) {
        setIsLoading(false);
        setInitialLoadComplete(true);
        console.log("AuthContext: Initial auth processing complete. isLoading set to false.");
      }
    },
    [publicFetchProfile, profileState, user, initialLoadComplete] // Added dependencies
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
      // For initial session, force profile refresh if no profile yet for this user
      const forceInitialProfileRefresh = !profileState || (session?.user && profileState.id !== session.user.id);
      await processUserAndProfile(session?.user ?? null, 'INITIAL_SESSION', forceInitialProfileRefresh);
    }).catch(error => {
      if (didUnsubscribe) return;
      console.error("AuthContext: Error in initial getSession():", error);
      processUserAndProfile(null, 'INITIAL_SESSION_ERROR');
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (didUnsubscribe) return;
        console.log(`AuthContext: onAuthStateChange event: ${event}, User:`, session?.user?.id);

        const userActuallyChanged = prevUserRef.current?.id !== session?.user?.id;

        if (event === 'SIGNED_IN' && userActuallyChanged && !initialLoadComplete) {
             // This is a true new sign-in after initial load was already false, or first ever sign in
            console.log("AuthContext: New user SIGNED_IN or initial load SIGNED_IN. Setting isLoading true.");
            setIsLoading(true);
        } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
            console.log("AuthContext: SIGNED_OUT or USER_DELETED event. Setting isLoading true.");
            setIsLoading(true);
        }

        // Fetch profile if user changed, or if it's an explicit user update event
        const forceProfileRefreshOnEvent = userActuallyChanged || event === 'USER_UPDATED' || (event === 'SIGNED_IN' && userActuallyChanged);
        await processUserAndProfile(session?.user ?? null, event, forceProfileRefreshOnEvent);
        
        prevUserRef.current = session?.user ?? null;

        // Ensure loading is false after processing events like sign out,
        // especially if processUserAndProfile didn't handle it because initialLoadComplete was true.
        if ((event === 'SIGNED_OUT' || event === 'USER_DELETED' || (event === 'SIGNED_IN' && userActuallyChanged)) && initialLoadComplete) {
           setIsLoading(false);
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
  }, [processUserAndProfile, initialLoadComplete]);


  const handleSetProfileContext = useCallback((profileData: Profile | null | ((prevState: Profile | null) => Profile | null)) => {
    setProfileState(prevInternalProfile => {
      const resolvedNewProfile = typeof profileData === 'function'
        ? profileData(prevInternalProfile)
        : profileData;
      
      // Update user object only if profile actually changed and user exists
      setUser(prevUser => {
        if (prevUser && JSON.stringify(prevUser.profile) !== JSON.stringify(resolvedNewProfile)) {
          return { ...prevUser, profile: resolvedNewProfile } as AppUser;
        }
        return prevUser;
      });

      if (JSON.stringify(prevInternalProfile) !== JSON.stringify(resolvedNewProfile)){
        console.log("AuthContext: handleSetProfileContext updating profileState.");
        return resolvedNewProfile;
      }
      return prevInternalProfile;
    });
  }, []);

  const signOut = async () => {
    console.log("AuthContext: signOut initiated.");
    setIsLoading(true); // Show loader during sign out
    setProfileState(null); // Clear profile immediately on client
    setUser(null);        // Clear user immediately on client
    prevUserRef.current = null;

    const { error } = await supabase.auth.signOut();
    // The onAuthStateChange listener will handle the SIGNED_OUT event
    // and call processUserAndProfile(null, ...) which will ensure isLoading is set to false.
    if (error) {
      console.error("AuthContext: Error during signOut:", error);
      toast({ title: "Logout Error", description: error.message, variant: "destructive" });
      setIsLoading(false); // Ensure loading is false on error
    }
    // No need to set initialLoadComplete to false here, app remains loaded
  };

  const value: AuthContextType = {
    user,
    profile: profileState,
    isLoading,
    isAdmin: profileState?.role === "admin",
    isApproved: !!profileState?.is_approved,
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

    