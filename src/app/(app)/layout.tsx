
"use client";

import type { ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
// Removed old AppSidebar import
import { useAuth } from "@/hooks/useAuth"; 
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Loader2, Building2 } from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarInset,
  // Removed SidebarFooter, SidebarGroup, SidebarGroupLabel etc. if not directly used here
} from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/layout/SidebarNav"; // Keep SidebarNav
import { APP_NAME } from "@/lib/constants";
import Link from "next/link";
import { ClientAuthInitializer } from "@/components/providers/ClientAuthInitializer"; 

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, profile, isLoadingAuth, isApproved, isAdmin } = useAuth(); 
  const router = useRouter();
  const pathname = usePathname();
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    console.log("AppLayout: Auth State Check for redirection:", { path: pathname, isLoadingAuth, userId: user?.id, profileId: profile?.id, isApproved });
    if (!isLoadingAuth) { 
      if (!user) {
        if (!pathname.startsWith("/login") && !pathname.startsWith("/signup") && !pathname.startsWith("/auth/callback")) { 
          console.log("AppLayout: No user, redirecting to /login from:", pathname);
          router.replace("/login");
        }
      } else if (!isApproved) {
        if (pathname !== "/awaiting-approval") {
          console.log("AppLayout: User not approved, redirecting to /awaiting-approval from:", pathname);
          router.replace("/awaiting-approval");
        }
      } else {
        console.log("AppLayout: User authenticated and approved. Path:", pathname);
        // If user is approved and on awaiting-approval, redirect to dashboard
        if (pathname === "/awaiting-approval") {
            console.log("AppLayout: User approved but on /awaiting-approval, redirecting to /");
            router.replace("/");
        }
      }
    } else {
      console.log("AppLayout: Auth state is loading, no redirection decision yet.");
    }
  }, [user, profile, isLoadingAuth, isApproved, router, pathname]);


  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (pathname && !isLoadingAuth && user && isApproved) { 
      setIsTransitioning(true);
      timer = setTimeout(() => setIsTransitioning(false), 300); 
    } else if (isLoadingAuth) { 
      setIsTransitioning(false);
    }
    return () => clearTimeout(timer);
  }, [pathname, isLoadingAuth, user, isApproved]); 

  const showMainLoader = 
    isLoadingAuth || 
    (!user && typeof window !== 'undefined' && !pathname.startsWith('/login') && !pathname.startsWith('/signup') && !pathname.startsWith('/auth/callback')) ||
    (user && !isApproved && typeof window !== 'undefined' && pathname !== '/awaiting-approval');

  if (showMainLoader) {
    console.log("AppLayout: Showing main loader. isLoadingAuth:", isLoadingAuth, "User ID:", user?.id, "Path:", pathname);
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

  if (pathname === "/awaiting-approval" && user && !isApproved) {
     console.log("AppLayout: Rendering awaiting-approval page.");
     return (
        <>
          <ClientAuthInitializer />
          {children} 
        </>
     );
  }
  
  // This check is crucial: if after all loading, user is still not valid for app routes
  if (!isLoadingAuth && (!user || !isApproved) && pathname !== "/awaiting-approval" && !pathname.startsWith("/login") && !pathname.startsWith("/signup")) {
    console.warn("AppLayout: Fallback - Invalid state for app routes. isLoadingAuth:", isLoadingAuth, "User ID:", user?.id, "isApproved:", isApproved, "Path:", pathname, ". Redirecting to login.");
    // This state should ideally be caught by the redirection useEffect.
    // If it's reached, force redirect to login to prevent showing a blank page or erroring.
    // Note: Direct router.replace() here might cause hydration issues if not careful.
    // Forcing a loader is safer if the useEffect for redirection is slightly delayed.
    if (typeof window !== 'undefined') router.replace("/login"); // Attempt client-side redirect
    return (
       <>
        <ClientAuthInitializer /> 
        <div className="flex h-screen w-screen items-center justify-center bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-2">Redirecting...</p>
        </div>
      </>
    );
  }

  console.log("AppLayout: Rendering full app layout. User ID:", user?.id, "isApproved:", isApproved, "Path:", pathname);
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
