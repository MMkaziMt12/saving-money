
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
import { useAuth } from "@/hooks/useAuth"; // Using the new hook
import { useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, UserCircle, Users, Sun, Moon, Loader2 } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationsDisplay } from "./NotificationsDisplay";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function Header() {
  const { user, profile, signOutUser, isAdmin, isLoadingAuth } = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleLogout = async () => {
    await signOutUser();
    // The onAuthStateChange listener in AuthProvider/authStore will handle redirecting after state clear
    // router.push("/login"); // This might be redundant or cause issues if listener also redirects
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
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
      
      <div className="flex-1">
        {/* Placeholder for potential breadcrumbs or page title */}
      </div>

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
        
        {/* Conditionally render NotificationsDisplay only if user is authenticated and not loading */}
        {!isLoadingAuth && user && <NotificationsDisplay />}
        
        {isLoadingAuth && (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        )}

        {!isLoadingAuth && user && profile ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar className="h-9 w-9 border border-primary/50">
                  <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name || "User"} data-ai-hint={profile.avatar_url ? "person portrait" : "profile placeholder"} />
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
        ) : !isLoadingAuth && !user ? (
          // Optionally show a Login button if not authenticated and auth check is complete
          <Button onClick={() => router.push("/login")} variant="outline">Login</Button>
        ) : null }
      </div>
    </header>
  );
}
