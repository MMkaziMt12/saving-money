
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import { ContributionManagement } from "@/components/admin/ContributionManagement";
import { EmergencyRequestManagementTable } from "@/components/admin/EmergencyRequestManagementTable";
import { NotificationSender } from "@/components/admin/NotificationSender";
import type { Profile, MonthlyContribution, EmergencyRequest } from "@/types";
import { useState, useEffect } from "react";
import { Users, ListChecks, ShieldAlert, BellRing, Loader2 } from "lucide-react";

// Mock data - in a real app, this would be fetched
const MOCK_USERS: Profile[] = [
  { id: "user1", full_name: "Amit Patel", email: "amit@example.com", phone: "1234567890", role: "user", is_approved: true, joined_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(), avatar_url: "https://picsum.photos/seed/amit/100/100" },
  { id: "user2", full_name: "Priya Singh", email: "priya@example.com", phone: "0987654321", role: "user", is_approved: false, joined_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(), avatar_url: "https://picsum.photos/seed/priya/100/100" },
  { id: "user-approved-id", full_name: "Sonia Sharma", email: "sonia.sharma@example.com", phone: "0987654321", role: "user", is_approved: true, joined_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(), avatar_url: "https://picsum.photos/seed/soniaSharma/100/100", },
  { id: "admin-id", full_name: "Admin Manager", email: "admin@example.com", phone: "1122334455", role: "admin", is_approved: true, joined_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString(), avatar_url: "https://picsum.photos/seed/adminManager/100/100", },
];

const MOCK_CONTRIBUTIONS: MonthlyContribution[] = [
  { id: "c1", user_id: "user1", user_name: "Amit Patel", amount: 200, payment_date: new Date(Date.now() - 1000*60*60*24*5).toISOString(), month: new Date().getMonth(), year: new Date().getFullYear(), recorded_by_admin_id: "admin-id", recorded_by_admin_name: "Admin Manager" },
  { id: "c2", user_id: "user-approved-id", user_name: "Sonia Sharma", amount: 200, payment_date: new Date(Date.now() - 1000*60*60*24*35).toISOString(), month: new Date().getMonth() -1, year: new Date().getFullYear(), recorded_by_admin_name: "Sonia Sharma" },
];

const MOCK_EMERGENCY_REQUESTS: EmergencyRequest[] = [
  { id: "e1", user_id: "user1", user_name: "Amit Patel", amount_requested: 5000, reason: "Urgent medical expense for a family member, hospital bills are piling up.", status: "pending", requested_at: new Date(Date.now() - 1000*60*60*24*2).toISOString() },
  { id: "e2", user_id: "user-approved-id", user_name: "Sonia Sharma", amount_requested: 1000, reason: "Essential bike repair for commute to work.", status: "approved", requested_at: new Date(Date.now() - 1000*60*60*24*10).toISOString(), reviewed_by_admin_id: "admin-id", reviewed_by_admin_name: "Admin Manager", reviewed_at: new Date(Date.now() - 1000*60*60*24*8).toISOString() },
  { id: "e3", user_id: "user1", user_name: "Amit Patel", amount_requested: 2500, reason: "Unexpected urgent travel requirement due to family emergency.", status: "rejected", requested_at: new Date(Date.now() - 1000*60*60*24*15).toISOString(), reviewed_by_admin_id: "admin-id", reviewed_by_admin_name: "Admin Manager", reviewed_at: new Date(Date.now() - 1000*60*60*24*12).toISOString() },
];


export default function AdminPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [contributions, setContributions] = useState<MonthlyContribution[]>([]);
  const [emergencyRequests, setEmergencyRequests] = useState<EmergencyRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate data fetching
    setTimeout(() => {
      setUsers(MOCK_USERS);
      setContributions(MOCK_CONTRIBUTIONS);
      setEmergencyRequests(MOCK_EMERGENCY_REQUESTS);
      setIsLoading(false);
    }, 500);
  }, []);

  const handleApproveUser = (userId: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_approved: true } : u));
  };
  const handleRejectUser = (userId: string) => {
     setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_approved: false } : u));
  };
   const handleMakeAdmin = (userId: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: 'admin' } : u));
  };
  const handleRevokeAdmin = (userId: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: 'user' } : u));
  };
   const handleDeleteUser = (userId: string) => {
    setUsers(prev => prev.filter(u => u.id !== userId));
    // Also remove their contributions and requests for mock consistency
    setContributions(prev => prev.filter(c => c.user_id !== userId));
    setEmergencyRequests(prev => prev.filter(er => er.user_id !== userId));
  };


  const handleAddContribution = (data: any) => { // Type should be AddContributionFormValues
    const newContribution: MonthlyContribution = {
      id: `c${contributions.length + 1}`,
      user_id: data.userId,
      user_name: users.find(u => u.id === data.userId)?.full_name,
      amount: data.amount,
      payment_date: data.paymentDate.toISOString(),
      month: data.month,
      year: data.year,
      recorded_by_admin_id: "admin-id", // Logged in admin
      recorded_by_admin_name: "Admin Manager",
    };
    setContributions(prev => [newContribution, ...prev]);
  };

  const handleApproveRequest = (requestId: string) => {
    setEmergencyRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: "approved", reviewed_at: new Date().toISOString(), reviewed_by_admin_id: "admin-id", reviewed_by_admin_name: "Admin Manager" } : r));
  };
  const handleRejectRequest = (requestId: string) => {
    setEmergencyRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by_admin_id: "admin-id", reviewed_by_admin_name: "Admin Manager" } : r));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading Admin Panel...</p>
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
              <UserManagementTable 
                users={users} 
                onApproveUser={handleApproveUser} 
                onRejectUser={handleRejectUser}
                onMakeAdmin={handleMakeAdmin}
                onRevokeAdmin={handleRevokeAdmin}
                onDeleteUser={handleDeleteUser}
              />
            </TabsContent>
            <TabsContent value="contributions">
              <ContributionManagement users={users} contributions={contributions} onAddContribution={handleAddContribution} />
            </TabsContent>
            <TabsContent value="emergency_requests">
              <EmergencyRequestManagementTable requests={emergencyRequests} users={users} onApproveRequest={handleApproveRequest} onRejectRequest={handleRejectRequest} />
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
