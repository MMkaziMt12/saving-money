
"use client";

import type { ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Loader2, Building2 } from "lucide-react";
import { 
  SidebarProvider, 
  Sidebar, 
  SidebarHeader, 
  SidebarContent, 
  SidebarFooter, // Optional, if you need a footer
  SidebarInset 
} from "@/components/ui/sidebar";
import { APP_NAME } from "@/lib/constants";
import Link from "next/link";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, profile, isLoading: authIsLoading, isApproved } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isTransitioning, setIsTransitioning] = useState(false);

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
      timer = setTimeout(() => setIsTransitioning(false), 300); 
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

  return (
    <SidebarProvider defaultOpen={true}> {/* Manages open/collapsed state */}
      <Sidebar> {/* Sidebar component from ui/sidebar */}
        <SidebarHeader>
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-[hsl(var(--sidebar-active-background))] group-data-[state=expanded]/sidebar:ml-2 group-data-[state=collapsed]/sidebar:justify-center">
            <Building2 className="h-6 w-6 shrink-0" />
            <span className="group-data-[state=expanded]/sidebar:inline group-data-[state=collapsed]/sidebar:hidden">{APP_NAME}</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarNav /> {/* SidebarNav will use SidebarMenu, SidebarMenuItem */}
        </SidebarContent>
        {/* <SidebarFooter>Optional Footer Content</SidebarFooter> */}
      </Sidebar>
      <SidebarInset> {/* Wraps the main content area */}
        <div className={cn("flex flex-col flex-1 transition-all duration-300 ease-in-out print:p-0")}>
          <Header />
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
      </SidebarInset>
    </SidebarProvider>
  );
}
