
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserManagementTab } from "@/components/admin/tabs/UserManagementTab";
import { ContributionManagementTab } from "@/components/admin/tabs/ContributionManagementTab";
import { EmergencyRequestManagementTab } from "@/components/admin/tabs/EmergencyRequestManagementTab";
import { NotificationSenderTab } from "@/components/admin/tabs/NotificationSenderTab";
import { useState, useEffect } from "react";
import { Users, ListChecks, ShieldAlert, BellRing, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext"; 
import { useToast } from "@/hooks/use-toast";

export default function AdminPage() {
  const { user, profile, isAdmin, isLoading: authLoading, isApproved } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading) {
      if (!user || !isApproved) {
        router.replace("/login"); 
        return;
      }
      if (!isAdmin) {
        toast({ title: "Access Denied", description: "You do not have permission to view this page.", variant: "destructive" });
        router.replace("/");
        return;
      }
    }
  }, [user, profile, isAdmin, authLoading, isApproved, router, toast]);


  if (authLoading || (!isAdmin && !authLoading)) {
    return (
      <div className="flex items-center justify-center h-screen py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading Admin Panel...</p>
      </div>
    );
  }
  
  if (!isAdmin && user) { 
     return (
      <div className="flex items-center justify-center h-screen py-10">
        <p className="text-lg text-destructive">Access Denied. You are not an administrator.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-0">
      <Card className="shadow-xl">
        <CardHeader className="border-b">
          <CardTitle className="text-3xl font-bold">Admin Panel</CardTitle>
          <CardDescription>Manage users, contributions, emergency requests, and notifications.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Tabs defaultValue="users" className="w-full">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-6">
              <TabsTrigger value="users"><Users className="mr-2 h-4 w-4 inline-block" />Users</TabsTrigger>
              <TabsTrigger value="contributions"><ListChecks className="mr-2 h-4 w-4 inline-block" />Contributions</TabsTrigger>
              <TabsTrigger value="emergency_requests"><ShieldAlert className="mr-2 h-4 w-4 inline-block" />Emergency Requests</TabsTrigger>
              <TabsTrigger value="notifications"><BellRing className="mr-2 h-4 w-4 inline-block" />Notifications</TabsTrigger>
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
    
    
