
"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { EmergencyRequest, Notification as AppNotification, Profile } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, badgeVariants } from "@/components/ui/badge"; // Import badgeVariants
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, User, Mail, Phone, Shield, CalendarDays, MessageSquare, ArrowLeft, AlertTriangle, DollarSign, Info, ListChecks, Hash, ExternalLink } from "lucide-react";
import { format, parseISO, formatDistanceToNowStrict, isPast } from "date-fns";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import React, { useEffect } from "react"; // Ensure React is imported

const supabase = createClient();

async function fetchEmergencyRequestDetails(requestId: string): Promise<EmergencyRequest | null> {
  if (!requestId) return null;
  const { data, error } = await supabase
    .from("emergency_requests")
    // Optimized: Select specific columns and from joined tables
    .select(`
      id, user_id, amount_requested, reason, status, requested_at, return_date,
      amount_returned, is_fully_repaid, last_return_date, admin_notes, reviewed_at, reviewed_by_admin_id,
      profile_user:profiles!emergency_requests_user_id_fkey(full_name, avatar_url),
      profile_admin:profiles!emergency_requests_reviewed_by_admin_id_fkey(full_name)
    `)
    .eq("id", requestId)
    .single();
  if (error) {
    console.error("Error fetching emergency request details:", error);
    throw new Error(error.message);
  }
  return data as EmergencyRequest | null; // Cast as some joined fields are partial
}

async function fetchRelatedNotifications(requestId: string): Promise<AppNotification[]> {
  if (!requestId) return [];
  const { data, error } = await supabase
    .from("notifications")
    // Optimized: Select specific columns
    .select("id, message, created_at, read_at, link")
    .eq("related_request_id", requestId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching related notifications:", error);
    throw new Error(error.message);
  }
  return data || [];
}

interface InfoItemProps {
  icon: React.ElementType;
  label: string;
  value: string | React.ReactNode;
  valueClass?: string;
}

const InfoItem = React.memo(({ icon: Icon, label, value, valueClass }: InfoItemProps) => {
  return (
    <div className="flex items-start py-3 border-b border-muted last:border-b-0">
      <Icon className="h-5 w-5 text-muted-foreground mr-3 sm:mr-4 mt-1 shrink-0" />
      <div className="flex-1">
        <span className="font-medium text-foreground/80 block mb-0.5 text-xs sm:text-sm">{label}:</span>
        <span className={cn("text-foreground break-words text-sm sm:text-base", valueClass)}>{value}</span>
      </div>
    </div>
  );
});
InfoItem.displayName = 'InfoItem';

const getStatusBadgeVariant = (request: EmergencyRequest | null): VariantProps<typeof Badge>["variant"] => {
    if (!request) return "outline";
    if (request.is_fully_repaid) return "success";
    if (request.status === 'approved' && request.return_date && isPast(parseISO(request.return_date)) && !request.is_fully_repaid) return "destructive";
    if (request.status === "approved") return "default"; 
    if (request.status === "rejected") return "destructive";
    if (request.status === "pending") return "secondary"; 
    return "outline";
  };

  const getRepaymentStatusText = (request: EmergencyRequest | null) => {
    if (!request) return "Unknown";
    if (request.is_fully_repaid) return "Fully Repaid";
    if (request.status === 'approved') {
       if (request.return_date && isPast(parseISO(request.return_date)) && !request.is_fully_repaid) return "Overdue";
       return "Outstanding";
    }
    return request.status;
  }

export default function EmergencyRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user, isLoading: authLoading, isApproved } = useAuth();
  const requestId = params.requestId as string;

  useEffect(() => {
    if (!authLoading && (!user || !isApproved)) {
      router.replace("/login");
    }
  }, [user, authLoading, isApproved, router]);

  const { data: requestDetails, isLoading: isLoadingRequest, error: requestError } = useQuery<EmergencyRequest | null, Error>({
    queryKey: ["emergencyRequestDetails", requestId],
    queryFn: () => fetchEmergencyRequestDetails(requestId),
    enabled: !!requestId && !!user,
  });

  const { data: notifications, isLoading: isLoadingNotifications, error: notificationsError } = useQuery<AppNotification[], Error>({
    queryKey: ["relatedNotifications", requestId],
    queryFn: () => fetchRelatedNotifications(requestId),
    enabled: !!requestId && !!user,
  });

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    const names = name.split(" ");
    if (names.length === 1) return names[0][0].toUpperCase();
    return (names[0][0]?.toUpperCase() || "") + (names[names.length - 1][0]?.toUpperCase() || "");
  };

  if (authLoading || (isLoadingRequest && !requestDetails) || (isLoadingNotifications && !notifications)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading request details...</p>
      </div>
    );
  }

  if (requestError || notificationsError) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-10 text-center px-4">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-destructive mb-2">Error loading request details.</p>
        <p className="text-sm text-muted-foreground mb-4">
          {requestError?.message || notificationsError?.message}
        </p>
        <Button onClick={() => router.back()} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    );
  }

  if (!requestDetails) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-10 text-center px-4">
        <ListChecks className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">Emergency request not found.</p>
        <Button onClick={() => router.back()} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    );
  }
  
  const requesterProfile = requestDetails.profile_user;
  const adminProfile = requestDetails.profile_admin;
  const requestedAtDate = requestDetails.requested_at ? parseISO(requestDetails.requested_at) : new Date();
  const returnDate = requestDetails.return_date ? parseISO(requestDetails.return_date) : null;
  const reviewedAtDate = requestDetails.reviewed_at ? parseISO(requestDetails.reviewed_at) : null;
  const lastReturnDate = requestDetails.last_return_date ? parseISO(requestDetails.last_return_date) : null;

  const statusText = getRepaymentStatusText(requestDetails);
  const statusBadgeVariant = getStatusBadgeVariant(requestDetails);

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 max-w-4xl space-y-8">
      <Button onClick={() => router.back()} variant="outline" className="mb-2">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <Card className="shadow-xl">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col md:flex-row items-start gap-4 md:gap-6">
            {requesterProfile && (
                 <Avatar className="h-20 w-20 md:h-24 md:w-24 border-2 border-primary/30 shadow-sm">
                    <AvatarImage src={requesterProfile.avatar_url || undefined} alt={requesterProfile.full_name || "User"} data-ai-hint="person profile" />
                    <AvatarFallback className="text-2xl md:text-3xl">{getInitials(requesterProfile.full_name)}</AvatarFallback>
                </Avatar>
            )}
            <div className="flex-1">
              <CardTitle className="text-xl md:text-2xl font-bold mb-1">Emergency Request Details</CardTitle>
              <CardDescription className="text-sm md:text-md text-muted-foreground">
                Submitted by: <span className="font-semibold text-primary">{requesterProfile?.full_name || "Unknown User"}</span>
              </CardDescription>
              <div className="mt-3">
                 <Badge 
                    variant={statusBadgeVariant}
                    className={cn("capitalize text-xs sm:text-sm px-3 py-1",
                        {'bg-yellow-500 hover:bg-yellow-600 text-white': statusText === 'pending' || statusText === 'Pending' }, // Handle case variations
                        {'bg-green-500 hover:bg-green-600 text-white': (statusText === 'Approved' || statusText === 'Outstanding') && !(requestDetails.return_date && isPast(parseISO(requestDetails.return_date)) && !requestDetails.is_fully_repaid) },
                        {'bg-green-600 hover:bg-green-700 text-white': statusText === 'Fully Repaid'},
                        {'bg-red-500 hover:bg-red-600 text-white': statusText === 'Rejected' || statusText === 'Overdue' }
                    )}
                 >
                    {statusText}
                 </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 grid md:grid-cols-2 gap-x-6 gap-y-0">
            <InfoItem icon={Hash} label="Request ID" value={requestDetails.id.substring(0,8)} />
            <InfoItem icon={User} label="Requested By" value={requesterProfile?.full_name || "N/A"} />
            <InfoItem icon={DollarSign} label="Amount Requested" value={`${CURRENCY_SYMBOL}${requestDetails.amount_requested.toLocaleString()}`} valueClass="font-semibold text-primary" />
            <InfoItem icon={DollarSign} label="Amount Returned" value={`${CURRENCY_SYMBOL}${(requestDetails.amount_returned || 0).toLocaleString()}`} valueClass={requestDetails.amount_returned && requestDetails.amount_returned > 0 ? "text-green-600 font-semibold" : ""} />
            <InfoItem icon={CalendarDays} label="Requested At" value={format(requestedAtDate, "MMMM dd, yyyy HH:mm")} />
            {returnDate && <InfoItem icon={CalendarDays} label="Expected Return Date" value={format(returnDate, "MMMM dd, yyyy")} />}
            {lastReturnDate && <InfoItem icon={CalendarDays} label="Last Repayment Date" value={format(lastReturnDate, "MMMM dd, yyyy HH:mm")} />}
            {reviewedAtDate && adminProfile && <InfoItem icon={Shield} label="Reviewed By" value={`${adminProfile.full_name} on ${format(reviewedAtDate, "MMMM dd, yyyy HH:mm")}`} />}
            {reviewedAtDate && !adminProfile && requestDetails.reviewed_by_admin_id && <InfoItem icon={Shield} label="Reviewed By Admin ID" value={requestDetails.reviewed_by_admin_id.substring(0,8)} />}
        </CardContent>
        <CardFooter className="flex-col items-start pt-4 border-t">
            <InfoItem icon={Info} label="Reason for Request" value={<p className="whitespace-pre-wrap">{requestDetails.reason}</p>} />
            {requestDetails.admin_notes && <InfoItem icon={MessageSquare} label="Admin Notes" value={<p className="whitespace-pre-wrap bg-muted/50 p-3 rounded-md">{requestDetails.admin_notes}</p>} />}
        </CardFooter>
      </Card>

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle>Notifications for this Request</CardTitle>
          <CardDescription>History of communications regarding this emergency request.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingNotifications ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : notifications && notifications.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2 rounded-md border p-3">
              {notifications.map(notification => (
                <div key={notification.id} className={cn("p-3 rounded-md border", notification.read_at ? "bg-card hover:bg-muted/30" : "bg-primary/10 border-primary/30")}>
                  <p className={cn("text-sm", !notification.read_at && "font-semibold")}>{notification.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sent: {notification.created_at ? format(parseISO(notification.created_at), "MMM dd, yyyy HH:mm") : 'N/A'}
                    {notification.read_at && ` | Read: ${formatDistanceToNowStrict(parseISO(notification.read_at), { addSuffix: true })}`}
                  </p>
                  {notification.link && notification.link !== `/requests/${requestId}` && (
                     <Link href={notification.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1">
                        View Context <ExternalLink className="h-3 w-3"/>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-6">No notifications found for this request.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
