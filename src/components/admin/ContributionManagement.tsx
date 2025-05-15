
"use client";

import type { MonthlyContribution, Profile } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller, useWatch } from "react-hook-form";
import { z } from "zod";
import { CURRENCY_SYMBOL, MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect, useMemo } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, DollarSign, Loader2, Layers, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import React from "react";

const addContributionSchema = z.object({
  userId: z.string().min(1, "User selection is required."),
  totalAmountReceived: z.coerce.number().min(MONTHLY_CONTRIBUTION_AMOUNT, `Total amount must be at least ${CURRENCY_SYMBOL}${MONTHLY_CONTRIBUTION_AMOUNT}`),
  paymentDate: z.date({ required_error: "Payment date is required." }),
  month: z.coerce.number().min(1).max(12), 
  year: z.coerce.number().min(new Date().getFullYear() - 10).max(new Date().getFullYear() + 10),
  numberOfMonths: z.coerce.number().min(1, "Number of months must be at least 1").max(60, "Cannot record more than 60 months at once."),
}).refine(data => data.totalAmountReceived % MONTHLY_CONTRIBUTION_AMOUNT === 0, {
  message: `Total amount received must be a multiple of ${CURRENCY_SYMBOL}${MONTHLY_CONTRIBUTION_AMOUNT}.`,
  path: ["totalAmountReceived"],
}).refine(data => data.totalAmountReceived === data.numberOfMonths * MONTHLY_CONTRIBUTION_AMOUNT, {
  message: `Total amount received must be exactly ${CURRENCY_SYMBOL}${MONTHLY_CONTRIBUTION_AMOUNT} multiplied by the number of months.`,
  path: ["totalAmountReceived"],
});

export type AddContributionFormValues = z.infer<typeof addContributionSchema>;

interface ContributionManagementProps {
  users: Profile[];
  contributions: MonthlyContribution[];
  onAddContribution: (data: AddContributionFormValues) => Promise<void>;
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i).reverse();
const months = Array.from({length: 12}, (_, i) => ({ value: i + 1, label: format(new Date(currentYear, i), "MMMM")}));

const ITEMS_PER_PAGE_CONTRIBUTIONS = 10;

export const ContributionManagement = React.memo(function ContributionManagement({ users, contributions, onAddContribution }: ContributionManagementProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contributionSearchTerm, setContributionSearchTerm] = useState("");
  const [currentContributionPage, setCurrentContributionPage] = useState(1);

  const form = useForm<AddContributionFormValues>({
    resolver: zodResolver(addContributionSchema),
    defaultValues: {
      totalAmountReceived: MONTHLY_CONTRIBUTION_AMOUNT,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      paymentDate: new Date(),
      userId: "",
      numberOfMonths: 1,
    },
  });

  const watchedTotalAmount = useWatch({ control: form.control, name: "totalAmountReceived" });

  useEffect(() => {
    if (watchedTotalAmount && MONTHLY_CONTRIBUTION_AMOUNT > 0) {
      if (watchedTotalAmount % MONTHLY_CONTRIBUTION_AMOUNT === 0) {
        const calculatedMonths = watchedTotalAmount / MONTHLY_CONTRIBUTION_AMOUNT;
        if (calculatedMonths >= 1 && calculatedMonths <= 60) { 
            if (form.getValues("numberOfMonths") !== calculatedMonths) {
                form.setValue("numberOfMonths", calculatedMonths, { shouldValidate: true });
            }
        }
      }
    }
  }, [watchedTotalAmount, form]);

  async function onSubmit(data: AddContributionFormValues) {
    setIsSubmitting(true);
    try {
      await onAddContribution(data);
      form.reset({
        totalAmountReceived: MONTHLY_CONTRIBUTION_AMOUNT,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        paymentDate: new Date(),
        userId: "",
        numberOfMonths: 1,
      });
    } catch (error) {
      console.error("Submission error in ContributionManagement form:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const filteredContributions = useMemo(() => {
    if (!contributions) return [];
    return contributions
      .filter(c => {
        const userName = c.user_name || users.find(u => u.id === c.user_id)?.full_name || "";
        const searchTermLower = contributionSearchTerm.toLowerCase();
        return (
          userName.toLowerCase().includes(searchTermLower) ||
          String(c.year).includes(searchTermLower) ||
          format(new Date(c.year, c.month -1), "MMMM").toLowerCase().includes(searchTermLower) ||
          String(c.amount).includes(searchTermLower)
        );
      })
      .sort((a,b) => parseISO(b.payment_date).getTime() - parseISO(a.payment_date).getTime());
  }, [contributions, contributionSearchTerm, users]);

  const paginatedContributions = useMemo(() => {
    const startIndex = (currentContributionPage - 1) * ITEMS_PER_PAGE_CONTRIBUTIONS;
    return filteredContributions.slice(startIndex, startIndex + ITEMS_PER_PAGE_CONTRIBUTIONS);
  }, [filteredContributions, currentContributionPage]);

  const totalContributionPages = Math.ceil(filteredContributions.length / ITEMS_PER_PAGE_CONTRIBUTIONS);

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <Card className="md:col-span-1 shadow-lg">
        <CardHeader>
          <CardTitle>Add Contribution</CardTitle>
          <CardDescription>Manually record contribution(s) for a family member. Standard per month is {CURRENCY_SYMBOL}{MONTHLY_CONTRIBUTION_AMOUNT}.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="userId">Select User</Label>
               <Controller
                name="userId"
                control={form.control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value || ""} disabled={isSubmitting}>
                    <SelectTrigger id="userId">
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.filter(u => u.is_approved).map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.userId && <p className="text-sm font-medium text-destructive">{form.formState.errors.userId.message}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="totalAmountReceived">Total Amount Received ({CURRENCY_SYMBOL})</Label>
                <Input id="totalAmountReceived" type="number" {...form.register("totalAmountReceived")} disabled={isSubmitting} />
                {form.formState.errors.totalAmountReceived && <p className="text-sm font-medium text-destructive">{form.formState.errors.totalAmountReceived.message}</p>}
              </div>
              <div>
                <Label htmlFor="numberOfMonths">Number of Months</Label>
                <Input id="numberOfMonths" type="number" {...form.register("numberOfMonths")} disabled={isSubmitting} />
                {form.formState.errors.numberOfMonths && <p className="text-sm font-medium text-destructive">{form.formState.errors.numberOfMonths.message}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor="paymentDate">Payment Date</Label>
              <Controller
                name="paymentDate"
                control={form.control}
                render={({ field }) => (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                        disabled={isSubmitting}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                        disabled={(date) => date > new Date() || date < new Date("2000-01-01")}
                      />
                    </PopoverContent>
                  </Popover>
                )}
              />
              {form.formState.errors.paymentDate && <p className="text-sm font-medium text-destructive">{form.formState.errors.paymentDate.message}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="month">Starting Month</Label>
                <Controller
                  name="month"
                  control={form.control}
                  render={({ field }) => (
                    <Select onValueChange={(value) => field.onChange(parseInt(value))} value={String(field.value)} disabled={isSubmitting}>
                      <SelectTrigger id="month"><SelectValue placeholder="Month" /></SelectTrigger>
                      <SelectContent>
                        {months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
                 {form.formState.errors.month && <p className="text-sm font-medium text-destructive">{form.formState.errors.month.message}</p>}
              </div>
              <div>
                <Label htmlFor="year">Starting Year</Label>
                <Controller
                  name="year"
                  control={form.control}
                  render={({ field }) => (
                    <Select onValueChange={(value) => field.onChange(parseInt(value))} value={String(field.value)} disabled={isSubmitting}>
                      <SelectTrigger id="year"><SelectValue placeholder="Year" /></SelectTrigger>
                      <SelectContent>
                        {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.year && <p className="text-sm font-medium text-destructive">{form.formState.errors.year.message}</p>}
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Layers className="mr-2 h-4 w-4" />}
              {isSubmitting ? "Recording..." : "Record Contribution(s)"}
            </Button>
             {form.formState.errors.root?.message && <p className="text-sm font-medium text-destructive">{form.formState.errors.root.message}</p>}
          </form>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 shadow-lg">
        <CardHeader>
          <CardTitle>All Contributions</CardTitle>
          <CardDescription>List of all recorded contributions.</CardDescription>
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
              className="pl-10 w-full md:w-2/3 lg:w-1/2"
            />
          </div>
          {/* ShadCN Table handles its own overflow. No extra wrapper needed here. */}
          {/* The CardContent provides the visual boundary. */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Payment Date</TableHead>
                <TableHead>Contribution For (Month/Year)</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden sm:table-cell">Recorded By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedContributions.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="break-words">{c.user_name || users.find(u => u.id === c.user_id)?.full_name || 'Unknown User'}</TableCell>
                  <TableCell>{format(parseISO(c.payment_date), "MMM dd, yyyy")}</TableCell>
                  <TableCell>{format(new Date(c.year, c.month -1), "MMMM yyyy")}</TableCell>
                  <TableCell className="text-right">{CURRENCY_SYMBOL}{c.amount.toLocaleString()}</TableCell>
                  <TableCell className="hidden sm:table-cell break-words">{c.recorded_by_admin_name || 'Admin'}</TableCell>
                </TableRow>
              ))}
              {paginatedContributions.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center h-24">
                  {contributions.length > 0 ? 'No contributions match your search.' : 'No contributions recorded yet.'}
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          {totalContributionPages > 1 && (
            <div className="flex items-center justify-end space-x-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentContributionPage(prev => Math.max(1, prev - 1))}
                disabled={currentContributionPage === 1}
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
                disabled={currentContributionPage === totalContributionPages}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});
ContributionManagement.displayName = "ContributionManagement";
