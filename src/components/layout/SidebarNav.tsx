
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

export function SidebarNav() {
  const pathname = usePathname();
  const { user, isAdmin, isApproved, isLoading } = useAuth();

  if (isLoading && !user) {
    return (
      <div className="p-2 space-y-1">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 rounded-md bg-sidebar-muted-foreground/20 animate-pulse group-data-[state=expanded]/sidebar:w-full group-data-[state=collapsed]/sidebar:w-8"></div>
        ))}
      </div>
    );
  }

  const filteredNavItems = navItems.filter(item => {
    if (!user) return false; 
    if (item.requiresApproval && !isApproved) return false; 
    if (item.adminOnly && !isAdmin) return false; 
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
                as="a" 
                icon={<IconComponent className={cn(
                  "shrink-0", // Size will be controlled by SidebarMenuButton's internal [&>svg]:size-4
                  isActive 
                    ? "text-[var(--sidebar-active-foreground)]" 
                    : "text-[var(--sidebar-muted-foreground)] group-hover/menu-item:text-[var(--sidebar-accent-foreground)]"
                )} />}
                isActive={isActive}
                tooltip={{ children: item.label, side: "right", align: "center" }} 
                className={cn(
                  "justify-start gap-3 group/menu-item h-10 font-medium",
                   isActive && "bg-[var(--sidebar-active-background)] text-[var(--sidebar-active-foreground)] hover:bg-[var(--sidebar-active-background)] hover:text-[var(--sidebar-active-foreground)]"
                )}
              >
                {item.label}
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
