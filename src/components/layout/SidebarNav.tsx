
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  LayoutDashboard,
  HandCoins,
  ShieldAlert,
  Users,
  BellRing,
  Settings,
  UserCircle,
} from "lucide-react";
import { useMockAuth } from "@/hooks/use-mock-auth";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  userOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/emergency-request", label: "Emergency Fund", icon: ShieldAlert, userOnly: true },
  { href: "/profile", label: "My Profile", icon: UserCircle },
  { href: "/admin", label: "Admin Panel", icon: Users, adminOnly: true },
  // { href: "/notifications", label: "Notifications", icon: BellRing }, // Example for future
  // { href: "/settings", label: "Settings", icon: Settings }, // Example for future
];

interface SidebarNavProps {
  isCollapsed?: boolean;
  onLinkClick?: () => void; // Optional: callback for when a link is clicked (e.g., to close mobile sidebar)
}

export function SidebarNav({ isCollapsed = false, onLinkClick }: SidebarNavProps) {
  const pathname = usePathname();
  const { isAdmin, isApproved } = useMockAuth();

  const filteredNavItems = navItems.filter(item => {
    if (!isApproved && (item.href !== "/profile")) return false; // Unapproved users only see profile or nothing relevant
    if (item.adminOnly && !isAdmin) return false;
    if (item.userOnly && isAdmin) return false; // Admins might have a different view or access through admin panel
    return true;
  });

  if (!isApproved && filteredNavItems.length === 0) { // If unapproved and no relevant links, show nothing or a message
      return null; 
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
                      variant: isActive ? "default" : "ghost", 
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
                <TooltipContent side="right" className="bg-sidebar-accent text-sidebar-accent-foreground">
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
