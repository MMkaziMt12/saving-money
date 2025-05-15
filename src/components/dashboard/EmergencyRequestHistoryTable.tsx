
"use client";

import type { EmergencyRequest } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, CheckCircle2, XCircle, Clock, CalendarDays, Hourglass, DollarSign, AlertTriangle, Eye } from "lucide-react";
import { format, parseISO, isPast } from "date-fns";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import Link from "next/link"; 
import type { VariantProps } from "class-variance-authority"; 

interface EmergencyRequestHistoryTableProps {
  requests: EmergencyRequest[] | undefined;
  isLoading: boolean;
  title: string;
  description: string;
  showUserName?: boolean;
  totalCount: number;
  currentPage: number;
  onPageChange: (newPage: number) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  itemsPerPage: number;
  isGlobalView?: boolean;
}

export function EmergencyRequestHistoryTable({
  requests,
  isLoading,
  title,
  description,
  showUserName = false,
  totalCount,
  currentPage,
  onPageChange,
  searchTerm,
  onSearchChange,
  itemsPerPage,
  isGlobalView = false,
}: EmergencyRequestHistoryTableProps) {
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const getStatusBadgeInfo = (request: EmergencyRequest): { variant: VariantProps<typeof Badge>["variant"], text: string, icon?: React.ReactNode } => {
    if (request.is_fully_repaid) {
      return { variant: "success", text: "Fully Repaid", icon: <CheckCircle2 className="h-3 w-3" /> };
    }
    if (request.status === 'approved') {
      if (request.return_date && isPast(parseISO(request.return_date))) {
        return { variant: "destructive", text: "Overdue", icon: <AlertTriangle className="h-3 w-3" /> };
      }
      return { variant: "default", text: "Approved", icon: <CheckCircle2 className="h-3 w-3 text-green-500" /> };
    }
    if (request.status === "rejected") {
      return { variant: "destructive", text: "Rejected", icon: <XCircle className="h-3 w-3" /> };
    }
    if (request.status === "pending") {
      return { variant: "secondary", text: "Pending", icon: <Hourglass className="h-3 w-3" /> };
    }
    return { variant: "outline", text: request.status || "Unknown", icon: <Clock className="h-3 w-3" /> };
  };

  if (isLoading && (!requests || requests.length === 0) && totalCount === 0) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Loading emergency request data...</CardDescription>
        </CardHeader>
        <CardContent className="h-48 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}{isGlobalView ? " Search by user, reason, or status (e.g. pending, approved, overdue, repaid)." : " Search by reason or status."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder={isGlobalView ? "Search all requests..." : "Search your requests..."}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 w-full md:w-1/2"
            disabled={isLoading && requests && requests.length > 0}
          />
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {showUserName && <TableHead>Requested By</TableHead>}
                <TableHead>Requested At</TableHead>
                <TableHead>Amount Req.</TableHead>
                {isGlobalView && <TableHead>Amount Ret.</TableHead>}
                <TableHead>Reason</TableHead>
                <TableHead>Exp. Return</TableHead>
                <TableHead className="text-center">Status</TableHead>
                {isGlobalView && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && requests && requests.length > 0 ? (
                 <TableRow><TableCell colSpan={showUserName ? (isGlobalView ? 8 : 7) : (isGlobalView ? 7 : 6)} className="text-center h-24"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></TableCell></TableRow>
              ) : requests && requests.length > 0 ? (
                requests.map((req) => {
                  const statusInfo = getStatusBadgeInfo(req);
                  return (
                    <TableRow key={req.id}>
                      {showUserName && <TableCell>{req.user_name || req.user_id}</TableCell>}
                      <TableCell>{format(parseISO(req.requested_at), "MMM dd, yy HH:mm")}</TableCell>
                      <TableCell>{CURRENCY_SYMBOL}{req.amount_requested.toLocaleString()}</TableCell>
                      {isGlobalView && <TableCell>{CURRENCY_SYMBOL}{(req.amount_returned || 0).toLocaleString()}</TableCell>}
                      <TableCell className="max-w-xs truncate">{req.reason}</TableCell>
                      <TableCell>
                        {req.return_date ? format(parseISO(req.return_date), "MMM dd, yyyy") : <span className="text-muted-foreground">N/A</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant={statusInfo.variant} 
                          className={cn("capitalize flex items-center justify-center gap-1.5 min-w-[110px]",
                            {'bg-yellow-500 hover:bg-yellow-600 text-white': statusInfo.text === 'Pending'},
                            {'bg-blue-500 hover:bg-blue-600 text-white': statusInfo.text === 'Approved'},
                            {'bg-green-600 hover:bg-green-700 text-white': statusInfo.text === 'Fully Repaid'},
                            {'bg-red-500 hover:bg-red-600 text-white': statusInfo.text === 'Rejected' || statusInfo.text === 'Overdue' }
                          )}
                        >
                          {statusInfo.icon}
                          {statusInfo.text}
                        </Badge>
                      </TableCell>
                      {isGlobalView && (
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="icon" className="h-8 w-8 p-0">
                            <Link href={`/requests/${req.id}`} title="View Details">
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">View Details</span>
                            </Link>
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow><TableCell colSpan={showUserName ? (isGlobalView ? 8 : 7) : (isGlobalView ? 7 : 6)} className="text-center text-muted-foreground h-24">{totalCount === 0 ? 'No emergency requests found.' : 'No results for your search.'}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-end space-x-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1 || (isLoading && requests && requests.length > 0)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages || (isLoading && requests && requests.length > 0)}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
