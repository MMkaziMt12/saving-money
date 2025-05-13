
"use client"; // This layout uses hooks, so it must be a client component

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useMockAuth } from "@/hooks/use-mock-auth";
import { Toaster } from "@/components/ui/toaster";
import { Skeleton } from "@/components/ui/skeleton";
import { PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Helper hook for mobile detection
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  return isMobile;
}


export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, isApproved } = useMockAuth();
  console.log(user,"is user there")
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
    if (!isLoading && !user) {
      router.replace("/login");
    } else if (!isLoading && user && !isApproved) {
      router.replace("/awaiting-approval");
    }
  }, [user, isLoading, isApproved, router]);

  if (isLoading || (!user && typeof window !== 'undefined') || (user && !isApproved && typeof window !== 'undefined')) {
    // Show a full-page loading skeleton or a minimal loading screen
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
  
  // If user is null but we are past loading and conditions, it means redirection is happening or something is wrong.
  // This check is to prevent rendering layout for unauthenticated/unapproved users briefly.
  if (!user || !isApproved) {
  
    return null; // Or specific loading for redirection
  }


  return (
    <div className="flex min-h-screen w-full flex-row bg-muted/40">
      {!isMobile && <AppSidebar />} 
      <div className={cn("flex flex-col sm:gap-4 sm:py-4 flex-1", isMobile ? "sm:pl-0" : "sm:pl-14")}>
         {/* The sm:pl-14 is for when sidebar is collapsed. This needs to be dynamic based on AppSidebar's state */}
        <Header isMobile={isMobile} onMenuClick={!isMobile ? toggleDesktopSidebar : undefined}/>
        <main className="flex-1 p-4 sm:px-6 sm:py-0 md:gap-8 overflow-auto">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}

// Note: The AppSidebar has its own collapse state. If the toggle button is in the Header,
// this AppLayout would need to manage that state and pass it down, or use a global state (Context/Zustand).
// For simplicity, the current AppSidebar handles its own state via localStorage.
// The `sm:pl-14` might need adjustment if AppSidebar's width changes.
// This layout is simplified for this example. A production app might use a more robust state management for sidebar.
