
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
} from "@/components/ui/alert-dialog";
import React, { useState, useCallback } from "react";

interface UserManagementTableProps {
  users: Profile[];
  onApproveUser: (userId: string) => void;
  onRejectUser: (userId: string) => void;
  onMakeAdmin?: (userId: string) => void;
  onRevokeAdmin?: (userId: string) => void;
  onDeleteUser?: (userId: string) => void;
  currentAdminId?: string | null; // Pass current admin ID to prevent self-action
}

type UserActionType = 'approve' | 'reject' | 'makeAdmin' | 'revokeAdmin' | 'deleteProfile';

export const UserManagementTable = React.memo(function UserManagementTable({
    users,
    onApproveUser,
    onRejectUser,
    onMakeAdmin,
    onRevokeAdmin,
    onDeleteUser,
    currentAdminId,
 }: UserManagementTableProps) {

  const [userForConfirmation, setUserForConfirmation] = useState<Profile | null>(null);
  const [actionTypeForConfirmation, setActionTypeForConfirmation] = useState<UserActionType | null>(null);
  const [isUserActionConfirmDialogOpen, setIsUserActionConfirmDialogOpen] = useState(false);

  const openConfirmationDialog = (user: Profile, actionType: UserActionType) => {
    setUserForConfirmation(user);
    setActionTypeForConfirmation(actionType);
    setIsUserActionConfirmDialogOpen(true);
  };

  const closeConfirmationDialog = () => {
    setIsUserActionConfirmDialogOpen(false);
    setUserForConfirmation(null);
    setActionTypeForConfirmation(null);
  };

  const executeUserAction = useCallback(() => {
    if (!userForConfirmation || !actionTypeForConfirmation) return;

    switch (actionTypeForConfirmation) {
      case 'approve':
        onApproveUser(userForConfirmation.id);
        break;
      case 'reject':
        onRejectUser(userForConfirmation.id);
        break;
      case 'makeAdmin':
        onMakeAdmin?.(userForConfirmation.id);
        break;
      case 'revokeAdmin':
        onRevokeAdmin?.(userForConfirmation.id);
        break;
      case 'deleteProfile':
        onDeleteUser?.(userForConfirmation.id);
        break;
    }
    closeConfirmationDialog();
  }, [userForConfirmation, actionTypeForConfirmation, onApproveUser, onRejectUser, onMakeAdmin, onRevokeAdmin, onDeleteUser]);


  const getConfirmationDialogContent = () => {
    if (!userForConfirmation || !actionTypeForConfirmation) return { title: "", description: "" };
    const userName = userForConfirmation.full_name || userForConfirmation.email || "this user";
    switch (actionTypeForConfirmation) {
      case 'approve':
        return { title: "Approve User?", description: `Are you sure you want to approve ${userName}?` };
      case 'reject':
        return { title: "Unapprove User?", description: `Are you sure you want to unapprove ${userName}? Their access will be restricted.` };
      case 'makeAdmin':
        return { title: "Make Admin?", description: `Are you sure you want to grant admin privileges to ${userName}?` };
      case 'revokeAdmin':
        let revokeDesc = `Are you sure you want to revoke admin privileges from ${userName}?`;
        if (users.filter(u => u.role === 'admin').length <= 1 && userForConfirmation.role === 'admin') {
            revokeDesc += " Warning: This is the last admin. Revoking will leave no admins.";
        }
        return { title: "Revoke Admin?", description: revokeDesc };
      case 'deleteProfile':
        return { title: "Delete User Profile?", description: `This action cannot be undone. This will permanently delete the profile for ${userName}. It does not delete their authentication record.` };
      default:
        return { title: "", description: "" };
    }
  };

  const confirmationContent = getConfirmationDialogContent();

  return (
    <>
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
                <TableCell className="font-medium break-words">{user.full_name || 'N/A'}</TableCell>
                <TableCell className="break-words">{user.email || 'N/A'}</TableCell>
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
                        <DropdownMenuItem onSelect={() => openConfirmationDialog(user, 'approve')}>
                          <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" /> Approve User
                        </DropdownMenuItem>
                      )}

                      {user.is_approved && user.role !== 'admin' && (
                        <DropdownMenuItem onSelect={() => openConfirmationDialog(user, 'reject')}>
                          <XCircle className="mr-2 h-4 w-4 text-orange-500" /> Unapprove User
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />

                      {user.role !== 'admin' && onMakeAdmin && (
                        <DropdownMenuItem onSelect={() => openConfirmationDialog(user, 'makeAdmin')}>
                          <ShieldCheck className="mr-2 h-4 w-4 text-blue-500" /> Make Admin
                        </DropdownMenuItem>
                      )}

                      {user.role === 'admin' && onRevokeAdmin && user.id !== currentAdminId && ( // Prevent self-revoke here for safety
                        <DropdownMenuItem onSelect={() => openConfirmationDialog(user, 'revokeAdmin')} className="text-orange-600 focus:text-orange-600 focus:bg-orange-50">
                          <ShieldX className="mr-2 h-4 w-4" /> Revoke Admin
                        </DropdownMenuItem>
                      )}
                      
                      {user.role === 'admin' && user.id === currentAdminId && (
                        <DropdownMenuItem disabled>
                          <ShieldX className="mr-2 h-4 w-4" /> Revoke Admin (Self)
                        </DropdownMenuItem>
                      )}


                      {onDeleteUser && user.role !== 'admin' && (
                        <>
                          <DropdownMenuSeparator />
                           <DropdownMenuItem onSelect={() => openConfirmationDialog(user, 'deleteProfile')} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                                <Trash2 className="mr-2 h-4 w-4" /> Delete User Profile
                           </DropdownMenuItem>
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

      {/* Unified Confirmation Dialog for User Actions */}
      {userForConfirmation && actionTypeForConfirmation && (
        <AlertDialog open={isUserActionConfirmDialogOpen} onOpenChange={setIsUserActionConfirmDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmationContent.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirmationContent.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={closeConfirmationDialog}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: (actionTypeForConfirmation === 'reject' || actionTypeForConfirmation === 'revokeAdmin' || actionTypeForConfirmation === 'deleteProfile') ? "destructive" : "default" })}
                onClick={executeUserAction}
              >
                {actionTypeForConfirmation === 'approve' && 'Approve'}
                {actionTypeForConfirmation === 'reject' && 'Unapprove'}
                {actionTypeForConfirmation === 'makeAdmin' && 'Make Admin'}
                {actionTypeForConfirmation === 'revokeAdmin' && 'Revoke Admin'}
                {actionTypeForConfirmation === 'deleteProfile' && 'Delete Profile'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
});
UserManagementTable.displayName = "UserManagementTable";

    