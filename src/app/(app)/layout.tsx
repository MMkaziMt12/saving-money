
"use client";

import type { ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { useAuth } from "@/hooks/useAuth"; 
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Loader2, Building2 } from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarInset
} from "@/components/ui/sidebar";
import { APP_NAME } from "@/lib/constants";
import Link from "next/link";
import { ClientAuthInitializer } from "@/components/providers/ClientAuthInitializer"; 

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, profile, isLoadingAuth, isApproved, isAdmin } = useAuth(); 
  const router = useRouter();
  const pathname = usePathname();
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    console.log("AppLayout: Auth State Check:", { path: pathname, isLoadingAuth, user: user?.id, profile: profile?.id, isApproved });
    if (!isLoadingAuth) { // Only redirect if auth state is resolved
      if (!user) {
        // If on any (app) route and no user, redirect to login
        if (!pathname.startsWith("/login") && !pathname.startsWith("/signup")) { // Avoid redirect loop if already on auth pages
          console.log("AppLayout: No user, redirecting to /login from:", pathname);
          router.replace("/login");
        }
      } else if (!isApproved) {
        // User exists but is not approved
        if (pathname !== "/awaiting-approval") {
          console.log("AppLayout: User not approved, redirecting to /awaiting-approval from:", pathname);
          router.replace("/awaiting-approval");
        }
      } else {
        // User is authenticated and approved
        // If admin tries to access non-admin page (excluding awaiting-approval), consider if a redirect is needed.
        // For now, allow admin access to all approved user pages.
        // If a non-admin tries to access an admin-only page (e.g. /admin), that page itself should handle redirection.
        console.log("AppLayout: User authenticated and approved. Path:", pathname);
      }
    }
  }, [user, profile, isLoadingAuth, isApproved, router, pathname]);


  useEffect(() => {
    let timer: NodeJS.Timeout;
    // Only show page transition loader if auth is NOT loading and we have a user
    if (pathname && !isLoadingAuth && user && isApproved) { 
      setIsTransitioning(true);
      timer = setTimeout(() => setIsTransitioning(false), 300); // Adjust delay as needed
    } else if (isLoadingAuth) { // If auth is loading, ensure page transition is off
      setIsTransitioning(false);
    }
    return () => clearTimeout(timer);
  }, [pathname, isLoadingAuth, user, isApproved]); // Added user & isApproved dependency

  // Show main loader if auth is still loading OR if there's no user (and we're not on a public auth page)
  // OR if user exists but is not approved (and we're not on awaiting-approval page)
  const showMainLoader = 
    isLoadingAuth || 
    (!user && typeof window !== 'undefined' && !pathname.startsWith('/login') && !pathname.startsWith('/signup') && !pathname.startsWith('/auth/callback')) ||
    (user && !isApproved && typeof window !== 'undefined' && pathname !== '/awaiting-approval');


  if (showMainLoader) {
    return (
      <>
        <ClientAuthInitializer /> 
        <div className="flex h-screen w-screen items-center justify-center bg-background">
          <div className="space-y-4 p-8 rounded-lg text-center">
            <Building2 className="h-12 w-12 text-primary mx-auto mb-3 animate-pulse" />
            <p className="text-lg font-medium text-foreground">Loading {APP_NAME}...</p>
            <Skeleton className="h-4 w-64 mx-auto bg-muted" />
          </div>
        </div>
      </>
    );
  }

  // If we reach here, isLoadingAuth is false, user exists and is approved (or we are on awaiting-approval)
  // Edge case: if on awaiting-approval page, let it render.
  if (pathname === "/awaiting-approval" && user && !isApproved) {
     return (
        <>
          <ClientAuthInitializer />
          {children} 
        </>
     );
  }
  
  // Final check before rendering full layout: if after loading, user is still null or not approved
  // and not on awaiting-approval, this implies a logic error or race condition.
  // The useEffect for redirection should have handled this.
  // This is a fallback, but should ideally not be hit frequently if useEffect works.
  if (!isLoadingAuth && (!user || !isApproved)) {
    // This indicates a state where redirection should have happened but didn't, or a protected route was accessed directly.
    // The useEffect hook should handle redirects. Returning null here might lead to a blank page briefly if redirects are slow.
    // Forcing a loader here can prevent flashing content if there's a slight delay in redirection.
    console.warn("AppLayout: Fallback - isLoadingAuth is false but user/approval state is not valid for app routes. Path:", pathname);
    return (
       <>
        <ClientAuthInitializer /> 
        <div className="flex h-screen w-screen items-center justify-center bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </>
    );
  }


  return (
    <>
      <ClientAuthInitializer /> 
      <SidebarProvider defaultOpen={true}>
        <Sidebar>
          <SidebarHeader>
            <Link
              href="/"
              className="flex items-center gap-2 font-bold text-lg text-[hsl(var(--sidebar-active-background))] group-data-[state=expanded]/sidebar:ml-2 group-data-[state=collapsed]/sidebar:justify-center"
            >
              <Building2 className="h-6 w-6 shrink-0" />
              <span className="group-data-[state=expanded]/sidebar:inline group-data-[state=collapsed]/sidebar:hidden">
                {APP_NAME}
              </span>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarNav />
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <div className={cn("flex flex-col flex-1 transition-all duration-300 ease-in-out print:p-0")}>
            <Header />
            <main className="flex-1 p-4 sm:px-6 sm:py-6 md:gap-8 overflow-auto print:overflow-visible">
              {isTransitioning ? (
                <div className="flex items-center justify-center h-full print:hidden">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </div>
              ) : (
                children
              )}
            </main>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}
