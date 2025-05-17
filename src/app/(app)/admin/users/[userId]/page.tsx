
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { cookies } from "next/headers";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { 
  fetchUserProfileForAdmin, 
  fetchUserContributionsForAdmin, 
  fetchUserEmergencyRequestsForAdminDetail 
} from "@/lib/api/admin";
import { UserDetailClientContent } from "@/components/admin/users/UserDetailClientContent";
import type { Profile, UserContributionForAdminDetail, UserEmergencyRequestForAdminDetail } from "@/types";
import { redirect } from "next/navigation";

interface AdminUserDetailPageProps {
  params: { userId: string };
}

export default async function AdminUserDetailPageSSR({ params }: AdminUserDetailPageProps) {
  const { userId } = params;
  if (!userId) {
    redirect("/admin?tab=users"); // Or a 404 page
  }

  // const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient();
  
  // Admin check
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    redirect("/login");
  }
  const { data: adminProfile } = await supabase.from("profiles").select("role, is_approved").eq("id", authUser.id).single();
  if (!adminProfile || !adminProfile.is_approved || adminProfile.role !== 'admin') {
    redirect("/"); // Or a specific access denied page
  }

  const queryClient = new QueryClient();
  let initialUserProfile: Profile | null = null;
  let initialContributions: UserContributionForAdminDetail[] = [];
  let initialEmergencyRequests: UserEmergencyRequestForAdminDetail[] = [];

  try {
    initialUserProfile = await queryClient.fetchQuery({
      queryKey: ["userProfileForAdmin", userId],
      queryFn: () => fetchUserProfileForAdmin(supabase, userId),
    });

    if (initialUserProfile) { // Only fetch related data if profile exists
      initialContributions = await queryClient.fetchQuery({
        queryKey: ["userContributionsForAdmin", userId],
        queryFn: () => fetchUserContributionsForAdmin(supabase, userId),
      });

      initialEmergencyRequests = await queryClient.fetchQuery({
        queryKey: ["userEmergencyRequestsForAdminDetail", userId],
        queryFn: () => fetchUserEmergencyRequestsForAdminDetail(supabase, userId),
      });
    } else {
        console.warn(`AdminUserDetailPageSSR: User profile not found for userId: ${userId}. Skipping related data fetches.`);
    }
  } catch (error) {
    console.error(`AdminUserDetailPageSSR: Error prefetching data for user ${userId}:`, error);
  }
  
  const dehydratedState = dehydrate(queryClient);

  return (
    <HydrationBoundary state={dehydratedState}>
      <UserDetailClientContent 
        userId={userId}
        initialUserProfile={initialUserProfile}
        initialContributions={initialContributions}
        initialEmergencyRequests={initialEmergencyRequests}
      />
    </HydrationBoundary>
  );
}
