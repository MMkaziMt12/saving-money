
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { ArrowRight, DollarSign, ShieldAlert, Users, BarChart3, Clock, AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { APP_NAME, CURRENCY_SYMBOL, MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants";
import type { MonthlyContribution, EmergencyRequest, Profile } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { StatCard } from "@/components/shared/StatCard";

const supabase = createClient();

// Fetching functions
async function fetchUserContributions(userId: string): Promise<MonthlyContribution[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("monthly_contributions")
    .select("*")
    .eq("user_id", userId)
    .order("payment_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchEmergencyRequests(userId: string | null, isAdmin: boolean): Promise<EmergencyRequest[]> {
  let query = supabase
    .from("emergency_requests")
    .select(`
      *,
      profile_user:profiles!emergency_requests_user_id_fkey(full_name)
    `)
    .order("requested_at", { ascending: false });

  if (!isAdmin && userId) {
    query = query.eq("user_id", userId);
  } else if (!isAdmin && !userId) {
    return []; // Non-admin with no user ID shouldn't fetch all
  }
  // Admins fetch all by not adding a user_id filter

  const { data: rawRequests, error } = await query;
  if (error) throw new Error(error.message);

  return rawRequests?.map(req => ({
      ...req,
      user_name: (req.profile_user as unknown as Profile)?.full_name || req.user_id,
  })) || [];
}

async function fetchTotalFamilySavings(): Promise<number> {
  const { data, error } = await supabase
    .from("monthly_contributions")
    .select("amount");
  
  if (error) throw new Error(error.message);
  return data?.reduce((sum, c) => sum + c.amount, 0) || 0;
}


function PaymentHistoryTable({ contributions, isLoading }: { contributions: MonthlyContribution[] | undefined, isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>My Payment History</CardTitle>
          <CardDescription>Loading your contribution data...</CardDescription>
        </CardHeader>
        <CardContent className="h-48 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    )
  }
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>My Payment History</CardTitle>
        <CardDescription>Overview of your monthly contributions.</CardDescription>
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
            {contributions && contributions.length > 0 ? (
              contributions.map(c => (
                <TableRow key={c.id}>
                  <TableCell>{format(parseISO(c.payment_date), "MMM dd, yyyy")}</TableCell>
                  <TableCell>{format(new Date(c.year, c.month -1), "MMMM yyyy")}</TableCell>
                  <TableCell className="text-right">{CURRENCY_SYMBOL}{c.amount.toLocaleString()}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground h-24">No payments made yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface EmergencyRequestHistoryTableProps {
  requests: EmergencyRequest[] | undefined;
  isLoading: boolean;
  title: string;
  description: string;
  showUserName?: boolean;
}

function EmergencyRequestHistoryTable({ requests, isLoading, title, description, showUserName = false }: EmergencyRequestHistoryTableProps) {
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
      case "pending": return <Clock className="h-4 w-4 text-yellow-500" />; // Updated for consistency
      default: return null;
    }
  }

  if (isLoading) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Loading emergency request data...</CardDescription>
        </CardHeader>
        <CardContent className="h-48 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
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
             {requests && requests.length > 0 ? (
            requests.map(req => (
              <TableRow key={req.id}>
                {showUserName && <TableCell>{req.user_name || req.user_id}</TableCell>}
                <TableCell>{format(parseISO(req.requested_at), "MMM dd, yyyy HH:mm")}</TableCell>
                <TableCell>{CURRENCY_SYMBOL}{req.amount_requested.toLocaleString()}</TableCell>
                <TableCell className="max-w-xs truncate">{req.reason}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={getStatusBadgeVariant(req.status)} className="capitalize flex items-center justify-center gap-1.5 min-w-[110px]"> {/* Ensure badge has enough width */}
                    {getStatusIcon(req.status)}
                    {req.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))) : (
                 <TableRow><TableCell colSpan={showUserName ? 5 : 4} className="text-center text-muted-foreground h-24">No emergency requests found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}


export default function DashboardPage() {
  const { user, profile, isAdmin, isLoading: authLoading } = useAuth();

  const { data: userContributions, isLoading: isLoadingContributions } = useQuery<MonthlyContribution[], Error>({
    queryKey: ["userContributions", user?.id],
    queryFn: () => fetchUserContributions(user!.id),
    enabled: !!user && !isAdmin, // Only fetch for non-admins who are logged in
  });

  const { data: emergencyRequests, isLoading: isLoadingEmergencyRequests } = useQuery<EmergencyRequest[], Error>({
    queryKey: ["emergencyRequests", user?.id, isAdmin],
    queryFn: () => fetchEmergencyRequests(user?.id || null, isAdmin),
    enabled: !!user, // Fetch if user is logged in (logic inside handles admin vs user)
  });

  const { data: totalFamilySavings, isLoading: isLoadingTotalSavings } = useQuery<number, Error>({
    queryKey: ["totalFamilySavings"],
    queryFn: fetchTotalFamilySavings,
  });
  
  if (authLoading || (!profile && !authLoading) ) { // Added check for profile ensures it's loaded too
    return (
      <div className="flex items-center justify-center h-full py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading Dashboard...</p>
      </div>
    );
  }

  if (!user || !profile) { // Should be caught by layout, but as a safeguard
     return (
        <div className="flex items-center justify-center h-full py-10">
          <p>Error: User or profile data not available. Please re-login.</p>
        </div>
     );
  }
  
  const totalPaidByUser = userContributions?.reduce((sum, c) => sum + c.amount, 0) || 0;
  // Use created_at from profile if joined_at is not available or reliable
  const accountCreationDate = profile.created_at ? parseISO(profile.created_at) : new Date();
  const monthsJoined = Math.max(1, Math.floor((Date.now() - accountCreationDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
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
          value={isLoadingContributions && !isAdmin ? "Loading..." : (isAdmin ? "N/A for Admin" : totalPaidByUser) }
          icon={DollarSign}
          description={isAdmin ? "Admin view" : (isLoadingContributions ? "Fetching..." : "You've contributed consistently.")}
          iconClassName="text-green-500"
        />
        <StatCard 
          title="Pending Amount" 
          value={isLoadingContributions && !isAdmin ? "Loading..." : (isAdmin ? "N/A for Admin" : pendingAmount)}
          icon={AlertTriangle}
          description={isAdmin ? "Admin view" : (isLoadingContributions ? "Fetching..." : (pendingAmount > 0 ? `Keep up with your contributions!` : "All caught up!"))}
          iconClassName={pendingAmount > 0 && !isAdmin ? "text-orange-500" : "text-green-500"}
        />
         <StatCard 
          title="Total Family Savings" 
          value={isLoadingTotalSavings ? "Loading..." : (totalFamilySavings ?? 0)}
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
        {!isAdmin && <PaymentHistoryTable contributions={userContributions} isLoading={isLoadingContributions} />}
        <EmergencyRequestHistoryTable 
          requests={emergencyRequests} 
          isLoading={isLoadingEmergencyRequests}
          title={isAdmin ? "All Family Emergency Requests" : "My Emergency Request History"}
          description={isAdmin ? "Track the status of all emergency fund requests." : "Overview of your submitted emergency fund requests."}
          showUserName={isAdmin} 
        />
      </div>
    </div>
  );
}

