
"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { SidebarNav } from "./SidebarNav";
import { Button } from "@/components/ui/button";
import { Building2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState, useEffect } from "react";

const SIDEBAR_COOKIE_NAME = "sidebar_collapsed_state";

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
        "hidden md:flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className={cn(
          "flex h-16 items-center border-b px-4",
          isCollapsed ? "justify-center" : "justify-between"
        )}>
        <Link href="/" className={cn("flex items-center gap-2 font-bold", isCollapsed && "hidden")}>
          <Building2 className="h-6 w-6 text-sidebar-primary" />
          <span className="text-sidebar-primary-foreground">{APP_NAME}</span>
        </Link>
        {isCollapsed && <Building2 className="h-6 w-6 text-sidebar-primary" />}
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className={cn(
          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
           isCollapsed && "hidden" // Hide when collapsed, toggle will be in header or a floating button
          )}>
          <PanelLeftClose className="h-5 w-5" />
          <span className="sr-only">Toggle Sidebar</span>
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <SidebarNav isCollapsed={isCollapsed} />
      </div>
      {/* Optional Footer */}
      {/* <div className="mt-auto border-t p-4">
        {!isCollapsed && <p className="text-xs text-sidebar-foreground/70">© {new Date().getFullYear()} {APP_NAME}</p>}
      </div> */}
    </aside>
  );
}

// This simplified AppSidebar is for desktop. Mobile sidebar is handled in Header via Sheet.
// The toggle button is inside the sidebar itself for desktop.
// If a global toggle in header is needed for desktop, state management (e.g. Context) would be better.
