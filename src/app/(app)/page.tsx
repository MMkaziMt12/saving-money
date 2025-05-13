"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext"; // Use new AuthContext
import Link from "next/link";
import { ArrowRight, DollarSign, ShieldAlert, Users, BarChart3, Clock, AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { APP_NAME, CURRENCY_SYMBOL, MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants";
import type { MonthlyContribution, EmergencyRequest, Profile } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { useState, useEffect } from "react";
// TODO: Import Supabase client and React Query for data fetching

// Placeholder: Data will be fetched from Supabase
const MOCK_TOTAL_FAMILY_SAVINGS = 0; // Example total, to be replaced

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  actionLink?: string;
  actionText?: string;
  color?: string;
}

function StatCard({ title, value, icon: Icon, description, actionLink, actionText, color = "text-primary" }: StatCardProps) {
  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-5 w-5 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{typeof value === 'number' && (title.toLowerCase().includes('amount') || title.toLowerCase().includes('savings') || title.toLowerCase().includes('balance')) ? `${CURRENCY_SYMBOL}${value.toLocaleString()}` : value}</div>
        {description && <p className="text-xs text-muted-foreground pt-1">{description}</p>}
        {actionLink && actionText && (
          <Button asChild variant="link" className="px-0 pt-2 text-sm">
            <Link href={actionLink}>{actionText} <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentHistoryTable({ contributions }: { contributions: MonthlyContribution[] }) {
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>My Payment History</CardTitle>
        <CardDescription>Overview of your monthly contributions. (Data from Supabase)</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Month/Year</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contributions.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground h-24">No payments made yet. Fetching...</TableCell></TableRow>
            ) : (
              contributions.map(c => (
                <TableRow key={c.id}>
                  <TableCell>{format(parseISO(c.payment_date), "MMM dd, yyyy")}</TableCell>
                  <TableCell>{format(new Date(c.year, c.month -1), "MMMM yyyy")}</TableCell>
                  <TableCell className="text-right">{CURRENCY_SYMBOL}{c.amount.toLocaleString()}</TableCell>
                </TableRow>
              )))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface EmergencyRequestHistoryTableProps {
  requests: EmergencyRequest[];
  title: string;
  description: string;
  showUserName?: boolean;
}

function EmergencyRequestHistoryTable({ requests, title, description, showUserName = false }: EmergencyRequestHistoryTableProps) {
    const getStatusBadgeVariant = (status: EmergencyRequest["status"]) => {
    switch (status) {
      case "approved": return "success"; 
      case "rejected": return "destructive";
      case "pending": return "secondary";
      default: return "outline";
    }
  };
  
  const getStatusIcon = (status: EmergencyRequest["status"]) => {
    switch (status) {
      case "approved": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "rejected": return <XCircle className="h-4 w-4 text-red-500" />;
      case "pending": return <Clock className="h-4 w-4 text-yellow-500" />;
      default: return null;
    }
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description} (Data from Supabase)</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {showUserName && <TableHead>Requested By</TableHead>}
              <TableHead>Requested At</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
             {requests.length === 0 ? (
              <TableRow><TableCell colSpan={showUserName ? 5 : 4} className="text-center text-muted-foreground h-24">No emergency requests found. Fetching...</TableCell></TableRow>
            ) : (
            requests.map(req => (
              <TableRow key={req.id}>
                {showUserName && <TableCell>{req.user_name || req.user_id /* Fallback to ID if name not populated */}</TableCell>}
                <TableCell>{format(parseISO(req.requested_at), "MMM dd, yyyy HH:mm")}</TableCell>
                <TableCell>{CURRENCY_SYMBOL}{req.amount_requested.toLocaleString()}</TableCell>
                <TableCell className="max-w-xs truncate">{req.reason}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={getStatusBadgeVariant(req.status)} className="capitalize flex items-center justify-center gap-1.5 w-28">
                    {getStatusIcon(req.status)}
                    {req.status}
                  </Badge>
                </TableCell>
              </TableRow>
            )))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}


export default function DashboardPage() {
  const { user, profile, isAdmin, isLoading: authLoading } = useAuth();
  const [userContributions, setUserContributions] = useState<MonthlyContribution[]>([]);
  const [allEmergencyRequests, setAllEmergencyRequests] = useState<EmergencyRequest[]>([]);
  const [totalFamilySavings, setTotalFamilySavings] = useState<number>(MOCK_TOTAL_FAMILY_SAVINGS);
  const [isDataLoading, setIsDataLoading] = useState(true);

  // TODO: Implement actual data fetching from Supabase using React Query
  useEffect(() => {
    if (!authLoading && user && profile) {
      // Simulate data fetching
      setTimeout(() => {
        // Replace with actual Supabase calls
        // e.g., fetchUserContributions(user.id).then(setUserContributions);
        // fetchAllEmergencyRequests().then(setAllEmergencyRequests);
        // fetchTotalFamilySavings().then(setTotalFamilySavings);
        setIsDataLoading(false);
      }, 1000);
    }
  }, [authLoading, user, profile]);
  
  if (authLoading || isDataLoading) {
    return (
      <div className="flex items-center justify-center h-full py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading Dashboard...</p>
      </div>
    );
  }

  if (!user || !profile) {
     return <p>Error: User or profile data not available.</p>; // Should be handled by layout
  }
  
  const totalPaidByUser = userContributions.reduce((sum, c) => sum + c.amount, 0);
  const joinedAtDate = profile.joined_at ? parseISO(profile.joined_at) : new Date();
  const monthsJoined = Math.max(1, Math.floor((Date.now() - joinedAtDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
  const totalExpected = monthsJoined * MONTHLY_CONTRIBUTION_AMOUNT;
  const pendingAmount = Math.max(0, totalExpected - totalPaidByUser);

  return (
    <div className="container mx-auto py-8 px-4 md:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Welcome to {APP_NAME}, {profile.full_name || user.email}!</h1>
        <p className="text-muted-foreground">Here&apos;s your family savings overview.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <StatCard 
          title="My Total Contributions" 
          value={totalPaidByUser} 
          icon={DollarSign}
          description={`You've contributed consistently.`}
          color="text-green-500"
        />
        <StatCard 
          title="Pending Amount" 
          value={pendingAmount}
          icon={AlertTriangle}
          description={pendingAmount > 0 ? `Keep up with your contributions!` : "All caught up!"}
          color={pendingAmount > 0 ? "text-orange-500" : "text-green-500"}
        />
         <StatCard 
          title="Total Family Savings" 
          value={totalFamilySavings}
          icon={BarChart3}
          description="Combined savings of all family members."
        />
      </div>
      
      {!isAdmin && (
        <div className="mb-8">
          <Button asChild size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground shadow-md">
            <Link href="/emergency-request">
              <ShieldAlert className="mr-2 h-5 w-5" /> Request Emergency Fund
            </Link>
          </Button>
        </div>
      )}
      
      {isAdmin && (
        <div className="mb-8">
           <Button asChild size="lg" className="ml-0 shadow-md">
            <Link href="/admin">
              <Users className="mr-2 h-5 w-5" /> Go to Admin Panel
            </Link>
          </Button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-1">
        {!isAdmin && <PaymentHistoryTable contributions={userContributions} />}
        <EmergencyRequestHistoryTable 
          requests={allEmergencyRequests} 
          title={isAdmin ? "All Family Emergency Requests" : "Family Emergency Request History"}
          description={isAdmin ? "Track the status of all emergency fund requests." : "Overview of all submitted emergency fund requests in the family."}
          showUserName={true} 
        />
      </div>
    </div>
  );
}
