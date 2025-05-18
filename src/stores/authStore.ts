
import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser, Session, AuthChangeEvent } from '@supabase/supabase-js';
import type { Profile } from '@/types';
import { fetchUserProfileFromServer } from '@/lib/api/profile';

const supabase = createClient();

interface AuthState {
  user: SupabaseUser | null;
  profile: Profile | null;
  isLoadingAuth: boolean;
  isAuthenticated: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  initialAuthCheckDone: boolean; // To track if initial session/profile load is complete
  previousUserId: string | null;   // To track if user identity changed

  // Actions
  initializeAuth: () => void;
  _handleAuthStateChange: (event: AuthChangeEvent, session: Session | null) => Promise<void>;
  fetchProfileAndUpdateStore: (userId: string | null, forceRefresh?: boolean) => Promise<Profile | null>;
  signOut: () => Promise<void>;
  setUser: (user: SupabaseUser | null) => void; // Exposed for direct user update if needed elsewhere
  setProfile: (profile: Profile | null) => void; // Exposed for direct profile update
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  isLoadingAuth: true,
  isAuthenticated: false,
  isApproved: false,
  isAdmin: false,
  initialAuthCheckDone: false,
  previousUserId: null,

  _updateDerivedStates: () => {
    const { user, profile } = get();
    set({
      isAuthenticated: !!user && !!profile?.is_approved,
      isApproved: !!profile?.is_approved,
      isAdmin: !!user && profile?.role === 'admin',
    });
  },

  setUser: (newUser) => {
    const oldUser = get().user;
    if (JSON.stringify(oldUser) !== JSON.stringify(newUser)) {
      console.log("AuthStore: Setting user state", newUser ? { id: newUser.id, email: newUser.email } : null);
      set({ user: newUser });
      get()._updateDerivedStates();
    }
  },

  setProfile: (newProfile) => {
    const oldProfile = get().profile;
    if (JSON.stringify(oldProfile) !== JSON.stringify(newProfile)) {
      console.log("AuthStore: Setting profile state", newProfile ? { id: newProfile.id, name: newProfile.full_name } : null);
      set({ profile: newProfile });
      if (get().user && (!get().user?.profile || JSON.stringify(get().user?.profile) !== JSON.stringify(newProfile))) {
        set(state => ({ user: { ...state.user!, profile: newProfile } }));
      }
      get()._updateDerivedStates();
    }
  },

  fetchProfileAndUpdateStore: async (userId, forceRefresh = false) => {
    const { profile: currentProfile, setProfile: setProfileState, setUser: setUserState, user: currentUserInStore } = get();
    console.log(`AuthStore: fetchProfileAndUpdateStore called for user ${userId}. Force refresh: ${forceRefresh}. Current profile ID: ${currentProfile?.id}`);

    if (!userId) {
      console.log("AuthStore: No userId provided to fetchProfileAndUpdateStore. Clearing profile.");
      if (currentProfile !== null) setProfileState(null);
      if (currentUserInStore && currentUserInStore.profile) {
        setUserState({ ...currentUserInStore, profile: null });
      }
      return null;
    }

    if (!forceRefresh && currentProfile && currentProfile.id === userId) {
      console.log(`AuthStore: Profile for ${userId} already in store and not forcing refresh. Using existing.`);
      // Ensure user object also has this profile if it somehow differs
      if (currentUserInStore && (!currentUserInStore.profile || currentUserInStore.profile.id !== currentProfile.id)) {
         setUserState({ ...currentUserInStore, profile: currentProfile });
      }
      return currentProfile;
    }

    try {
      console.log(`AuthStore: Fetching fresh profile for ${userId} from server (via fetchUserProfileFromServer).`);
      // Pass client-side supabase instance from this store's scope
      const fetchedProfile = await fetchUserProfileFromServer(userId, supabase);

      if (get().user?.id === userId) { // Critical: ensure profile belongs to current user in store
        console.log("AuthStore: Successfully fetched profile:", fetchedProfile ? { id: fetchedProfile.id, name: fetchedProfile.full_name } : null);
        if (JSON.stringify(currentProfile) !== JSON.stringify(fetchedProfile)) {
          setProfileState(fetchedProfile);
          if (currentUserInStore) {
            setUserState({ ...currentUserInStore, profile: fetchedProfile });
          }
        } else {
          console.log("AuthStore: Fetched profile is same as current, no profile state update needed for content. Ensuring user object has it.");
           if (currentUserInStore && (!currentUserInStore.profile || currentUserInStore.profile.id !== (fetchedProfile?.id || null))) {
             setUserState({ ...currentUserInStore, profile: fetchedProfile });
           }
        }
        return fetchedProfile;
      }
      console.warn("AuthStore: User changed during profile fetch. Discarding fetched profile for previous user.");
      return null;
    } catch (error) {
      console.error(`AuthStore: Error fetching profile for ${userId}:`, error);
      if (get().user?.id === userId) { // Clear profile if fetch failed for current user
        if (currentProfile !== null) setProfileState(null);
        if (currentUserInStore && currentUserInStore.profile) {
          setUserState({ ...currentUserInStore, profile: null });
        }
      }
      return null;
    }
  },

  _handleAuthStateChange: async (event, session) => {
    const { 
      fetchProfileAndUpdateStore: fetchProfile, 
      setUser: setSupaUser, // Renamed for clarity within this function
      setProfile: setAppProfile, // Renamed for clarity
      previousUserId, 
      initialAuthCheckDone,
      user: currentUserObjectInStore, // Get current user object from store
    } = get();

    const currentSupaUser = session?.user ?? null;
    const currentSupaUserId = currentSupaUser?.id ?? null;

    console.log(`AuthStore: onAuthStateChange event: ${event}, User ID: ${currentSupaUserId}, Prev User ID: ${previousUserId}, Initial Check Done: ${initialAuthCheckDone}`);

    if (event === 'INITIAL_SESSION' || (event === 'SIGNED_IN' && !initialAuthCheckDone)) {
      console.log("AuthStore: Initial session or first SIGNED_IN. Setting isLoadingAuth true and fetching profile.");
      set({ isLoadingAuth: true });
      await fetchProfile(currentSupaUserId, true); // Force fetch for initial
      set({ user: currentSupaUser, previousUserId: currentSupaUserId, initialAuthCheckDone: true, isLoadingAuth: false });
    } else if (event === 'SIGNED_IN') {
      if (currentSupaUserId !== previousUserId) {
        console.log("AuthStore: SIGNED_IN for a new user. Setting isLoadingAuth true and fetching profile.");
        set({ isLoadingAuth: true }); // Briefly indicate loading for user switch
        await fetchProfile(currentSupaUserId, true); // Force fetch for new user
        set({ user: currentSupaUser, previousUserId: currentSupaUserId, isLoadingAuth: false });
      } else {
        // SIGNED_IN for the same user (likely token refresh) & initial check is done
        console.log(`AuthStore: SIGNED_IN for same user ${currentSupaUserId}. Updating Supabase user object only.`);
        // Only update user if the session object itself has changed to avoid unnecessary re-renders
        if (JSON.stringify(currentUserObjectInStore) !== JSON.stringify(currentSupaUser)){
            // Critical: Ensure profile from previous state is re-embedded into the new user object
            // if the currentSupaUser from session doesn't have it (it usually won't)
            setSupaUser({ ...currentSupaUser!, profile: get().profile });
        }
        // Ensure isLoadingAuth is false if it was somehow set true
        if(get().isLoadingAuth && initialAuthCheckDone) set({ isLoadingAuth: false });
      }
    } else if (event === 'USER_UPDATED' && currentSupaUser) {
      console.log(`AuthStore: USER_UPDATED for user ${currentSupaUserId}. Fetching profile.`);
      // For USER_UPDATED, always fetch the profile to get latest metadata.
      // Don't set global isLoadingAuth if initial load was done.
      await fetchProfile(currentSupaUserId, true);
      setSupaUser({ ...currentSupaUser!, profile: get().profile }); // Ensure user object is updated with latest session & potentially new profile
    } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
      console.log(`AuthStore: Event ${event}. Clearing user and profile.`);
      set({ isLoadingAuth: true }); // Briefly show loading
      setSupaUser(null);
      setAppProfile(null);
      set({ previousUserId: null, isLoadingAuth: false });
    } else if (event === 'TOKEN_REFRESHED' && currentSupaUser) {
        console.log(`AuthStore: TOKEN_REFRESHED for user ${currentSupaUserId}. Updating Supabase user object only.`);
        if (JSON.stringify(currentUserObjectInStore) !== JSON.stringify(currentSupaUser)){
            setSupaUser({ ...currentSupaUser!, profile: get().profile });
        }
    } else if (event === 'PASSWORD_RECOVERY') {
        console.log("AuthStore: PASSWORD_RECOVERY event. User may need to re-authenticate or session might change.");
        // Typically, this event means the user needs to sign in again after password reset.
        // The Supabase client handles session invalidation. A SIGNED_OUT or new SIGNED_IN event will follow.
    }
    
    // This final set ensures derived states are always updated after any auth event logic.
    // It also ensures isLoadingAuth is correctly false if initial check is done and no major change happened.
    if (initialAuthCheckDone && get().isLoadingAuth && !(event === 'SIGNED_OUT' || event === 'USER_DELETED' || (event === 'SIGNED_IN' && currentSupaUserId !== previousUserId))) {
      set({ isLoadingAuth: false });
    }
    get()._updateDerivedStates(); // Always update derived booleans
  },

  initializeAuth: () => {
    const { _handleAuthStateChange, initialAuthCheckDone } = get();
    if (initialAuthCheckDone) {
      console.log("AuthStore: Auth already initialized.");
      return;
    }
    console.log("AuthStore: Initializing Auth...");
    set({ isLoadingAuth: true });

    // Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log("AuthStore: Initial getSession() result:", session ? { userId: session.user.id } : "No session");
      await _handleAuthStateChange('INITIAL_SESSION', session);
      // _handleAuthStateChange should set initialAuthCheckDone and isLoadingAuth
    }).catch(error => {
      console.error("AuthStore: Error during initial getSession():", error);
      set({ isLoadingAuth: false, initialAuthCheckDone: true }); // Ensure loading stops
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(_handleAuthStateChange);
    console.log("AuthStore: onAuthStateChange listener attached.");
    
    // Store the unsubscribe function if needed, e.g., for cleanup in a root component, but Zustand store itself persists.
    // For now, we assume the listener persists for the app's lifetime.
  },

  signOut: async () => {
    const { user } = get();
    if (user) { // Only set loading if there was a user
      set({ isLoadingAuth: true });
    }
    console.log("AuthStore: Signing out...");
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("AuthStore: Error signing out:", error);
      // Even if Supabase signOut fails, clear local state.
      // The onAuthStateChange handler will also fire with SIGNED_OUT.
      set({ user: null, profile: null, previousUserId: null, isLoadingAuth: false });
      get()._updateDerivedStates();
    }
    // Let onAuthStateChange handle final state update (isLoadingAuth to false)
  },
}));

// Optional: Trigger initializeAuth if running in a client environment.
// This is better handled by ClientAuthInitializer.tsx to ensure it runs after client mount.
// if (typeof window !== 'undefined') {
//   useAuthStore.getState().initializeAuth();
// }
