
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserManagementTab } from "@/components/admin/tabs/UserManagementTab";
import { ContributionManagementTab } from "@/components/admin/tabs/ContributionManagementTab";
import { EmergencyRequestManagementTab } from "@/components/admin/tabs/EmergencyRequestManagementTab";
import { NotificationSenderTab } from "@/components/admin/tabs/NotificationSenderTab";
import { useState, useEffect } from "react";
import { Users, ListChecks, ShieldAlert, BellRing, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext"; 
import { useToast } from "@/hooks/use-toast";
import type { Profile } from "@/types";
import { useAdminPanelStore } from "@/stores/adminPanelStore"; // Import Zustand store

interface AdminPageClientContentProps {
  initialProfile: Profile | null; // Admin's profile passed from server
}

export function AdminPageClientContent({ initialProfile: serverProfile }: AdminPageClientContentProps) {
  const { user: authUser, profile: authContextProfile, isAdmin: authIsAdmin, isLoading: authLoading, isApproved: authIsApproved } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  
  // Use Zustand store for activeTab
  const storeActiveTab = useAdminPanelStore(state => state.activeTab);
  const storeSetInitialTab = useAdminPanelStore(state => state.setInitialTab);
  const storeSetActiveTab = useAdminPanelStore(state => state.setActiveTab);

  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get("tab");

  // Initialize Zustand store with tab from query params once
  useEffect(() => {
    storeSetInitialTab(tabFromQuery || "users");
  }, [storeSetInitialTab, tabFromQuery]);
  
  // Use profile from context once available, fallback to serverProfile
  const currentProfile = authContextProfile || serverProfile;
  const isAdmin = authIsAdmin || (currentProfile?.role === 'admin');
  const isApproved = authIsApproved || (currentProfile?.is_approved);

  useEffect(() => {
    if (!authLoading) { // Only check after auth context is resolved
      if (!authUser || !isApproved) {
        router.replace("/login"); 
        return;
      }
      if (!isAdmin) {
        toast({ title: "Access Denied", description: "You do not have permission to view this page.", variant: "destructive" });
        router.replace("/");
        return;
      }
    }
  }, [authUser, isAdmin, authLoading, isApproved, router, toast]);

  if (authLoading || (!isAdmin && !authLoading && !authUser)) { // Ensure authUser check is also gated by authLoading
    return (
      <div className="flex items-center justify-center h-screen py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Verifying admin access...</p>
      </div>
    );
  }
  
  if (!isAdmin && authUser) { 
     return (
      <div className="flex items-center justify-center h-screen py-10">
        <p className="text-lg text-destructive">Access Denied. You are not an administrator.</p>
      </div>
    );
  }

  const handleTabChange = (value: string) => {
    storeSetActiveTab(value); // Update Zustand store
    router.push(`/admin?tab=${value}`, { scroll: false }); // Update URL
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
