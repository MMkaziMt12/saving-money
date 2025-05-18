
"use client";

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function ClientAuthInitializer() {
  useEffect(() => {
    // Initialize authentication state when the component mounts on the client
    // This will set up the onAuthStateChange listener and check the initial session
    console.log("ClientAuthInitializer: Mounting and calling initializeAuth...");
    const initialize = useAuthStore.getState().initializeAuth;
    initialize();
  }, []);

  return null; // This component doesn't render anything visible
}
