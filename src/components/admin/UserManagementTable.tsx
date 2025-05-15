
"use client";

import type { Profile } from "@/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Trash2, ShieldCheck, ShieldX, MoreHorizontal, Eye } from "lucide-react";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

interface UserManagementTableProps {
  users: Profile[];
  onApproveUser: (userId: string) => void;
  onRejectUser: (userId: string) => void;
  onMakeAdmin?: (userId: string) => void;
  onRevokeAdmin?: (userId: string) => void;
  onDeleteUser?: (userId: string) => void;
}

export function UserManagementTable({
    users,
    onApproveUser,
    onRejectUser,
    onMakeAdmin,
    onRevokeAdmin,
    onDeleteUser,
 }: UserManagementTableProps) {

  const [dialogState, setDialogState] = useState<{ [key: string]: boolean }>({});
  const [actionUser, setActionUser] = useState<Profile | null>(null);

  const openDialog = (action: string, user: Profile) => {
    setActionUser(user);
    setDialogState(prev => ({ ...prev, [action]: true }));
  };

  const closeDialog = (action: string) => {
    setDialogState(prev => ({ ...prev, [action]: false }));
    setActionUser(null);
  };

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Full Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="hidden md:table-cell">Phone</TableHead>
            <TableHead className="hidden sm:table-cell">Created At</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center">
                No users found.
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.full_name || 'N/A'}</TableCell>
                <TableCell>{user.email || 'N/A'}</TableCell>
                <TableCell className="hidden md:table-cell">{user.phone || 'N/A'}</TableCell>
                <TableCell className="hidden sm:table-cell">{user.created_at ? format(parseISO(user.created_at), "MMM dd, yyyy") : 'N/A'}</TableCell>
                <TableCell>
                  <Badge variant={user.role === 'admin' ? 'destructive' : 'secondary'} className="capitalize">{user.role}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  {user.is_approved ? (
                    <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-white">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Approved
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-orange-500 text-orange-500">
                      <XCircle className="mr-1 h-3 w-3" /> Pending
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                       <DropdownMenuItem asChild>
                        <Link href={`/admin/users/${user.id}`} className="cursor-pointer">
                          <Eye className="mr-2 h-4 w-4" /> View Details
                        </Link>
                      </DropdownMenuItem>

                      {!user.is_approved && (
                        <AlertDialog open={dialogState[`approve-${user.id}`]} onOpenChange={(open) => !open && closeDialog(`approve-${user.id}`)}>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); openDialog(`approve-${user.id}`, user); }}>
                              <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" /> Approve User
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Approve User?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to approve {actionUser?.full_name || actionUser?.email}?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => closeDialog(`approve-${user.id}`)}>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => { onApproveUser(user.id); closeDialog(`approve-${user.id}`); }}>Approve</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}

                      {user.is_approved && user.role !== 'admin' && (
                        <AlertDialog open={dialogState[`reject-${user.id}`]} onOpenChange={(open) => !open && closeDialog(`reject-${user.id}`)}>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); openDialog(`reject-${user.id}`, user); }}>
                              <XCircle className="mr-2 h-4 w-4 text-orange-500" /> Unapprove User
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Unapprove User?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to unapprove {actionUser?.full_name || actionUser?.email}? Their access will be restricted.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => closeDialog(`reject-${user.id}`)}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className={buttonVariants({ variant: "destructive" })}
                                onClick={() => { onRejectUser(user.id); closeDialog(`reject-${user.id}`); }}
                              >
                                Unapprove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}

                      <DropdownMenuSeparator />

                      {user.role !== 'admin' && onMakeAdmin && (
                         <AlertDialog open={dialogState[`makeAdmin-${user.id}`]} onOpenChange={(open) => !open && closeDialog(`makeAdmin-${user.id}`)}>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); openDialog(`makeAdmin-${user.id}`, user); }}>
                              <ShieldCheck className="mr-2 h-4 w-4 text-blue-500" /> Make Admin
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Make Admin?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to grant admin privileges to {actionUser?.full_name || actionUser?.email}?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => closeDialog(`makeAdmin-${user.id}`)}>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => { onMakeAdmin(user.id); closeDialog(`makeAdmin-${user.id}`); }}>Make Admin</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}

                      {user.role === 'admin' && onRevokeAdmin && users.filter(u => u.role === 'admin').length > 1 && (
                        <AlertDialog open={dialogState[`revokeAdmin-${user.id}`]} onOpenChange={(open) => !open && closeDialog(`revokeAdmin-${user.id}`)}>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); openDialog(`revokeAdmin-${user.id}`, user); }} className="text-orange-600 focus:text-orange-600 focus:bg-orange-50">
                              <ShieldX className="mr-2 h-4 w-4" /> Revoke Admin
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Revoke Admin?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to revoke admin privileges from {actionUser?.full_name || actionUser?.email}?
                                {(users.filter(u => u.role === 'admin').length <= 1) && <p className="mt-2 text-destructive-foreground bg-destructive p-2 rounded-md">Warning: This is the last admin. Revoking will leave no admins.</p>}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => closeDialog(`revokeAdmin-${user.id}`)}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className={buttonVariants({ variant: "destructive" })}
                                onClick={() => { onRevokeAdmin(user.id); closeDialog(`revokeAdmin-${user.id}`); }}
                              >
                                Revoke Admin
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}

                      {onDeleteUser && user.role !== 'admin' && (
                        <>
                          <DropdownMenuSeparator />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                                <Trash2 className="mr-2 h-4 w-4" /> Delete User Profile
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently delete the profile for {user.full_name || user.email}. It does not delete the authentication user.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => onDeleteUser(user.id)}
                                  className={buttonVariants({variant: "destructive"})}
                                >
                                  Delete Profile
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

