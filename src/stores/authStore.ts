
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
  initialAuthCheckComplete: boolean; // New flag
  previousUserId: string | null; // To track user changes

  // Actions
  initializeAuth: () => Promise<void>;
  _handleAuthStateChange: (event: AuthChangeEvent, session: Session | null) => Promise<void>;
  fetchProfileAndUpdateStore: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>;
  signOut: () => Promise<void>;
  setUser: (user: SupabaseUser | null) => void;
  setProfile: (profile: Profile | null) => void;
  setIsLoadingAuth: (loading: boolean) => void;
  _updateDerivedStates: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  isLoadingAuth: true,
  isAuthenticated: false,
  isApproved: false,
  isAdmin: false,
  initialAuthCheckComplete: false,
  previousUserId: null,

  setUser: (user) => {
    set({ user });
    get()._updateDerivedStates();
  },
  setProfile: (profile) => {
    set({ profile });
    get()._updateDerivedStates();
  },
  setIsLoadingAuth: (loading) => set({ isLoadingAuth: loading }),

  _updateDerivedStates: () => {
    const user = get().user;
    const profile = get().profile;
    set({
      isAuthenticated: !!user && !!profile?.is_approved,
      isApproved: !!profile?.is_approved,
      isAdmin: profile?.role === 'admin',
    });
  },

  fetchProfileAndUpdateStore: async (userId, forceRefresh = false) => {
    if (!forceRefresh && get().profile && get().profile?.id === userId) {
      console.log("AuthStore: Profile already loaded and matches user ID. Skipping fetch unless forced.");
      return get().profile;
    }
    console.log(`AuthStore: Fetching profile for user ${userId}. Force refresh: ${forceRefresh}`);
    try {
      // Pass the client-side supabase instance
      const fetchedProfile = await fetchUserProfileFromServer(userId, supabase);
      if (get().user?.id === userId) { // Ensure profile belongs to current user in store
        set({ profile: fetchedProfile });
        get()._updateDerivedStates(); // Update derived states after profile fetch
        return fetchedProfile;
      }
      return null; // Profile fetched doesn't match current user (e.g., race condition)
    } catch (error) {
      console.error("AuthStore: Error fetching profile:", error);
      if (get().user?.id === userId) { // Clear profile if fetch failed for current user
        set({ profile: null });
        get()._updateDerivedStates();
      }
      return null;
    }
  },

  _handleAuthStateChange: async (event, session) => {
    console.log("AuthStore: onAuthStateChange event:", event, "Session user:", session?.user?.id);
    const currentSupabaseUser = session?.user ?? null;
    const currentUserId = currentSupabaseUser?.id ?? null;
    const previousUserId = get().previousUserId;

    set({ user: currentSupabaseUser }); // Always update the Supabase user object

    if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || (event === 'INITIAL_SESSION' && currentUserId)) {
      if (currentUserId !== previousUserId || !get().profile) {
        // User changed or profile not yet loaded for this user
        console.log(`AuthStore: User changed or profile needed for ${currentUserId}. Fetching profile.`);
        if (!get().initialAuthCheckComplete) { // Only show global load for initial sign-in or first session check
            set({ isLoadingAuth: true });
        }
        await get().fetchProfileAndUpdateStore(currentUserId!, true); // Force refresh for new user/update
        if (!get().initialAuthCheckComplete) {
             set({ isLoadingAuth: false, initialAuthCheckComplete: true });
        }
      } else if (currentSupabaseUser) {
        // Same user, likely token refresh or minor update, keep existing profile in store
        console.log("AuthStore: Same user, session refreshed/updated. Keeping existing profile data.");
      }
    } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
      console.log("AuthStore: SIGNED_OUT or USER_DELETED. Clearing profile.");
      set({ profile: null, isLoadingAuth: false }); // No longer loading if signed out
    }
    
    set({ previousUserId: currentUserId }); // Update previous user ID
    get()._updateDerivedStates(); // Ensure derived states are always updated after any change
  },

  initializeAuth: async () => {
    if (get().initialAuthCheckComplete) {
      console.log("AuthStore: Auth already initialized.");
      return;
    }
    console.log("AuthStore: Initializing Auth...");
    set({ isLoadingAuth: true });

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
        console.error("AuthStore: Error getting initial session:", sessionError);
    }
    await get()._handleAuthStateChange('INITIAL_SESSION', session);
    
    // Ensure loading is false and initial check is marked complete
    // This might be redundant if _handleAuthStateChange covers it for INITIAL_SESSION
    // but good as a safeguard.
    if (!get().initialAuthCheckComplete){ // If _handleAuthStateChange didn't set it
        set({ isLoadingAuth: false, initialAuthCheckComplete: true });
    }


    supabase.auth.onAuthStateChange(get()._handleAuthStateChange);
    console.log("AuthStore: onAuthStateChange listener attached.");
  },

  signOut: async () => {
    set({ isLoadingAuth: true }); // Briefly set loading
    console.log("AuthStore: Signing out...");
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("AuthStore: Error signing out:", error);
      // Still clear local state even if Supabase signOut fails for some reason
    }
    // The onAuthStateChange listener will handle setting user and profile to null
    // and then isLoadingAuth to false via _handleAuthStateChange
    // Explicitly setting here might be redundant if listener is quick.
    set({ user: null, profile: null, previousUserId: null });
    get()._updateDerivedStates();
    set({ isLoadingAuth: false }); // Ensure loading is off after sign out logic
  },
}));

// Call initializeAuth when the store is first created/imported if running on client.
// This is one way to auto-initialize. Another is via ClientAuthInitializer component.
if (typeof window !== 'undefined') {
  // useAuthStore.getState().initializeAuth(); // Consider moving this to ClientAuthInitializer
}
