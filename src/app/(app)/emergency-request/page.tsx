"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Send, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import { useAuth } from "@/contexts/AuthContext"; // Use AuthContext
import { createClient } from "@/lib/supabase/client"; // For Supabase interactions
import { useRouter } from "next/navigation";

const emergencyRequestSchema = z.object({
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  reason: z.string().min(10, "Reason must be at least 10 characters long").max(500, "Reason cannot exceed 500 characters"),
});

type EmergencyRequestFormValues = z.infer<typeof emergencyRequestSchema>;

export default function EmergencyRequestPage() {
  const { toast } = useToast();
  const { user, profile, isLoading: authLoading } = useAuth(); // Get user from context
  const router = useRouter();
  const form = useForm<EmergencyRequestFormValues>({
    resolver: zodResolver(emergencyRequestSchema),
    defaultValues: {
      amount: 0,
      reason: "",
    },
  });

  async function onSubmit(data: EmergencyRequestFormValues) {
    if (!user || !profile) {
      toast({ title: "Error", description: "You must be logged in to submit a request.", variant: "destructive" });
      return;
    }
    form.control.disabled = true; // Disable form while submitting

    const supabase = createClient();
    // TODO: Implement actual API call to submit the request to Supabase 'emergency_requests' table
    // Example:
    // const { error } = await supabase.from('emergency_requests').insert({
    //   user_id: user.id,
    //   amount_requested: data.amount,
    //   reason: data.reason,
    //   status: 'pending', // default status
    //   requested_at: new Date().toISOString()
    // });
    // if (error) { ... handle error ... } else { ... handle success ... }
    
    // Simulating API call
    await new Promise(resolve => setTimeout(resolve, 1000)); 
    const error = null; // Simulate no error for now

    if (error) {
      toast({
        title: "Submission Failed",
        description: "Could not submit your request. Please try again.", // Replace with error.message
        variant: "destructive",
      });
    } else {
      toast({
        title: "Request Submitted!",
        description: `Your request for ${CURRENCY_SYMBOL}${data.amount} has been submitted for approval.`,
        variant: "default",
      });
      form.reset();
      // router.push("/"); // Optionally redirect
    }
    form.control.disabled = false;
  }
  
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !profile) {
     router.replace("/login"); // Or show a message
     return null;
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-0 max-w-2xl">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Request Emergency Fund</CardTitle>
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
