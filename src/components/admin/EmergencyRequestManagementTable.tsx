"use client";

import type { EmergencyRequest, Profile } from "@/types";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, MoreHorizontal, Eye, CalendarDays, TrendingUp, History, HandCoins, CalendarIcon } from "lucide-react";
import { format, formatDistanceToNow, parseISO, isPast } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { VariantProps } from "class-variance-authority";

interface EmergencyRequestManagementTableProps {
  requests: EmergencyRequest[];
  users: Profile[]; 
  onApproveRequest: (requestId: string) => void;
  onRejectRequest: (requestId: string) => void;
  onRecordRepayment: (requestId: string, amountRepaid: number, repaymentDate: Date) => Promise<void>;
}

const repaymentSchema = z.object({
  amountRepaid: z.coerce.number().positive("Amount must be greater than 0."),
  repaymentDate: z.date({ required_error: "Repayment date is required." }),
});
type RepaymentFormValues = z.infer<typeof repaymentSchema>;


export function EmergencyRequestManagementTable({ requests, users, onApproveRequest, onRejectRequest, onRecordRepayment }: EmergencyRequestManagementTableProps) {
  const { toast } = useToast();
  const [selectedRequestForView, setSelectedRequestForView] = useState<EmergencyRequest | null>(null);
  const [selectedRequestForRepayment, setSelectedRequestForRepayment] = useState<EmergencyRequest | null>(null);
  
  const repaymentForm = useForm<RepaymentFormValues>({
    resolver: zodResolver(repaymentSchema),
    defaultValues: {
      amountRepaid: 0,
      repaymentDate: new Date(),
    },
  });

  const getUserName = (userId: string) => users.find(u => u.id === userId)?.full_name || "Unknown User";

  const handleApprove = (request: EmergencyRequest) => {
    onApproveRequest(request.id);
  };

  const handleReject = (request: EmergencyRequest) => {
    onRejectRequest(request.id);
  };

  const handleRepaymentSubmit = async (data: RepaymentFormValues) => {
    if (!selectedRequestForRepayment) return;
    const maxRepayAmount = (selectedRequestForRepayment.amount_requested || 0) - (selectedRequestForRepayment.amount_returned || 0);
    if (data.amountRepaid > maxRepayAmount) {
      repaymentForm.setError("amountRepaid", { type: "manual", message: `Cannot repay more than outstanding: ${CURRENCY_SYMBOL}${maxRepayAmount.toLocaleString()}` });
      return;
    }

    try {
      await onRecordRepayment(selectedRequestForRepayment.id, data.amountRepaid, data.repaymentDate);
      setSelectedRequestForRepayment(null); 
      repaymentForm.reset({ amountRepaid: 0, repaymentDate: new Date() });
    } catch (error) {
      console.error("Repayment submission error", error);
    }
  };
  
  const getStatusBadgeVariant = (request: EmergencyRequest): VariantProps<typeof Badge>["variant"] => {
    if (request.is_fully_repaid) return "success";
    if (request.status === 'approved' && request.return_date && isPast(parseISO(request.return_date))) return "destructive";
    if (request.status === "approved") return "default"; 
    if (request.status === "rejected") return "destructive";
    if (request.status === "pending") return "secondary"; 
    return "outline";
  };

  const getRepaymentStatusText = (request: EmergencyRequest) => {
    if (request.is_fully_repaid) return "Fully Repaid";
    if (request.status === 'approved') {
       if (request.return_date && isPast(parseISO(request.return_date))) return "Overdue";
       return "Outstanding";
    }
    return request.status;
  }

  return (
    <>
    <div className="overflow-x-auto rounded-md border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead className="hidden sm:table-cell">Requested</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead className="hidden md:table-cell">Exp. Return</TableHead>
          <TableHead className="text-right">Amt. Req.</TableHead>
          <TableHead className="text-right">Amt. Ret.</TableHead>
          <TableHead className="text-center">Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="h-24 text-center">
              No emergency requests match your criteria.
            </TableCell>
          </TableRow>
        ) : (
          requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell className="font-medium">{getUserName(request.user_id)}</TableCell>
              <TableCell className="hidden sm:table-cell">{format(parseISO(request.requested_at), "MMM dd, yy")}</TableCell>
              <TableCell className="max-w-[150px] sm:max-w-[200px] truncate">{request.reason}</TableCell>
              <TableCell className="hidden md:table-cell">
                {request.return_date ? format(parseISO(request.return_date), "MMM dd, yy") : <span className="text-xs text-muted-foreground">N/A</span>}
              </TableCell>
              <TableCell className="text-right">{CURRENCY_SYMBOL}{request.amount_requested.toLocaleString()}</TableCell>
              <TableCell className="text-right">{CURRENCY_SYMBOL}{(request.amount_returned || 0).toLocaleString()}</TableCell>
              <TableCell className="text-center">
                <Badge 
                  variant={getStatusBadgeVariant(request)} 
                  className={cn("capitalize min-w-[100px] text-center justify-center",
                    {'bg-yellow-500 hover:bg-yellow-600 text-white': request.status === 'pending'},
                    {'bg-green-500 hover:bg-green-600 text-white': request.status === 'approved' && !request.is_fully_repaid && !(request.return_date && isPast(parseISO(request.return_date)))},
                    {'bg-green-600 hover:bg-green-700 text-white': request.is_fully_repaid},
                    {'bg-red-500 hover:bg-red-600 text-white': request.status === 'rejected' || (request.status === 'approved' && !request.is_fully_repaid && request.return_date && isPast(parseISO(request.return_date))) }
                  )}
                >
                  {getRepaymentStatusText(request)}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Dialog onOpenChange={(isOpen) => { if(!isOpen) setSelectedRequestForView(null);}}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DialogTrigger asChild>
                        <DropdownMenuItem onSelect={() => setSelectedRequestForView(request)}>
                          <Eye className="mr-2 h-4 w-4" /> View Details
                        </DropdownMenuItem>
                      </DialogTrigger>
                      {request.status === "pending" && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleApprove(request)} className="text-green-600 focus:text-green-600 focus:bg-green-50">
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleReject(request)} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                            <XCircle className="mr-2 h-4 w-4" /> Reject
                          </DropdownMenuItem>
                        </>
                      )}
                       {request.status === "approved" && !request.is_fully_repaid && (
                        <DialogTrigger asChild>
                          <DropdownMenuItem onSelect={() => setSelectedRequestForRepayment(request)}>
                            <HandCoins className="mr-2 h-4 w-4 text-blue-500" /> Record Repayment
                          </DropdownMenuItem>
                        </DialogTrigger>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                   {selectedRequestForView && ( 
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Emergency Request Details</DialogTitle>
                        <DialogDescription>
                          Reviewing request from {getUserName(selectedRequestForView.user_id)}.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4 text-sm">
                        <InfoRow label="User:" value={getUserName(selectedRequestForView.user_id)} />
                        <InfoRow label="Amount Requested:" value={`${CURRENCY_SYMBOL}${selectedRequestForView.amount_requested.toLocaleString()}`} />
                        <InfoRow label="Amount Returned:" value={`${CURRENCY_SYMBOL}${(selectedRequestForView.amount_returned || 0).toLocaleString()}`} />
                        <InfoRow label="Requested At:" value={format(parseISO(selectedRequestForView.requested_at), "MMM dd, yyyy HH:mm")} />
                        <InfoRow 
                          label="Expected Return:" 
                          value={selectedRequestForView.return_date ? format(parseISO(selectedRequestForView.return_date), "MMM dd, yyyy") : "Not specified"} 
                        />
                        <div className="grid grid-cols-4 items-start gap-4">
                          <Label className="text-right col-span-1 pt-1 text-muted-foreground">Reason:</Label>
                          <p className="col-span-3 bg-muted/50 p-3 rounded-md max-h-40 overflow-y-auto">{selectedRequestForView.reason}</p>
                        </div>
                         <div className="grid grid-cols-4 items-start gap-4">
                          <Label className="text-right col-span-1 pt-1 text-muted-foreground">Admin Notes:</Label>
                          <p className="col-span-3 bg-muted/50 p-3 rounded-md max-h-40 overflow-y-auto">
                            {selectedRequestForView.admin_notes || <span className="italic text-muted-foreground">No notes yet.</span>}
                          </p>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right col-span-1 text-muted-foreground">Status:</Label>
                           <Badge 
                            variant={getStatusBadgeVariant(selectedRequestForView)} 
                            className={cn("capitalize col-span-3 w-fit justify-center",
                              {'bg-yellow-500 hover:bg-yellow-600 text-white': selectedRequestForView.status === 'pending'},
                              {'bg-green-500 hover:bg-green-600 text-white': selectedRequestForView.status === 'approved' && !selectedRequestForView.is_fully_repaid && !(selectedRequestForView.return_date && isPast(parseISO(selectedRequestForView.return_date)))},
                              {'bg-green-600 hover:bg-green-700 text-white': selectedRequestForView.is_fully_repaid},
                              {'bg-red-500 hover:bg-red-600 text-white': selectedRequestForView.status === 'rejected' || (selectedRequestForView.status === 'approved' && !selectedRequestForView.is_fully_repaid && selectedRequestForView.return_date && isPast(parseISO(selectedRequestForView.return_date))) }
                            )}
                          >
                            {getRepaymentStatusText(selectedRequestForView)}
                          </Badge>
                        </div>
                        {selectedRequestForView.reviewed_at && (
                           <InfoRow 
                            label="Reviewed:" 
                            value={`${format(parseISO(selectedRequestForView.reviewed_at), "MMM dd, yyyy HH:mm")} by ${selectedRequestForView.reviewed_by_admin_name || 'Admin'}`} 
                           />
                        )}
                        {selectedRequestForView.last_return_date && (
                           <InfoRow 
                            label="Last Repayment:" 
                            value={format(parseISO(selectedRequestForView.last_return_date), "MMM dd, yyyy HH:mm")} 
                           />
                        )}
                      </div>
                      <DialogFooter className="sm:justify-end">
                         <DialogClose asChild>
                            <Button type="button" variant="secondary">Close</Button>
                         </DialogClose>
                        {selectedRequestForView.status === "pending" && (
                          <>
                            <Button type="button" variant="destructive" onClick={() => {handleReject(selectedRequestForView!); (document.querySelector('[data-radix-dialog-default-close][type="button"]') as HTMLElement)?.click();}}>Reject</Button>
                            <Button type="button" onClick={() => {handleApprove(selectedRequestForView!); (document.querySelector('[data-radix-dialog-default-close][type="button"]') as HTMLElement)?.click();}}>Approve</Button>
                          </>
                        )}
                      </DialogFooter>
                    </DialogContent>
                  )}
                  {selectedRequestForRepayment && ( 
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Record Repayment</DialogTitle>
                        <DialogDescription>
                          For {getUserName(selectedRequestForRepayment.user_id)}'s request of {CURRENCY_SYMBOL}{selectedRequestForRepayment.amount_requested.toLocaleString()}.
                          Outstanding: {CURRENCY_SYMBOL}{( (selectedRequestForRepayment.amount_requested || 0) - (selectedRequestForRepayment.amount_returned || 0) ).toLocaleString()}
                        </DialogDescription>
                      </DialogHeader>
                       <Form {...repaymentForm}>
                        <form onSubmit={repaymentForm.handleSubmit(handleRepaymentSubmit)} className="space-y-4 py-4">
                          <FormField
                            control={repaymentForm.control}
                            name="amountRepaid"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Amount Repaid ({CURRENCY_SYMBOL})</FormLabel>
                                <FormControl>
                                  <Input type="number" placeholder="e.g., 500" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={repaymentForm.control}
                            name="repaymentDate"
                            render={({ field }) => (
                              <FormItem className="flex flex-col">
                                <FormLabel>Repayment Date</FormLabel>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant={"outline"}
                                        className={cn(
                                          "w-full pl-3 text-left font-normal",
                                          !field.value && "text-muted-foreground"
                                        )}
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
                                      selected={field.value}
                                      onSelect={field.onChange}
                                      disabled={(date) => date > new Date() || date < new Date("2000-01-01")}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button type="button" variant="outline" onClick={() => setSelectedRequestForRepayment(null)}>Cancel</Button>
                            </DialogClose>
                            <Button type="submit" disabled={repaymentForm.formState.isSubmitting}>
                              {repaymentForm.formState.isSubmitting ? "Saving..." : "Record Repayment"}
                            </Button>
                          </DialogFooter>
                        </form>
                      </Form>
                    </DialogContent>
                  )}
                </Dialog>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
    </div>
    </>
  );
}

const Label = ({className, ...props}: React.ComponentPropsWithoutRef<"label">) => (
  <label className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)} {...props} />
);

const InfoRow = ({ label, value }: { label: string, value: string | React.ReactNode }) => (
  <div className="grid grid-cols-4 items-center gap-4">
    <Label className="text-right col-span-1 text-muted-foreground">{label}</Label>
    <span className="col-span-3 font-medium">{value}</span>
  </div>
);
