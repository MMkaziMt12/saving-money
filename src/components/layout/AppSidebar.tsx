
"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { SidebarNav } from "./SidebarNav";
import { Button } from "@/components/ui/button";
import { Building2, PanelLeftClose } from "lucide-react";
import { useState, useEffect } from "react";

const SIDEBAR_COOKIE_NAME = "desktop_sidebar_collapsed_state"; // Use a more specific name

export function AppSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const storedState = localStorage.getItem(SIDEBAR_COOKIE_NAME);
    if (storedState !== null) {
      setIsCollapsed(JSON.parse(storedState));
    }
  }, []);

  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem(SIDEBAR_COOKIE_NAME, JSON.stringify(newState));
  };

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))] transition-all duration-300 ease-in-out shadow-md",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className={cn(
          "flex h-16 items-center border-b border-[hsl(var(--sidebar-border))] px-4",
          isCollapsed ? "justify-center" : "justify-between"
        )}>
        <Link href="/" className={cn(
            "flex items-center gap-2 font-bold text-lg",
            isCollapsed && "hidden",
            "text-[hsl(var(--sidebar-active-background))]" // Use primary color for app name
          )}>
          <Building2 className="h-6 w-6" />
          <span>{APP_NAME}</span>
        </Link>
        {isCollapsed && <Building2 className="h-7 w-7 text-[hsl(var(--sidebar-active-background))]" />} {/* Slightly larger icon when collapsed */}
        
        {!isCollapsed && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleSidebar} 
            className={cn(
              "text-[hsl(var(--sidebar-muted-foreground))] hover:bg-[hsl(var(--sidebar-hover-background))] hover:text-[hsl(var(--sidebar-foreground))]"
            )}
            aria-label="Toggle sidebar"
          >
            <PanelLeftClose className="h-5 w-5" />
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <SidebarNav isCollapsed={isCollapsed} />
      </div>
    </aside>
  );
}
