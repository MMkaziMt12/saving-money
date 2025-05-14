
"use client";

import type { EmergencyRequest, Profile } from "@/types";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, MoreHorizontal, Eye, CalendarDays } from "lucide-react";
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
  users: Profile[]; 
  onApproveRequest: (requestId: string) => void;
  onRejectRequest: (requestId: string) => void;
}

export function EmergencyRequestManagementTable({ requests, users, onApproveRequest, onRejectRequest }: EmergencyRequestManagementTableProps) {
  const { toast } = useToast();
  const [selectedRequest, setSelectedRequest] = useState<EmergencyRequest | null>(null);

  const getUserName = (userId: string) => users.find(u => u.id === userId)?.full_name || "Unknown User";

  const handleApprove = (request: EmergencyRequest) => {
    onApproveRequest(request.id);
  };

  const handleReject = (request: EmergencyRequest) => {
    onRejectRequest(request.id);
  };
  
  const getStatusBadgeVariant = (status: EmergencyRequest["status"]) => {
    switch (status) {
      case "approved": return "default"; 
      case "rejected": return "destructive";
      case "pending": return "secondary"; 
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
          <TableHead>Expected Return</TableHead>
          <TableHead className="text-center">Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="h-24 text-center">
              No emergency requests match your criteria.
            </TableCell>
          </TableRow>
        ) : (
          requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell className="font-medium">{getUserName(request.user_id)}</TableCell>
              <TableCell>{CURRENCY_SYMBOL}{request.amount_requested.toLocaleString()}</TableCell>
              <TableCell className="max-w-xs truncate">{request.reason}</TableCell>
              <TableCell>{formatDistanceToNow(parseISO(request.requested_at), { addSuffix: true })}</TableCell>
              <TableCell>
                {request.return_date ? format(parseISO(request.return_date), "MMM dd, yyyy") : <span className="text-muted-foreground text-xs">N/A</span>}
              </TableCell>
              <TableCell className="text-center">
                <Badge 
                  variant={getStatusBadgeVariant(request.status)} 
                  className={`capitalize ${request.status === 'approved' ? 'bg-green-500 hover:bg-green-600 text-white' : request.status === 'pending' ? 'bg-orange-400 hover:bg-orange-500 text-white' : '' }`}
                >
                  {request.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Dialog onOpenChange={(isOpen) => { if(!isOpen) setSelectedRequest(null);}}>
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
                      <div className="grid gap-4 py-4 text-sm">
                        <InfoRow label="User:" value={getUserName(selectedRequest.user_id)} />
                        <InfoRow label="Amount:" value={`${CURRENCY_SYMBOL}${selectedRequest.amount_requested.toLocaleString()}`} />
                        <InfoRow label="Requested At:" value={format(parseISO(selectedRequest.requested_at), "MMM dd, yyyy HH:mm")} />
                        <InfoRow 
                          label="Expected Return:" 
                          value={selectedRequest.return_date ? format(parseISO(selectedRequest.return_date), "MMM dd, yyyy") : "Not specified"} 
                        />
                        <div className="grid grid-cols-4 items-start gap-4">
                          <Label className="text-right col-span-1 pt-1 text-muted-foreground">Reason:</Label>
                          <p className="col-span-3 bg-muted/50 p-3 rounded-md max-h-40 overflow-y-auto">{selectedRequest.reason}</p>
                        </div>
                         <div className="grid grid-cols-4 items-start gap-4">
                          <Label className="text-right col-span-1 pt-1 text-muted-foreground">Admin Notes:</Label>
                          <p className="col-span-3 bg-muted/50 p-3 rounded-md max-h-40 overflow-y-auto">
                            {selectedRequest.admin_notes || <span className="italic text-muted-foreground">No notes yet.</span>}
                          </p>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right col-span-1 text-muted-foreground">Status:</Label>
                          <Badge 
                            variant={getStatusBadgeVariant(selectedRequest.status)} 
                            className={`capitalize col-span-3 w-fit ${selectedRequest.status === 'approved' ? 'bg-green-500 hover:bg-green-600 text-white' : selectedRequest.status === 'pending' ? 'bg-orange-400 hover:bg-orange-500 text-white' : '' }`}
                          >
                            {selectedRequest.status}
                          </Badge>
                        </div>
                        {selectedRequest.reviewed_at && (
                           <InfoRow 
                            label="Reviewed:" 
                            value={`${format(parseISO(selectedRequest.reviewed_at), "MMM dd, yyyy HH:mm")} by ${selectedRequest.reviewed_by_admin_name || 'Admin'}`} 
                           />
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

const Label = ({className, ...props}: React.ComponentPropsWithoutRef<"label">) => (
  <label className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)} {...props} />
);

const InfoRow = ({ label, value }: { label: string, value: string | React.ReactNode }) => (
  <div className="grid grid-cols-4 items-center gap-4">
    <Label className="text-right col-span-1 text-muted-foreground">{label}</Label>
    <span className="col-span-3 font-medium">{value}</span>
  </div>
);
