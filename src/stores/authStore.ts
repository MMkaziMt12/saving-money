
import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser, Session, AuthChangeEvent } from '@supabase/supabase-js';
import type { Profile } from '@/types';
import { fetchUserProfileFromServer } from '@/lib/api/profile'; // Ensure this is correctly imported

const supabase = createClient();

interface AuthState {
  user: SupabaseUser | null;
  profile: Profile | null;
  isLoadingAuth: boolean;
  isAuthenticated: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  initialAuthCheckDone: boolean;
  previousUserId: string | null;

  initializeAuth: () => void;
  _handleAuthStateChange: (event: AuthChangeEvent, session: Session | null) => Promise<void>;
  fetchProfileAndUpdateStore: (userId: string | null, forceRefresh?: boolean) => Promise<Profile | null>;
  signOut: () => Promise<void>;
  setUser: (user: SupabaseUser | null) => void;
  setProfile: (profile: Profile | null) => void;
  _updateDerivedStates: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  isLoadingAuth: true, // Start true until first check is complete
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
    // Basic check to avoid re-render if user object reference is new but data is same
    if (JSON.stringify(oldUser?.id) !== JSON.stringify(newUser?.id) || 
        JSON.stringify(oldUser?.email) !== JSON.stringify(newUser?.email)) {
      console.log("AuthStore: Setting user state", newUser ? { id: newUser.id, email: newUser.email } : null);
      set({ user: newUser });
      get()._updateDerivedStates();
    } else if (!oldUser && newUser) { // Case where oldUser was null
      console.log("AuthStore: Setting user state from null", newUser ? { id: newUser.id, email: newUser.email } : null);
      set({ user: newUser });
      get()._updateDerivedStates();
    }
  },

  setProfile: (newProfile) => {
    const oldProfile = get().profile;
    if (JSON.stringify(oldProfile) !== JSON.stringify(newProfile)) {
      console.log("AuthStore: Setting profile state", newProfile ? { id: newProfile.id, name: newProfile.full_name } : null);
      set({ profile: newProfile });
      // Ensure user object also has this profile
      const currentUserInStore = get().user;
      if (currentUserInStore && (!currentUserInStore.profile || JSON.stringify(currentUserInStore.profile) !== JSON.stringify(newProfile))) {
        set(state => ({ user: { ...state.user!, profile: newProfile } as any }));
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
      return null;
    }

    // No localStorage caching in this version for simplicity with SSR/hydration conflicts
    // Always fetch if forced or if no current profile for this user exists
    if (!forceRefresh && currentProfile && currentProfile.id === userId) {
      console.log(`AuthStore: Profile for ${userId} already in store and not forcing refresh. Using existing.`);
      return currentProfile;
    }

    try {
      console.log(`AuthStore: Fetching profile for ${userId} from server (via fetchUserProfileFromServer).`);
      const fetchedProfile = await fetchUserProfileFromServer(userId, supabase); // Pass client-side supabase

      if (get().user?.id === userId) { // Ensure profile belongs to current user in store
        console.log("AuthStore: Successfully fetched profile:", fetchedProfile ? { id: fetchedProfile.id, name: fetchedProfile.full_name } : null);
        setProfileState(fetchedProfile); // This will also update user.profile via setProfile's internal logic
        return fetchedProfile;
      }
      console.warn("AuthStore: User changed during profile fetch. Discarding fetched profile for previous user.");
      return null;
    } catch (error) {
      console.error(`AuthStore: Error fetching profile for ${userId}:`, error);
      if (get().user?.id === userId) { // Clear profile if fetch failed for current user
        setProfileState(null);
      }
      return null;
    }
  },

  _handleAuthStateChange: async (event, session) => {
    const { 
      fetchProfileAndUpdateStore, 
      setUser: setSupaUser, 
      setProfile: setAppProfile, 
      previousUserId, 
      initialAuthCheckDone,
      isLoadingAuth: currentIsLoadingAuth
    } = get();

    const currentSupaUser = session?.user ?? null;
    const currentSupaUserId = currentSupaUser?.id ?? null;

    console.log(`AuthStore: _handleAuthStateChange event: ${event}, User ID: ${currentSupaUserId}, Prev User ID: ${previousUserId}, Initial Check Done: ${initialAuthCheckDone}, Current isLoadingAuth: ${currentIsLoadingAuth}`);

    let nextIsLoadingAuth = currentIsLoadingAuth;
    let nextInitialAuthCheckDone = initialAuthCheckDone;

    if (event === 'INITIAL_SESSION') {
      if (!initialAuthCheckDone) {
        console.log("AuthStore: INITIAL_SESSION event, initial check not done. Fetching profile.");
        nextIsLoadingAuth = true;
        set({ isLoadingAuth: true });
        await fetchProfileAndUpdateStore(currentSupaUserId, true);
        nextIsLoadingAuth = false;
        nextInitialAuthCheckDone = true;
      } else {
        console.log("AuthStore: INITIAL_SESSION event, but initial check was already done. Updating user if changed.");
         if (JSON.stringify(get().user?.id) !== JSON.stringify(currentSupaUserId)) {
           setSupaUser(currentSupaUser); // Update user object if different
         }
      }
    } else if (event === 'SIGNED_IN') {
      if (!initialAuthCheckDone || currentSupaUserId !== previousUserId) {
        console.log("AuthStore: SIGNED_IN for new user or before initial check completion. Fetching profile.");
        nextIsLoadingAuth = true; // Set loading for this significant change
        set({ isLoadingAuth: true });
        await fetchProfileAndUpdateStore(currentSupaUserId, true);
        nextIsLoadingAuth = false;
        nextInitialAuthCheckDone = true;
      } else {
        // Same user, likely token refresh, initial check done. Only update user object for new token.
        console.log(`AuthStore: SIGNED_IN for same user ${currentSupaUserId} (initial check done). Updating Supabase user object only.`);
        // Only update user if the session object itself has changed (e.g. new token)
        if (JSON.stringify(get().user) !== JSON.stringify(currentSupaUser)){
            setSupaUser(currentSupaUser); // This will embed existing profile
        }
      }
    } else if (event === 'USER_UPDATED' && currentSupaUser) {
      console.log(`AuthStore: USER_UPDATED for user ${currentSupaUserId}. Re-fetching profile.`);
      // Don't set global isLoadingAuth if initial load was done and it's just a profile update.
      await fetchProfileAndUpdateStore(currentSupaUserId, true);
      setSupaUser(currentSupaUser); // Ensure user object is updated
    } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
      console.log(`AuthStore: Event ${event}. Clearing user and profile.`);
      nextIsLoadingAuth = true;
      set({ isLoadingAuth: true }); // Briefly show loading
      setSupaUser(null);
      setAppProfile(null);
      nextIsLoadingAuth = false;
      // initialAuthCheckDone remains true, as we have completed an auth cycle.
      // previousUserId will be cleared when next user signs in or on next INITIAL_SESSION.
    } else if (event === 'TOKEN_REFRESHED' && currentSupaUser) {
        console.log(`AuthStore: TOKEN_REFRESHED for user ${currentSupaUserId}. Updating Supabase user object only.`);
        if (JSON.stringify(get().user) !== JSON.stringify(currentSupaUser)){
            setSupaUser(currentSupaUser);
        }
    }

    set({ 
      user: get().user, // ensure re-evaluation if internal setProfile updated user.profile
      profile: get().profile,
      previousUserId: currentSupaUserId, 
      isLoadingAuth: nextIsLoadingAuth, 
      initialAuthCheckDone: nextInitialAuthCheckDone 
    });
    get()._updateDerivedStates();
  },

  initializeAuth: () => {
    const { _handleAuthStateChange, initialAuthCheckDone: isAlreadyInitialized } = get();
    if (isAlreadyInitialized) {
      console.log("AuthStore: Auth already initialized.");
      return;
    }
    console.log("AuthStore: Initializing Auth (isLoadingAuth will be true)...");
    set({ isLoadingAuth: true });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log("AuthStore: Initial getSession() result:", session ? { userId: session.user.id } : "No session");
      // _handleAuthStateChange will be called with 'INITIAL_SESSION'
      // No direct call to _handleAuthStateChange needed here as listener will pick it up.
      // However, explicitly handling INITIAL_SESSION in _handleAuthStateChange ensures profile fetch
      // if this completes before listener fires for INITIAL_SESSION.
      if (!get().initialAuthCheckDone) { // If listener hasn't processed INITIAL_SESSION yet
          await get()._handleAuthStateChange('INITIAL_SESSION', session);
      }
    }).catch(error => {
      console.error("AuthStore: Error during initial getSession():", error);
      set({ isLoadingAuth: false, initialAuthCheckDone: true });
      get()._updateDerivedStates();
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(get()._handleAuthStateChange);
    console.log("AuthStore: onAuthStateChange listener attached.");
    
    // Add a return function for potential cleanup if the store were to be destroyed,
    // though for a global store, this is less common.
    // return () => {
    //   authListener?.unsubscribe();
    // };
  },

  signOut: async () => {
    const { user: currentUser } = get();
    if (currentUser) {
      set({ isLoadingAuth: true });
    }
    console.log("AuthStore: Signing out...");
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("AuthStore: Error signing out:", error);
      // Even if Supabase signOut fails, onAuthStateChange should fire with SIGNED_OUT
      // and handle clearing local state. We can force it here too.
      set({ user: null, profile: null, previousUserId: null, isLoadingAuth: false });
      get()._updateDerivedStates();
    }
    // Let onAuthStateChange handle final state update.
  },
}));
