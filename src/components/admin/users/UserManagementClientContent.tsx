
"use client";

import React, { useMemo, useState, useCallback } from "react";
import type { Profile } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import { Loader2, Search, RefreshCw, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  fetchAdminUsers, 
  updateUserProfileAdmin, 
  deleteUserProfileAdmin 
} from "@/lib/api/admin";
import { createClient as createClientComponentClient } from "@/lib/supabase/client";

const ITEMS_PER_PAGE = 10;

export function UserManagementClientContent() {
  const { toast } = useToast();
  const { user: authUser } = useAuth(); // For admin actions that might depend on current admin's ID
  const queryClient = useQueryClient();
  const supabase = createClientComponentClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const { 
    data: users, 
    isLoading: isLoadingUsers, 
    isError: isUsersError,
    error: usersErrorObj,
    refetch: refetchUsers
  } = useQuery<Profile[], Error>({
    queryKey: ['adminUsers'],
    queryFn: () => fetchAdminUsers(supabase),
  });

  const mutationOptions = {
    onSuccess: (updatedProfileData: Profile | void, variables: string | { userId: string; updates?: Partial<Profile> }) => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      const targetUserId = typeof variables === 'string' ? variables : variables.userId;
      queryClient.invalidateQueries({ queryKey: ["userProfileForAdmin", targetUserId] }); 
      queryClient.invalidateQueries({ queryKey: ["userProfile", targetUserId] }); // For potential profile page updates

      const userName = (updatedProfileData as Profile)?.full_name || users?.find(u => u.id === targetUserId)?.full_name || "User";
      
      if (typeof variables === 'string') { 
         toast({ title: "Success", description: `${userName} profile deleted.` });
      } else if (variables.updates?.is_approved === true) {
         toast({ title: "Success", description: `${userName} approved.` });
      } else if (variables.updates?.is_approved === false) {
         toast({ title: "Success", description: `${userName} unapproved.` });
      } else if (variables.updates?.role === 'admin') {
         toast({ title: "Success", description: `${userName} promoted to admin.` });
      } else if (variables.updates?.role === 'user') {
         toast({ title: "Success", description: `${userName} demoted from admin.` });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  };

  const approveUserMutation = useMutation<Profile, Error, string>({
    mutationFn: (userId: string) => updateUserProfileAdmin(supabase, userId, { is_approved: true }),
    ...mutationOptions,
    onSuccess: (data, userId) => mutationOptions.onSuccess(data, { userId, updates: {is_approved: true }})
  });

  const rejectUserMutation = useMutation<Profile, Error, string>({
    mutationFn: (userId: string) => updateUserProfileAdmin(supabase, userId, { is_approved: false }),
    ...mutationOptions,
    onSuccess: (data, userId) => mutationOptions.onSuccess(data, { userId, updates: {is_approved: false }})
  });

  const makeAdminMutation = useMutation<Profile, Error, string>({
    mutationFn: (userId: string) => updateUserProfileAdmin(supabase, userId, { role: 'admin' }),
    ...mutationOptions,
     onSuccess: (data, userId) => mutationOptions.onSuccess(data, { userId, updates: { role: 'admin' }})
  });

  const revokeAdminMutation = useMutation<Profile, Error, string>({
    mutationFn: (userId: string) => {
      if (authUser?.id === userId && users?.filter(u => u.role === 'admin').length <= 1) {
        throw new Error("Cannot revoke the last admin's privileges.");
      }
      return updateUserProfileAdmin(supabase, userId, { role: 'user' });
    },
    ...mutationOptions,
    onSuccess: (data, userId) => mutationOptions.onSuccess(data, { userId, updates: {role: 'user' }})
  });

  const deleteUserMutation = useMutation<void, Error, string>({
    mutationFn: (userId: string) => {
      if (authUser?.id === userId) {
        throw new Error("Cannot delete your own profile.");
      }
      return deleteUserProfileAdmin(supabase, userId);
    },
    ...mutationOptions,
    onSuccess: (_, userId) => mutationOptions.onSuccess(undefined, userId)
  });
  
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users
      .filter(user => 
        (user.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (user.email?.toLowerCase() || '').includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [users, searchTerm]);

  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredUsers, currentPage]);

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);

  const handleApproveUser = useCallback((userId: string) => approveUserMutation.mutate(userId), [approveUserMutation]);
  const handleRejectUser = useCallback((userId: string) => rejectUserMutation.mutate(userId), [rejectUserMutation]);
  const handleMakeAdmin = useCallback((userId: string) => makeAdminMutation.mutate(userId), [makeAdminMutation]);
  const handleRevokeAdmin = useCallback((userId: string) => revokeAdminMutation.mutate(userId), [revokeAdminMutation]);
  const handleDeleteUser = useCallback((userId: string) => deleteUserMutation.mutate(userId), [deleteUserMutation]);

  if (isLoadingUsers && !users) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Fetching users...</p>
      </div>
    );
  }

  if (isUsersError && !users) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center px-4">
        <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
        <p className="text-destructive mb-2">Error fetching users.</p>
        <p className="text-sm text-muted-foreground mb-4">{usersErrorObj?.message || "An unknown error occurred."}</p>
        <Button onClick={() => refetchUsers()} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" /> Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input 
          type="search"
          placeholder="Search users by name or email..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="pl-10 w-full md:w-2/3 lg:w-1/2"
          disabled={isLoadingUsers && !!users}
        />
      </div>
      {(isLoadingUsers && !!users) && (
         <div className="py-4 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2"/> Refreshing user list...
        </div>
       )}
      <div className="overflow-x-auto rounded-md border bg-card shadow">
        <UserManagementTable 
          users={paginatedUsers} 
          onApproveUser={handleApproveUser}
          onRejectUser={handleRejectUser}
          onMakeAdmin={handleMakeAdmin}
          onRevokeAdmin={handleRevokeAdmin}
          onDeleteUser={handleDeleteUser}
        />
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-end space-x-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1 || (isLoadingUsers && !!users)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages || (isLoadingUsers && !!users)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
