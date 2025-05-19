
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserManagementTab } from "@/components/admin/tabs/UserManagementTab";
import { ContributionManagementTab } from "@/components/admin/tabs/ContributionManagementTab";
import { EmergencyRequestManagementTab } from "@/components/admin/tabs/EmergencyRequestManagementTab";
import { NotificationSenderTab } from "@/components/admin/tabs/NotificationSenderTab";
import { useEffect } from "react";
import { Users, ListChecks, ShieldAlert, BellRing, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import type { Profile } from "@/types";
import { useAdminPanelStore } from "@/stores/adminPanelStore"; 
import { useAuth } from "@/hooks/useAuth"; // Using the new hook

interface AdminPageClientContentProps {
  initialProfile: Profile | null; // Admin's profile passed from server
  // initialTab: string; // Passed from server
}

export function AdminPageClientContent({ initialProfile: serverProfile }: AdminPageClientContentProps) {
  const { user: authUserFromHook, profile: authProfileFromHook, isAdmin, isLoadingAuth, isApproved } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  
  const storeActiveTab = useAdminPanelStore(state => state.activeTab);
  const storeSetInitialTab = useAdminPanelStore(state => state.setInitialTab); // Use the action to set initial tab
  const storeSetActiveTab = useAdminPanelStore(state => state.setActiveTab);

  const searchParams = useSearchParams(); // Use on client-side
  const tabFromQuery = searchParams.get("tab");

  useEffect(() => {
    // Set initial tab from query params once client-side searchParams are available
    storeSetInitialTab(tabFromQuery || "users");
  }, [storeSetInitialTab, tabFromQuery]);
  
  // Prioritize live auth profile from hook, fallback to server-passed if auth is loading
  const currentAdminProfile = !isLoadingAuth && authProfileFromHook ? authProfileFromHook : serverProfile;

  // The isAdmin and isApproved from useAuth hook are derived from the context state,
  // which should be updated based on server-passed initialProfile and subsequent client-side fetches.

  useEffect(() => {
    // This effect runs on the client after AuthProvider has initialized
    if (!isLoadingAuth) { // Only run checks once auth state is determined
      if (!authUserFromHook || !currentAdminProfile) { // User not logged in or admin profile not available
        toast({ title: "Access Denied", description: "You must be logged in as an admin.", variant: "destructive" });
        router.replace("/login"); 
        return;
      }
      if (!currentAdminProfile.is_approved) {
        toast({ title: "Access Denied", description: "Your admin account is not yet approved.", variant: "destructive" });
        router.replace("/awaiting-approval");
        return;
      }
      if (currentAdminProfile.role !== 'admin') { // Also checking role from potentially server-passed profile initially
        toast({ title: "Access Denied", description: "You do not have permission to view this page.", variant: "destructive" });
        router.replace("/");
        return;
      }
    }
  }, [authUserFromHook, currentAdminProfile, isLoadingAuth, router, toast]); // Added currentAdminProfile

  // If auth is loading, or if it's done loading but critical admin profile is missing, show loader.
  // The SSR part (AdminPageSSR) should have already done a preliminary redirect if absolutely no auth user.
  if (isLoadingAuth || (!isLoadingAuth && (!currentAdminProfile || currentAdminProfile.role !== 'admin'))) { 
    return (
      <div className="flex items-center justify-center h-screen py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Verifying admin access...</p>
      </div>
    );
  }
  
  const handleTabChange = (value: string) => {
    storeSetActiveTab(value); 
    router.push(`/admin?tab=${value}`, { scroll: false }); 
  };

  return (
    <div className="container mx-auto py-8 px-0">
      <Card className="shadow-xl">
        <CardHeader className="border-b">
          <CardTitle className="text-3xl font-bold">Admin Panel</CardTitle>
          <CardDescription>Manage users, contributions, emergency requests, and notifications.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Tabs value={storeActiveTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-6">
              <TabsTrigger value="users"><Users className="mr-1 md:mr-2 h-4 w-4 inline-block" />Users</TabsTrigger>
              <TabsTrigger value="contributions"><ListChecks className="mr-1 md:mr-2 h-4 w-4 inline-block" />Contributions</TabsTrigger>
              <TabsTrigger value="emergency_requests"><ShieldAlert className="mr-1 md:mr-2 h-4 w-4 inline-block" />Emergency Requests</TabsTrigger>
              <TabsTrigger value="notifications"><BellRing className="mr-1 md:mr-2 h-4 w-4 inline-block" />Notifications</TabsTrigger>
            </TabsList>
            
            <TabsContent value="users">
              <UserManagementTab />
            </TabsContent>
            <TabsContent value="contributions">
              <ContributionManagementTab />
            </TabsContent>
            <TabsContent value="emergency_requests">
              <EmergencyRequestManagementTab />
            </TabsContent>
            <TabsContent value="notifications">
              <NotificationSenderTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
