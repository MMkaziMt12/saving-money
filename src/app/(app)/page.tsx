
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { ArrowRight, DollarSign, ShieldAlert, Users, BarChart3, Clock, AlertTriangle, CheckCircle2, XCircle, Loader2, Gift, Search as SearchIcon } from "lucide-react";
import { APP_NAME, CURRENCY_SYMBOL, MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants";
import type { MonthlyContribution, EmergencyRequest, Profile } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { format, parseISO, differenceInCalendarMonths, getMonth, getYear } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { StatCard } from "@/components/shared/StatCard";
import { useState, useEffect, useMemo } from "react";

const supabase = createClient();
const ITEMS_PER_PAGE = 5; // For dashboard tables

// Fetching functions with server-side pagination and search
interface PaginatedData<T> {
  data: T[];
  count: number | null;
}

async function fetchUserContributions(
  userId: string,
  page: number,
  itemsPerPage: number,
  searchTerm: string
): Promise<PaginatedData<MonthlyContribution>> {
  if (!userId) return { data: [], count: 0 };

  const from = (page - 1) * itemsPerPage;
  const to = from + itemsPerPage - 1;

  let query = supabase
    .from("monthly_contributions")
    .select("*", { count: "exact" })
    .eq("user_id", userId);

  if (searchTerm) {
    // Simple search on year for now, can be expanded
    const numericSearchTerm = parseInt(searchTerm);
    if (!isNaN(numericSearchTerm)) {
      query = query.eq("year", numericSearchTerm);
    } else {
        // If search term is not a number, maybe search by month name (more complex)
        // For simplicity, we'll skip non-numeric search for contributions for now
        // or you can implement a text search on a formatted month/year column if available
    }
  }
  
  query = query.order("year", { ascending: false })
    .order("month", { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { data: data || [], count };
}

async function fetchEmergencyRequests(
  userId: string | null, 
  isAdmin: boolean,
  page: number,
  itemsPerPage: number,
  searchTerm: string
): Promise<PaginatedData<EmergencyRequest>> {
  const from = (page - 1) * itemsPerPage;
  const to = from + itemsPerPage - 1;

  let query = supabase
    .from("emergency_requests")
    .select(`
      *,
      profile_user:profiles!emergency_requests_user_id_fkey(full_name)
    `, { count: "exact" });

  if (!isAdmin && userId) {
    query = query.eq("user_id", userId);
  } else if (!isAdmin && !userId) {
    return { data: [], count: 0 };
  }
  
  if (searchTerm) {
    query = query.or(`reason.ilike.%${searchTerm}%,status.ilike.%${searchTerm}%${isAdmin ? `,profiles!emergency_requests_user_id_fkey(full_name).ilike.%${searchTerm}%` : '' }`);
  }
  
  query = query.order("requested_at", { ascending: false }).range(from, to);

  const { data: rawRequests, error, count } = await query;
  if (error) throw new Error(error.message);

  const formattedData = rawRequests?.map(req => ({
      ...req,
      user_name: (req.profile_user as unknown as Profile)?.full_name || req.user_id,
  })) || [];
  return { data: formattedData, count };
}

async function fetchTotalFamilySavings(): Promise<number> {
  const { data, error } = await supabase.rpc('get_total_family_savings');
  if (error) {
    console.error("Error fetching total family savings via RPC:", error.message, error);
    throw new Error(error.message);
  }
  console.log("RPC 'get_total_family_savings' raw data received:", data);
  if (data === null || data === undefined) {
    console.warn("RPC 'get_total_family_savings' returned null or undefined. Defaulting to 0.");
    return 0;
  }
  const savings = Number(data);
  if (isNaN(savings)) {
    console.warn(`RPC 'get_total_family_savings' returned a non-numeric value: ${data}. Defaulting to 0.`);
    return 0;
  }
  return savings;
}


function PaymentHistoryTable({ 
  contributions, 
  isLoading, 
  totalCount,
  currentPage,
  onPageChange,
  searchTerm,
  onSearchChange,
  itemsPerPage
}: { 
  contributions: MonthlyContribution[] | undefined, 
  isLoading: boolean,
  totalCount: number,
  currentPage: number,
  onPageChange: (newPage: number) => void,
  searchTerm: string,
  onSearchChange: (term: string) => void,
  itemsPerPage: number
}) {
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  if (isLoading && (!contributions || contributions.length === 0)) {
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
        <CardDescription>Overview of your monthly contributions. Search by year.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              type="search"
              placeholder="Search by year (e.g., 2023)..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 w-full md:w-1/2"
            />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment Date</TableHead>
                <TableHead>Contribution For (Month/Year)</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={3} className="text-center h-24"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></TableCell></TableRow>}
              {!isLoading && contributions && contributions.length > 0 ? (
                contributions.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>{format(parseISO(c.payment_date), "MMM dd, yyyy")}</TableCell>
                    <TableCell>{format(new Date(c.year, c.month -1), "MMMM yyyy")}</TableCell>
                    <TableCell className="text-right">{CURRENCY_SYMBOL}{c.amount.toLocaleString()}</TableCell>
                  </TableRow>
                ))
              ) : (
                !isLoading && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground h-24">{totalCount === 0 ? 'No payments made yet.' : 'No results for your search.'}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-end space-x-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1 || isLoading}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages || isLoading}
            >
              Next
            </Button>
          </div>
        )}
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
  totalCount: number;
  currentPage: number;
  onPageChange: (newPage: number) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  itemsPerPage: number;
}

function EmergencyRequestHistoryTable({ 
  requests, 
  isLoading, 
  title, 
  description, 
  showUserName = false,
  totalCount,
  currentPage,
  onPageChange,
  searchTerm,
  onSearchChange,
  itemsPerPage 
}: EmergencyRequestHistoryTableProps) {
    const totalPages = Math.ceil(totalCount / itemsPerPage);
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

  if (isLoading && (!requests || requests.length === 0)) {
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
        <CardDescription>{description}. Search by reason, status {showUserName ? ', or user' : ''}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
         <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              type="search"
              placeholder="Search requests..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 w-full md:w-1/2"
            />
        </div>
        <div className="overflow-x-auto">
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
              {isLoading && <TableRow><TableCell colSpan={showUserName ? 5 : 4} className="text-center h-24"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></TableCell></TableRow>}
              {!isLoading && requests && requests.length > 0 ? (
              requests.map(req => (
                <TableRow key={req.id}>
                  {showUserName && <TableCell>{req.user_name || req.user_id}</TableCell>}
                  <TableCell>{format(parseISO(req.requested_at), "MMM dd, yyyy HH:mm")}</TableCell>
                  <TableCell>{CURRENCY_SYMBOL}{req.amount_requested.toLocaleString()}</TableCell>
                  <TableCell className="max-w-xs truncate">{req.reason}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={getStatusBadgeVariant(req.status)} className="capitalize flex items-center justify-center gap-1.5 min-w-[110px]">
                      {getStatusIcon(req.status)}
                      {req.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))) : (
                  !isLoading && <TableRow><TableCell colSpan={showUserName ? 5 : 4} className="text-center text-muted-foreground h-24">{totalCount === 0 ? 'No emergency requests found.' : 'No results for your search.'}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
         {totalPages > 1 && (
          <div className="flex items-center justify-end space-x-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1 || isLoading}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages || isLoading}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


export default function DashboardPage() {
  const { user, profile, isAdmin, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient(); // Get query client

  // State for Contributions Table
  const [currentPageContributions, setCurrentPageContributions] = useState(1);
  const [searchTermContributions, setSearchTermContributions] = useState("");
  
  // State for Emergency Requests Table
  const [currentPageEmergencyRequests, setCurrentPageEmergencyRequests] = useState(1);
  const [searchTermEmergencyRequests, setSearchTermEmergencyRequests] = useState("");

  const { data: userContributionsData, isLoading: isLoadingContributions } = useQuery<PaginatedData<MonthlyContribution>, Error>({
    queryKey: ["userContributions", user?.id, currentPageContributions, searchTermContributions],
    queryFn: () => fetchUserContributions(user!.id, currentPageContributions, ITEMS_PER_PAGE, searchTermContributions),
    enabled: !!user,
    keepPreviousData: true, // Important for smoother pagination
  });

  const { data: emergencyRequestsData, isLoading: isLoadingEmergencyRequests } = useQuery<PaginatedData<EmergencyRequest>, Error>({
    queryKey: ["emergencyRequests", user?.id, isAdmin, currentPageEmergencyRequests, searchTermEmergencyRequests],
    queryFn: () => fetchEmergencyRequests(user?.id || null, isAdmin, currentPageEmergencyRequests, ITEMS_PER_PAGE, searchTermEmergencyRequests),
    enabled: !!user,
    keepPreviousData: true,
  });

  const { data: totalFamilySavings, isLoading: isLoadingTotalSavings } = useQuery<number, Error>({
    queryKey: ["totalFamilySavings"],
    queryFn: fetchTotalFamilySavings,
  });
  
  // Debounce search term changes
  useEffect(() => {
    const handler = setTimeout(() => {
      // This will trigger useQuery to refetch if debouncedSearchTerm changes
      // Actual refetch query logic is based on queryKey changing, 
      // so we just need to ensure the state passed to queryKey is updated after debounce.
      // For simplicity here, we'll set page to 1 on new search
      // For a true debounce effect on query, one might wrap fetch functions or use a debounced state for queryKey.
      // Let's reset page to 1 when search term changes.
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTermContributions, searchTermEmergencyRequests]);


  const handleContributionSearchChange = (term: string) => {
    setSearchTermContributions(term);
    setCurrentPageContributions(1); // Reset to first page on new search
  };

  const handleEmergencyRequestSearchChange = (term: string) => {
    setSearchTermEmergencyRequests(term);
    setCurrentPageEmergencyRequests(1); // Reset to first page on new search
  };

  // Effect to prefetch next page data for contributions
  useEffect(() => {
    if (userContributionsData && currentPageContributions < Math.ceil((userContributionsData.count || 0) / ITEMS_PER_PAGE)) {
      queryClient.prefetchQuery({
        queryKey: ["userContributions", user?.id, currentPageContributions + 1, searchTermContributions],
        queryFn: () => fetchUserContributions(user!.id, currentPageContributions + 1, ITEMS_PER_PAGE, searchTermContributions),
      });
    }
  }, [userContributionsData, currentPageContributions, searchTermContributions, user?.id, queryClient]);

  // Effect to prefetch next page data for emergency requests
  useEffect(() => {
    if (emergencyRequestsData && currentPageEmergencyRequests < Math.ceil((emergencyRequestsData.count || 0) / ITEMS_PER_PAGE)) {
      queryClient.prefetchQuery({
        queryKey: ["emergencyRequests", user?.id, isAdmin, currentPageEmergencyRequests + 1, searchTermEmergencyRequests],
        queryFn: () => fetchEmergencyRequests(user!.id || null, isAdmin, currentPageEmergencyRequests + 1, ITEMS_PER_PAGE, searchTermEmergencyRequests),
      });
    }
  }, [emergencyRequestsData, currentPageEmergencyRequests, searchTermEmergencyRequests, user?.id, isAdmin, queryClient]);


  if (authLoading || (!profile && !authLoading) ) {
    return (
      <div className="flex items-center justify-center h-full py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading Dashboard...</p>
      </div>
    );
  }

  if (!user || !profile) {
     return (
        <div className="flex items-center justify-center h-full py-10">
          <p>Error: User or profile data not available. Please re-login.</p>
        </div>
     );
  }

  // Calculate total paid by user from ALL contributions, not just paginated ones.
  // This requires a separate query or careful handling if we want to avoid fetching all contributions for this summary.
  // For simplicity, this example will use the 'count' from the *first page load* of contributions for some calcs, which is not ideal for dynamic total paid.
  // A better way for "total paid" would be a separate RPC or specific query.
  // For now, let's assume userContributionsData.data if available on first load contains enough for an approximate "total paid" or we need another query for total paid.

  // For "totalPaidByUser", we should ideally get all contributions.
  // Let's fetch all user contributions once for this calculation, without pagination.
  // This is a simplification. For very large datasets, this should be an aggregate query.
  const { data: allUserContributionsForTotal } = useQuery<PaginatedData<MonthlyContribution>, Error>({
    queryKey: ["allUserContributionsForTotal", user?.id],
    queryFn: () => fetchUserContributions(user!.id, 1, 10000, ""), // Fetch a large number, effectively all for summary
    enabled: !!user,
  });
  const totalPaidByUser = allUserContributionsForTotal?.data?.reduce((sum, c) => sum + c.amount, 0) || 0;
  const numberOfContributionsMadeForStatus = allUserContributionsForTotal?.data?.length || 0;


  let monthsSinceJoined = 0;
  let pendingAmountValue = 0;
  let paymentDifferenceMonths = 0;
  let pendingStatusDescription = "Calculating status...";
  let pendingStatusIcon = Clock;
  let pendingAmountColorClass = "text-orange-500";

  if (profile.created_at) {
    const accountCreationDate = parseISO(profile.created_at);
    const currentDate = new Date();
    const startMonthDate = new Date(getYear(accountCreationDate), getMonth(accountCreationDate), 1);
    const endMonthDate = new Date(getYear(currentDate), getMonth(currentDate), 1);
    monthsSinceJoined = differenceInCalendarMonths(endMonthDate, startMonthDate) + 1;
    monthsSinceJoined = Math.max(1, monthsSinceJoined); 

    paymentDifferenceMonths = numberOfContributionsMadeForStatus - monthsSinceJoined;

    if (paymentDifferenceMonths > 0) {
      pendingAmountValue = 0; 
      pendingStatusDescription = `Paid in advance for ${paymentDifferenceMonths} month${paymentDifferenceMonths > 1 ? 's' : ''}!`;
      pendingStatusIcon = Gift; 
      pendingAmountColorClass = "text-green-500";
    } else if (paymentDifferenceMonths < 0) {
      const dueMonthsCount = Math.abs(paymentDifferenceMonths);
      pendingAmountValue = dueMonthsCount * MONTHLY_CONTRIBUTION_AMOUNT;
      pendingStatusDescription = `Pending payment for ${dueMonthsCount} month${dueMonthsCount > 1 ? 's' : ''}.`;
      pendingStatusIcon = AlertTriangle;
      pendingAmountColorClass = "text-orange-500";
    } else { 
      pendingAmountValue = 0; 
      const currentMonthPaid = allUserContributionsForTotal?.data?.some(c => c.month === (getMonth(currentDate) + 1) && c.year === getYear(currentDate));
      if (numberOfContributionsMadeForStatus === 0 && monthsSinceJoined === 1) { 
         pendingAmountValue = MONTHLY_CONTRIBUTION_AMOUNT;
         pendingStatusDescription = `Current month's contribution due.`;
         pendingStatusIcon = AlertTriangle;
         pendingAmountColorClass = "text-orange-500";
      } else if (currentMonthPaid || numberOfContributionsMadeForStatus >= monthsSinceJoined) {
        pendingStatusDescription = "All contributions paid up to date!";
        pendingStatusIcon = CheckCircle2;
        pendingAmountColorClass = "text-green-500";
      } else {
         pendingAmountValue = MONTHLY_CONTRIBUTION_AMOUNT;
         pendingStatusDescription = `Current month's contribution due.`;
         pendingStatusIcon = AlertTriangle;
         pendingAmountColorClass = "text-orange-500";
      }
    }
  }


  return (
    <div className="container mx-auto py-8 px-4 md:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Welcome to {APP_NAME}, {profile.full_name || user.email}!</h1>
        <p className="text-muted-foreground">Here&apos;s your family savings overview.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <StatCard
          title="My Total Contributions"
          value={isLoadingContributions ? "Loading..." : totalPaidByUser }
          icon={DollarSign}
          description={isLoadingContributions ? "Fetching..." : "Total amount you've contributed."}
          iconClassName="text-green-500"
        />
        <StatCard
          title="Contribution Status"
          value={isLoadingContributions ? "Loading..." : (paymentDifferenceMonths > 0 ? `${paymentDifferenceMonths} Adv. Mths` : pendingAmountValue)}
          icon={pendingStatusIcon}
          valuePrefix={paymentDifferenceMonths > 0 ? "" : CURRENCY_SYMBOL}
          description={isLoadingContributions ? "Fetching..." : pendingStatusDescription}
          iconClassName={pendingAmountColorClass}
          valueClassName={pendingAmountColorClass}
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
        <PaymentHistoryTable 
          contributions={userContributionsData?.data} 
          isLoading={isLoadingContributions}
          totalCount={userContributionsData?.count || 0}
          currentPage={currentPageContributions}
          onPageChange={setCurrentPageContributions}
          searchTerm={searchTermContributions}
          onSearchChange={handleContributionSearchChange}
          itemsPerPage={ITEMS_PER_PAGE}
        />
        <EmergencyRequestHistoryTable
          requests={emergencyRequestsData?.data}
          isLoading={isLoadingEmergencyRequests}
          title={isAdmin ? "All Family Emergency Requests" : "My Emergency Request History"}
          description={isAdmin ? "Track the status of all emergency fund requests." : "Overview of your submitted emergency fund requests."}
          showUserName={isAdmin}
          totalCount={emergencyRequestsData?.count || 0}
          currentPage={currentPageEmergencyRequests}
          onPageChange={setCurrentPageEmergencyRequests}
          searchTerm={searchTermEmergencyRequests}
          onSearchChange={handleEmergencyRequestSearchChange}
          itemsPerPage={ITEMS_PER_PAGE}
        />
      </div>
    </div>
  );
}

