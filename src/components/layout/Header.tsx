
"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APP_NAME } from "@/lib/constants";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Building2, LayoutDashboard, LogOut, Menu, UserCircle, Users, Sun, Moon } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet"; // Added SheetClose
import { SidebarNav } from "./SidebarNav";
import { NotificationsDisplay } from "./NotificationsDisplay";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface HeaderProps {
  onMenuClick?: React.MouseEventHandler<HTMLButtonElement>;
  isMobile?: boolean;
}

export function Header({ onMenuClick, isMobile }: HeaderProps) {
  const { user, profile, signOut, isAdmin } = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false); // Control sheet open state

  useEffect(() => setMounted(true), []);

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  const getInitials = (name: string | undefined | null): string => {
    if (!name) return "U";
    const names = name.split(" ");
    if (names.length === 1) return names[0][0]?.toUpperCase() || "U";
    return (names[0][0]?.toUpperCase() || "") + (names[names.length - 1][0]?.toUpperCase() || "");
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6 print:hidden">
      {isMobile ? (
         <Sheet open={isMobileSheetOpen} onOpenChange={setIsMobileSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0 md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle navigation menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col p-0 pt-4 bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))] w-[260px]">
            <Link href="/" className="mb-4 flex items-center gap-2 px-4 text-lg font-semibold text-[hsl(var(--sidebar-active-background))]">
              <Building2 className="h-6 w-6" />
              <span>{APP_NAME}</span>
            </Link>
            <SidebarNav isCollapsed={false} onLinkClick={() => setIsMobileSheetOpen(false)} />
          </SheetContent>
        </Sheet>
      ) : (
        onMenuClick && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex text-muted-foreground hover:text-foreground"
            onClick={onMenuClick}
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )
      )}

      {!isMobile && (
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold md:text-base mr-auto">
           {/* Removed App Name / Logo from here as it's in the AppSidebar */}
        </Link>
      )}
      
      {isMobile && ( // Show App Name in header for mobile view if sidebar is closed
          <div className="flex items-center gap-2 text-lg font-semibold mr-auto md:hidden">
             <Building2 className="h-6 w-6 text-primary" />
             <span>{APP_NAME}</span>
          </div>
      )}


      <div className="ml-auto flex items-center gap-1 md:gap-2">
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="text-muted-foreground hover:text-foreground"
          >
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </Button>
        )}
        {user && <NotificationsDisplay />}
        {user && profile ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar className="h-9 w-9 border border-primary/50">
                  <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name || "User"} data-ai-hint="person portrait" />
                  <AvatarFallback>{getInitials(profile.full_name)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{profile.full_name || "User"}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/")}>
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>Dashboard</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/profile")}>
                <UserCircle className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem onClick={() => router.push("/admin")}>
                  <Users className="mr-2 h-4 w-4" />
                  <span>Admin Panel</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
           !isMobile && <Button onClick={() => router.push("/login")}>Login</Button> // Hide login button on mobile if user not loaded, covered by guards
        )}
      </div>
    </header>
  );
}
