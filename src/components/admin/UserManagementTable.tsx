
"use client";

import type { Profile } from "@/types";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Edit, Trash2, ShieldCheck, ShieldX, MoreHorizontal } from "lucide-react";
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
} from "@/components/ui/alert-dialog"


interface UserManagementTableProps {
  users: Profile[];
  onApproveUser: (userId: string) => void;
  onRejectUser: (userId: string) => void; // Or more general update action
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
    toast({ title: "User Approved", description: `${userName} has been approved.`});
  };

  const handleReject = (userId: string, userName: string) => { // Assuming reject means de-approve or similar
    onRejectUser(userId);
     toast({ title: "User Status Updated", description: `${userName}'s approval status has been updated (e.g., rejected/unapproved).`, variant: "destructive" });
  };
  
  const handleMakeAdmin = (userId: string, userName: string) => {
    if(onMakeAdmin) {
      onMakeAdmin(userId);
      toast({ title: "Admin Promoted", description: `${userName} is now an admin.`});
    }
  };
  
  const handleRevokeAdmin = (userId: string, userName: string) => {
    if(onRevokeAdmin) {
      onRevokeAdmin(userId);
      toast({ title: "Admin Revoked", description: `${userName} is no longer an admin.`, variant: "destructive"});
    }
  };
  
  const handleDelete = (userId: string, userName: string) => {
    if(onDeleteUser) {
      onDeleteUser(userId);
      toast({ title: "User Deleted", description: `${userName} has been deleted.`, variant: "destructive"});
    }
  };


  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Full Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Joined At</TableHead>
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
              <TableCell className="font-medium">{user.full_name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{user.phone}</TableCell>
              <TableCell>{format(parseISO(user.joined_at), "MMM dd, yyyy")}</TableCell>
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
                      <DropdownMenuItem onClick={() => handleApprove(user.id, user.full_name)}>
                        <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" /> Approve User
                      </DropdownMenuItem>
                    )}
                    {user.is_approved && (
                       <DropdownMenuItem onClick={() => handleReject(user.id, user.full_name)}>
                        <XCircle className="mr-2 h-4 w-4 text-orange-500" /> Unapprove User
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {user.role !== 'admin' && onMakeAdmin && (
                       <DropdownMenuItem onClick={() => handleMakeAdmin(user.id, user.full_name)}>
                        <ShieldCheck className="mr-2 h-4 w-4 text-blue-500" /> Make Admin
                      </DropdownMenuItem>
                    )}
                    {user.role === 'admin' && onRevokeAdmin && (
                       <DropdownMenuItem onClick={() => handleRevokeAdmin(user.id, user.full_name)} className="text-orange-600 focus:text-orange-600 focus:bg-orange-50">
                        <ShieldX className="mr-2 h-4 w-4" /> Revoke Admin
                      </DropdownMenuItem>
                    )}
                     {onDeleteUser && (
                       <>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                              <Trash2 className="mr-2 h-4 w-4" /> Delete User
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete {user.full_name}&apos;s account and all their data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(user.id, user.full_name)}
                                className={buttonVariants({variant: "destructive"})}
                              >
                                Delete
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
  );
}
