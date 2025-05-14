
"use client"; 

import type { ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation"; // Added usePathname
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react"; // Added Loader2 for page transition

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return; // Guard for SSR
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  return isMobile;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, profile, isLoading: authIsLoading, isApproved } = useAuth(); // Renamed isLoading to authIsLoading
  const router = useRouter();
  const pathname = usePathname(); // Get current pathname
  const isMobile = useIsMobile();
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false); // State for route transition loading

  useEffect(() => {
    const storedState = localStorage.getItem("desktop_sidebar_collapsed_state");
    if (storedState !== null) {
      setIsDesktopSidebarCollapsed(JSON.parse(storedState));
    }
  }, []);

  const toggleDesktopSidebar = () => {
    const newState = !isDesktopSidebarCollapsed;
    setIsDesktopSidebarCollapsed(newState);
    localStorage.setItem("desktop_sidebar_collapsed_state", JSON.stringify(newState));
  };

  useEffect(() => {
    if (!authIsLoading) {
      if (!user) {
        router.replace("/login");
      } else if (!isApproved) {
        router.replace("/awaiting-approval");
      }
    }
  }, [user, authIsLoading, isApproved, router]);

  // Listen to route changes for transition loading
  useEffect(() => {
    const handleStart = (url: string) => {
      // Only show loader if navigating to a different page within the app layout
      if (url !== pathname) {
        setIsTransitioning(true);
      }
    };
    const handleComplete = () => {
      setIsTransitioning(false);
    };

    // Next.js router events are not directly available in the same way as pages router.
    // For App Router, loading state is often handled by Suspense boundaries or loading.tsx files.
    // However, for a global client-side indicator triggered by router.push/replace,
    // we can use a simple state toggle. The ideal solution would be Next.js's built-in loading UI.
    // This is a simplified client-side approach.
    // For true route change events, you'd need to subscribe to router.events if using pages router,
    // or manage state within Link components/navigation actions.
    // Let's use a temporary mechanism based on pathname changes for this simulation.

    // Simulating route change start by checking if router.push/replace is called elsewhere
    // This effect will trigger on pathname changes, if navigation happens client-side
    // it won't directly tell us "start" vs "complete" but we can show a brief loader.
    
    // A more robust client-side way with App Router for a *global* indicator:
    // We need to rely on how navigation is initiated.
    // If router.push/replace is used, we can wrap those calls or use context.
    // For this example, we'll assume any pathname change (after initial load) is a transition.
    
    // Let's refine this: we'll use a simple flag set by Link clicks or programmatic navigation
    // if we were to build a custom Router provider.
    // For now, this is a placeholder and loading.tsx or Suspense is preferred for App Router.
    // Let's set up a basic example where we manually toggle for a short duration on pathname change
    // if not initial load. This is not ideal but demonstrates the concept.

    // A more direct way to tap into App Router navigation events is not straightforwardly exposed client-side for global loading spinners.
    // The recommended Next.js way is `loading.js` files.
    // To achieve a *global* spinner on all client-side navigations, we'd typically intercept `Link` clicks or `router.push`.

    // For the purpose of this prototype, we'll use a simple flag.
    // Consider implementing a custom hook or context if this becomes more complex.
    if (pathname && !authIsLoading) { // check if not initial auth loading
      setIsTransitioning(true);
      const timer = setTimeout(() => setIsTransitioning(false), 300); // Simulate load time
      return () => clearTimeout(timer);
    }

  }, [pathname, authIsLoading]);


  if (authIsLoading || (!user && typeof window !== 'undefined') || (user && !profile && typeof window !== 'undefined') || (user && profile && !isApproved && typeof window !== 'undefined')) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="space-y-4 p-8 rounded-lg ">
           <Skeleton className="h-12 w-12 rounded-full mx-auto bg-muted" />
           <Skeleton className="h-6 w-48 mx-auto bg-muted" />
           <Skeleton className="h-4 w-64 mx-auto bg-muted" />
        </div>
      </div>
    );
  }
  
  if (!user || !profile || !isApproved) {
    // Redirection is happening via useEffect, or something is wrong.
    // This state should ideally not be reached if redirection logic is sound.
    return ( // Fallback loader while redirecting
       <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // Page transition loader
  if (isTransitioning) {
    return (
      <div className="flex min-h-screen w-full flex-row bg-muted/40">
        {!isMobile && <AppSidebar />}
        <div className={cn("flex flex-col sm:gap-4 sm:py-4 flex-1", isMobile ? "sm:pl-0" : "sm:pl-14")}>
          <Header isMobile={isMobile} onMenuClick={!isMobile ? toggleDesktopSidebar : undefined}/>
          <main className="flex-1 p-4 sm:px-6 sm:py-0 md:gap-8 overflow-auto flex items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-row bg-muted/40">
      {!isMobile && <AppSidebar />} 
      <div className={cn("flex flex-col sm:gap-4 sm:py-4 flex-1", isMobile ? "sm:pl-0" : "sm:pl-14")}>
        <Header isMobile={isMobile} onMenuClick={!isMobile ? toggleDesktopSidebar : undefined}/>
        <main className="flex-1 p-4 sm:px-6 sm:py-0 md:gap-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
