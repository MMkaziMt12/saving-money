
"use client"; // This hook is for client components

import { useAuthStore } from '@/stores/authStore';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { Profile } from '@/types';

export interface UseAuthReturn {
  user: SupabaseUser | null;
  profile: Profile | null;
  isLoadingAuth: boolean;
  isAuthenticated: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  signOutUser: () => Promise<void>;
  initializeAuth: () => Promise<void>; // Exposed for ClientAuthInitializer
  fetchProfile: (userId: string, forceRefresh?: boolean) => Promise<Profile | null>;
}

export const useAuth = (): UseAuthReturn => {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const isLoadingAuth = useAuthStore((state) => state.isLoadingAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isApproved = useAuthStore((state) => state.isApproved);
  const isAdmin = useAuthStore((state) => state.isAdmin);

  // Get actions directly from the store. Non-reactive, so call as needed.
  const signOutUser = useAuthStore.getState().signOut;
  const initializeAuth = useAuthStore.getState().initializeAuth;
  const fetchProfile = useAuthStore.getState().fetchProfileAndUpdateStore;


  return {
    user,
    profile,
    isLoadingAuth,
    isAuthenticated,
    isApproved,
    isAdmin,
    signOutUser,
    initializeAuth,
    fetchProfile,
  };
};
