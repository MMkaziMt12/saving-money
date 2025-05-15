
"use client";

import type { ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const checkMobile = () => setIsMobile(window.innerWidth < 768); // md breakpoint
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  return isMobile;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, profile, isLoading: authIsLoading, isApproved } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

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

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (pathname && !authIsLoading) {
      setIsTransitioning(true);
      timer = setTimeout(() => setIsTransitioning(false), 300); // Simulate load time
    }
    return () => clearTimeout(timer);
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
    return (
       <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const mainContentPadding = isMobile ? "pl-0" : (isDesktopSidebarCollapsed ? "md:pl-16" : "md:pl-60");

  return (
    <div className="flex min-h-screen w-full flex-row bg-muted/40 print:bg-white">
      {!isMobile && <AppSidebar isCollapsed={isDesktopSidebarCollapsed} />}
      <div className={cn(
          "flex flex-col flex-1 transition-all duration-300 ease-in-out print:p-0",
           mainContentPadding
        )}>
        <Header isMobile={isMobile} onMenuClick={!isMobile ? toggleDesktopSidebar : undefined}/>
        <main className="flex-1 p-4 sm:px-6 sm:py-6 md:gap-8 overflow-auto print:overflow-visible">
          {isTransitioning && !authIsLoading ? (
            <div className="flex items-center justify-center h-full print:hidden">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
