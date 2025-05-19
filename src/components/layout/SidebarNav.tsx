
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShieldAlert,
  Users,
  UserCircle,
  Loader2
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth"; // Using the new hook
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
  userOnly?: boolean; 
  requiresApproval?: boolean;
}

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, requiresApproval: true },
  { href: "/emergency-request", label: "Emergency Fund", icon: ShieldAlert, requiresApproval: true },
  { href: "/profile", label: "My Profile", icon: UserCircle }, // Profile page itself doesn't require approval, but editing might
  { href: "/admin", label: "Admin Panel", icon: Users, adminOnly: true, requiresApproval: true },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { user, profile, isAdmin, isApproved, isLoadingAuth } = useAuth();

  // If auth is still loading, or user is not yet determined, show skeleton or minimal UI
  if (isLoadingAuth && !user) {
    return (
      <div className="p-2 space-y-1">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 rounded-md bg-[var(--sidebar-muted-foreground)] opacity-20 animate-pulse group-data-[state=expanded]/sidebar:w-full group-data-[state=collapsed]/sidebar:w-10"></div>
        ))}
      </div>
    );
  }
  
  // If auth check is done, but no user (should be redirected by layout guard, but as a fallback)
  if (!isLoadingAuth && !user) {
    return null; 
  }

  const filteredNavItems = navItems.filter(item => {
    if (!user) return false; // Should not happen if guard works, but defensive
    // If profile is still loading (even if user object exists), isApproved might be false.
    // We rely on isLoadingAuth to gate until profile is likely settled.
    // If profile is explicitly null after loading, isApproved will be false.
    if (item.requiresApproval && !isApproved) return false; 
    if (item.adminOnly && !isAdmin) return false; 
    return true;
  });

  if (filteredNavItems.length === 0 && !isLoadingAuth && user && !isApproved) {
      // User is logged in but not approved, and no nav items are available for them (e.g. if profile was also requiresApproval)
      // This case is mostly handled by the redirect to /awaiting-approval
      // but if they land on a page and sidebar is shown, it will be empty.
      return <div className="p-4 text-xs text-[var(--sidebar-muted-foreground)] group-data-[state=expanded]/sidebar:block group-data-[state=collapsed]/sidebar:hidden">No actions available.</div>;
  }


  return (
    <SidebarMenu>
      {filteredNavItems.map((item) => {
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
                {item.label}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
