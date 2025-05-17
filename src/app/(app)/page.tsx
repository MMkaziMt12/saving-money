
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { cookies } from "next/headers";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server"; // Server client
import { fetchUserProfileFromServer } from "@/lib/api/profile";
import { 
  fetchUserContributionsForDashboard, 
  fetchAllFamilyEmergencyRequestsForDashboard, 
  fetchTotalFamilySavingsRPC, 
  fetchAllUserContributionsForStatus,
  type PaginatedData,
  type UserContributionForTable,
  type FamilyEmergencyRequestForTable
} from "@/lib/api/dashboard";
import { DashboardClientContent } from "@/components/dashboard/DashboardClientContent";
import { APP_NAME } from "@/lib/constants";
import type { Profile, AuthenticatedUser as AppUser } from "@/types";

const ITEMS_PER_PAGE = 5; // Define this if it's used by client content's initial state

export default async function DashboardPage() {
  const cookieStore = cookies();
  const supabase = createServerSupabaseClient(); // Server client

  const { data: { user: authUser } } = await supabase.auth.getUser();
  
  let initialProfile: Profile | null = null;
  if (authUser) {
    try {
      initialProfile = await fetchUserProfileFromServer(authUser.id, supabase);
    } catch (error) {
      console.error("DashboardPage (Server): Failed to fetch initial profile", error);
      // Handle appropriately, maybe redirect or show error page
    }
  }

  const initialUserWithProfile = authUser && initialProfile ? { ...authUser, profile: initialProfile } as AppUser : null;

  const queryClient = new QueryClient();

  // Prefetch data for StatCards and initial table loads
  if (initialUserWithProfile && initialUserWithProfile.profile) {
    await queryClient.prefetchQuery({
      queryKey: ["allUserContributionsForStatus", initialUserWithProfile.id],
      queryFn: () => fetchAllUserContributionsForStatus(supabase, initialUserWithProfile.id),
    });

    await queryClient.prefetchQuery({
      queryKey: ["totalFamilySavings"],
      queryFn: () => fetchTotalFamilySavingsRPC(supabase),
    });

    await queryClient.prefetchQuery<PaginatedData<FamilyEmergencyRequestForTable>, Error>({
      queryKey: ["allFamilyEmergencyRequestsForDashboard", 1, ""], // Initial page 1, empty search
      queryFn: () => fetchAllFamilyEmergencyRequestsForDashboard(supabase, 1, ITEMS_PER_PAGE, ""),
    });
    
    await queryClient.prefetchQuery<PaginatedData<UserContributionForTable>, Error>({
      queryKey: ["userContributionsForDashboard", initialUserWithProfile.id, 1, ""], // Initial page 1, empty search
      queryFn: () => fetchUserContributionsForDashboard(supabase, initialUserWithProfile.id, 1, ITEMS_PER_PAGE, ""),
    });
  }

  const dehydratedState = dehydrate(queryClient);

  if (!initialUserWithProfile || !initialUserWithProfile.profile) {
    // This might happen if authUser exists but profile fetching failed.
    // Or if the user is not authenticated (though layout should catch this for /app routes)
    // You might want to redirect to login or show an error page.
    // For now, we pass null, and DashboardClientContent can decide how to render.
    console.warn("DashboardPage (Server): User or Profile not available for initial render.");
  }

  return (
    <HydrationBoundary state={dehydratedState}>
      <DashboardClientContent 
        initialUser={initialUserWithProfile} 
        initialProfile={initialProfile} 
        appName={APP_NAME}
      />
    </HydrationBoundary>
  );
}
