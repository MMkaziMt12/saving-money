
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Send, Loader2, CalendarIcon, Info, AlertTriangle, RefreshCw } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, isPast, parseISO } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EmergencyRequest } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import React, { useMemo } from "react";

const emergencyRequestSchema = z.object({
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  reason: z.string().min(10, "Reason must be at least 10 characters long").max(500, "Reason cannot exceed 500 characters"),
  return_date: z.date({ required_error: "An expected return date is required." }),
});

type EmergencyRequestFormValues = z.infer<typeof emergencyRequestSchema>;

const supabase = createClient();

async function fetchCurrentUserActiveEmergencyRequests(userId: string | undefined): Promise<EmergencyRequest[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("emergency_requests")
    .select("id, amount_requested, reason, requested_at, return_date, status, is_fully_repaid, amount_returned") // Optimized columns
    .eq("user_id", userId)
    .in("status", ["pending", "approved"]) 
    .order("requested_at", { ascending: false });

  if (error) {
    console.error("Error fetching user's active emergency requests:", JSON.stringify(error, null, 2));
    throw error;
  }
  return data || [];
}

async function fetchTotalFamilySavingsRPC(): Promise<number> {
  const { data, error } = await supabase.rpc('get_total_family_savings');
  if (error) {
    console.error("Error fetching total family savings via RPC on request page:", JSON.stringify(error, null, 2));
    if (data !== undefined) {
      console.log("RPC 'get_total_family_savings' raw data received (on error) on request page:", data);
    }
    throw error;
  }
  if (data === null || data === undefined) {
    console.warn("RPC 'get_total_family_savings' returned null or undefined on request page. Defaulting to 0.");
    return 0;
  }
  const savings = Number(data);
  if (isNaN(savings)) {
    console.warn(`RPC 'get_total_family_savings' returned a non-numeric value on request page: ${data}. Defaulting to 0.`);
    return 0;
  }
  return savings;
}

const RequestTableDisplay = React.memo(({ requests }: { requests: EmergencyRequest[] }) => {
  if (!requests || requests.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Amount</TableHead>
            <TableHead className="hidden sm:table-cell">Reason</TableHead>
            <TableHead>Requested On</TableHead>
            <TableHead>Expected Return</TableHead>
            <TableHead className="text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map(req => (
            <TableRow key={req.id}>
              <TableCell>{CURRENCY_SYMBOL}{req.amount_requested.toLocaleString()}</TableCell>
              <TableCell className="hidden sm:table-cell max-w-xs truncate text-ellipsis whitespace-nowrap overflow-hidden break-words">{req.reason}</TableCell>
              <TableCell>{format(parseISO(req.requested_at), "MMM dd, yyyy")}</TableCell>
              <TableCell>{req.return_date ? format(parseISO(req.return_date), "MMM dd, yyyy") : "N/A"}</TableCell>
              <TableCell className="text-center">
                  <Badge
                      variant={req.status === 'approved' ? (req.return_date && isPast(parseISO(req.return_date)) && !req.is_fully_repaid ? 'destructive' : 'success') : req.status === 'pending' ? 'secondary' : 'outline'}
                      className="capitalize"
                  >
                      {req.status === 'approved' && req.return_date && isPast(parseISO(req.return_date)) && !req.is_fully_repaid ? 'Overdue' : req.status}
                  </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
});
RequestTableDisplay.displayName = "RequestTableDisplay";


export default function EmergencyRequestPage() {
  const { toast } = useToast();
  const { user, profile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<EmergencyRequestFormValues>({
    resolver: zodResolver(emergencyRequestSchema),
    defaultValues: {
      amount: 0,
      reason: "",
      return_date: undefined,
    },
  });

  const { 
    data: existingRequests, 
    isLoading: isLoadingExistingRequests,
    isError: isExistingRequestsError,
    error: existingRequestsErrorObj,
    refetch: refetchExistingRequests
  } = useQuery<EmergencyRequest[], Error>({
    queryKey: ["currentUserActiveEmergencyRequests", user?.id],
    queryFn: () => fetchCurrentUserActiveEmergencyRequests(user?.id),
    enabled: !!user,
  });

  const { 
    data: totalFamilySavings, 
    isLoading: isLoadingTotalSavings,
    isError: isTotalSavingsError,
    error: totalSavingsErrorObj,
    refetch: refetchTotalSavings
  } = useQuery<number, Error>({
    queryKey: ["totalFamilySavingsForRequestForm"],
    queryFn: fetchTotalFamilySavingsRPC,
  });

  const pendingRequests = useMemo(() =>
    existingRequests?.filter(req => req.status === 'pending') || [],
    [existingRequests]
  );

  const approvedOutstandingRequests = useMemo(() =>
    existingRequests?.filter(req => req.status === 'approved' && !req.is_fully_repaid) || [],
    [existingRequests]
  );

  const totalOutstandingAmount = useMemo(() =>
    approvedOutstandingRequests.reduce((sum, req) => sum + (req.amount_requested - (req.amount_returned || 0)), 0),
    [approvedOutstandingRequests]
  );

  async function onSubmit(data: EmergencyRequestFormValues) {
    if (!user || !profile) {
      toast({ title: "Error", description: "You must be logged in to submit a request.", variant: "destructive" });
      return;
    }

    if (totalFamilySavings === undefined || isLoadingTotalSavings) {
        toast({ title: "Validation Error", description: "Fund balance is still loading. Please try again shortly.", variant: "destructive" });
        return;
    }

    if (data.amount > totalFamilySavings) {
        toast({ 
            title: "Request Exceeds Funds", 
            description: `Your requested amount of ${CURRENCY_SYMBOL}${data.amount.toLocaleString()} exceeds the current available fund balance of ${CURRENCY_SYMBOL}${totalFamilySavings.toLocaleString()}.`, 
            variant: "destructive",
            duration: 7000,
        });
        return;
    }

    const { error } = await supabase.from('emergency_requests').insert({
      user_id: user.id,
      amount_requested: data.amount,
      reason: data.reason,
      return_date: data.return_date.toISOString(),
      status: 'pending',
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), 
      created_at: new Date().toISOString(), 
    }).select('id').single(); 

    if (error) {
      toast({
        title: "Submission Failed",
        description: error.message || "Could not submit your request. Please try again.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Request Submitted!",
        description: `Your request for ${CURRENCY_SYMBOL}${data.amount} has been submitted for approval.`,
        variant: "default",
      });
      form.reset({ amount: 0, reason: "", return_date: undefined });
      queryClient.invalidateQueries({ queryKey: ["currentUserActiveEmergencyRequests", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["allFamilyEmergencyRequests"] }); // For dashboard
      queryClient.invalidateQueries({ queryKey: ["totalFamilySavingsForRequestForm"] });
      queryClient.invalidateQueries({ queryKey: ["totalFamilySavings"] }); // For dashboard
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !profile) {
     router.replace("/login");
     return null;
  }

  const showSummaryCard = (!isLoadingExistingRequests && (pendingRequests.length > 0 || approvedOutstandingRequests.length > 0)) || isExistingRequestsError;
  const showFormCard = !isTotalSavingsError;

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 max-w-3xl space-y-8">
      {(isLoadingExistingRequests && !existingRequests && !isExistingRequestsError) ? (
        <Card className="shadow-md">
          <CardHeader><CardTitle className="text-lg">Loading Your Active Requests...</CardTitle></CardHeader>
          <CardContent className="flex justify-center py-6"><Loader2 className="h-8 w-8 animate-spin text-primary" /></CardContent>
        </Card>
      ) : showSummaryCard ? (
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2"><Info className="text-primary h-5 w-5"/>Your Active Emergency Requests</CardTitle>
            <CardDescription>
              Review your pending and approved outstanding emergency fund requests.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isExistingRequestsError && (
              <div className="text-center py-4">
                <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
                <p className="text-destructive mb-1">Error loading your requests.</p>
                <p className="text-sm text-muted-foreground mb-3">{existingRequestsErrorObj?.message || "An unknown error occurred."}</p>
                <Button onClick={() => refetchExistingRequests()} variant="outline" size="sm">
                  <RefreshCw className="mr-2 h-4 w-4" /> Try again
                </Button>
              </div>
            )}
            {!isExistingRequestsError && pendingRequests.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-2 text-foreground/90">Pending Requests ({pendingRequests.length})</h3>
                <RequestTableDisplay requests={pendingRequests} />
              </div>
            )}
            {!isExistingRequestsError && pendingRequests.length > 0 && approvedOutstandingRequests.length > 0 && (
              <hr className="my-6 border-border" />
            )}
            {!isExistingRequestsError && approvedOutstandingRequests.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-2 text-foreground/90">Approved & Outstanding Requests ({approvedOutstandingRequests.length})</h3>
                <RequestTableDisplay requests={approvedOutstandingRequests} />
                {totalOutstandingAmount > 0 && (
                    <p className="mt-4 text-sm font-medium text-muted-foreground">
                        Total outstanding from approved requests: <span className="font-semibold text-primary">{CURRENCY_SYMBOL}{totalOutstandingAmount.toLocaleString()}</span>
                    </p>
                )}
              </div>
            )}
            {!isExistingRequestsError && existingRequests?.length === 0 && (
                <p className="text-center text-muted-foreground py-4">You have no active emergency requests.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {isTotalSavingsError && (
         <Card className="shadow-xl">
            <CardHeader>
                <CardTitle className="text-2xl font-bold">Request New Emergency Fund</CardTitle>
            </CardHeader>
            <CardContent className="text-center py-6">
                <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
                <p className="text-destructive mb-1">Error loading fund balance.</p>
                <p className="text-sm text-muted-foreground mb-3">{totalSavingsErrorObj?.message || "An unknown error occurred."}</p>
                <Button onClick={() => refetchTotalSavings()} variant="outline" size="sm">
                  <RefreshCw className="mr-2 h-4 w-4" /> Try again
                </Button>
            </CardContent>
         </Card>
      )}

      {showFormCard && (
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Request New Emergency Fund</CardTitle>
            <CardDescription>
              Need financial assistance? Fill out the form below. All requests are subject to admin approval.
              <br />
              {(isLoadingTotalSavings && totalFamilySavings === undefined && !isTotalSavingsError) ? (
                  <span className="text-sm text-muted-foreground italic">Loading available fund balance...</span>
              ) : !isTotalSavingsError ? (
                  <span className="text-sm text-primary font-medium">Current Available Fund Balance: {CURRENCY_SYMBOL}{(totalFamilySavings ?? 0).toLocaleString()}</span>
              ) : null }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount Requested ({CURRENCY_SYMBOL})</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="e.g., 5000" {...field} disabled={form.formState.isSubmitting || isLoadingTotalSavings || totalFamilySavings === undefined} />
                      </FormControl>
                      <FormDescription>
                        Enter the total amount you require.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason for Request</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe the emergency and why you need the funds (e.g., urgent medical bill, unexpected home repair)."
                          className="min-h-[120px]"
                          {...field}
                          disabled={form.formState.isSubmitting}
                        />
                      </FormControl>
                      <FormDescription>
                        Please be specific. This will help admins review your request. (Min. 10 characters)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="return_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Expected Return Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              disabled={form.formState.isSubmitting}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value || undefined}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date < new Date(new Date().setDate(new Date().getDate() -1))
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        When do you expect to return this amount? This is a required field.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full md:w-auto" disabled={form.formState.isSubmitting || isLoadingTotalSavings || totalFamilySavings === undefined}>
                  {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (
                    <>
                      <Send className="mr-2 h-4 w-4" /> Submit Request
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

    