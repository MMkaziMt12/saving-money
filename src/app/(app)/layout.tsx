
import type { ReactNode } from "react";
import { Header } from "@/components/layout/Header";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarInset,
} from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { APP_NAME } from "@/lib/constants";
import Link from "next/link";
import { Building2, Loader2 } from "lucide-react";
import { AuthProvider } from "@/contexts/AuthContext"; // Import new AuthProvider
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchUserProfileFromServer } from "@/lib/api/profile";
import type { AuthenticatedUser as AppUser, Profile } from "@/types";
import { cn } from "@/lib/utils";
import { useRouter, usePathname } from "next/navigation"; // Client hook
import { useEffect, useState } from "react"; // Client hook
import { useAuth } from "@/hooks/useAuth"; // Client hook for consuming context
import { Skeleton } from "@/components/ui/skeleton";


export default async function AppLayout({ children }: { children: ReactNode }) {
  // This part runs on the server
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: serverAuthUser },
  } = await supabase.auth.getUser();

  let serverProfile: Profile | null = null;
  if (serverAuthUser) {
    try {
      console.log("AppLayout (Server): Fetching initial profile for user:", serverAuthUser.id);
      serverProfile = await fetchUserProfileFromServer(serverAuthUser.id, supabase);
      console.log("AppLayout (Server): Initial profile fetched:", serverProfile ? serverProfile.id : null, "Approved:", serverProfile?.is_approved);
    } catch (error) {
      console.error("AppLayout (Server): Error fetching initial profile:", error);
      // serverProfile remains null
    }
  }
  
  const initialUserWithProfile = serverAuthUser
    ? ({ ...serverAuthUser, profile: serverProfile } as AppUser) // Embed profile directly
    : null;

  console.log("AppLayout (Server): Passing to AuthProvider:", { initialUser: initialUserWithProfile?.id, initialProfile: serverProfile?.id });

  return (
    <AuthProvider initialUser={initialUserWithProfile} initialProfile={serverProfile}>
      <ClientAuthGuardWrapper>
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
                {children}
              </main>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </ClientAuthGuardWrapper>
    </AuthProvider>
  );
}

function ClientAuthGuardWrapper({ children }: { children: ReactNode }) {
  "use client";
  
  const { user, profile, isLoadingAuth, isAuthenticated, isApproved } = useAuth();
  const router = useRouter(); 
  const pathname = usePathname(); 
  const [isTransitioning, setIsTransitioning] = useState(false); 

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (pathname && !isLoadingAuth && isAuthenticated) {
      setIsTransitioning(true);
      timer = setTimeout(() => setIsTransitioning(false), 300);
    } else if (isLoadingAuth) {
      setIsTransitioning(false); // Cancel transition if main auth is loading
    }
    return () => clearTimeout(timer);
  }, [pathname, isLoadingAuth, isAuthenticated]);


  useEffect(() => {
    console.log("ClientAuthGuard: State Check:", { path: pathname, isLoadingAuth, userId: user?.id, profileId: profile?.id, isApproved, isAuthenticated });
    if (!isLoadingAuth) { // Only run checks if initial auth loading is complete
      if (!user) { // No user session at all
        if (!pathname.startsWith("/login") && !pathname.startsWith("/signup") && !pathname.startsWith("/auth/callback")) {
          console.log("ClientAuthGuard: No user (auth check done), redirecting to /login from:", pathname);
          router.replace("/login");
        }
      } else if (!isApproved) { // User exists (implies profile was checked), but not approved
        if (pathname !== "/awaiting-approval") {
          console.log("ClientAuthGuard: User not approved (auth check done), redirecting to /awaiting-approval from:", pathname);
          router.replace("/awaiting-approval");
        }
      } else { // User is authenticated, profile loaded, and approved (isAuthenticated should be true)
        if (pathname === "/awaiting-approval") {
            console.log("ClientAuthGuard: User approved but on /awaiting-approval, redirecting to /");
            router.replace("/");
        }
        // If user is on /login or /signup but is already authenticated and approved, redirect to dashboard
        if (pathname.startsWith("/login") || pathname.startsWith("/signup")) {
            console.log("ClientAuthGuard: Authenticated and approved user on auth page, redirecting to /");
            router.replace("/");
        }
      }
    }
  }, [user, profile, isLoadingAuth, isAuthenticated, isApproved, router, pathname]); // Added profile to deps


  // Conditions for showing the main full-page loader
  // Show loader if auth context is explicitly loading, OR if client-side checks haven't completed
  // and we are not on a public auth page.
  const showMainLoader = isLoadingAuth || 
                         (!isLoadingAuth && !user && typeof window !== 'undefined' && !pathname.startsWith('/login') && !pathname.startsWith('/signup') && !pathname.startsWith('/auth/callback')) ||
                         (!isLoadingAuth && user && !profile && typeof window !== 'undefined' && !pathname.startsWith('/awaiting-approval')) || // User, but no profile loaded yet, and not on awaiting approval
                         (!isLoadingAuth && user && profile && !isApproved && typeof window !== 'undefined' && pathname !== '/awaiting-approval');


  if (showMainLoader) {
    console.log("ClientAuthGuard: Showing main loader. isLoadingAuth:", isLoadingAuth, "User ID:", user?.id, "Profile ID:", profile?.id, "Path:", pathname);
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="space-y-4 p-8 rounded-lg text-center">
          <Building2 className="h-12 w-12 text-primary mx-auto mb-3 animate-pulse" />
          <p className="text-lg font-medium text-foreground">Loading {APP_NAME}...</p>
          <Skeleton className="h-4 w-64 mx-auto bg-muted" />
        </div>
      </div>
    );
  }
  
  // Specific handling for awaiting-approval page if user is logged in, profile exists, but not approved
  if (!isLoadingAuth && user && profile && !isApproved && pathname === "/awaiting-approval") {
     console.log("ClientAuthGuard: Rendering awaiting-approval page content.");
     return <>{children}</>; 
  }

  // Fallback check: if after loading, state is invalid for protected app routes, redirect.
  // This should ideally be caught by the primary loader, but serves as a safety net.
  if (!isLoadingAuth && (!isAuthenticated || !user || !profile) && // isAuthenticated implies user, profile, and approved
      !pathname.startsWith("/login") && 
      !pathname.startsWith("/signup") &&
      !pathname.startsWith("/auth/callback") &&
      pathname !== "/awaiting-approval" 
    ) {
    console.warn("ClientAuthGuard: Fallback - Invalid state for app routes after loading. isLoadingAuth:", isLoadingAuth, "isAuthenticated:", isAuthenticated, "user:", !!user, "profile:", !!profile, "path:", pathname, ". Redirecting to login.");
    if (typeof window !== 'undefined') router.replace("/login"); 
    return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-2">Redirecting...</p>
        </div>
    );
  }
  
  // Transition loader for page navigation within the app if user is authenticated
  if (isTransitioning && isAuthenticated) { 
    return (
      <div className="flex-1 p-4 sm:px-6 sm:py-6 md:gap-8 overflow-auto print:overflow-visible">
        <div className="flex items-center justify-center h-full print:hidden">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  console.log("ClientAuthGuard: Rendering children for path:", pathname, {isLoadingAuth, isAuthenticated, user: !!user, profile: !!profile});
  return <>{children}</>;
}
    