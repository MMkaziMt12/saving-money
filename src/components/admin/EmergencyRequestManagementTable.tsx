
"use client";

import type { EmergencyRequest, Profile } from "@/types";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, MoreHorizontal, Eye } from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
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
import { useState } from "react";
import { cn } from "@/lib/utils";

interface EmergencyRequestManagementTableProps {
  requests: EmergencyRequest[];
  users: Profile[]; // To map user_id to user_name
  onApproveRequest: (requestId: string) => void;
  onRejectRequest: (requestId: string) => void;
}

export function EmergencyRequestManagementTable({ requests, users, onApproveRequest, onRejectRequest }: EmergencyRequestManagementTableProps) {
  const { toast } = useToast();
  const [selectedRequest, setSelectedRequest] = useState<EmergencyRequest | null>(null);

  const getUserName = (userId: string) => users.find(u => u.id === userId)?.full_name || "Unknown User";

  const handleApprove = (request: EmergencyRequest) => {
    onApproveRequest(request.id);
    toast({ title: "Request Approved", description: `Emergency request from ${getUserName(request.user_id)} for ${CURRENCY_SYMBOL}${request.amount_requested} has been approved.` });
  };

  const handleReject = (request: EmergencyRequest) => {
    onRejectRequest(request.id);
    toast({ title: "Request Rejected", description: `Emergency request from ${getUserName(request.user_id)} for ${CURRENCY_SYMBOL}${request.amount_requested} has been rejected.`, variant: "destructive" });
  };
  
  const getStatusBadgeVariant = (status: EmergencyRequest["status"]) => {
    switch (status) {
      case "approved": return "default"; // Green bg
      case "rejected": return "destructive";
      case "pending": return "secondary"; // Yellow/Orange bg
      default: return "outline";
    }
  };


  return (
    <>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Reason (Excerpt)</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead className="text-center">Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="h-24 text-center">
              No pending emergency requests.
            </TableCell>
          </TableRow>
        ) : (
          requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell className="font-medium">{getUserName(request.user_id)}</TableCell>
              <TableCell>{CURRENCY_SYMBOL}{request.amount_requested.toLocaleString()}</TableCell>
              <TableCell className="max-w-xs truncate">{request.reason}</TableCell>
              <TableCell>{formatDistanceToNow(parseISO(request.requested_at), { addSuffix: true })}</TableCell>
              <TableCell className="text-center">
                <Badge 
                  variant={getStatusBadgeVariant(request.status)} 
                  className={`capitalize ${request.status === 'approved' ? 'bg-green-500 hover:bg-green-600 text-white' : request.status === 'pending' ? 'bg-orange-400 hover:bg-orange-500 text-white' : '' }`}
                >
                  {request.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Dialog>
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
                        <DropdownMenuItem onSelect={() => setSelectedRequest(request)}>
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                   {selectedRequest && (
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Emergency Request Details</DialogTitle>
                        <DialogDescription>
                          Reviewing request from {getUserName(selectedRequest.user_id)}.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right col-span-1">User:</Label>
                          <span className="col-span-3 font-medium">{getUserName(selectedRequest.user_id)}</span>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right col-span-1">Amount:</Label>
                          <span className="col-span-3">{CURRENCY_SYMBOL}{selectedRequest.amount_requested.toLocaleString()}</span>
                        </div>
                         <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right col-span-1">Requested:</Label>
                          <span className="col-span-3">{format(parseISO(selectedRequest.requested_at), "MMM dd, yyyy HH:mm")}</span>
                        </div>
                        <div className="grid grid-cols-4 items-start gap-4">
                          <Label className="text-right col-span-1 pt-1">Reason:</Label>
                          <p className="col-span-3 text-sm bg-muted p-3 rounded-md max-h-40 overflow-y-auto">{selectedRequest.reason}</p>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right col-span-1">Status:</Label>
                          <Badge 
                            variant={getStatusBadgeVariant(selectedRequest.status)} 
                            className={`capitalize col-span-3 w-fit ${selectedRequest.status === 'approved' ? 'bg-green-500 hover:bg-green-600 text-white' : selectedRequest.status === 'pending' ? 'bg-orange-400 hover:bg-orange-500 text-white' : '' }`}
                          >
                            {selectedRequest.status}
                          </Badge>
                        </div>
                        {selectedRequest.reviewed_at && (
                           <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right col-span-1">Reviewed:</Label>
                            <span className="col-span-3">{format(parseISO(selectedRequest.reviewed_at), "MMM dd, yyyy HH:mm")} by {selectedRequest.reviewed_by_admin_name || 'Admin'}</span>
                          </div>
                        )}
                      </div>
                      <DialogFooter className="sm:justify-end">
                         <DialogClose asChild>
                            <Button type="button" variant="secondary">Close</Button>
                         </DialogClose>
                        {selectedRequest.status === "pending" && (
                          <>
                            <Button type="button" variant="destructive" onClick={() => {handleReject(selectedRequest); (document.querySelector('[data-radix-dialog-default-close]') as HTMLElement)?.click();}}>Reject</Button>
                            <Button type="button" onClick={() => {handleApprove(selectedRequest); (document.querySelector('[data-radix-dialog-default-close]') as HTMLElement)?.click();}}>Approve</Button>
                          </>
                        )}
                      </DialogFooter>
                    </DialogContent>
                  )}
                </Dialog>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
    </>
  );
}

// Small Label component for Dialog
const Label = ({className, ...props}: React.ComponentPropsWithoutRef<"label">) => (
  <label className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)} {...props} />
)
