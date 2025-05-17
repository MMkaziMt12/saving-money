
"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { DollarSign, ShieldAlert, Users, BarChart3, AlertTriangle, CheckCircle2, Gift, TrendingDown, TrendingUp, Coins, RefreshCw, Loader2, Clock } from "lucide-react";
import { CURRENCY_SYMBOL, MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants";
import type { Profile, AuthenticatedUser as AppUser } from "@/types";
import { format, parseISO, differenceInCalendarMonths, getYear, getMonth } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StatCard } from "@/components/shared/StatCard";
import { useState, useEffect, useMemo } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { PaymentHistoryTable } from "@/components/dashboard/PaymentHistoryTable";
import { EmergencyRequestHistoryTable } from "@/components/dashboard/EmergencyRequestHistoryTable";
import { 
  fetchUserContributionsForDashboard, 
  fetchAllFamilyEmergencyRequestsForDashboard, 
  fetchTotalFamilySavingsRPC, 
  fetchAllUserContributionsForStatus,
  type UserContributionForTable,
  type FamilyEmergencyRequestForTable,
  type UserContributionForStatus,
  type PaginatedData
} from "@/lib/api/dashboard";
import { createClient as createClientComponentClient } from "@/lib/supabase/client"; // Client-side client for refetches

const ITEMS_PER_PAGE = 5;

interface DashboardClientContentProps {
  initialUser: AppUser | null;
  initialProfile: Profile | null;
  appName: string;
}

export function DashboardClientContent({ initialUser, initialProfile, appName }: DashboardClientContentProps) {
  // Use AuthContext for live user/profile updates and isAdmin status after initial load
  const { user: authContextUser, profile: authContextProfile, isAdmin, isLoading: authLoading, fetchProfile } = useAuth();
  const queryClient = useQueryClient();
  const supabase = createClientComponentClient(); // Client for client-side fetches by TanStack Query

  // Prioritize context user/profile once loaded, fallback to initial props
  const currentUser = authContextUser || initialUser;
  const currentProfile = authContextProfile || initialProfile;

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
    error: userContributionsErrorObj,
    refetch: refetchUserContributions
  } = useQuery<PaginatedData<UserContributionForTable>, Error>({
    queryKey: ["userContributionsForDashboard", currentUser?.id, currentPageContributions, debouncedSearchTermContributions],
    queryFn: () => fetchUserContributionsForDashboard(supabase, currentUser?.id, currentPageContributions, ITEMS_PER_PAGE, debouncedSearchTermContributions),
    enabled: !!currentUser?.id,
    keepPreviousData: true,
  });

  const { 
    data: allEmergencyRequestsData, 
    isLoading: isLoadingEmergencyRequests, 
    isError: isEmergencyRequestsError,
    error: emergencyRequestsErrorObj,
    refetch: refetchAllEmergencyRequests
  } = useQuery<PaginatedData<FamilyEmergencyRequestForTable>, Error>({
    queryKey: ["allFamilyEmergencyRequestsForDashboard", currentPageEmergencyRequests, debouncedSearchTermEmergencyRequests],
    queryFn: () => fetchAllFamilyEmergencyRequestsForDashboard(supabase, currentPageEmergencyRequests, ITEMS_PER_PAGE, debouncedSearchTermEmergencyRequests),
    enabled: !!currentUser, // Assuming all users can see this
    keepPreviousData: true,
  });

  const { 
    data: totalFamilySavings, 
    isLoading: isLoadingTotalSavings, 
    isError: isTotalSavingsError,
    error: totalSavingsErrorObj,
    refetch: refetchTotalSavings
  } = useQuery<number, Error>({
    queryKey: ["totalFamilySavings"], 
    queryFn: () => fetchTotalFamilySavingsRPC(supabase),
    enabled: !!currentUser,
  });
  
  const { 
    data: allUserContributionsForStatusData, 
    isLoading: isLoadingAllContributionsForStatus, 
    isError: isAllContributionsForStatusError,
    error: allContributionsForStatusErrorObj,
    refetch: refetchAllUserContributionsForStatus
  } = useQuery<UserContributionForStatus[], Error>({
    queryKey: ["allUserContributionsForStatus", currentUser?.id],
    queryFn: () => fetchAllUserContributionsForStatus(supabase, currentUser?.id),
    enabled: !!currentUser?.id && !!currentProfile,
  });

  const userContributionStats = useMemo(() => {
    if (!currentProfile?.created_at || !allUserContributionsForStatusData) {
      return {
        totalPaid: 0,
        userGeneralContributionStatusText: "Calculating...",
        userPendingAmountValue: 0,
        userDetailedContributionDescription: "Calculating status...",
        userContributionStatusIcon: Clock,
        userContributionValueColorClass: "text-orange-500",
        paymentDifferenceMonths: 0,
      };
    }

    const totalPaid = allUserContributionsForStatusData.reduce((sum, c) => sum + c.amount, 0);
    const numContributionsMade = allUserContributionsForStatusData.length;
    
    const accountCreationDate = parseISO(currentProfile.created_at);
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
      pendingAmountVal = 0;
      detailedDescriptionVal = `Paid in advance for ${paymentDifferenceMonthsCalc} month${paymentDifferenceMonthsCalc > 1 ? 's' : ''}!`;
      statusIconVal = Gift;
      valueColorClassVal = "text-green-500";
      statusTextVal = "Paid in Advance";
    } else if (paymentDifferenceMonthsCalc < 0) {
      const dueMonthsCount = Math.abs(paymentDifferenceMonthsCalc);
      pendingAmountVal = dueMonthsCount * MONTHLY_CONTRIBUTION_AMOUNT;
      detailedDescriptionVal = `Pending payment for ${dueMonthsCount} month${dueMonthsCount > 1 ? 's' : ''}.`;
      statusIconVal = AlertTriangle;
      valueColorClassVal = "text-orange-500";
      statusTextVal = "Payment Due";
    } else { 
      pendingAmountVal = 0; 
      if (monthsSinceJoined === 1 && numContributionsMade === 0 && currentProfile.is_approved) {
        pendingAmountVal = MONTHLY_CONTRIBUTION_AMOUNT;
        detailedDescriptionVal = `Current month's contribution due.`;
        statusIconVal = AlertTriangle;
        valueColorClassVal = "text-orange-500";
        statusTextVal = "Payment Due";
      } else { 
        detailedDescriptionVal = "All contributions paid up to date!";
        statusIconVal = CheckCircle2;
        valueColorClassVal = "text-green-500";
        statusTextVal = "Up to Date";
      }
    }
    return { 
      totalPaid, 
      userGeneralContributionStatusText: statusTextVal, 
      userPendingAmountValue: pendingAmountVal, 
      userDetailedContributionDescription: detailedDescriptionVal, 
      userContributionStatusIcon: statusIconVal, 
      userContributionValueColorClass: valueColorClassVal, 
      paymentDifferenceMonths: paymentDifferenceMonthsCalc 
    };
  }, [currentProfile?.created_at, currentProfile?.is_approved, allUserContributionsForStatusData]);

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
    if (userContributionsData && currentUser?.id && currentPageContributions < Math.ceil((userContributionsData.count || 0) / ITEMS_PER_PAGE)) {
      queryClient.prefetchQuery<PaginatedData<UserContributionForTable>, Error>({
        queryKey: ["userContributionsForDashboard", currentUser.id, currentPageContributions + 1, debouncedSearchTermContributions],
        queryFn: () => fetchUserContributionsForDashboard(supabase, currentUser.id, currentPageContributions + 1, ITEMS_PER_PAGE, debouncedSearchTermContributions),
      });
    }
  }, [userContributionsData, currentPageContributions, debouncedSearchTermContributions, currentUser?.id, queryClient, supabase]);

  useEffect(() => {
    if (allEmergencyRequestsData && currentPageEmergencyRequests < Math.ceil((allEmergencyRequestsData.count || 0) / ITEMS_PER_PAGE)) {
      queryClient.prefetchQuery<PaginatedData<FamilyEmergencyRequestForTable>, Error>({
        queryKey: ["allFamilyEmergencyRequestsForDashboard", currentPageEmergencyRequests + 1, debouncedSearchTermEmergencyRequests],
        queryFn: () => fetchAllFamilyEmergencyRequestsForDashboard(supabase, currentPageEmergencyRequests + 1, ITEMS_PER_PAGE, debouncedSearchTermEmergencyRequests),
      });
    }
  }, [allEmergencyRequestsData, currentPageEmergencyRequests, debouncedSearchTermEmergencyRequests, queryClient, supabase]);

  // This loader handles client-side loading if AuthContext is still resolving user/profile
  // or if critical initial data for rendering user-specific cards isn't available yet.
  const clientSideInitialLoading = authLoading || (!currentProfile && !authLoading) || (isLoadingAllContributionsForStatus && !allUserContributionsForStatusData && !isAllContributionsForStatusError);

  if (clientSideInitialLoading) {
    return (
      <div className="flex items-center justify-center h-full py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading Dashboard...</p>
      </div>
    );
  }
  
  if (!currentUser || !currentProfile || (isAllContributionsForStatusError && !allUserContributionsForStatusData)) {
     const errorToDisplay = allContributionsForStatusErrorObj?.message || "User profile or contribution status could not be loaded.";
     return (
        <div className="flex flex-col items-center justify-center h-full py-10 text-center px-4">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-destructive mb-2">Error loading essential dashboard data.</p>
            <p className="text-sm text-muted-foreground mb-4">{errorToDisplay}</p>
            <Button 
                onClick={() => {
                    if (!currentProfile && currentUser && fetchProfile) fetchProfile(currentUser.id, true);
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
        <h1 className="text-3xl font-bold tracking-tight">Welcome to {appName}, {currentProfile.full_name || currentUser.email}!</h1>
        <p className="text-muted-foreground">Here&apos;s your family savings overview.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <StatCard
          title="My Total Contributions"
          value={(isLoadingAllContributionsForStatus && !allUserContributionsForStatusData && !isAllContributionsForStatusError) ? "Loading..." : (isAllContributionsForStatusError ? "Error" : userContributionStats.totalPaid) }
          icon={DollarSign}
          description={isLoadingAllContributionsForStatus ? "Fetching..." : (isAllContributionsForStatusError ? allContributionsForStatusErrorObj?.message : "Total amount you've contributed.")}
          iconClassName="text-green-500"
          valueClassName={isAllContributionsForStatusError ? "text-destructive" : ""}
        />
        <StatCard
          title="Contribution Status"
          value={(isLoadingAllContributionsForStatus && !allUserContributionsForStatusData && !isAllContributionsForStatusError) ? "Loading..." : (isAllContributionsForStatusError ? "Error" : userContributionStats.userGeneralContributionStatusText)}
          icon={isAllContributionsForStatusError ? AlertTriangle : userContributionStats.userContributionStatusIcon}
          description={isLoadingAllContributionsForStatus ? "Fetching..." : (isAllContributionsForStatusError ? allContributionsForStatusErrorObj?.message : (userContributionStats.paymentDifferenceMonths > 0 ? `You are ${userContributionStats.paymentDifferenceMonths} month${userContributionStats.paymentDifferenceMonths > 1 ? 's' : ''} ahead!` : (userContributionStats.userGeneralContributionStatusText === "Payment Due" ? `Please settle your outstanding balance.` : `You're all set!`)) )}
          iconClassName={isAllContributionsForStatusError ? "text-destructive" : userContributionStats.userContributionValueColorClass}
          valueClassName={isAllContributionsForStatusError ? "text-destructive" : userContributionStats.userContributionValueColorClass}
          valuePrefix="" 
        />
        <StatCard
          title="My Dues / Advance"
          value={(isLoadingAllContributionsForStatus && !allUserContributionsForStatusData && !isAllContributionsForStatusError) ? "Loading..." : (isAllContributionsForStatusError ? "Error" : userContributionStats.userPendingAmountValue)}
          icon={isAllContributionsForStatusError ? AlertTriangle : (userContributionStats.userPendingAmountValue > 0 ? AlertTriangle : (userContributionStats.paymentDifferenceMonths > 0 ? Gift : CheckCircle2))}
          valuePrefix={CURRENCY_SYMBOL}
          description={isLoadingAllContributionsForStatus ? "Fetching..." : (isAllContributionsForStatusError ? allContributionsForStatusErrorObj?.message : userContributionStats.userDetailedContributionDescription)}
          iconClassName={isAllContributionsForStatusError ? "text-destructive" : (userContributionStats.userPendingAmountValue > 0 ? "text-orange-500" : (userContributionStats.paymentDifferenceMonths > 0 ? "text-green-500" : "text-green-500"))}
          valueClassName={isAllContributionsForStatusError ? "text-destructive" : userContributionStats.userContributionValueColorClass}
        />
         <StatCard
          title="Current Fund Balance"
          value={(isLoadingTotalSavings && totalFamilySavings === undefined && !isTotalSavingsError) ? "Loading..." : (isTotalSavingsError ? "Error" : (totalFamilySavings ?? 0))}
          icon={BarChart3}
          description={isLoadingTotalSavings ? "Fetching..." : (isTotalSavingsError ? totalSavingsErrorObj?.message : `Fund balance available after disbursements and repayments.`)}
          iconClassName="text-blue-500"
          valueClassName={isTotalSavingsError ? "text-destructive" : ""}
        />
        <StatCard
          title="Total Emergency Funds Disbursed"
          value={(isLoadingEmergencyRequests && !allEmergencyRequestsData && !isEmergencyRequestsError) ? "Loading..." : (isEmergencyRequestsError ? "Error" : emergencyFundStats.totalDisbursed)}
          icon={TrendingDown}
          description={isLoadingEmergencyRequests ? "Fetching..." : (isEmergencyRequestsError ? emergencyRequestsErrorObj?.message : "Total amount paid out for approved emergency requests.")}
          iconClassName="text-red-500"
          valueClassName={isEmergencyRequestsError ? "text-destructive" : ""}
        />
        <StatCard
          title="Total Outstanding Emergency Funds"
          value={(isLoadingEmergencyRequests && !allEmergencyRequestsData && !isEmergencyRequestsError) ? "Loading..." : (isEmergencyRequestsError ? "Error" : emergencyFundStats.totalOutstanding)}
          icon={Coins}
          description={isLoadingEmergencyRequests ? "Fetching..." : (isEmergencyRequestsError ? emergencyRequestsErrorObj?.message : "Total amount currently owed back to the fund from approved requests.")}
          iconClassName="text-yellow-500"
          valueClassName={isEmergencyRequestsError ? "text-destructive" : ""}
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
          isLoading={isLoadingEmergencyRequests && !allEmergencyRequestsData?.data && !isEmergencyRequestsError} 
          isError={isEmergencyRequestsError}
          errorObj={emergencyRequestsErrorObj}
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
          isError={isUserContributionsError}
          errorObj={userContributionsErrorObj}
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
