
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

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: serverAuthUser },
  } = await supabase.auth.getUser();

  let serverProfile: Profile | null = null;
  if (serverAuthUser) {
    try {
      serverProfile = await fetchUserProfileFromServer(serverAuthUser.id, supabase);
    } catch (error) {
      console.error("AppLayout (Server): Error fetching initial profile:", error);
      // serverProfile remains null, AuthProvider will handle client-side fetch
    }
  }
  
  const initialUserWithProfile = serverAuthUser
    ? ({ ...serverAuthUser, profile: serverProfile } as AppUser)
    : null;

  // This is now a Server Component, client-side redirection logic
  // will be handled by a Client Component that consumes useAuth()
  // or within AuthProvider itself if needed.
  // For now, (app)/layout relies on AuthProvider to manage state and client components to react.

  return (
    <AuthProvider initialUser={initialUserWithProfile} initialProfile={serverProfile}>
      {/* ClientAuthGuardWrapper will consume useAuth and handle redirects */}
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

// New Client Component to handle client-side auth guards
function ClientAuthGuardWrapper({ children }: { children: ReactNode }) {
  "use client";
  
  const { user, profile, isLoadingAuth, isApproved, isAdmin } = useAuth();
  const router = useRouter(); // from next/navigation
  const pathname = usePathname(); // from next/navigation
  const [isTransitioning, setIsTransitioning] = useState(false); // For page transitions

  useEffect(() => {
    // Page transition loader
    let timer: NodeJS.Timeout;
    if (pathname && !isLoadingAuth && user && isApproved) {
      setIsTransitioning(true);
      timer = setTimeout(() => setIsTransitioning(false), 300);
    } else if (isLoadingAuth) {
      setIsTransitioning(false);
    }
    return () => clearTimeout(timer);
  }, [pathname, isLoadingAuth, user, isApproved]);


  useEffect(() => {
    console.log("AppLayout (Client): Auth Guard Check:", { path: pathname, isLoadingAuth, userId: user?.id, profileId: profile?.id, isApproved });
    if (!isLoadingAuth) {
      if (!user) {
        if (!pathname.startsWith("/login") && !pathname.startsWith("/signup") && !pathname.startsWith("/auth/callback")) {
          console.log("AppLayout (Client): No user, redirecting to /login from:", pathname);
          router.replace("/login");
        }
      } else if (!isApproved) {
        if (pathname !== "/awaiting-approval") {
          console.log("AppLayout (Client): User not approved, redirecting to /awaiting-approval from:", pathname);
          router.replace("/awaiting-approval");
        }
      } else { // User is authenticated and approved
        if (pathname === "/awaiting-approval") {
            console.log("AppLayout (Client): User approved but on /awaiting-approval, redirecting to /");
            router.replace("/");
        }
      }
    }
  }, [user, profile, isLoadingAuth, isApproved, router, pathname]);


  const showMainLoader =
    isLoadingAuth || // Primary condition: if auth state is being determined
    (!user && typeof window !== 'undefined' && !pathname.startsWith('/login') && !pathname.startsWith('/signup') && !pathname.startsWith('/auth/callback')) ||
    (user && !isApproved && typeof window !== 'undefined' && pathname !== '/awaiting-approval');


  if (showMainLoader) {
    console.log("AppLayout (Client): Showing main loader. isLoadingAuth:", isLoadingAuth, "User ID:", user?.id, "Path:", pathname);
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
  
  // Specific handling for awaiting-approval page
  if (pathname === "/awaiting-approval" && user && !isApproved) {
     console.log("AppLayout (Client): Rendering awaiting-approval page content.");
     return <>{children}</>; // Let the awaiting-approval page render itself
  }

  // Fallback redirect if, after loading, user state is invalid for app routes
  if (!isLoadingAuth && (!user || !isApproved) && 
      pathname !== "/awaiting-approval" && 
      !pathname.startsWith("/login") && 
      !pathname.startsWith("/signup") &&
      !pathname.startsWith("/auth/callback") ) {
    console.warn("AppLayout (Client): Fallback - Invalid state for app routes. Redirecting to login.", { isLoadingAuth, user, isApproved, pathname });
    if (typeof window !== 'undefined') router.replace("/login");
    return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-2">Redirecting...</p>
        </div>
    );
  }
  
  // If transitioning between pages within the app
  if (isTransitioning) {
    return (
      <div className="flex-1 p-4 sm:px-6 sm:py-6 md:gap-8 overflow-auto print:overflow-visible">
        <div className="flex items-center justify-center h-full print:hidden">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  console.log("AppLayout (Client): Rendering children for path:", pathname);
  return <>{children}</>;
}

// Need to import useRouter and usePathname if not already available globally (they are hooks)
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth"; // Ensure this uses the new AuthContext
import { Skeleton } from "@/components/ui/skeleton";

    