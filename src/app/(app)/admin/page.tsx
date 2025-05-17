
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { cookies } from "next/headers";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchUserProfileFromServer } from "@/lib/api/profile"; // Server fetch
import { AdminPageClientContent } from "@/components/admin/AdminPageClientContent";
import type { Profile } from "@/types";
import { redirect } from "next/navigation"; // For server-side redirect

export default async function AdminPageSSR() {
  // const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient();
  
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/login"); // Redirect if not authenticated
  }

  let initialProfile: Profile | null = null;
  try {
    initialProfile = await fetchUserProfileFromServer(authUser.id, supabase); // Pass server client
  } catch (error) {
    console.error("AdminPageSSR: Error fetching initial profile for admin check:", error);
    // Decide how to handle this, maybe redirect or show error
    // For now, if profile fetch fails, access might be denied by client content
  }

  if (!initialProfile?.is_approved) {
    redirect("/awaiting-approval");
  }

  if (initialProfile?.role !== 'admin') {
    redirect("/"); // Redirect to dashboard if not an admin
  }
  
  // No specific data needs to be prefetched into QueryClient for the AdminPageSSR itself
  // as individual tabs will fetch their own data client-side via AdminPageClientContent
  const queryClient = new QueryClient();
  const dehydratedState = dehydrate(queryClient); // Empty dehydrated state for this page

  // The searchParams would be available in the Server Component props if needed
  // For example: export default async function AdminPageSSR({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined }}) {
  // const initialTabFromSearch = typeof searchParams?.tab === 'string' ? searchParams.tab : "users";

  return (
    <HydrationBoundary state={dehydratedState}>
      <AdminPageClientContent 
        initialProfile={initialProfile} // Pass the admin's profile
      />
    </HydrationBoundary>
  );
}
