
"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Profile, MonthlyContribution } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, User, Mail, Phone, Shield, CalendarDays, ArrowLeft, AlertTriangle, DollarSign } from "lucide-react";
import { format, parseISO } from "date-fns";
import { CURRENCY_SYMBOL, MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import React, { useEffect } from "react"; // Ensure React is imported

const supabase = createClient();

async function fetchUserProfile(userId: string): Promise<Profile | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    // Optimized: Select specific columns
    .select('id, full_name, email, phone, avatar_url, role, is_approved, created_at')
    .eq("id", userId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function fetchUserContributions(userId: string): Promise<Pick<MonthlyContribution, 'id' | 'payment_date' | 'month' | 'year' | 'amount' | 'recorded_by_admin_name' | 'recorded_by_admin_id'>[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("monthly_contributions")
    // Optimized: Select specific columns
    .select("id, payment_date, month, year, amount, recorded_by_admin_name, recorded_by_admin_id")
    .eq("user_id", userId)
    .order("payment_date", { ascending: false });
  if (error) throw new Error(error.message);
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


export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user: adminUser, isAdmin, isLoading: authLoading, isApproved: adminIsApproved } = useAuth();
  const userId = params.userId as string;

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

  const { data: userProfile, isLoading: isLoadingProfile, error: profileError } = useQuery<Profile | null, Error>({
    queryKey: ["userProfile", userId],
    queryFn: () => fetchUserProfile(userId),
    enabled: !!userId && isAdmin, 
  });

  const { data: contributions, isLoading: isLoadingContributions, error: contributionsError } = useQuery<Pick<MonthlyContribution, 'id' | 'payment_date' | 'month' | 'year' | 'amount' | 'recorded_by_admin_name' | 'recorded_by_admin_id'>[], Error>({
    queryKey: ["userContributions", userId],
    queryFn: () => fetchUserContributions(userId),
    enabled: !!userId && isAdmin, 
  });

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    const names = name.split(" ");
    if (names.length === 1) return names[0][0].toUpperCase();
    return (names[0][0]?.toUpperCase() || "") + (names[names.length - 1][0]?.toUpperCase() || "");
  };

  if (authLoading || (!isAdmin && !authLoading)) {
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

  if (isLoadingProfile || isLoadingContributions) {
    return (
      <div className="flex items-center justify-center h-full py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading user details...</p>
      </div>
    );
  }

  if (profileError || contributionsError) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-10 text-center px-4">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-destructive mb-2">Error loading user details.</p>
        <p className="text-sm text-muted-foreground mb-4">
          {profileError?.message || contributionsError?.message}
        </p>
        <Button onClick={() => router.back()} variant="outline">
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
  const monthsJoined = Math.max(1, Math.floor((Date.now() - joinedAtDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
  const totalExpected = monthsJoined * MONTHLY_CONTRIBUTION_AMOUNT;
  const pendingAmount = Math.max(0, totalExpected - totalPaidByUser);

  return (
    <div className="container mx-auto py-8 px-4 sm:px-0 max-w-4xl">
      <Button onClick={() => router.push("/admin?tab=users")} variant="outline" className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to User Management
      </Button>

      <Card className="shadow-xl mb-8">
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
            <InfoItem icon={CalendarDays} label="Account Created" value={format(joinedAtDate, "MMMM dd, yyyy")} />
            <InfoItem icon={DollarSign} label="Total Contributed" value={`${CURRENCY_SYMBOL}${totalPaidByUser.toLocaleString()}`} valueClass="text-green-600 font-semibold" />
            <InfoItem icon={AlertTriangle} label="Pending Amount" value={`${CURRENCY_SYMBOL}${pendingAmount.toLocaleString()}`} valueClass={pendingAmount > 0 ? "text-orange-500 font-semibold" : "text-green-600 font-semibold"} />
        </CardContent>
      </Card>

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle>Contribution History for {userProfile.full_name}</CardTitle>
          <CardDescription>Overview of this user's monthly contributions.</CardDescription>
        </CardHeader>
        <CardContent>
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
                {contributions && contributions.length > 0 ? (
                  contributions.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{format(parseISO(c.payment_date), "MMM dd, yyyy")}</TableCell>
                      <TableCell>{format(new Date(c.year, c.month - 1), "MMMM yyyy")}</TableCell>
                      <TableCell className="text-right">{CURRENCY_SYMBOL}{c.amount.toLocaleString()}</TableCell>
                      <TableCell className="hidden sm:table-cell">{c.recorded_by_admin_name || (c.recorded_by_admin_id ? 'Admin' : 'System/User')}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                      No contributions found for this user.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
