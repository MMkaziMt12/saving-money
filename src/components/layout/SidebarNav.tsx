
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShieldAlert,
  Users,
  UserCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { 
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton,
  // useSidebar // Not strictly needed if SidebarMenuButton handles collapsed state rendering
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
  { href: "/emergency-request", label: "Emergency Fund", icon: ShieldAlert, userOnly: false, requiresApproval: true },
  { href: "/profile", label: "My Profile", icon: UserCircle },
  { href: "/admin", label: "Admin Panel", icon: Users, adminOnly: true, requiresApproval: true },
];

// Removed isCollapsed prop as SidebarMenuButton will use context from ui/sidebar
// Removed onLinkClick prop as SidebarMenuButton from ui/sidebar should handle mobile sheet closing
export function SidebarNav() {
  const pathname = usePathname();
  const { user, isAdmin, isApproved, isLoading } = useAuth();
  // const { state } = useSidebar(); // from @/components/ui/sidebar
  // const isUiSidebarCollapsed = state === 'collapsed';

  if (isLoading && !user) {
    // Placeholder for loading state, can be expanded
    return (
      <div className="p-2 space-y-1">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 rounded-md bg-sidebar-muted-foreground/20 animate-pulse group-data-[state=expanded]/sidebar:w-full group-data-[state=collapsed]/sidebar:w-8"></div>
        ))}
      </div>
    );
  }

  const filteredNavItems = navItems.filter(item => {
    if (!user) return false; // Must be logged in
    if (item.requiresApproval && !isApproved) return false; // Must be approved if item requires it
    if (item.adminOnly && !isAdmin) return false; // Must be admin if item is admin only
    // item.userOnly is not strictly enforced here, more of a hint
    return true;
  });

  return (
    <SidebarMenu>
      {filteredNavItems.map((item) => {
        const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
        const IconComponent = item.icon;

        return (
          <SidebarMenuItem key={item.href}>
            <Link href={item.href} passHref legacyBehavior>
              <SidebarMenuButton
                as="a" // Render as an anchor tag due to Link with legacyBehavior
                icon={<IconComponent className={cn(
                  "h-5 w-5 shrink-0", // Default icon classes
                  isActive ? "text-[var(--sidebar-active-foreground)]" : "text-[var(--sidebar-muted-foreground)] group-hover/menu-item:text-[var(--sidebar-foreground)]"
                )} />}
                isActive={isActive}
                tooltip={{ children: item.label, side: "right", align: "center" }} // Tooltip for collapsed state
                className={cn(
                  "justify-start gap-3 group/menu-item h-10 font-medium",
                  // Active styles are primarily handled by data-[active=true] in ui/sidebar's buttonVariants
                  // but we can add more specific overrides if needed
                   isActive && "bg-[var(--sidebar-active-background)] text-[var(--sidebar-active-foreground)] hover:bg-[var(--sidebar-active-background)] hover:text-[var(--sidebar-active-foreground)]"
                )}
              >
                {/* Label is the child for SidebarMenuButton, it handles collapsed/expanded display */}
                {item.label}
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
