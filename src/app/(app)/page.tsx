
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server"; 
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
import { redirect } from "next/navigation";

const ITEMS_PER_PAGE = 5; 

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient(); 

  const { data: { user: authUser } } = await supabase.auth.getUser();
  console.log(authUser,"in app/page.")
  // If not authenticated, (app)/layout should ideally redirect.
  // But this is a server component, so a direct check is good before fetching user-specific data.
  // if (!authUser) {
  //   redirect("/login");
  // }
  
  let initialProfile: Profile | null = null;
  try {
    initialProfile = await fetchUserProfileFromServer(authUser.id, supabase); // Pass server client
  } catch (error) {
    console.error("DashboardPage (Server): Failed to fetch initial profile", error);
    // If profile fetch fails, the client content will show an error or rely on Zustand store
  }

  // If profile is still null and this page requires it, redirect or handle error
  // For now, we pass null and let client content decide.
  // The (app)/layout.tsx will also enforce !isApproved redirect.
  if (!initialProfile?.is_approved && authUser) {
    // This redirect might be redundant if (app)/layout handles it,
    // but good for cases where this page is hit before layout's client-side check fully processes.
    redirect("/awaiting-approval");
  }

  const initialUserWithProfile = authUser && initialProfile ? { ...authUser, profile: initialProfile } as AppUser : (authUser ? { ...authUser, profile: null } as AppUser : null);

  const queryClient = new QueryClient();

  // Prefetch data for StatCards and initial table loads
  if (initialUserWithProfile && initialUserWithProfile.id) { // Check for id
    await queryClient.prefetchQuery({
      queryKey: ["allUserContributionsForStatus", initialUserWithProfile.id],
      queryFn: () => fetchAllUserContributionsForStatus(supabase, initialUserWithProfile.id),
    });

    await queryClient.prefetchQuery<PaginatedData<UserContributionForTable>, Error>({
      queryKey: ["userContributionsForDashboard", initialUserWithProfile.id, 1, ""], 
      queryFn: () => fetchUserContributionsForDashboard(supabase, initialUserWithProfile.id, 1, ITEMS_PER_PAGE, ""),
    });
  }

  // Global data prefetches
  await queryClient.prefetchQuery({
    queryKey: ["totalFamilySavings"],
    queryFn: () => fetchTotalFamilySavingsRPC(supabase),
  });

  await queryClient.prefetchQuery<PaginatedData<FamilyEmergencyRequestForTable>, Error>({
    queryKey: ["allFamilyEmergencyRequestsForDashboard", 1, ""], 
    queryFn: () => fetchAllFamilyEmergencyRequestsForDashboard(supabase, 1, ITEMS_PER_PAGE, ""),
  });
  
  const dehydratedState = dehydrate(queryClient);

  if (!initialUserWithProfile) { // This implies authUser was null
    console.warn("DashboardPage (Server): AuthUser not available for initial render. Redirect should have happened.");
    // Redirect again if somehow missed by middleware or layout for non-SSR parts
     redirect("/login");
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
