
"use client";

import type { Profile } from "@/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Trash2, ShieldCheck, ShieldX, MoreHorizontal } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
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
  const { toast } = useToast();

  const handleApprove = (userId: string, userName: string) => {
    onApproveUser(userId);
  };

  const handleReject = (userId: string, userName: string) => { 
    onRejectUser(userId);
  };
  
  const handleMakeAdmin = (userId: string, userName: string) => {
    if(onMakeAdmin) {
      onMakeAdmin(userId);
    }
  };
  
  const handleRevokeAdmin = (userId: string, userName: string) => {
    if(onRevokeAdmin) {
      onRevokeAdmin(userId);
    }
  };
  
  const handleDelete = (userId: string, userName: string) => {
    if(onDeleteUser) {
      onDeleteUser(userId);
    }
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Full Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Created At</TableHead> 
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
                <TableCell>{user.phone || 'N/A'}</TableCell>
                <TableCell>{user.created_at ? format(parseISO(user.created_at), "MMM dd, yyyy") : 'N/A'}</TableCell>
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
                      {!user.is_approved && (
                        <DropdownMenuItem onClick={() => handleApprove(user.id, user.full_name || user.email || user.id)}>
                          <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" /> Approve User
                        </DropdownMenuItem>
                      )}
                      {user.is_approved && user.role !== 'admin' && ( // Admins generally shouldn't be "unapproved" this way
                        <DropdownMenuItem onClick={() => handleReject(user.id, user.full_name || user.email || user.id)}>
                          <XCircle className="mr-2 h-4 w-4 text-orange-500" /> Unapprove User
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      {user.role !== 'admin' && onMakeAdmin && (
                        <DropdownMenuItem onClick={() => handleMakeAdmin(user.id, user.full_name || user.email || user.id)}>
                          <ShieldCheck className="mr-2 h-4 w-4 text-blue-500" /> Make Admin
                        </DropdownMenuItem>
                      )}
                      {user.role === 'admin' && onRevokeAdmin && ( 
                        <DropdownMenuItem onClick={() => handleRevokeAdmin(user.id, user.full_name || user.email || user.id)} className="text-orange-600 focus:text-orange-600 focus:bg-orange-50">
                          <ShieldX className="mr-2 h-4 w-4" /> Revoke Admin
                        </DropdownMenuItem>
                      )}
                      {onDeleteUser && user.role !== 'admin' && ( // Prevent easy deletion of admin accounts from this menu
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
                                  onClick={() => handleDelete(user.id, user.full_name || user.email || user.id)}
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
    </>
  );
}
