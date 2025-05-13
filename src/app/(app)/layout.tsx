"use client"; 

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
  const { user, profile, isLoading, isApproved } = useAuth();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);

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
    if (!isLoading) {
      if (!user) {
        router.replace("/login");
      } else if (!isApproved) {
        router.replace("/awaiting-approval");
      }
      // If user is present and approved, they can stay.
    }
  }, [user, isLoading, isApproved, router]);

  if (isLoading || (!user && typeof window !== 'undefined') || (user && !profile && typeof window !== 'undefined') || (user && profile && !isApproved && typeof window !== 'undefined')) {
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
    return null; // Redirection is happening or something is wrong
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
