"use client";

import type { Profile, UserRole } from "@/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Edit, Trash2, ShieldCheck, ShieldX, MoreHorizontal, UserPlus, Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";


const addUserSchema = z.object({
  full_name: z.string().min(3, "Full name must be at least 3 characters."),
  email: z.string().email("Invalid email address."),
  phone: z.string().min(10, "Phone number must be at least 10 digits."),
  role: z.enum(["user", "admin"]),
  is_approved: z.boolean(),
});

export type AddUserFormValues = z.infer<typeof addUserSchema>;

interface UserManagementTableProps {
  users: Profile[];
  onApproveUser: (userId: string) => void;
  onRejectUser: (userId: string) => void; 
  onMakeAdmin?: (userId: string) => void;
  onRevokeAdmin?: (userId: string) => void;
  onDeleteUser?: (userId: string) => void;
  onAddNewUser: (data: AddUserFormValues) => void;
}

export function UserManagementTable({ 
    users, 
    onApproveUser, 
    onRejectUser,
    onMakeAdmin,
    onRevokeAdmin,
    onDeleteUser,
    onAddNewUser,
 }: UserManagementTableProps) {
  const { toast } = useToast();
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);

  const addUserForm = useForm<AddUserFormValues>({
    resolver: zodResolver(addUserSchema),
    defaultValues: {
      full_name: "",
      email: "",
      phone: "",
      role: "user",
      is_approved: true,
    },
  });

  const handleApprove = (userId: string, userName: string) => {
    onApproveUser(userId);
    toast({ title: "User Approved", description: `${userName} has been approved.`});
  };

  const handleReject = (userId: string, userName: string) => { 
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

  const onSubmitAddUser = (data: AddUserFormValues) => {
    onAddNewUser(data);
    addUserForm.reset();
    setIsAddUserDialogOpen(false);
  };


  return (
    <>
      <div className="flex justify-end mb-4">
        <Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="default">
              <UserPlus className="mr-2 h-4 w-4" /> Add New User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
              <DialogDescription>
                Fill in the details to add a new user to the system.
              </DialogDescription>
            </DialogHeader>
            <Form {...addUserForm}>
              <form onSubmit={addUserForm.handleSubmit(onSubmitAddUser)} className="space-y-4 py-2">
                <FormField
                  control={addUserForm.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={addUserForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="user@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={addUserForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="123-456-7890" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={addUserForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={addUserForm.control}
                  name="is_approved"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>Approved</FormLabel>
                        <FormDescription>
                          Allow this user to access the app immediately.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <DialogFooter className="sm:justify-end gap-2 pt-2">
                  <DialogClose asChild>
                     <Button type="button" variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button type="submit" disabled={addUserForm.formState.isSubmitting}>
                    {addUserForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add User
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
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
    </>
  );
}
