
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Send, Loader2, CalendarIcon, Info, AlertTriangle } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EmergencyRequest } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";


const emergencyRequestSchema = z.object({
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  reason: z.string().min(10, "Reason must be at least 10 characters long").max(500, "Reason cannot exceed 500 characters"),
  return_date: z.date({ required_error: "An expected return date is required." }),
});

type EmergencyRequestFormValues = z.infer<typeof emergencyRequestSchema>;

const supabase = createClient();

async function fetchUserEmergencyRequests(userId: string | undefined): Promise<EmergencyRequest[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("emergency_requests")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["pending", "approved"]) // Fetch pending or approved requests
    .order("requested_at", { ascending: false });

  if (error) {
    console.error("Error fetching user's emergency requests:", error);
    throw new Error(error.message);
  }
  return data || [];
}


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
      return_date: null, // Zod will enforce selection if required_error is set
    },
  });

  const { data: existingRequests, isLoading: isLoadingExistingRequests } = useQuery<EmergencyRequest[], Error>({
    queryKey: ["userEmergencyRequests", user?.id],
    queryFn: () => fetchUserEmergencyRequests(user?.id),
    enabled: !!user,
  });

  async function onSubmit(data: EmergencyRequestFormValues) {
    if (!user || !profile) {
      toast({ title: "Error", description: "You must be logged in to submit a request.", variant: "destructive" });
      return;
    }
    
    const { error } = await supabase.from('emergency_requests').insert({
      user_id: user.id,
      amount_requested: data.amount,
      reason: data.reason,
      return_date: data.return_date.toISOString(), // Now always a date
      status: 'pending', 
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
    
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
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["userEmergencyRequests", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["emergencyRequests"] }); // For dashboard if admin views it
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

  const totalOutstandingAmount = existingRequests
    ?.filter(req => req.status === 'approved') // Only sum approved amounts not yet marked as returned
    .reduce((sum, req) => sum + req.amount_requested, 0) || 0;

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 max-w-3xl space-y-8">
      {isLoadingExistingRequests ? (
        <Card className="shadow-md">
          <CardHeader><CardTitle>Loading Existing Requests...</CardTitle></CardHeader>
          <CardContent><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent>
        </Card>
      ) : existingRequests && existingRequests.length > 0 && (
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2"><Info className="text-primary"/>Your Existing Emergency Requests</CardTitle>
            <CardDescription>
              You have {existingRequests.length} pending or approved request(s). 
              Total outstanding from approved requests: <span className="font-semibold text-primary">{CURRENCY_SYMBOL}{totalOutstandingAmount.toLocaleString()}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Requested On</TableHead>
                  <TableHead>Expected Return</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {existingRequests.map(req => (
                  <TableRow key={req.id}>
                    <TableCell>{CURRENCY_SYMBOL}{req.amount_requested.toLocaleString()}</TableCell>
                    <TableCell className="max-w-xs truncate">{req.reason}</TableCell>
                    <TableCell>{format(parseISO(req.requested_at), "MMM dd, yyyy")}</TableCell>
                    <TableCell>{req.return_date ? format(parseISO(req.return_date), "MMM dd, yyyy") : "N/A"}</TableCell>
                    <TableCell>
                        <Badge variant={req.status === 'approved' ? 'success' : req.status === 'pending' ? 'secondary' : 'outline'} className="capitalize">
                            {req.status}
                        </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Request New Emergency Fund</CardTitle>
          <CardDescription>
            Need financial assistance for an emergency? Fill out the form below. All requests are subject to admin approval.
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
                      <Input type="number" placeholder="e.g., 5000" {...field} disabled={form.formState.isSubmitting} />
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
                            date < new Date(new Date().setDate(new Date().getDate() -1)) // Cannot select past dates
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      When do you expect to return this amount?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full md:w-auto" disabled={form.formState.isSubmitting}>
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
    </div>
  );
}

