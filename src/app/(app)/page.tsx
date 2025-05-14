
"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { DollarSign, ShieldAlert, Users, BarChart3, Clock, AlertTriangle, CheckCircle2, XCircle, Loader2, Gift } from "lucide-react";
import { APP_NAME, CURRENCY_SYMBOL, MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants";
import type { MonthlyContribution, EmergencyRequest, Profile } from "@/types";
import { format, parseISO, differenceInCalendarMonths, getMonth, getYear } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { StatCard } from "@/components/shared/StatCard";
import { useState, useEffect } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { PaymentHistoryTable } from "@/components/dashboard/PaymentHistoryTable";
import { EmergencyRequestHistoryTable } from "@/components/dashboard/EmergencyRequestHistoryTable";

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
    .select("*, profile_user:profiles!emergency_requests_user_id_fkey(full_name)", { count: "exact" });

  if (!isAdmin && userId) {
    query = query.eq("user_id", userId);
  } else if (!isAdmin && !userId) {
    return { data: [], count: 0 };
  }
  
  if (searchTerm) {
    const orConditions = [`reason.ilike.%${searchTerm}%`, `status.ilike.%${searchTerm}%`];
    if (isAdmin) { // Only search by user name if admin is viewing all requests
        orConditions.push(`profile_user:full_name.ilike.%${searchTerm}%`);
    }
    // Correct usage of .or() for Supabase client
     // For .or with foreign table, it's a bit tricky.
    // We might need to adjust if direct filtering on foreign table name in .or() isn't supported as expected.
    // A simpler search for now:
    query = query.or(orConditions.join(','), { foreignTable: 'profiles' });
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

  const { data: userContributionsData, isLoading: isLoadingContributions } = useQuery<PaginatedData<MonthlyContribution>, Error>({
    queryKey: ["userContributions", user?.id, currentPageContributions, debouncedSearchTermContributions],
    queryFn: () => fetchUserContributions(user!.id, currentPageContributions, ITEMS_PER_PAGE, debouncedSearchTermContributions),
    enabled: !!user,
    keepPreviousData: true, 
  });

  const { data: emergencyRequestsData, isLoading: isLoadingEmergencyRequests } = useQuery<PaginatedData<EmergencyRequest>, Error>({
    queryKey: ["emergencyRequests", user?.id, isAdmin, currentPageEmergencyRequests, debouncedSearchTermEmergencyRequests],
    queryFn: () => fetchEmergencyRequests(user?.id || null, isAdmin, currentPageEmergencyRequests, ITEMS_PER_PAGE, debouncedSearchTermEmergencyRequests),
    enabled: !!user,
    keepPreviousData: true,
  });

  const { data: totalFamilySavings, isLoading: isLoadingTotalSavings } = useQuery<number, Error>({
    queryKey: ["totalFamilySavings"],
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

  useEffect(() => {
    if (userContributionsData && currentPageContributions < Math.ceil((userContributionsData.count || 0) / ITEMS_PER_PAGE)) {
      queryClient.prefetchQuery({
        queryKey: ["userContributions", user?.id, currentPageContributions + 1, debouncedSearchTermContributions],
        queryFn: () => fetchUserContributions(user!.id, currentPageContributions + 1, ITEMS_PER_PAGE, debouncedSearchTermContributions),
      });
    }
  }, [userContributionsData, currentPageContributions, debouncedSearchTermContributions, user?.id, queryClient]);

  useEffect(() => {
    if (emergencyRequestsData && currentPageEmergencyRequests < Math.ceil((emergencyRequestsData.count || 0) / ITEMS_PER_PAGE)) {
      queryClient.prefetchQuery({
        queryKey: ["emergencyRequests", user?.id, isAdmin, currentPageEmergencyRequests + 1, debouncedSearchTermEmergencyRequests],
        queryFn: () => fetchEmergencyRequests(user?.id || null, isAdmin, currentPageEmergencyRequests + 1, ITEMS_PER_PAGE, debouncedSearchTermEmergencyRequests),
      });
    }
  }, [emergencyRequestsData, currentPageEmergencyRequests, debouncedSearchTermEmergencyRequests, user?.id, isAdmin, queryClient]);

  const { data: allUserContributionsForTotal, isLoading: isLoadingAllContributionsForTotal } = useQuery<PaginatedData<MonthlyContribution>, Error>({
    queryKey: ["allUserContributionsForTotal", user?.id],
    queryFn: () => fetchUserContributions(user!.id, 1, 10000, ""), 
    enabled: !!user,
  });

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
          value={isLoadingAllContributionsForTotal ? "Loading..." : totalPaidByUser }
          icon={DollarSign}
          description={isLoadingAllContributionsForTotal ? "Fetching..." : "Total amount you've contributed."}
          iconClassName="text-green-500"
        />
        <StatCard
          title="Contribution Status"
          value={isLoadingAllContributionsForTotal ? "Loading..." : (paymentDifferenceMonths > 0 ? `${paymentDifferenceMonths} Adv. Mths` : pendingAmountValue)}
          icon={pendingStatusIcon}
          valuePrefix={paymentDifferenceMonths > 0 ? "" : CURRENCY_SYMBOL}
          description={isLoadingAllContributionsForTotal ? "Fetching..." : pendingStatusDescription}
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
          isLoading={isLoadingContributions} // Pass the specific loading state
          totalCount={userContributionsData?.count || 0}
          currentPage={currentPageContributions}
          onPageChange={setCurrentPageContributions}
          searchTerm={searchTermContributions}
          onSearchChange={handleContributionSearchChange}
          itemsPerPage={ITEMS_PER_PAGE}
        />
        <EmergencyRequestHistoryTable
          requests={emergencyRequestsData?.data}
          isLoading={isLoadingEmergencyRequests} // Pass the specific loading state
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
