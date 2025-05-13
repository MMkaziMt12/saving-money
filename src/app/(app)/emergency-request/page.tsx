
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CURRENCY_SYMBOL } from "@/lib/constants";

const emergencyRequestSchema = z.object({
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  reason: z.string().min(10, "Reason must be at least 10 characters long").max(500, "Reason cannot exceed 500 characters"),
});

type EmergencyRequestFormValues = z.infer<typeof emergencyRequestSchema>;

export default function EmergencyRequestPage() {
  const { toast } = useToast();
  const form = useForm<EmergencyRequestFormValues>({
    resolver: zodResolver(emergencyRequestSchema),
    defaultValues: {
      amount: 0,
      reason: "",
    },
  });

  function onSubmit(data: EmergencyRequestFormValues) {
    console.log("Emergency Request Submitted:", data);
    // TODO: Implement actual API call to submit the request
    toast({
      title: "Request Submitted!",
      description: `Your request for ${CURRENCY_SYMBOL}${data.amount} has been submitted for approval.`,
      variant: "default",
    });
    form.reset();
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
                      <Input type="number" placeholder="e.g., 5000" {...field} />
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
                {form.formState.isSubmitting ? "Submitting..." : (
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
