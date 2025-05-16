
"use client";

import type { MonthlyContribution } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, RefreshCw, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { CURRENCY_SYMBOL } from "@/lib/constants";
import React from "react";

interface PaymentHistoryTableProps {
  contributions: MonthlyContribution[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  totalCount: number;
  currentPage: number;
  onPageChange: (newPage: number) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  itemsPerPage: number;
}

export const PaymentHistoryTable = React.memo(function PaymentHistoryTable({
  contributions,
  isLoading,
  error,
  onRetry,
  totalCount,
  currentPage,
  onPageChange,
  searchTerm,
  onSearchChange,
  itemsPerPage,
}: PaymentHistoryTableProps) {
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  if (isLoading && !contributions && !error) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>My Payment History</CardTitle>
          <CardDescription>Loading your contribution data...</CardDescription>
        </CardHeader>
        <CardContent className="h-48 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>My Payment History</CardTitle>
          <CardDescription>Overview of your monthly contributions.</CardDescription>
        </CardHeader>
        <CardContent className="text-center py-10">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-3" />
          <p className="text-destructive mb-2">Error loading payment history.</p>
          <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
          <Button onClick={onRetry} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>My Payment History</CardTitle>
        <CardDescription>Overview of your monthly contributions. Search by year.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by year (e.g., 2023)..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 w-full md:w-1/2"
            disabled={isLoading && !!contributions} // Disable if refetching in background
          />
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment Date</TableHead>
                <TableHead>Contribution For (Month/Year)</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !!contributions ? ( 
                <TableRow><TableCell colSpan={3} className="text-center h-24"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></TableCell></TableRow>
              ) : contributions && contributions.length > 0 ? (
                contributions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{format(parseISO(c.payment_date), "MMM dd, yyyy")}</TableCell>
                    <TableCell>{format(new Date(c.year, c.month - 1), "MMMM yyyy")}</TableCell>
                    <TableCell className="text-right">{CURRENCY_SYMBOL}{c.amount.toLocaleString()}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground h-24">{totalCount === 0 && !searchTerm ? 'No payments made yet.' : 'No results for your search.'}</TableCell></TableRow>
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
              disabled={currentPage === 1 || (isLoading && !!contributions)}
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
              disabled={currentPage === totalPages || (isLoading && !!contributions)}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
PaymentHistoryTable.displayName = "PaymentHistoryTable";
