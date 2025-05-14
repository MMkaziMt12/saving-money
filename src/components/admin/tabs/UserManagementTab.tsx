
"use client";

import { useState, useEffect, useCallback } from "react";
import type { Profile } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function UserManagementTab() {
  const supabase = createClient();
  const { toast } = useToast();
  const { user: authUser } = useAuth(); // To prevent deleting self or revoking own admin if last admin

  const [users, setUsers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    console.log(data,"user Data list");
    if (error) {
      toast({ title: "Error fetching users", description: error.message, variant: "destructive" });
      setUsers([]);
    } else {
      setUsers(data || []);
    }
    setIsLoading(false);
  }, [supabase, toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleApproveUser = async (userId: string) => {
    const { error } = await supabase.from('profiles').update({ is_approved: true, updated_at: new Date().toISOString() }).eq('id', userId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_approved: true } : u));
      toast({ title: "Success", description: "User approved." });
    }
  };

  const handleRejectUser = async (userId: string) => {
     const { error } = await supabase.from('profiles').update({ is_approved: false, updated_at: new Date().toISOString() }).eq('id', userId);
     if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
     else {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_approved: false } : u));
        toast({ title: "Success", description: "User unapproved." });
     }
  };

  const handleMakeAdmin = async (userId: string) => {
    const { error } = await supabase.from('profiles').update({ role: 'admin', updated_at: new Date().toISOString() }).eq('id', userId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: 'admin' } : u));
      toast({ title: "Success", description: "User promoted to admin." });
    }
  };

  const handleRevokeAdmin = async (userId: string) => {
    if (authUser?.id === userId && users.filter(u => u.role === 'admin').length <= 1) {
        toast({ title: "Action Denied", description: "Cannot revoke the last admin's privileges.", variant: "destructive" });
        return;
    }
    const { error } = await supabase.from('profiles').update({ role: 'user', updated_at: new Date().toISOString() }).eq('id', userId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: 'user' } : u));
      toast({ title: "Success", description: "User demoted from admin." });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (authUser?.id === userId) {
        toast({ title: "Action Denied", description: "Cannot delete your own profile.", variant: "destructive" });
        return;
    }
    // Note: Supabase auth user is separate. This only deletes from 'profiles' table.
    // You might need a Supabase Edge Function to delete the auth.users record if true user deletion is needed.
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
        setUsers(prev => prev.filter(u => u.id !== userId));
        toast({ title: "Success", description: "User profile deleted." });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Fetching users...</p>
      </div>
    );
  }

  return (
    <UserManagementTable 
      users={users} 
      onApproveUser={handleApproveUser} 
      onRejectUser={handleRejectUser}
      onMakeAdmin={handleMakeAdmin}
      onRevokeAdmin={handleRevokeAdmin}
      onDeleteUser={handleDeleteUser}
    />
  );
}
