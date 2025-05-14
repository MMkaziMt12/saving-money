
"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { DollarSign, ShieldAlert, Users, BarChart3, Clock, AlertTriangle, CheckCircle2, Gift, TrendingDown, TrendingUp, Coins } from "lucide-react";
import { APP_NAME, CURRENCY_SYMBOL, MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants";
import type { MonthlyContribution, EmergencyRequest, Profile } from "@/types";
import { format, parseISO, differenceInCalendarMonths, getMonth, getYear } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { StatCard } from "@/components/shared/StatCard";
import { useState, useEffect, useMemo } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { PaymentHistoryTable } from "@/components/dashboard/PaymentHistoryTable";
import { EmergencyRequestHistoryTable } from "@/components/dashboard/EmergencyRequestHistoryTable";
import { Loader2 } from "lucide-react";


const supabase = createClient();
const ITEMS_PER_PAGE = 5; 

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
    const numericSearchTerm = parseInt(searchTerm);
    if (!isNaN(numericSearchTerm)) {
      query = query.eq("year", numericSearchTerm);
    }
  }
  
  query = query.order("year", { ascending: false })
    .order("month", { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { data: data || [], count };
}

async function fetchAllFamilyEmergencyRequests(
  page: number,
  itemsPerPage: number,
  searchTerm: string
): Promise<PaginatedData<EmergencyRequest>> {
  const from = (page - 1) * itemsPerPage;
  const to = from + itemsPerPage - 1;

  let query = supabase
    .from("emergency_requests")
    .select("*, profile_user:profiles!emergency_requests_user_id_fkey(full_name)", { count: "exact" });
  
  if (searchTerm) {
    query = query.or(
        `reason.ilike.%${searchTerm}%,status.ilike.%${searchTerm}%,profile_user:full_name.ilike.%${searchTerm}%${",overdue".includes(searchTerm.toLowerCase()) ? ",return_date.lt.now(),is_fully_repaid.is.false" : ""}${"repaid".includes(searchTerm.toLowerCase()) ? ",is_fully_repaid.is.true" : ""}`,
        { foreignTable: "profiles" } 
    );
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


export default function DashboardPage() {
  const { user, profile, isAdmin, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient(); 

  const [currentPageContributions, setCurrentPageContributions] = useState(1);
  const [searchTermContributions, setSearchTermContributions] = useState("");
  const debouncedSearchTermContributions = useDebounce(searchTermContributions, 500);
  
  const [currentPageEmergencyRequests, setCurrentPageEmergencyRequests] = useState(1);
  const [searchTermEmergencyRequests, setSearchTermEmergencyRequests] = useState("");
  const debouncedSearchTermEmergencyRequests = useDebounce(searchTermEmergencyRequests, 500);

  // Fetch contributions for the logged-in user (for their payment history table)
  const { data: userContributionsData, isLoading: isLoadingContributions } = useQuery<PaginatedData<MonthlyContribution>, Error>({
    queryKey: ["userContributions", user?.id, currentPageContributions, debouncedSearchTermContributions],
    queryFn: () => fetchUserContributions(user!.id, currentPageContributions, ITEMS_PER_PAGE, debouncedSearchTermContributions),
    enabled: !!user,
    keepPreviousData: true, 
  });

  // Fetch ALL emergency requests for dashboard summary cards and the global history table
  const { data: allEmergencyRequestsData, isLoading: isLoadingAllEmergencyRequests } = useQuery<PaginatedData<EmergencyRequest>, Error>({
    queryKey: ["allFamilyEmergencyRequests", currentPageEmergencyRequests, debouncedSearchTermEmergencyRequests], // This queryKey will be used for the global table
    queryFn: () => fetchAllFamilyEmergencyRequests(currentPageEmergencyRequests, ITEMS_PER_PAGE, debouncedSearchTermEmergencyRequests),
    enabled: !!user, // Fetch if user is logged in
    keepPreviousData: true,
  });

  const { data: totalFamilySavings, isLoading: isLoadingTotalSavings } = useQuery<number, Error>({
    queryKey: ["totalFamilySavings"], // This now fetches the NET balance
    queryFn: fetchTotalFamilySavings,
  });
  
  const handleContributionSearchChange = (term: string) => {
    setSearchTermContributions(term);
    setCurrentPageContributions(1); 
  };

  const handleEmergencyRequestSearchChange = (term: string) => {
    setSearchTermEmergencyRequests(term);
    setCurrentPageEmergencyRequests(1); 
  };

  // Prefetching for user contributions table
  useEffect(() => {
    if (userContributionsData && currentPageContributions < Math.ceil((userContributionsData.count || 0) / ITEMS_PER_PAGE)) {
      queryClient.prefetchQuery({
        queryKey: ["userContributions", user?.id, currentPageContributions + 1, debouncedSearchTermContributions],
        queryFn: () => fetchUserContributions(user!.id, currentPageContributions + 1, ITEMS_PER_PAGE, debouncedSearchTermContributions),
      });
    }
  }, [userContributionsData, currentPageContributions, debouncedSearchTermContributions, user?.id, queryClient]);

  // Prefetching for all family emergency requests table
  useEffect(() => {
    if (allEmergencyRequestsData && currentPageEmergencyRequests < Math.ceil((allEmergencyRequestsData.count || 0) / ITEMS_PER_PAGE)) {
      queryClient.prefetchQuery({
        queryKey: ["allFamilyEmergencyRequests", currentPageEmergencyRequests + 1, debouncedSearchTermEmergencyRequests],
        queryFn: () => fetchAllFamilyEmergencyRequests(currentPageEmergencyRequests + 1, ITEMS_PER_PAGE, debouncedSearchTermEmergencyRequests),
      });
    }
  }, [allEmergencyRequestsData, currentPageEmergencyRequests, debouncedSearchTermEmergencyRequests, queryClient]);

  // Fetch all contributions for current user (unpaginated) for accurate total calculation for their StatCards
  const { data: allUserContributionsForTotal, isLoading: isLoadingAllContributionsForTotal } = useQuery<PaginatedData<MonthlyContribution>, Error>({
    queryKey: ["allUserContributionsForTotal", user?.id],
    queryFn: () => fetchUserContributions(user!.id, 1, 10000, ""), // Fetch up to 10000 records, effectively "all" for this purpose
    enabled: !!user,
  });

  const {
    totalDisbursedForEmergency,
    totalOutstandingEmergency,
    isLoadingEmergencyStats,
  } = useMemo(() => {
    if (isLoadingAllEmergencyRequests || !allEmergencyRequestsData?.data) {
      return { totalDisbursedForEmergency: 0, totalOutstandingEmergency: 0, isLoadingEmergencyStats: true };
    }
    const approvedRequests = allEmergencyRequestsData.data.filter(req => req.status === 'approved');
    
    const disbursed = approvedRequests.reduce((sum, req) => sum + (req.amount_requested || 0), 0);
    
    const outstanding = approvedRequests
      .filter(req => !req.is_fully_repaid)
      .reduce((sum, req) => sum + ((req.amount_requested || 0) - (req.amount_returned || 0)), 0);
      
    return { totalDisbursedForEmergency: disbursed, totalOutstandingEmergency: outstanding, isLoadingEmergencyStats: false };
  }, [allEmergencyRequestsData, isLoadingAllEmergencyRequests]);


  if (authLoading || (!profile && !authLoading) || isLoadingAllContributionsForTotal ) {
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
  
  const totalPaidByUser = allUserContributionsForTotal?.data?.reduce((sum, c) => sum + c.amount, 0) || 0;
  const numberOfContributionsMadeForStatus = allUserContributionsForTotal?.data?.length || 0;

  let monthsSinceJoined = 0;
  let userPendingAmountValue = 0;
  let paymentDifferenceMonths = 0;
  let userDetailedContributionDescription = "Calculating status...";
  let userGeneralContributionStatusText = "Calculating...";
  let userContributionStatusIcon: React.ElementType = Clock;
  let userContributionValueColorClass = "text-orange-500";


  if (profile.created_at && !isLoadingAllContributionsForTotal && allUserContributionsForTotal?.data) {
    const accountCreationDate = parseISO(profile.created_at);
    const currentDate = new Date();
    const startMonthDate = new Date(getYear(accountCreationDate), getMonth(accountCreationDate), 1);
    const endMonthDate = new Date(getYear(currentDate), getMonth(currentDate), 1);
    
    monthsSinceJoined = differenceInCalendarMonths(endMonthDate, startMonthDate) + 1;
    monthsSinceJoined = Math.max(1, monthsSinceJoined); 

    paymentDifferenceMonths = numberOfContributionsMadeForStatus - monthsSinceJoined;

    if (paymentDifferenceMonths > 0) { // Paid in advance
      userPendingAmountValue = 0; 
      userDetailedContributionDescription = `Paid in advance for ${paymentDifferenceMonths} month${paymentDifferenceMonths > 1 ? 's' : ''}!`;
      userContributionStatusIcon = Gift; 
      userContributionValueColorClass = "text-green-500";
      userGeneralContributionStatusText = "Paid in Advance";
    } else if (paymentDifferenceMonths < 0) { // Pending payments
      const dueMonthsCount = Math.abs(paymentDifferenceMonths);
      userPendingAmountValue = dueMonthsCount * MONTHLY_CONTRIBUTION_AMOUNT;
      userDetailedContributionDescription = `Pending payment for ${dueMonthsCount} month${dueMonthsCount > 1 ? 's' : ''}.`;
      userContributionStatusIcon = AlertTriangle;
      userContributionValueColorClass = "text-orange-500";
      userGeneralContributionStatusText = "Payment Due";
    } else { // paymentDifferenceMonths === 0;
      userPendingAmountValue = 0; 
      if (monthsSinceJoined === 1 && numberOfContributionsMadeForStatus === 0) {
        userPendingAmountValue = MONTHLY_CONTRIBUTION_AMOUNT;
        userDetailedContributionDescription = `Current month's contribution due.`;
        userContributionStatusIcon = AlertTriangle;
        userContributionValueColorClass = "text-orange-500";
        userGeneralContributionStatusText = "Payment Due";
      } else {
        userDetailedContributionDescription = "All contributions paid up to date!";
        userContributionStatusIcon = CheckCircle2;
        userContributionValueColorClass = "text-green-500";
        userGeneralContributionStatusText = "Up to Date";
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
          value={isLoadingAllContributionsForTotal ? "Loading..." : totalPaidByUser }
          icon={DollarSign}
          description={isLoadingAllContributionsForTotal ? "Fetching..." : "Total amount you've contributed."}
          iconClassName="text-green-500"
        />
        <StatCard
          title="Contribution Status"
          value={isLoadingAllContributionsForTotal ? "Loading..." : userGeneralContributionStatusText}
          icon={userContributionStatusIcon}
          description={isLoadingAllContributionsForTotal ? "Fetching..." : (paymentDifferenceMonths > 0 ? `You are ${paymentDifferenceMonths} month${paymentDifferenceMonths > 1 ? 's' : ''} ahead!` : (userGeneralContributionStatusText === "Payment Due" ? `Please settle your outstanding balance.` : `You're all set!`)) }
          iconClassName={userContributionValueColorClass}
          valueClassName={userContributionValueColorClass}
          valuePrefix="" 
        />
        <StatCard
          title="My Dues / Advance"
          value={isLoadingAllContributionsForTotal ? "Loading..." : userPendingAmountValue}
          icon={userPendingAmountValue > 0 ? AlertTriangle : (paymentDifferenceMonths > 0 ? Gift : CheckCircle2)}
          valuePrefix={CURRENCY_SYMBOL}
          description={isLoadingAllContributionsForTotal ? "Fetching..." : userDetailedContributionDescription}
          iconClassName={userPendingAmountValue > 0 ? "text-orange-500" : (paymentDifferenceMonths > 0 ? "text-green-500" : "text-green-500")}
          valueClassName={userContributionValueColorClass}
        />
         <StatCard
          title="Current Fund Balance"
          value={isLoadingTotalSavings ? "Loading..." : (totalFamilySavings ?? 0)}
          icon={BarChart3}
          description="Net balance of the family fund."
          iconClassName="text-blue-500"
        />
        <StatCard
          title="Total Emergency Funds Disbursed"
          value={isLoadingEmergencyStats ? "Loading..." : totalDisbursedForEmergency}
          icon={TrendingDown}
          description="Total amount paid out for approved emergency requests."
          iconClassName="text-red-500"
        />
        <StatCard
          title="Total Outstanding Emergency Funds"
          value={isLoadingEmergencyStats ? "Loading..." : totalOutstandingEmergency}
          icon={Coins}
          description="Total amount currently owed back to the fund from approved requests."
          iconClassName="text-yellow-500"
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
          requests={allEmergencyRequestsData?.data} 
          isLoading={isLoadingAllEmergencyRequests} 
          title="All Family Emergency Requests" 
          description="Track the status of all emergency fund requests across the family." 
          showUserName={true} 
          totalCount={allEmergencyRequestsData?.count || 0}
          currentPage={currentPageEmergencyRequests}
          onPageChange={setCurrentPageEmergencyRequests}
          searchTerm={searchTermEmergencyRequests}
          onSearchChange={handleEmergencyRequestSearchChange}
          itemsPerPage={ITEMS_PER_PAGE}
          isGlobalView={true} 
        />
      </div>
    </div>
  );
}
    

    
