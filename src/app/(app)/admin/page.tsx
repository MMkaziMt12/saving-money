
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import { ContributionManagement } from "@/components/admin/ContributionManagement";
import { EmergencyRequestManagementTable } from "@/components/admin/EmergencyRequestManagementTable";
import { NotificationSender } from "@/components/admin/NotificationSender";
import type { Profile, MonthlyContribution, EmergencyRequest } from "@/types";
import { useState, useEffect, useCallback } from "react";
import { Users, ListChecks, ShieldAlert, BellRing, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext"; 
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";

export default function AdminPage() {
  const { user, profile, isAdmin, isLoading: authLoading, isApproved } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();

  const [users, setUsers] = useState<Profile[]>([]);
  const [contributions, setContributions] = useState<MonthlyContribution[]>([]);
  const [emergencyRequests, setEmergencyRequests] = useState<EmergencyRequest[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  const fetchAllUsers = useCallback(async () => {
    if (!isAdmin) return;
    setIsDataLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "Error fetching users", description: error.message, variant: "destructive" });
      setUsers([]);
    } else {
      setUsers(data || []);
    }
    setIsDataLoading(false);
  }, [isAdmin, supabase, toast]);

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
      fetchAllUsers();
      // TODO: Fetch other admin data (contributions, emergency requests)
      // For now, setting loading to false for other data if users are fetched
      // setIsDataLoading(false); // This will be handled by individual fetch functions
    }
  }, [user, profile, isAdmin, authLoading, isApproved, router, toast, fetchAllUsers]);


  const handleApproveUser = async (userId: string) => {
    const { error } = await supabase.from('profiles').update({ is_approved: true, updated_at: new Date().toISOString() }).eq('id', userId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_approved: true } : u));
      toast({ title: "Success", description: "User approved." });
    }
  };
  const handleRejectUser = async (userId: string) => {
     const { error } = await supabase.from('profiles').update({ is_approved: false, updated_at: new Date().toISOString() }).eq('id', userId);
     if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
     else {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_approved: false } : u));
        toast({ title: "Success", description: "User unapproved." });
     }
  };
  const handleMakeAdmin = async (userId: string) => {
    const { error } = await supabase.from('profiles').update({ role: 'admin', updated_at: new Date().toISOString() }).eq('id', userId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: 'admin' } : u));
      toast({ title: "Success", description: "User promoted to admin." });
    }
  };
  const handleRevokeAdmin = async (userId: string) => {
    const { error } = await supabase.from('profiles').update({ role: 'user', updated_at: new Date().toISOString() }).eq('id', userId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: 'user' } : u));
      toast({ title: "Success", description: "User demoted from admin." });
    }
  };
  const handleDeleteUser = async (userId: string) => {
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
        setUsers(prev => prev.filter(u => u.id !== userId));
        toast({ title: "Success", description: "User profile deleted." });
    }
  };

  if (authLoading || (!isAdmin && !authLoading)) { // Show loader if auth is loading OR if not admin and auth is done
    return (
      <div className="flex items-center justify-center h-full py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading Admin Panel...</p>
      </div>
    );
  }
  
  if (!isAdmin) { // This check is now more robust after loading state
     return (
      <div className="flex items-center justify-center h-full py-10">
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
              {isDataLoading && users.length === 0 ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="ml-3 text-muted-foreground">Fetching users...</p>
                </div>
              ) : (
                <UserManagementTable 
                  users={users} 
                  onApproveUser={handleApproveUser} 
                  onRejectUser={handleRejectUser}
                  onMakeAdmin={handleMakeAdmin}
                  onRevokeAdmin={handleRevokeAdmin}
                  onDeleteUser={handleDeleteUser}
                />
              )}
            </TabsContent>
            <TabsContent value="contributions">
              {/* TODO: Update ContributionManagement to use Supabase */}
              <ContributionManagement users={users} contributions={contributions} onAddContribution={() => {}} />
            </TabsContent>
            <TabsContent value="emergency_requests">
              {/* TODO: Update EmergencyRequestManagementTable to use Supabase */}
              <EmergencyRequestManagementTable requests={emergencyRequests} users={users} onApproveRequest={() => {}} onRejectRequest={() => {}} />
            </TabsContent>
            <TabsContent value="notifications">
              <NotificationSender users={users} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
    
    