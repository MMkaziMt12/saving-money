"use client";

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export function ClientAuthGuardWrapper({ children }: { children: ReactNode }) {
  const { user, profile, isLoadingAuth, isAuthenticated, isApproved } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    console.log("ClientAuthGuardWrapper: State Check:", {
      isLoadingAuth,
      user: user ? { id: user.id, email: user.email } : null,
      profile: profile ? { id: profile.id, name: profile.full_name, isApproved: profile.is_approved } : null,
      isAuthenticated,
      isApproved,
      pathname,
    });

    if (isLoadingAuth) {
      console.log("ClientAuthGuardWrapper: Auth state is loading. Waiting...");
      return; // Wait for auth state to be determined
    }

    // If auth check is complete
    const isAuthPage = pathname === '/login' || pathname === '/signup';
    const isAwaitingApprovalPage = pathname === '/awaiting-approval';

    if (!user) { // Not authenticated
      if (!isAuthPage) {
        console.log("ClientAuthGuardWrapper: No user, not on auth page. Redirecting to /login.");
        router.replace('/login');
      }
      return;
    }

    // User is authenticated (user object exists)
    if (!profile) {
        // This state should ideally be covered by isLoadingAuth if profile fetch is part of initial auth load
        console.warn("ClientAuthGuardWrapper: User exists but profile is null. AuthContext might still be settling or profile fetch failed. This could lead to redirect loops if not handled well by isLoadingAuth.");
        // Depending on app logic, might redirect to login or show a specific error/loader
        // For now, if isLoadingAuth is false, this implies an issue.
        // If the user exists but profile couldn't be fetched, it might be treated as unapproved/incomplete.
        // Let's assume if user exists, isApproved will be derived from profile or be false if profile is null
    }
    
    if (!isApproved) { // Authenticated but not approved
      if (!isAwaitingApprovalPage) {
        console.log("ClientAuthGuardWrapper: User authenticated but not approved. Redirecting to /awaiting-approval.");
        router.replace('/awaiting-approval');
      }
      return;
    }

    // User is authenticated and approved (isAuthenticated should be true)
    if (isAuthenticated) {
      if (isAuthPage || isAwaitingApprovalPage) {
        console.log(`ClientAuthGuardWrapper: Authenticated and approved user on ${pathname}. Redirecting to /.`);
        router.replace('/');
      }
    }

  }, [user, profile, isLoadingAuth, isAuthenticated, isApproved, router, pathname]);

  // Show main loader if auth is still loading,
  // OR if auth is done, but user is null (and not on an auth page - though redirect handles this)
  // OR if auth is done, user exists, but profile is null (and not on awaiting-approval or auth page) - this state implies user is not yet "approved"
  const showMainLoader = isLoadingAuth || 
                         (!isLoadingAuth && !user && !(pathname === '/login' || pathname === '/signup')) ||
                         (!isLoadingAuth && user && !profile && !(pathname === '/awaiting-approval' || pathname === '/login' || pathname === '/signup'));


  if (showMainLoader) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Initializing App...</p>
      </div>
    );
  }

  // If user exists but isn't approved, and we're on the awaiting-approval page, render children.
  if (user && !isApproved && pathname === '/awaiting-approval') {
    return <>{children}</>;
  }

  // If user is authenticated and approved, render children.
  // Or if not loading and on a public auth page, render children (login/signup form).
  if ((isAuthenticated) || (!isLoadingAuth && (pathname === '/login' || pathname === '/signup'))) {
    return <>{children}</>;
  }
  
  // Fallback loader, though the logic above should handle most cases.
  // This can also appear if an authenticated & approved user is briefly on /login before redirect kicks in.
  return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Finalizing...</p>
      </div>
  );
}
