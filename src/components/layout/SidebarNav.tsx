"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  LayoutDashboard,
  ShieldAlert,
  Users,
  UserCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  userOnly?: boolean;
  requiresApproval?: boolean; // New flag
}

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, requiresApproval: true },
  { href: "/emergency-request", label: "Emergency Fund", icon: ShieldAlert, userOnly: true, requiresApproval: true },
  { href: "/profile", label: "My Profile", icon: UserCircle }, // Profile always visible if logged in
  { href: "/admin", label: "Admin Panel", icon: Users, adminOnly: true, requiresApproval: true },
];

interface SidebarNavProps {
  isCollapsed?: boolean;
  onLinkClick?: () => void; 
}

export function SidebarNav({ isCollapsed = false, onLinkClick }: SidebarNavProps) {
  const pathname = usePathname();
  const { user, isAdmin, isApproved, isLoading } = useAuth();

  // Wait for auth state to be loaded
  if (isLoading) {
    // Optionally return a loading skeleton for nav items
    return null; 
  }
  
  const filteredNavItems = navItems.filter(item => {
    if (!user) return false; // Must be logged in for any nav items
    if (item.requiresApproval && !isApproved) return false; // Needs approval but not approved
    if (item.adminOnly && !isAdmin) return false;
    if (item.userOnly && isAdmin) return false; 
    return true;
  });
  
  if (filteredNavItems.length === 0 && !isApproved && user) { 
      // If user is logged in, not approved, and no items are visible (e.g. only profile might be)
      // It's often better to let the (app)/layout handle redirection to /awaiting-approval
      // So, an empty nav here is fine. Profile link should still be evaluated by the filter.
  }


  return (
    <TooltipProvider delayDuration={0}>
      <nav className={cn("flex flex-col gap-1 px-2", isCollapsed ? "items-center" : "items-stretch")}>
        {filteredNavItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  onClick={onLinkClick}
                  className={cn(
                    buttonVariants({ 
                      variant: isActive ? "default" : "ghost", // Use ghost for sidebar items
                      size: isCollapsed ? "icon" : "default" 
                    }),
                    "justify-start gap-2 group",
                    isActive 
                      ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90" 
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isCollapsed ? "h-10 w-10" : "h-10"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground group-hover:text-sidebar-accent-foreground")} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" className="bg-sidebar text-sidebar-accent-foreground border-sidebar-border">
                  {item.label}
                </TooltipContent>
              )}
            </Tooltip>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}
