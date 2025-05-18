
import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser, Session, AuthChangeEvent } from '@supabase/supabase-js';
import type { Profile } from '@/types';
import { fetchUserProfileFromServer } from '@/lib/api/profile'; // Ensure this is correctly imported

const supabase = createClient();

interface AuthState {
  user: SupabaseUser | null;
  profile: Profile | null;
  isLoadingAuth: boolean; // True during initial auth check or significant auth state changes
  isAuthenticated: boolean; // Derived: user exists AND profile is approved
  isApproved: boolean;    // Derived: profile exists and is_approved is true
  isAdmin: boolean;       // Derived: profile exists and role is 'admin'
  initialAuthCheckDone: boolean; // Tracks if the first session check & profile fetch attempt has completed
  previousUserId: string | null; // Stores the ID of the previous user

  initializeAuth: () => void;
  _handleAuthStateChange: (event: AuthChangeEvent, session: Session | null) => Promise<void>;
  fetchProfileAndUpdateStore: (userId: string | null, forceRefresh?: boolean) => Promise<Profile | null>;
  signOut: () => Promise<void>;
  setUser: (user: SupabaseUser | null) => void; // For internal store updates
  setProfile: (profile: Profile | null) => void; // For internal store updates
  _updateDerivedStates: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  isLoadingAuth: true, // Start true until initial auth check is definitively complete
  isAuthenticated: false,
  isApproved: false,
  isAdmin: false,
  initialAuthCheckDone: false,
  previousUserId: null,

  _updateDerivedStates: () => {
    const { user, profile } = get();
    const newIsAuthenticated = !!user && !!profile?.is_approved;
    const newIsApproved = !!profile?.is_approved;
    const newIsAdmin = !!user && profile?.role === 'admin';

    if (get().isAuthenticated !== newIsAuthenticated || get().isApproved !== newIsApproved || get().isAdmin !== newIsAdmin) {
        console.log("AuthStore: Updating derived states:", { newIsAuthenticated, newIsApproved, newIsAdmin });
        set({
            isAuthenticated: newIsAuthenticated,
            isApproved: newIsApproved,
            isAdmin: newIsAdmin,
        });
    }
  },

  setUser: (newUser) => {
    const oldUser = get().user;
    // Basic check to avoid re-render if user object reference is new but data is same
    if (JSON.stringify(oldUser?.id) !== JSON.stringify(newUser?.id)) {
      console.log("AuthStore: Setting user state. Old ID:", oldUser?.id, "New ID:", newUser?.id);
      set({ user: newUser });
      get()._updateDerivedStates();
    } else if (!oldUser && newUser) { // Case where oldUser was null
      console.log("AuthStore: Setting user state from null. New ID:", newUser?.id);
      set({ user: newUser });
      get()._updateDerivedStates();
    } else if (oldUser && newUser && JSON.stringify(oldUser) !== JSON.stringify(newUser)) { // User object updated (e.g. token)
      console.log("AuthStore: Updating user object reference. ID:", newUser?.id);
      set({ user: newUser });
      // No need to call _updateDerivedStates if only user object reference changed but not ID/profile status
    }
  },

  setProfile: (newProfile) => {
    const oldProfile = get().profile;
    if (JSON.stringify(oldProfile) !== JSON.stringify(newProfile)) {
      console.log("AuthStore: Setting profile state. Old profile:", oldProfile ? {id: oldProfile.id, name: oldProfile.full_name} : null, "New profile:", newProfile ? { id: newProfile.id, name: newProfile.full_name } : null);
      set({ profile: newProfile });
      // Ensure user object also has this profile if user exists
      const currentUserInStore = get().user;
      if (currentUserInStore && (!currentUserInStore.profile || JSON.stringify(currentUserInStore.profile) !== JSON.stringify(newProfile))) {
        set(state => ({ user: { ...state.user!, profile: newProfile } as any }));
      }
      get()._updateDerivedStates();
    }
  },

  fetchProfileAndUpdateStore: async (userId, forceRefresh = false) => {
    const { profile: currentProfile, setProfile: setProfileState } = get();
    console.log(`AuthStore: fetchProfileAndUpdateStore called for user ${userId}. Force refresh: ${forceRefresh}. Current profile ID: ${currentProfile?.id}`);

    if (!userId) {
      console.log("AuthStore: No userId provided to fetchProfileAndUpdateStore. Clearing profile.");
      if (currentProfile !== null) setProfileState(null);
      return null;
    }

    if (!forceRefresh && currentProfile && currentProfile.id === userId) {
      console.log(`AuthStore: Profile for ${userId} already in store and not forcing refresh. Using existing.`);
      return currentProfile;
    }

    try {
      console.log(`AuthStore: Fetching profile for ${userId} from server (via fetchUserProfileFromServer).`);
      // Use client-side supabase instance for this fetch as it's initiated from client-side logic
      const fetchedProfile = await fetchUserProfileFromServer(userId, supabase); 

      if (get().user?.id === userId) { // Ensure profile belongs to current user in store
        console.log("AuthStore: Successfully fetched profile:", fetchedProfile ? { id: fetchedProfile.id, name: fetchedProfile.full_name } : null);
        setProfileState(fetchedProfile);
        return fetchedProfile;
      }
      console.warn("AuthStore: User changed during profile fetch. Discarding fetched profile for previous user ID:", userId);
      return null; // Return null if the fetched profile doesn't match the current user
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
      isLoadingAuth: currentIsLoadingAuth,
      user: currentUserObjectInStore, // Get current user object from store
      profile: currentProfileObjectInStore
    } = get();

    const currentSupaUser = session?.user ?? null;
    const currentSupaUserId = currentSupaUser?.id ?? null;

    console.log(`AuthStore: _handleAuthStateChange event: ${event}, User ID: ${currentSupaUserId}, Prev User ID: ${previousUserId}, Initial Check Done: ${initialAuthCheckDone}, Current isLoadingAuth: ${currentIsLoadingAuth}`);
    
    let nextIsLoadingAuth = currentIsLoadingAuth;
    let profileFetchedInThisEvent = false;

    if (event === 'INITIAL_SESSION' || (event === 'SIGNED_IN' && (!initialAuthCheckDone || currentSupaUserId !== previousUserId))) {
        console.log(`AuthStore: ${event} - New user session or initial check. Setting isLoadingAuth true.`);
        nextIsLoadingAuth = true;
        set({ isLoadingAuth: true });

        setSupaUser(currentSupaUser); // Set user first
        await fetchProfileAndUpdateStore(currentSupaUserId, true); // Then fetch profile
        profileFetchedInThisEvent = true;
        
        // isLoadingAuth will be set to false after this async block
        nextIsLoadingAuth = false; 
        set({ previousUserId: currentSupaUserId, initialAuthCheckDone: true }); // Update after processing
    
    } else if (event === 'SIGNED_IN' && initialAuthCheckDone && currentSupaUserId === previousUserId) {
        console.log(`AuthStore: SIGNED_IN for same user ${currentSupaUserId} (initial check done). Updating Supabase user object only.`);
        // Only update user object if reference or content changed, embed existing profile
        if (JSON.stringify(currentUserObjectInStore) !== JSON.stringify(currentSupaUser) || !currentUserObjectInStore) {
            setSupaUser({ ...currentSupaUser!, profile: currentProfileObjectInStore } as any);
        }
        // Ensure isLoadingAuth is false if it somehow got stuck true
        if (nextIsLoadingAuth) nextIsLoadingAuth = false;

    } else if (event === 'USER_UPDATED' && currentSupaUser) {
        console.log(`AuthStore: USER_UPDATED for user ${currentSupaUserId}. Re-fetching profile.`);
        setSupaUser(currentSupaUser); // Update user object first
        await fetchProfileAndUpdateStore(currentSupaUserId, true);
        profileFetchedInThisEvent = true;
        // Do not set global isLoadingAuth for background profile updates if initial load was done.
        if (nextIsLoadingAuth && initialAuthCheckDone) nextIsLoadingAuth = false;


    } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        console.log(`AuthStore: Event ${event}. Clearing user, profile. Setting isLoadingAuth true then false.`);
        nextIsLoadingAuth = true;
        set({ isLoadingAuth: true }); 
        setSupaUser(null);
        setAppProfile(null);
        set({ previousUserId: null }); 
        nextIsLoadingAuth = false;
        // initialAuthCheckDone remains true

    } else if (event === 'TOKEN_REFRESHED' && currentSupaUser) {
        console.log(`AuthStore: TOKEN_REFRESHED for user ${currentSupaUserId}. Updating Supabase user object only.`);
        if (JSON.stringify(currentUserObjectInStore) !== JSON.stringify(currentSupaUser) || !currentUserObjectInStore) {
            setSupaUser({ ...currentSupaUser!, profile: currentProfileObjectInStore } as any);
        }
        if (nextIsLoadingAuth && initialAuthCheckDone) nextIsLoadingAuth = false;
    }
    
    // Final state updates after processing the event
    set({ isLoadingAuth: nextIsLoadingAuth });
    if (profileFetchedInThisEvent || event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        get()._updateDerivedStates(); // Update derived states if profile potentially changed or user logged out
    }
    console.log("AuthStore: _handleAuthStateChange finished. isLoadingAuth:", get().isLoadingAuth, "initialAuthCheckDone:", get().initialAuthCheckDone, "User ID:", get().user?.id);
  },

  initializeAuth: () => {
    const { _handleAuthStateChange, initialAuthCheckDone: isAlreadyInitialized, isLoadingAuth: currentIsLoading } = get();
    if (isAlreadyInitialized && !currentIsLoading) { // Only skip if truly done and not mid-load
      console.log("AuthStore: Auth already initialized and not loading.");
      return;
    }
    if (currentIsLoading && isAlreadyInitialized) {
        console.log("AuthStore: Auth initialization called, but already in a loading state. Listener should handle.")
        return;
    }
    console.log("AuthStore: Initializing Auth. Setting isLoadingAuth true.");
    set({ isLoadingAuth: true, initialAuthCheckDone: false }); // Reset initialAuthCheckDone for re-init if needed

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log("AuthStore: Initial getSession() result:", session ? { userId: session.user.id } : "No session");
      // _handleAuthStateChange will be called by the listener for INITIAL_SESSION
      // However, explicitly call it if the initialAuthCheckDone is still false to kickstart
      if (!get().initialAuthCheckDone) {
          await _handleAuthStateChange('INITIAL_SESSION', session);
      }
    }).catch(error => {
      console.error("AuthStore: Error during initial getSession():", error);
      set({ isLoadingAuth: false, initialAuthCheckDone: true }); // Ensure loading stops
      get()._updateDerivedStates();
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(get()._handleAuthStateChange);
    console.log("AuthStore: onAuthStateChange listener attached.");
    
    // This return is for store structure, actual unsubscribe is harder with Zustand's nature for global listeners
    // return () => {
    //   authListener?.subscription.unsubscribe();
    // };
  },

  signOut: async () => {
    const { user: currentUser } = get();
    console.log("AuthStore: Signing out...");
    if (currentUser) {
      set({ isLoadingAuth: true }); // Set loading before async operation
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("AuthStore: Error signing out:", error);
      // _handleAuthStateChange should still fire with SIGNED_OUT
      // but we can ensure state is cleared if needed
      set({ user: null, profile: null, previousUserId: null, isLoadingAuth: false });
      get()._updateDerivedStates();
    }
    // Let onAuthStateChange handle the final state update to (null, null, false) for isLoadingAuth
  },
}));
