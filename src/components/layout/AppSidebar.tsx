
"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { SidebarNav } from "./SidebarNav";
import { Building2 } from "lucide-react";

interface AppSidebarProps {
  isCollapsed: boolean;
}

export function AppSidebar({ isCollapsed }: AppSidebarProps) {
  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))] transition-all duration-300 ease-in-out shadow-md print:hidden",
        isCollapsed ? "w-16" : "w-60" // Updated widths
      )}
    >
      <div className={cn(
          "flex h-16 items-center border-b border-[hsl(var(--sidebar-border))] px-4",
          isCollapsed ? "justify-center" : "justify-start" // Keep logo/name left-aligned when expanded
        )}>
        <Link href="/" className={cn(
            "flex items-center gap-2 font-bold text-lg",
            "text-[hsl(var(--sidebar-active-background))]" 
          )}>
          <Building2 className={cn("transition-all", isCollapsed ? "h-7 w-7" : "h-6 w-6")} />
          {!isCollapsed && <span>{APP_NAME}</span>}
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <SidebarNav isCollapsed={isCollapsed} />
      </div>
    </aside>
  );
}
