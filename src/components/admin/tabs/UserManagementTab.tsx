
"use client";

import { useMemo } from "react";
import type { Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const supabase = createClient();

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

  const { data: users, isLoading, error: usersError } = useQuery<Profile[], Error>({
    queryKey: ['adminUsers'],
    queryFn: fetchUsers,
  });

  const mutationOptions = {
    onSuccess: (data: Profile | void, variables: string | { userId: string; updates?: Partial<Profile> }) => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      // For delete, variables is userId (string). For update, it's an object.
      const userName = users?.find(u => u.id === (typeof variables === 'string' ? variables : variables.userId))?.full_name || "User";
      
      if (typeof variables === 'string') { // Delete operation
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
  
  const sortedUsers = useMemo(() => {
    return users ? [...users].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()) : [];
  }, [users]);


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
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['adminUsers'] })} className="mt-2 text-blue-500">Try again</button>
      </div>
    );
  }

  return (
    <UserManagementTable 
      users={sortedUsers} 
      onApproveUser={(userId) => approveUserMutation.mutate(userId)}
      onRejectUser={(userId) => rejectUserMutation.mutate(userId)}
      onMakeAdmin={(userId) => makeAdminMutation.mutate(userId)}
      onRevokeAdmin={(userId) => revokeAdminMutation.mutate(userId)}
      onDeleteUser={(userId) => deleteUserMutation.mutate(userId)}
    />
  );
}
