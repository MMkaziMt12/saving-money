
"use client";

import { useMemo, useState, useCallback } from "react";
import type { Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import { Loader2, Search, RefreshCw, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const supabase = createClient();
const ITEMS_PER_PAGE = 10;

async function fetchUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, avatar_url, role, is_approved, created_at, is_active') // Optimized columns
    .order('created_at', { ascending: false });
  if (error) {
    console.error("Error fetching users in UserManagementTab:", JSON.stringify(error, null, 2));
    throw error;
  }
  return data || [];
}

async function updateUserProfile(userId: string, updates: Partial<Profile>): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id, full_name, email, phone, avatar_url, role, is_approved, created_at, is_active, updated_at') // Optimized columns
    .single();
  if (error) {
    console.error("Error updating user profile in UserManagementTab:", JSON.stringify(error, null, 2));
    throw error;
  }
  if (!data) throw new Error("User profile not found after update.");
  return data;
}

async function deleteUserProfile(userId: string): Promise<void> {
  // Note: This only deletes from 'profiles' table. Auth user deletion is separate.
  const { error } = await supabase.from('profiles').delete().eq('id', userId);
  if (error) {
    console.error("Error deleting user profile in UserManagementTab:", JSON.stringify(error, null, 2));
    throw error;
  }
}

export function UserManagementTab() {
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const { 
    data: users, 
    isLoading: isLoadingUsers, 
    isError: isUsersError,
    error: usersErrorObj, // Renamed to avoid conflict
    refetch: refetchUsers
  } = useQuery<Profile[], Error>({
    queryKey: ['adminUsers'],
    queryFn: fetchUsers,
  });

  const mutationOptions = {
    onSuccess: (data: Profile | void, variables: string | { userId: string; updates?: Partial<Profile> }) => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      const targetUserId = typeof variables === 'string' ? variables : variables.userId;
      queryClient.invalidateQueries({ queryKey: ["userProfile", targetUserId] });

      const userName = users?.find(u => u.id === targetUserId)?.full_name || "User";
      
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
    mutationFn: (userId: string) => updateUserProfile(userId, { is_approved: true }),
    ...mutationOptions,
    onSuccess: (data, userId) => mutationOptions.onSuccess(data, { userId, updates: {is_approved: true }})
  });

  const rejectUserMutation = useMutation<Profile, Error, string>({
    mutationFn: (userId: string) => updateUserProfile(userId, { is_approved: false }),
    ...mutationOptions,
    onSuccess: (data, userId) => mutationOptions.onSuccess(data, { userId, updates: {is_approved: false }})
  });

  const makeAdminMutation = useMutation<Profile, Error, string>({
    mutationFn: (userId: string) => updateUserProfile(userId, { role: 'admin' }),
    ...mutationOptions,
     onSuccess: (data, userId) => mutationOptions.onSuccess(data, { userId, updates: { role: 'admin' }})
  });

  const revokeAdminMutation = useMutation<Profile, Error, string>({
    mutationFn: (userId: string) => {
      if (authUser?.id === userId && users?.filter(u => u.role === 'admin').length <= 1) {
        throw new Error("Cannot revoke the last admin's privileges.");
      }
      return updateUserProfile(userId, { role: 'user' });
    },
    ...mutationOptions,
    onSuccess: (data, userId) => mutationOptions.onSuccess(data, { userId, updates: {role: 'user' }})
  });

  const deleteUserMutation = useMutation<void, Error, string>({
    mutationFn: (userId: string) => {
      if (authUser?.id === userId) {
        throw new Error("Cannot delete your own profile.");
      }
      return deleteUserProfile(userId);
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


  if (isLoadingUsers && !users && !isUsersError) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Fetching users...</p>
      </div>
    );
  }

  if (isUsersError && !users) { // Show error only if no stale data to display
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
    <div className="space-y-4">
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
          className="pl-10 w-full md:w-1/2 lg:w-1/3"
          disabled={isLoadingUsers && !!users} // Disable if refetching in background
        />
      </div>
      {isLoadingUsers && !!users && ( // Inline loader if refetching with stale data
        <div className="py-4 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2"/> Refreshing user list...
        </div>
      )}
      <UserManagementTable 
        users={paginatedUsers} 
        onApproveUser={handleApproveUser}
        onRejectUser={handleRejectUser}
        onMakeAdmin={handleMakeAdmin}
        onRevokeAdmin={handleRevokeAdmin}
        onDeleteUser={handleDeleteUser}
      />
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

    