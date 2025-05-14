
"use client";

import { useMemo, useState } from "react";
import type { Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import { Loader2, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const supabase = createClient();
const ITEMS_PER_PAGE = 10;

async function fetchUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

async function updateUserProfile(userId: string, updates: Partial<Profile>): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("User profile not found after update.");
  return data;
}

async function deleteUserProfile(userId: string): Promise<void> {
  const { error } = await supabase.from('profiles').delete().eq('id', userId);
  if (error) throw new Error(error.message);
}

export function UserManagementTab() {
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const { data: users, isLoading, error: usersError } = useQuery<Profile[], Error>({
    queryKey: ['adminUsers'],
    queryFn: fetchUsers,
  });

  const mutationOptions = {
    onSuccess: (data: Profile | void, variables: string | { userId: string; updates?: Partial<Profile> }) => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      const userName = users?.find(u => u.id === (typeof variables === 'string' ? variables : variables.userId))?.full_name || "User";
      
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

  const approveUserMutation = useMutation({
    mutationFn: (userId: string) => updateUserProfile(userId, { is_approved: true }),
    ...mutationOptions,
    onSuccess: (data, userId) => mutationOptions.onSuccess(data, { userId, updates: {is_approved: true }})
  });

  const rejectUserMutation = useMutation({
    mutationFn: (userId: string) => updateUserProfile(userId, { is_approved: false }),
    ...mutationOptions,
    onSuccess: (data, userId) => mutationOptions.onSuccess(data, { userId, updates: {is_approved: false }})
  });

  const makeAdminMutation = useMutation({
    mutationFn: (userId: string) => updateUserProfile(userId, { role: 'admin' }),
    ...mutationOptions,
     onSuccess: (data, userId) => mutationOptions.onSuccess(data, { userId, updates: { role: 'admin' }})
  });

  const revokeAdminMutation = useMutation({
    mutationFn: (userId: string) => {
      if (authUser?.id === userId && users?.filter(u => u.role === 'admin').length <= 1) {
        throw new Error("Cannot revoke the last admin's privileges.");
      }
      return updateUserProfile(userId, { role: 'user' });
    },
    ...mutationOptions,
    onSuccess: (data, userId) => mutationOptions.onSuccess(data, { userId, updates: {role: 'user' }})
  });

  const deleteUserMutation = useMutation({
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Fetching users...</p>
      </div>
    );
  }

  if (usersError) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <p className="text-destructive">Error fetching users: {usersError.message}</p>
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['adminUsers'] })} className="mt-2 text-primary hover:underline">Try again</button>
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
            setCurrentPage(1); // Reset to first page on search
          }}
          className="pl-10 w-full md:w-1/2 lg:w-1/3"
        />
      </div>
      <UserManagementTable 
        users={paginatedUsers} 
        onApproveUser={(userId) => approveUserMutation.mutate(userId)}
        onRejectUser={(userId) => rejectUserMutation.mutate(userId)}
        onMakeAdmin={(userId) => makeAdminMutation.mutate(userId)}
        onRevokeAdmin={(userId) => revokeAdminMutation.mutate(userId)}
        onDeleteUser={(userId) => deleteUserMutation.mutate(userId)}
      />
      {totalPages > 1 && (
        <div className="flex items-center justify-end space-x-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
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
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
