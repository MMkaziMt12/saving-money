
"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { DollarSign, ShieldAlert, Users, BarChart3, Clock, AlertTriangle, CheckCircle2, Gift, TrendingDown, TrendingUp, Coins, RefreshCw, Loader2 } from "lucide-react";
import { APP_NAME, CURRENCY_SYMBOL, MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants";
import type { MonthlyContribution, EmergencyRequest, Profile } from "@/types";
import { format, parseISO, differenceInCalendarMonths, getYear, getMonth } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { StatCard } from "@/components/shared/StatCard";
import { useState, useEffect, useMemo } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { PaymentHistoryTable } from "@/components/dashboard/PaymentHistoryTable";
import { EmergencyRequestHistoryTable } from "@/components/dashboard/EmergencyRequestHistoryTable";

const supabase = createClient();
const ITEMS_PER_PAGE = 5;

interface PaginatedData<T> {
  data: T[];
  count: number | null;
}

// Fetch user's contributions (paginated)
async function fetchUserContributions(
  userId: string | undefined,
  page: number,
  itemsPerPage: number,
  searchTerm: string
): Promise<PaginatedData<Pick<MonthlyContribution, 'id' | 'payment_date' | 'month' | 'year' | 'amount'>>> {
  if (!userId) return { data: [], count: 0 };

  const from = (page - 1) * itemsPerPage;
  const to = from + itemsPerPage - 1;

  let query = supabase
    .from("monthly_contributions")
    .select("id, payment_date, month, year, amount", { count: "exact" })
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
  if (error) {
    console.error("Error fetching user contributions:", error);
    throw error;
  }
  return { data: data || [], count };
}

// Fetch all family emergency requests (paginated)
async function fetchAllFamilyEmergencyRequests(
  page: number,
  itemsPerPage: number,
  searchTerm: string
): Promise<PaginatedData<EmergencyRequest & { user_name?: string }>> { // Added user_name to type
  const from = (page - 1) * itemsPerPage;
  const to = from + itemsPerPage - 1;

  let query = supabase
    .from("emergency_requests")
    .select(`
      id, user_id, amount_requested, reason, requested_at, return_date, status, amount_returned, is_fully_repaid,
      profile_user:profiles!emergency_requests_user_id_fkey(full_name)
    `, { count: "exact" });
  
  if (searchTerm) {
    query = query.or(
        `reason.ilike.%${searchTerm}%,status.ilike.%${searchTerm}%,profile_user:full_name.ilike.%${searchTerm}%${",overdue".includes(searchTerm.toLowerCase()) ? ",return_date.lt.now(),is_fully_repaid.is.false" : ""}${"repaid".includes(searchTerm.toLowerCase()) ? ",is_fully_repaid.is.true" : ""}`,
        { foreignTable: "profiles" } 
    );
  }
  
  query = query.order("requested_at", { ascending: false }).range(from, to);

  const { data: rawRequests, error, count } = await query;

  if (error) {
    console.error("Error fetching all family emergency requests:", JSON.stringify(error, null, 2));
    throw error;
  }

  const typedData = rawRequests as (EmergencyRequest & { profile_user: { full_name: string | null } | null })[] | null;

  const formattedData = typedData?.map(req => ({
      ...req,
      user_name: req.profile_user?.full_name || req.user_id, // Use user_id as fallback
  })) || [];
  return { data: formattedData, count };
}


// Fetch total family savings via RPC
async function fetchTotalFamilySavingsRPC(): Promise<number> {
  const { data, error } = await supabase.rpc('get_total_family_savings');
  if (error) {
    console.error("Error fetching total family savings via RPC on dashboard:", error.message, error);
    if (data !== undefined) {
        console.log("RPC 'get_total_family_savings' raw data received (on error) on dashboard:", data);
    }
    throw error;
  }
  if (data === null || data === undefined) {
    console.warn("RPC 'get_total_family_savings' returned null or undefined on dashboard. Defaulting to 0.");
    return 0;
  }
  const savings = Number(data);
  if (isNaN(savings)) {
    console.warn(`RPC 'get_total_family_savings' returned a non-numeric value on dashboard: ${data}. Defaulting to 0.`);
    return 0;
  }
  return savings;
}

// Fetch all contributions for a user for accurate total/status (not paginated for this specific calculation)
async function fetchAllUserContributionsForStatus(userId: string | undefined): Promise<Pick<MonthlyContribution, 'amount'>[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("monthly_contributions")
    .select("amount") // Only select amount
    .eq("user_id", userId);
  if (error) {
    console.error("Error fetching all user contributions for status:", JSON.stringify(error, null, 2));
    throw error;
  }
  return data || [];
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

  const { 
    data: userContributionsData, 
    isLoading: isLoadingUserContributions, 
    isError: isUserContributionsError,
    error: userContributionsErrorObj, // Renamed to avoid conflict with error var
    refetch: refetchUserContributions
  } = useQuery<PaginatedData<Pick<MonthlyContribution, 'id' | 'payment_date' | 'month' | 'year' | 'amount'>>, Error>({
    queryKey: ["userContributions", user?.id, currentPageContributions, debouncedSearchTermContributions],
    queryFn: () => fetchUserContributions(user?.id, currentPageContributions, ITEMS_PER_PAGE, debouncedSearchTermContributions),
    enabled: !!user,
    // keepPreviousData: true, 
  });

  const { 
    data: allEmergencyRequestsData, 
    isLoading: isLoadingAllEmergencyRequests, 
    isError: isAllEmergencyRequestsError,
    error: allEmergencyRequestsErrorObj, // Renamed
    refetch: refetchAllEmergencyRequests
  } = useQuery<PaginatedData<EmergencyRequest & { user_name?: string }>, Error>({
    queryKey: ["allFamilyEmergencyRequests", currentPageEmergencyRequests, debouncedSearchTermEmergencyRequests],
    queryFn: () => fetchAllFamilyEmergencyRequests(currentPageEmergencyRequests, ITEMS_PER_PAGE, debouncedSearchTermEmergencyRequests),
    enabled: !!user,
    // keepPreviousData: true,
  });

  const { 
    data: totalFamilySavings, 
    isLoading: isLoadingTotalSavings, 
    isError: isTotalSavingsError,
    error: totalSavingsErrorObj, // Renamed
    refetch: refetchTotalSavings
  } = useQuery<number, Error>({
    queryKey: ["totalFamilySavings"], 
    queryFn: fetchTotalFamilySavingsRPC,
    enabled: !!user,
  });
  
  const { 
    data: allUserContributionsForStatus, 
    isLoading: isLoadingAllContributionsForStatus, 
    isError: isAllContributionsForStatusError,
    error: allContributionsForStatusErrorObj, // Renamed
    refetch: refetchAllUserContributionsForStatus
  } = useQuery<Pick<MonthlyContribution, 'amount'>[], Error>({
    queryKey: ["allUserContributionsForStatus", user?.id],
    queryFn: () => fetchAllUserContributionsForStatus(user?.id),
    enabled: !!user,
  });

  const userContributionStats = useMemo(() => {
    if (!profile?.created_at || !allUserContributionsForStatus) {
      return {
        totalPaid: 0,
        statusText: "Calculating...",
        pendingAmount: 0,
        detailedDescription: "Calculating status...",
        statusIcon: Clock,
        valueColorClass: "text-orange-500",
        paymentDifferenceMonths: 0,
      };
    }

    const totalPaid = allUserContributionsForStatus.reduce((sum, c) => sum + c.amount, 0);
    const numContributionsMade = allUserContributionsForStatus.length;
    
    const accountCreationDate = parseISO(profile.created_at);
    const currentDate = new Date();
    const startMonthDate = new Date(getYear(accountCreationDate), getMonth(accountCreationDate), 1);
    const endMonthDate = new Date(getYear(currentDate), getMonth(currentDate), 1);
    
    let monthsSinceJoined = differenceInCalendarMonths(endMonthDate, startMonthDate) + 1;
    monthsSinceJoined = Math.max(1, monthsSinceJoined);
    
    const paymentDifferenceMonthsCalc = numContributionsMade - monthsSinceJoined;
    let pendingAmountVal = 0;
    let statusTextVal = "Calculating...";
    let detailedDescriptionVal = "Calculating status...";
    let statusIconVal: React.ElementType = Clock;
    let valueColorClassVal = "text-orange-500";

    if (paymentDifferenceMonthsCalc > 0) {
      pendingAmountVal = 0; // No pending amount if paid in advance
      detailedDescriptionVal = `Paid in advance for ${paymentDifferenceMonthsCalc} month${paymentDifferenceMonthsCalc > 1 ? 's' : ''}!`;
      statusIconVal = Gift;
      valueColorClassVal = "text-green-500";
      statusTextVal = "Paid in Advance";
    } else if (paymentDifferenceMonthsCalc < 0) {
      const dueMonthsCount = Math.abs(paymentDifferenceMonthsCalc);
      pendingAmountVal = dueMonthsCount * MONTHLY_CONTRIBUTION_AMOUNT;
      detailedDescriptionVal = `Pending payment for ${dueMonthsCount} month${dueMonthsCount > 1 ? 's' : ''}.`;
      statusIconVal = AlertTriangle;
      statusTextVal = "Payment Due";
    } else { // paymentDifferenceMonthsCalc === 0
      pendingAmountVal = 0; // No pending amount if up to date
      if (monthsSinceJoined === 1 && numContributionsMade === 0) { // First month, not paid yet
        pendingAmountVal = MONTHLY_CONTRIBUTION_AMOUNT;
        detailedDescriptionVal = `Current month's contribution due.`;
        statusIconVal = AlertTriangle;
        statusTextVal = "Payment Due";
      } else { // All contributions paid up to date
        detailedDescriptionVal = "All contributions paid up to date!";
        statusIconVal = CheckCircle2;
        valueColorClassVal = "text-green-500";
        statusTextVal = "Up to Date";
      }
    }
    return { totalPaid, statusText: statusTextVal, pendingAmount: pendingAmountVal, detailedDescription: detailedDescriptionVal, statusIcon: statusIconVal, valueColorClass: valueColorClassVal, paymentDifferenceMonths: paymentDifferenceMonthsCalc };
  }, [profile?.created_at, allUserContributionsForStatus]);

  const emergencyFundStats = useMemo(() => {
    if (!allEmergencyRequestsData?.data) {
      return { totalDisbursed: 0, totalOutstanding: 0 };
    }
    const approvedRequests = allEmergencyRequestsData.data.filter(req => req.status === 'approved');
    const disbursed = approvedRequests.reduce((sum, req) => sum + (req.amount_requested || 0), 0);
    const outstanding = approvedRequests
      .filter(req => !req.is_fully_repaid)
      .reduce((sum, req) => sum + ((req.amount_requested || 0) - (req.amount_returned || 0)), 0);
    return { totalDisbursed: disbursed, totalOutstanding: outstanding };
  }, [allEmergencyRequestsData]);

  const handleContributionSearchChange = (term: string) => {
    setSearchTermContributions(term);
    setCurrentPageContributions(1); 
  };

  const handleEmergencyRequestSearchChange = (term: string) => {
    setSearchTermEmergencyRequests(term);
    setCurrentPageEmergencyRequests(1); 
  };

  useEffect(() => {
    if (userContributionsData && currentPageContributions < Math.ceil((userContributionsData.count || 0) / ITEMS_PER_PAGE)) {
      queryClient.prefetchQuery({
        queryKey: ["userContributions", user?.id, currentPageContributions + 1, debouncedSearchTermContributions],
        queryFn: () => fetchUserContributions(user!.id, currentPageContributions + 1, ITEMS_PER_PAGE, debouncedSearchTermContributions),
      });
    }
  }, [userContributionsData, currentPageContributions, debouncedSearchTermContributions, user?.id, queryClient]);

  useEffect(() => {
    if (allEmergencyRequestsData && currentPageEmergencyRequests < Math.ceil((allEmergencyRequestsData.count || 0) / ITEMS_PER_PAGE)) {
      queryClient.prefetchQuery({
        queryKey: ["allFamilyEmergencyRequests", currentPageEmergencyRequests + 1, debouncedSearchTermEmergencyRequests],
        queryFn: () => fetchAllFamilyEmergencyRequests(currentPageEmergencyRequests + 1, ITEMS_PER_PAGE, debouncedSearchTermEmergencyRequests),
      });
    }
  }, [allEmergencyRequestsData, currentPageEmergencyRequests, debouncedSearchTermEmergencyRequests, queryClient]);

  if (authLoading || (!profile && !authLoading) || (isLoadingAllContributionsForStatus && !allUserContributionsForStatus && !isAllContributionsForStatusError) ) {
    return (
      <div className="flex items-center justify-center h-full py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading Dashboard...</p>
      </div>
    );
  }
  
  if (!user || !profile || (isAllContributionsForStatusError && !allUserContributionsForStatus)) {
     const errorToDisplay = allContributionsForStatusErrorObj?.message || "User profile or contribution status could not be loaded.";
     return (
        <div className="flex flex-col items-center justify-center h-full py-10 text-center px-4">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-destructive mb-2">Error loading essential dashboard data.</p>
            <p className="text-sm text-muted-foreground mb-4">{errorToDisplay}</p>
            <Button 
                onClick={() => {
                    if (!profile && publicFetchProfile) publicFetchProfile(user!.id, true); // Assuming fetchProfile exists on AuthContext
                    if (isAllContributionsForStatusError) refetchAllUserContributionsForStatus();
                }} 
                variant="outline"
            >
                <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
        </div>
     );
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Welcome to {APP_NAME}, {profile.full_name || user.email}!</h1>
        <p className="text-muted-foreground">Here&apos;s your family savings overview.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <StatCard
          title="My Total Contributions"
          value={isLoadingAllContributionsForStatus && !allUserContributionsForStatus ? "Loading..." : (isAllContributionsForStatusError ? "Error" : userContributionStats.totalPaid) }
          icon={DollarSign}
          description={isLoadingAllContributionsForStatus ? "Fetching..." : (isAllContributionsForStatusError ? allContributionsForStatusErrorObj?.message : "Total amount you've contributed.")}
          iconClassName="text-green-500"
        />
        <StatCard
          title="Contribution Status"
          value={isLoadingAllContributionsForStatus && !allUserContributionsForStatus ? "Loading..." : (isAllContributionsForStatusError ? "Error" : userContributionStats.statusText)}
          icon={isAllContributionsForStatusError ? AlertTriangle : userContributionStats.statusIcon}
          description={isLoadingAllContributionsForStatus ? "Fetching..." : (isAllContributionsForStatusError ? allContributionsForStatusErrorObj?.message : (userContributionStats.paymentDifferenceMonths > 0 ? `You are ${userContributionStats.paymentDifferenceMonths} month${userContributionStats.paymentDifferenceMonths > 1 ? 's' : ''} ahead!` : (userContributionStats.statusText === "Payment Due" ? `Please settle your outstanding balance.` : `You're all set!`)) )}
          iconClassName={isAllContributionsForStatusError ? "text-destructive" : userContributionStats.valueColorClass}
          valueClassName={isAllContributionsForStatusError ? "text-destructive" : userContributionStats.valueColorClass}
          valuePrefix="" 
        />
        <StatCard
          title="My Dues / Advance"
          value={isLoadingAllContributionsForStatus && !allUserContributionsForStatus ? "Loading..." : (isAllContributionsForStatusError ? "Error" : userContributionStats.pendingAmount)}
          icon={isAllContributionsForStatusError ? AlertTriangle : (userContributionStats.pendingAmount > 0 ? AlertTriangle : (userContributionStats.paymentDifferenceMonths > 0 ? Gift : CheckCircle2))}
          valuePrefix={CURRENCY_SYMBOL}
          description={isLoadingAllContributionsForStatus ? "Fetching..." : (isAllContributionsForStatusError ? allContributionsForStatusErrorObj?.message : userContributionStats.detailedDescription)}
          iconClassName={isAllContributionsForStatusError ? "text-destructive" : (userContributionStats.pendingAmount > 0 ? "text-orange-500" : (userContributionStats.paymentDifferenceMonths > 0 ? "text-green-500" : "text-green-500"))}
          valueClassName={isAllContributionsForStatusError ? "text-destructive" : userContributionStats.valueColorClass}
        />
         <StatCard
          title="Current Fund Balance"
          value={isLoadingTotalSavings && totalFamilySavings === undefined && !isTotalSavingsError ? "Loading..." : (isTotalSavingsError ? "Error" : (totalFamilySavings ?? 0))}
          icon={BarChart3}
          description={isLoadingTotalSavings ? "Fetching..." : (isTotalSavingsError ? totalSavingsErrorObj?.message : `Fund balance available after disbursements and repayments.`)}
          iconClassName="text-blue-500"
        />
        <StatCard
          title="Total Emergency Funds Disbursed"
          value={isLoadingAllEmergencyRequests && !allEmergencyRequestsData && !isAllEmergencyRequestsError ? "Loading..." : (isAllEmergencyRequestsError ? "Error" : emergencyFundStats.totalDisbursed)}
          icon={TrendingDown}
          description={isLoadingAllEmergencyRequests ? "Fetching..." : (isAllEmergencyRequestsError ? allEmergencyRequestsErrorObj?.message : "Total amount paid out for approved emergency requests.")}
          iconClassName="text-red-500"
        />
        <StatCard
          title="Total Outstanding Emergency Funds"
          value={isLoadingAllEmergencyRequests && !allEmergencyRequestsData && !isAllEmergencyRequestsError ? "Loading..." : (isAllEmergencyRequestsError ? "Error" : emergencyFundStats.totalOutstanding)}
          icon={Coins}
          description={isLoadingAllEmergencyRequests ? "Fetching..." : (isAllEmergencyRequestsError ? allEmergencyRequestsErrorObj?.message : "Total amount currently owed back to the fund from approved requests.")}
          iconClassName="text-yellow-500"
        />
      </div>

      <div className="flex flex-wrap gap-4 mb-8">
        {!isAdmin && (
          <Button asChild size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground shadow-md">
            <Link href="/emergency-request">
              <ShieldAlert className="mr-2 h-5 w-5" /> Request Emergency Fund
            </Link>
          </Button>
        )}
        {isAdmin && (
           <Button asChild size="lg" className="shadow-md">
            <Link href="/admin">
              <Users className="mr-2 h-5 w-5" /> Go to Admin Panel
            </Link>
          </Button>
        )}
      </div>
      
      <div className="space-y-8">
      <EmergencyRequestHistoryTable
          requests={allEmergencyRequestsData?.data} 
          isLoading={isLoadingAllEmergencyRequests && !allEmergencyRequestsData?.data && !isAllEmergencyRequestsError} 
          error={isAllEmergencyRequestsError ? allEmergencyRequestsErrorObj : null}
          onRetry={refetchAllEmergencyRequests}
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

        <PaymentHistoryTable 
          contributions={userContributionsData?.data} 
          isLoading={isLoadingUserContributions && !userContributionsData?.data && !isUserContributionsError} 
          error={isUserContributionsError ? userContributionsErrorObj : null}
          onRetry={refetchUserContributions}
          totalCount={userContributionsData?.count || 0}
          currentPage={currentPageContributions}
          onPageChange={setCurrentPageContributions}
          searchTerm={searchTermContributions}
          onSearchChange={handleContributionSearchChange}
          itemsPerPage={ITEMS_PER_PAGE}
        />
        
      </div>
    </div>
  );
}

    