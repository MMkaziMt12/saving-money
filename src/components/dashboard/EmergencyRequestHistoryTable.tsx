
"use client";

import type { EmergencyRequest } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, CheckCircle2, XCircle, Clock, CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";
import { CURRENCY_SYMBOL } from "@/lib/constants";

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
}: EmergencyRequestHistoryTableProps) {
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const getStatusBadgeVariant = (status: EmergencyRequest["status"]) => {
    switch (status) {
      case "approved": return "success";
      case "rejected": return "destructive";
      case "pending": return "secondary";
      default: return "outline";
    }
  };

  const getStatusIcon = (status: EmergencyRequest["status"]) => {
    switch (status) {
      case "approved": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "rejected": return <XCircle className="h-4 w-4 text-red-500" />;
      case "pending": return <Clock className="h-4 w-4 text-yellow-500" />;
      default: return null;
    }
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
        <CardDescription>{description}. Search by reason, status {showUserName ? ', or user name' : ''}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search requests..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 w-full md:w-1/2"
            disabled={isLoading && requests && requests.length > 0}
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {showUserName && <TableHead>Requested By</TableHead>}
                <TableHead>Requested At</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Expected Return</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && requests && requests.length > 0 ? (
                 <TableRow><TableCell colSpan={showUserName ? 6 : 5} className="text-center h-24"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></TableCell></TableRow>
              ) : requests && requests.length > 0 ? (
                requests.map((req) => (
                  <TableRow key={req.id}>
                    {showUserName && <TableCell>{req.user_name || req.user_id}</TableCell>}
                    <TableCell>{format(parseISO(req.requested_at), "MMM dd, yyyy HH:mm")}</TableCell>
                    <TableCell>{CURRENCY_SYMBOL}{req.amount_requested.toLocaleString()}</TableCell>
                    <TableCell className="max-w-xs truncate">{req.reason}</TableCell>
                    <TableCell>
                      {req.return_date ? format(parseISO(req.return_date), "MMM dd, yyyy") : <span className="text-muted-foreground">N/A</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={getStatusBadgeVariant(req.status)} className="capitalize flex items-center justify-center gap-1.5 min-w-[110px]">
                        {getStatusIcon(req.status)}
                        {req.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={showUserName ? 6 : 5} className="text-center text-muted-foreground h-24">{totalCount === 0 ? 'No emergency requests found.' : 'No results for your search.'}</TableCell></TableRow>
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
