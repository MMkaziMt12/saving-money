
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShieldAlert,
  Users,
  UserCircle,
  ListChecks, // For Contributions
  BellRing,   // For Notifications
  History     // Or other icon for Emergency Requests
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth"; 
import { 
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton,
} from "@/components/ui/sidebar";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  requiresApproval?: boolean;
}

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, requiresApproval: true },
  { href: "/emergency-request", label: "Request Fund", icon: ShieldAlert, requiresApproval: true },
  { href: "/profile", label: "My Profile", icon: UserCircle },
];

const adminNavItems: NavItem[] = [
  { href: "/admin/users", label: "Manage Users", icon: Users, adminOnly: true, requiresApproval: true },
  { href: "/admin/contributions", label: "Manage Contributions", icon: ListChecks, adminOnly: true, requiresApproval: true },
  { href: "/admin/emergency-requests", label: "Manage Requests", icon: History, adminOnly: true, requiresApproval: true },
  { href: "/admin/notifications", label: "Send Notifications", icon: BellRing, adminOnly: true, requiresApproval: true },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { user, profile, isAdmin, isApproved, isLoadingAuth } = useAuth();

  if (isLoadingAuth && !user) {
    return (
      <div className="p-2 space-y-1">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 rounded-md bg-[var(--sidebar-muted-foreground)] opacity-20 animate-pulse group-data-[state=expanded]/sidebar:w-full group-data-[state=collapsed]/sidebar:w-10"></div>
        ))}
      </div>
    );
  }
  
  if (!isLoadingAuth && !user) {
    return null; 
  }

  let itemsToDisplay = navItems.filter(item => {
    if (!user) return false;
    if (item.requiresApproval && !isApproved) return false; 
    // AdminOnly check is handled by concatenating adminNavItems if isAdmin
    return !item.adminOnly; 
  });

  if (isAdmin && isApproved) {
    itemsToDisplay = itemsToDisplay.concat(adminNavItems);
  }
  
  if (itemsToDisplay.length === 0 && !isLoadingAuth && user && !isApproved) {
      return <div className="p-4 text-xs text-[var(--sidebar-muted-foreground)] group-data-[state=expanded]/sidebar:block group-data-[state=collapsed]/sidebar:hidden">No actions available.</div>;
  }

  return (
    <SidebarMenu>
      {itemsToDisplay.map((item) => {
        const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
        const IconComponent = item.icon;

        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              tooltip={{ children: item.label, side: "right", align: "center" }}
              className={cn(
                "justify-start gap-3 group/menu-item h-10 font-medium"
              )}
            >
              <Link href={item.href}>
                <IconComponent
                  className={cn(
                    "h-5 w-5 shrink-0",
                    isActive
                      ? "text-[var(--sidebar-active-foreground)]"
                      : "text-[var(--sidebar-muted-foreground)] group-hover/menu-item:text-[var(--sidebar-hover-foreground)]"
                  )}
                />
                <span className="group-data-[state=expanded]/sidebar:inline group-data-[state=collapsed]/sidebar:hidden">
                    {item.label}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
