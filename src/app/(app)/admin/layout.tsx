
import type { ReactNode } from "react";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchUserProfileFromServer } from "@/lib/api/profile";
import { redirect } from "next/navigation";
import { APP_NAME } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: `Admin Panel - ${APP_NAME}`,
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/login");
  }

  const profile = await fetchUserProfileFromServer(authUser.id, supabase);

  if (!profile) {
    // This case should ideally be handled by the auth system ensuring profile creation
    // For safety, redirect to login if profile somehow doesn't exist for an authUser
    console.error(`AdminLayout: No profile found for authenticated user ${authUser.id}. Redirecting to login.`);
    redirect("/login");
  }

  if (!profile.is_approved) {
    redirect("/awaiting-approval");
  }

  if (profile.role !== "admin") {
    console.warn(`AdminLayout: User ${authUser.id} attempted to access admin panel but is not an admin. Redirecting to dashboard.`);
    redirect("/"); // Redirect to dashboard or a "not authorized" page
  }

  // If all checks pass, render the admin section children
  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
       <Card className="mb-6 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl font-bold">Admin Panel</CardTitle>
          <CardDescription>Manage application users, contributions, emergency requests, and notifications.</CardDescription>
        </CardHeader>
      </Card>
      {children}
    </div>
  );
}
