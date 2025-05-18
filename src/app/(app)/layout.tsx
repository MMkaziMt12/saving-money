
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
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth"; 
import { Skeleton } from "@/components/ui/skeleton";


export default async function AppLayout({ children }: { children: ReactNode }) {
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
    }
  }
  
  // Construct AppUser with potentially embedded profile from server fetch
  const initialUserWithProfile = serverAuthUser
    ? ({ ...serverAuthUser, profile: serverProfile } as AppUser)
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
    if (pathname && !isLoadingAuth && isAuthenticated) { // Check isAuthenticated
      setIsTransitioning(true);
      timer = setTimeout(() => setIsTransitioning(false), 300);
    } else if (isLoadingAuth) {
      setIsTransitioning(false);
    }
    return () => clearTimeout(timer);
  }, [pathname, isLoadingAuth, isAuthenticated]);


  useEffect(() => {
    console.log("ClientAuthGuard: State Check:", { path: pathname, isLoadingAuth, userId: user?.id, profileId: profile?.id, isApproved, isAuthenticated });
    if (!isLoadingAuth) {
      if (!user) { // No user session at all
        if (!pathname.startsWith("/login") && !pathname.startsWith("/signup") && !pathname.startsWith("/auth/callback")) {
          console.log("ClientAuthGuard: No user, redirecting to /login from:", pathname);
          router.replace("/login");
        }
      } else if (!profile) { // User exists, but profile hasn't loaded yet in context.isLoadingAuth should cover this.
        console.log("ClientAuthGuard: User exists, but profile is null. isLoadingAuth should be true. Current state:", isLoadingAuth);
        // Rely on isLoadingAuth to show loader. If isLoadingAuth is false and profile is still null, it's an issue.
      } else if (!isApproved) { // User and profile loaded, but not approved
        if (pathname !== "/awaiting-approval") {
          console.log("ClientAuthGuard: User not approved, redirecting to /awaiting-approval from:", pathname);
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
  }, [user, profile, isLoadingAuth, isAuthenticated, isApproved, router, pathname]);


  // Conditions for showing the main full-page loader
  const showMainLoader =
    isLoadingAuth || // Primary: if auth context is still determining initial state
    (!isLoadingAuth && !user && typeof window !== 'undefined' && !pathname.startsWith('/login') && !pathname.startsWith('/signup') && !pathname.startsWith('/auth/callback')) || // No user, not loading, not on public auth pages
    (!isLoadingAuth && user && !profile && typeof window !== 'undefined' && !pathname.startsWith('/awaiting-approval')) || // User, but no profile yet, not on awaiting approval (should be covered by isLoadingAuth, but as a fallback)
    (!isLoadingAuth && user && profile && !isApproved && typeof window !== 'undefined' && pathname !== '/awaiting-approval'); // User and profile, but not approved, and not on awaiting-approval page


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

  // Fallback redirect if, after loading, state is invalid for app routes
  // This condition is tricky because if isLoadingAuth is false, user and profile should be definitively set or null
  if (!isLoadingAuth && (!user || !profile || !isApproved) && 
      !pathname.startsWith("/login") && 
      !pathname.startsWith("/signup") &&
      !pathname.startsWith("/auth/callback") &&
      pathname !== "/awaiting-approval" 
    ) {
    console.warn("ClientAuthGuard: Fallback - Invalid state for app routes after loading. Redirecting to login.", { isLoadingAuth, user, profile, isApproved, pathname });
    if (typeof window !== 'undefined') router.replace("/login"); // Should rarely be hit if above logic is correct
    return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-2">Redirecting...</p>
        </div>
    );
  }
  
  if (isTransitioning && isAuthenticated) { // Only show transition loader if user is authenticated
    return (
      <div className="flex-1 p-4 sm:px-6 sm:py-6 md:gap-8 overflow-auto print:overflow-visible">
        <div className="flex items-center justify-center h-full print:hidden">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  console.log("ClientAuthGuard: Rendering children for path:", pathname);
  return <>{children}</>;
}

    