
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
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
  requiresApproval?: boolean;
}

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, requiresApproval: true },
  { href: "/emergency-request", label: "Emergency Fund", icon: ShieldAlert, userOnly: false, requiresApproval: true },
  { href: "/profile", label: "My Profile", icon: UserCircle },
  { href: "/admin", label: "Admin Panel", icon: Users, adminOnly: true, requiresApproval: true },
];

interface SidebarNavProps {
  isCollapsed?: boolean;
  onLinkClick?: () => void;
}

export function SidebarNav({ isCollapsed = false, onLinkClick }: SidebarNavProps) {
  const pathname = usePathname();
  const { user, isAdmin, isApproved, isLoading } = useAuth();

  if (isLoading && !user) { // Show placeholders or nothing if auth state is loading
    return (
      <div className={cn("flex flex-col gap-1.5 px-2", isCollapsed ? "items-center" : "items-stretch")}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className={cn(
            "h-10 rounded-md bg-[hsl(var(--sidebar-hover-background))] animate-pulse",
            isCollapsed ? "w-10" : "w-full"
          )}></div>
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
    <TooltipProvider delayDuration={0}>
      <nav className={cn("flex flex-col gap-1.5 px-2", isCollapsed ? "items-center" : "items-stretch")}>
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
                      variant: "ghost",
                      size: isCollapsed ? "icon" : "default"
                    }),
                    "justify-start gap-3 group h-10 font-medium",
                    isActive
                      ? "bg-[var(--sidebar-active-background)] text-[var(--sidebar-active-foreground)] hover:bg-[var(--sidebar-active-background)] hover:text-[var(--sidebar-active-foreground)]"
                      : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-hover-background))] hover:text-[hsl(var(--sidebar-foreground))]",
                    isCollapsed ? "w-10 rounded-md justify-center" : "rounded-md px-3"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <item.icon className={cn(
                      "h-5 w-5 shrink-0 transition-colors",
                      isActive ? "text-[var(--sidebar-active-foreground)]" : "text-[hsl(var(--sidebar-muted-foreground))] group-hover:text-[hsl(var(--sidebar-foreground))]"
                    )} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" className="bg-popover text-popover-foreground border-border ml-1">
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
