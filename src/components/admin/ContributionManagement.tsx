
"use client";

import type { MonthlyContribution, Profile } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { CURRENCY_SYMBOL, MONTHLY_CONTRIBUTION_AMOUNT } from "@/lib/constants";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

const addContributionSchema = z.object({
  userId: z.string().min(1, "User selection is required."),
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  paymentDate: z.date({ required_error: "Payment date is required." }),
  month: z.coerce.number().min(1).max(12),
  year: z.coerce.number().min(new Date().getFullYear() - 5).max(new Date().getFullYear() + 1),
});

type AddContributionFormValues = z.infer<typeof addContributionSchema>;

interface ContributionManagementProps {
  users: Profile[]; // To select user for whom contribution is added
  contributions: MonthlyContribution[]; // To display all contributions
  onAddContribution: (data: AddContributionFormValues) => void;
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 6 }, (_, i) => currentYear - 5 + i + 1).reverse(); // Last 5 years + current + next
const months = Array.from({length: 12}, (_, i) => ({ value: i + 1, label: format(new Date(currentYear, i), "MMMM")}));


export function ContributionManagement({ users, contributions, onAddContribution }: ContributionManagementProps) {
  const { toast } = useToast();
  const form = useForm<AddContributionFormValues>({
    resolver: zodResolver(addContributionSchema),
    defaultValues: {
      amount: MONTHLY_CONTRIBUTION_AMOUNT,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      paymentDate: new Date(),
    },
  });

  function onSubmit(data: AddContributionFormValues) {
    onAddContribution(data);
    const selectedUser = users.find(u => u.id === data.userId);
    toast({
      title: "Contribution Added!",
      description: `Contribution of ${CURRENCY_SYMBOL}${data.amount} for ${selectedUser?.full_name || 'user'} recorded.`,
    });
    form.reset({
      amount: MONTHLY_CONTRIBUTION_AMOUNT,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      paymentDate: new Date(),
      userId: "",
    });
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <Card className="md:col-span-1 shadow-lg">
        <CardHeader>
          <CardTitle>Add Contribution</CardTitle>
          <CardDescription>Manually record a contribution for a family member.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="userId">Select User</Label>
               <Controller
                name="userId"
                control={form.control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger id="userId">
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.filter(u => u.is_approved).map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.userId && <p className="text-sm font-medium text-destructive">{form.formState.errors.userId.message}</p>}
            </div>
            
            <div>
              <Label htmlFor="amount">Amount ({CURRENCY_SYMBOL})</Label>
              <Input id="amount" type="number" {...form.register("amount")} />
              {form.formState.errors.amount && <p className="text-sm font-medium text-destructive">{form.formState.errors.amount.message}</p>}
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="month">Month</Label>
                <Controller
                  name="month"
                  control={form.control}
                  render={({ field }) => (
                    <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={String(field.value)}>
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
                <Label htmlFor="year">Year</Label>
                <Controller
                  name="year"
                  control={form.control}
                  render={({ field }) => (
                    <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={String(field.value)}>
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
            
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              <DollarSign className="mr-2 h-4 w-4" />
              {form.formState.isSubmitting ? "Recording..." : "Record Contribution"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 shadow-lg">
        <CardHeader>
          <CardTitle>All Contributions</CardTitle>
          <CardDescription>List of all recorded contributions.</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Month/Year</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Recorded By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contributions.sort((a,b) => parseISO(b.payment_date).getTime() - parseISO(a.payment_date).getTime()).map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{users.find(u => u.id === c.user_id)?.full_name || 'Unknown User'}</TableCell>
                  <TableCell>{format(parseISO(c.payment_date), "MMM dd, yyyy")}</TableCell>
                  <TableCell>{format(new Date(c.year, c.month -1), "MMMM yyyy")}</TableCell>
                  <TableCell className="text-right">{CURRENCY_SYMBOL}{c.amount.toLocaleString()}</TableCell>
                  <TableCell>{c.recorded_by_admin_name || (c.recorded_by_admin_id ? 'Admin' : 'User')}</TableCell>
                </TableRow>
              ))}
              {contributions.length === 0 && (
                 <TableRow><TableCell colSpan={5} className="text-center h-24">No contributions recorded yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
