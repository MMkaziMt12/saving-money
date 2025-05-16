
"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Profile } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Loader2, User, Mail, Phone, Shield, CalendarDays, ArrowLeft, AlertTriangle, DollarSign, ListChecks, History, Search, RefreshCw } from "lucide-react";
import { format, parseISO, isPast, differenceInCalendarMonths, getYear, getMonth } from "date-fns"; 
import { CURRENCY_SYMBOL, MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import React, { useEffect, useMemo, useState } from "react";
import type { VariantProps } from "class-variance-authority";
import { 
  fetchUserProfileForAdmin, 
  fetchUserContributionsForAdmin, 
  fetchUserEmergencyRequestsForAdminDetail,
  type UserContributionForAdminDetail,
  type UserEmergencyRequestForAdminDetail
} from "@/lib/api/admin"; // Updated imports

const ITEMS_PER_PAGE_CONTRIBUTIONS_DETAIL = 5;

interface InfoItemProps {
  icon: React.ElementType;
  label: string;
  value: string | React.ReactNode;
  valueClass?: string;
}

const InfoItem = React.memo(({ icon: Icon, label, value, valueClass }: InfoItemProps) => {
  return (
    <div className="flex items-start py-2 border-b border-muted last:border-b-0">
      <Icon className="h-5 w-5 text-muted-foreground mr-3 sm:mr-4 mt-1 shrink-0" />
      <div className="flex-1">
        <span className="font-medium text-foreground/80 block mb-0.5 text-xs sm:text-sm">{label}:</span>
        <span className={cn("text-foreground break-words text-sm sm:text-base", valueClass)}>{value}</span>
      </div>
    </div>
  );
});
InfoItem.displayName = 'InfoItem';

const getRequestStatusBadgeInfo = (request: UserEmergencyRequestForAdminDetail): { variant: VariantProps<typeof Badge>["variant"], text: string } => {
    if (request.is_fully_repaid) {
      return { variant: "success", text: "Fully Repaid" };
    }
    if (request.status === 'approved') {
      if (request.return_date && isPast(parseISO(request.return_date))) {
        return { variant: "destructive", text: "Overdue" };
      }
      return { variant: "default", text: "Approved" };
    }
    if (request.status === "rejected") {
      return { variant: "destructive", text: "Rejected" };
    }
    if (request.status === "pending") {
      return { variant: "secondary", text: "Pending" };
    }
    return { variant: "outline", text: request.status || "Unknown" };
};

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user: adminUser, isAdmin, isLoading: authLoading, isApproved: adminIsApproved } = useAuth();
  const userId = params.userId as string;

  const [contributionSearchTerm, setContributionSearchTerm] = useState("");
  const [currentContributionPage, setCurrentContributionPage] = useState(1);

  useEffect(() => {
    if (!authLoading) {
      if (!adminUser || !adminIsApproved) {
        router.replace("/login");
        return;
      }
      if (!isAdmin) {
        toast({ title: "Access Denied", description: "You do not have permission to view this page.", variant: "destructive" });
        router.replace("/");
        return;
      }
    }
  }, [adminUser, isAdmin, authLoading, adminIsApproved, router, toast]);

  const { 
    data: userProfile, 
    isLoading: isLoadingProfile, 
    isError: isProfileError,
    error: profileErrorObj,
    refetch: refetchUserProfile
  } = useQuery<Profile | null, Error>({
    queryKey: ["userProfileForAdmin", userId], // Specific query key for admin context
    queryFn: () => fetchUserProfileForAdmin(userId),
    enabled: !!userId && isAdmin,
  });

  const { 
    data: contributions, 
    isLoading: isLoadingContributions, 
    isError: isContributionsError,
    error: contributionsErrorObj,
    refetch: refetchContributions
  } = useQuery<UserContributionForAdminDetail[], Error>({
    queryKey: ["userContributionsForAdmin", userId], 
    queryFn: () => fetchUserContributionsForAdmin(userId),
    enabled: !!userId && isAdmin,
  });

  const { 
    data: emergencyRequests, 
    isLoading: isLoadingEmergencyRequests, 
    isError: isEmergencyRequestsError,
    error: emergencyRequestsErrorObj,
    refetch: refetchEmergencyRequests
  } = useQuery<UserEmergencyRequestForAdminDetail[], Error>({
    queryKey: ["userEmergencyRequestsForAdminDetail", userId], // Specific key for detail page
    queryFn: () => fetchUserEmergencyRequestsForAdminDetail(userId),
    enabled: !!userId && isAdmin,
  });

  const filteredContributions = useMemo(() => {
    if (!contributions) return [];
    const searchTermLower = contributionSearchTerm.toLowerCase();
    return contributions.filter(c => {
      const paymentDate = c.payment_date ? format(parseISO(c.payment_date), "MMM dd, yyyy").toLowerCase() : "";
      const contributionFor = format(new Date(c.year, c.month - 1), "MMMM yyyy").toLowerCase();
      const amount = String(c.amount).toLowerCase();
      const recordedBy = (c.recorded_by_admin_name || 'System/User').toLowerCase();
      return paymentDate.includes(searchTermLower) ||
             contributionFor.includes(searchTermLower) ||
             amount.includes(searchTermLower) ||
             recordedBy.includes(searchTermLower);
    });
  }, [contributions, contributionSearchTerm]);

  const paginatedContributions = useMemo(() => {
    const startIndex = (currentContributionPage - 1) * ITEMS_PER_PAGE_CONTRIBUTIONS_DETAIL;
    return filteredContributions.slice(startIndex, startIndex + ITEMS_PER_PAGE_CONTRIBUTIONS_DETAIL);
  }, [filteredContributions, currentContributionPage]);

  const totalContributionPages = Math.ceil(filteredContributions.length / ITEMS_PER_PAGE_CONTRIBUTIONS_DETAIL);

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    const names = name.split(" ");
    if (names.length === 1) return names[0][0].toUpperCase();
    return (names[0][0]?.toUpperCase() || "") + (names[names.length - 1][0]?.toUpperCase() || "");
  };

  if (authLoading || (!isAdmin && !authLoading && !adminUser)) { // Ensure adminUser check is also gated by authLoading
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Verifying admin access...</p>
      </div>
    );
  }

  if (!isAdmin && adminUser) {
     return (
      <div className="flex items-center justify-center h-screen py-10">
        <p className="text-lg text-destructive">Access Denied. You are not an administrator.</p>
      </div>
    );
  }

  const combinedError = profileErrorObj || contributionsErrorObj || emergencyRequestsErrorObj;
  const combinedIsLoading = (isLoadingProfile && !userProfile && !isProfileError) || 
                            (isLoadingContributions && !contributions && !isContributionsError) || 
                            (isLoadingEmergencyRequests && !emergencyRequests && !isEmergencyRequestsError);


  if (combinedIsLoading) {
    return (
      <div className="flex items-center justify-center h-full py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading user details...</p>
      </div>
    );
  }

  if (combinedError && (!userProfile || !contributions || !emergencyRequests)) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-10 text-center px-4">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-destructive mb-2">Error loading user details.</p>
        <p className="text-sm text-muted-foreground mb-4">
          {combinedError.message || "An unknown error occurred."}
        </p>
        <Button onClick={() => {
            if (isProfileError) refetchUserProfile();
            if (isContributionsError) refetchContributions();
            if (isEmergencyRequestsError) refetchEmergencyRequests();
        }} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" /> Try again
        </Button>
        <Button onClick={() => router.back()} variant="link" className="mt-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-10 text-center px-4">
        <User className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">User profile not found.</p>
        <Button onClick={() => router.back()} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    );
  }

  const totalPaidByUser = contributions?.reduce((sum, c) => sum + c.amount, 0) || 0;
  const joinedAtDate = userProfile.created_at ? parseISO(userProfile.created_at) : new Date();
  
  const currentDate = new Date();
  const startMonthDate = new Date(getYear(joinedAtDate), getMonth(joinedAtDate), 1);
  const endMonthDate = new Date(getYear(currentDate), getMonth(currentDate), 1);
  let monthsSinceJoined = differenceInCalendarMonths(endMonthDate, startMonthDate) + 1;
  monthsSinceJoined = Math.max(1, monthsSinceJoined);

  const totalExpected = monthsSinceJoined * MONTHLY_CONTRIBUTION_AMOUNT;
  const pendingAmount = Math.max(0, totalExpected - totalPaidByUser);

  return (
    <div className="container mx-auto py-8 px-4 sm:px-0 max-w-4xl space-y-8">
      <Button onClick={() => router.push("/admin?tab=users")} variant="outline" className="mb-2">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to User Management
      </Button>

      <Card className="shadow-xl">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6">
            <Avatar className="h-24 w-24 md:h-32 md:w-32 border-4 border-primary/50 shadow-md">
              <AvatarImage src={userProfile.avatar_url || undefined} alt={userProfile.full_name || "User"} data-ai-hint={userProfile.avatar_url ? "person profile" : "profile placeholder"}/>
              <AvatarFallback className="text-3xl md:text-4xl">{getInitials(userProfile.full_name)}</AvatarFallback>
            </Avatar>
            <div className="text-center md:text-left">
              <CardTitle className="text-2xl md:text-3xl font-bold">{userProfile.full_name || "N/A"}</CardTitle>
              <CardDescription className="text-md text-muted-foreground mt-1">{userProfile.email}</CardDescription>
              <div className="mt-2 space-x-2">
                <Badge variant={userProfile.role === 'admin' ? 'destructive' : 'secondary'} className="capitalize">
                  {userProfile.role}
                </Badge>
                <Badge variant={userProfile.is_approved ? 'success' : 'outline'} className={cn(userProfile.is_approved ? 'border-green-500 text-green-700 bg-green-50' : 'border-orange-500 text-orange-600 bg-orange-50')}>
                  {userProfile.is_approved ? "Approved" : "Pending Approval"}
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 grid md:grid-cols-2 gap-x-6 gap-y-0">
            <InfoItem icon={User} label="Full Name" value={userProfile.full_name || "N/A"} />
            <InfoItem icon={Mail} label="Email" value={userProfile.email || "N/A"} />
            <InfoItem icon={Phone} label="Phone" value={userProfile.phone || "N/A"} />
            <InfoItem icon={Shield} label="Account Status" value={userProfile.is_approved ? "Approved" : "Pending Approval"} valueClass={userProfile.is_approved ? "text-green-600 font-semibold" : "text-orange-500 font-semibold"} />
            <InfoItem icon={CalendarDays} label="Account Created" value={userProfile.created_at ? format(parseISO(userProfile.created_at), "MMMM dd, yyyy") : 'N/A'} />
            <InfoItem icon={DollarSign} label="Total Contributed" value={`${CURRENCY_SYMBOL}${totalPaidByUser.toLocaleString()}`} valueClass="text-green-600 font-semibold" />
            <InfoItem icon={AlertTriangle} label="Pending Amount" value={`${CURRENCY_SYMBOL}${pendingAmount.toLocaleString()}`} valueClass={pendingAmount > 0 ? "text-orange-500 font-semibold" : "text-green-600 font-semibold"} />
        </CardContent>
      </Card>

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-primary"/>Contribution History for {userProfile.full_name}</CardTitle>
          <CardDescription>Overview of this user&apos;s monthly contributions. Search by date, month/year, amount, or recorder.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search contributions..."
              value={contributionSearchTerm}
              onChange={(e) => {
                setContributionSearchTerm(e.target.value);
                setCurrentContributionPage(1);
              }}
              className="pl-10 w-full md:w-1/2 lg:w-1/3"
              disabled={isLoadingContributions && !!contributions}
            />
          </div>
          {(isLoadingContributions && !!contributions && !isContributionsError) && ( // Show only when refetching with existing data
             <div className="py-4 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2"/> Refreshing contributions...
            </div>
          )}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Month/Year of Contribution</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden sm:table-cell">Recorded By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(isLoadingContributions && !contributions && !isContributionsError) ? ( // Initial load
                    <TableRow><TableCell colSpan={4} className="text-center h-24"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></TableCell></TableRow>
                ) : paginatedContributions && paginatedContributions.length > 0 ? (
                  paginatedContributions.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.payment_date ? format(parseISO(c.payment_date), "MMM dd, yyyy") : 'N/A'}</TableCell>
                      <TableCell>{format(new Date(c.year, c.month - 1), "MMMM yyyy")}</TableCell>
                      <TableCell className="text-right">{CURRENCY_SYMBOL}{c.amount.toLocaleString()}</TableCell>
                      <TableCell className="hidden sm:table-cell break-words">{c.recorded_by_admin_name || (c.recorded_by_admin_id ? 'Admin' : 'System/User')}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                      {contributions && contributions.length > 0 ? 'No contributions match your search.' : 'No contributions found for this user.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {totalContributionPages > 1 && (
            <div className="flex items-center justify-end space-x-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentContributionPage(prev => Math.max(1, prev - 1))}
                disabled={currentContributionPage === 1 || (isLoadingContributions && !!contributions)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentContributionPage} of {totalContributionPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentContributionPage(prev => Math.min(totalContributionPages, prev + 1))}
                disabled={currentContributionPage === totalContributionPages || (isLoadingContributions && !!contributions)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary"/>Emergency Request History for {userProfile.full_name}</CardTitle>
          <CardDescription>Overview of this user&apos;s emergency fund requests.</CardDescription>
        </CardHeader>
        <CardContent>
          {(isLoadingEmergencyRequests && !emergencyRequests && !isEmergencyRequestsError) ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="ml-2 text-muted-foreground">Loading requests...</p>
            </div>
          ) : emergencyRequests && emergencyRequests.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requested At</TableHead>
                    <TableHead className="text-right">Amount Req.</TableHead>
                    <TableHead className="text-right">Amount Ret.</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Exp. Return</TableHead>
                    <TableHead>Last Repayment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emergencyRequests.map((req) => {
                    const statusInfo = getRequestStatusBadgeInfo(req);
                    return (
                      <TableRow key={req.id}>
                        <TableCell>{req.requested_at ? format(parseISO(req.requested_at), "MMM dd, yy HH:mm") : 'N/A'}</TableCell>
                        <TableCell className="text-right">{CURRENCY_SYMBOL}{req.amount_requested.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{CURRENCY_SYMBOL}{(req.amount_returned || 0).toLocaleString()}</TableCell>
                        <TableCell className="max-w-xs truncate break-words">{req.reason}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={statusInfo.variant} 
                            className={cn("capitalize min-w-[100px] text-center justify-center", 
                            {'bg-yellow-500 hover:bg-yellow-600 text-white': statusInfo.text === 'Pending'},
                            {'bg-green-500 hover:bg-green-600 text-white': statusInfo.text === 'Approved' }, 
                            {'bg-green-600 hover:bg-green-700 text-white': statusInfo.text === 'Fully Repaid'},
                            {'bg-red-500 hover:bg-red-600 text-white': statusInfo.text === 'Rejected' || statusInfo.text === 'Overdue' }
                            )}
                          >
                            {statusInfo.text}
                          </Badge>
                        </TableCell>
                        <TableCell>{req.return_date ? format(parseISO(req.return_date), "MMM dd, yyyy") : <span className="text-muted-foreground text-xs">N/A</span>}</TableCell>
                        <TableCell>{req.last_return_date ? format(parseISO(req.last_return_date), "MMM dd, yyyy") : <span className="text-muted-foreground text-xs">N/A</span>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-6">No emergency requests found for this user.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
