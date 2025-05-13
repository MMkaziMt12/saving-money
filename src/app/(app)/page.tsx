
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMockAuth } from "@/hooks/use-mock-auth";
import Link from "next/link";
import { ArrowRight, DollarSign, ShieldAlert, Users, BarChart3, Clock, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { APP_NAME, CURRENCY_SYMBOL, MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants";
import type { MonthlyContribution, EmergencyRequest, Profile } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";

// Mock Data
const MOCK_CONTRIBUTIONS: MonthlyContribution[] = [
  { id: "c1", user_id: "user-approved-id", amount: 200, payment_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(), month: new Date().getMonth(), year: new Date().getFullYear() },
  { id: "c2", user_id: "user-approved-id", amount: 200, payment_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 35).toISOString(), month: new Date().getMonth() -1, year: new Date().getFullYear() },
];

const MOCK_EMERGENCY_REQUESTS: EmergencyRequest[] = [
  { id: "e1", user_id: "user-approved-id", amount_requested: 5000, reason: "Urgent medical expense", status: "pending", requested_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString() },
  { id: "e2", user_id: "user-approved-id", amount_requested: 1000, reason: "Bike repair", status: "approved", requested_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(), reviewed_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8).toISOString(), reviewed_by_admin_id: "admin-id" },
];

const MOCK_TOTAL_FAMILY_SAVINGS = 15200; // Example total

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
        <div className="text-3xl font-bold">{typeof value === 'number' && title.toLowerCase().includes('amount') ? `${CURRENCY_SYMBOL}${value.toLocaleString()}` : value}</div>
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
            {contributions.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No payments made yet.</TableCell></TableRow>
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


function EmergencyRequestHistoryTable({ requests }: { requests: EmergencyRequest[] }) {
    const getStatusBadgeVariant = (status: EmergencyRequest["status"]) => {
    switch (status) {
      case "approved": return "success"; // Define this variant in Badge if needed, or use default with green bg
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
        <CardTitle>My Emergency Requests</CardTitle>
        <CardDescription>Track the status of your emergency fund requests.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requested At</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
             {requests.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No emergency requests made yet.</TableCell></TableRow>
            ) : (
            requests.map(req => (
              <TableRow key={req.id}>
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
  const { user, isAdmin } = useMockAuth();
  console.log(user,"user ")
  // User specific data (mocked)
  const userContributions = MOCK_CONTRIBUTIONS.filter(c => c.user_id === user?.id);
  const totalPaidByUser = userContributions.reduce((sum, c) => sum + c.amount, 0);
  // Assuming 12 months of contributions expected for the current year for simplicity
  const monthsJoined = user ? Math.max(1, Math.floor((Date.now() - parseISO(user.joined_at).getTime()) / (1000 * 60 * 60 * 24 * 30.44))) : 1;
  const totalExpected = monthsJoined * MONTHLY_CONTRIBUTION_AMOUNT;
  const pendingAmount = Math.max(0, totalExpected - totalPaidByUser);

  const userEmergencyRequests = MOCK_EMERGENCY_REQUESTS.filter(req => req.user_id === user?.id);

  return (
    <div className="container mx-auto py-8 px-4 md:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Welcome to {APP_NAME}, {user?.full_name}!</h1>
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
          value={MOCK_TOTAL_FAMILY_SAVINGS}
          icon={BarChart3}
          description="Combined savings of all family members."
        />
      </div>
      
      <div className="mb-8">
         <Button asChild size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground shadow-md">
          <Link href="/emergency-request">
            <ShieldAlert className="mr-2 h-5 w-5" /> Request Emergency Fund
          </Link>
        </Button>
        {isAdmin && (
          <Button asChild size="lg" className="ml-4 shadow-md">
            <Link href="/admin">
              <Users className="mr-2 h-5 w-5" /> Go to Admin Panel
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-1">
        <PaymentHistoryTable contributions={userContributions} />
        <EmergencyRequestHistoryTable requests={userEmergencyRequests} />
      </div>
    </div>
  );
}
