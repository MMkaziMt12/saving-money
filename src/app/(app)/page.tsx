
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

export default async function DashboardPageSSR() { // Renamed to SSR for clarity
  const supabase = await createServerSupabaseClient(); 

  const { data: { user: authUser } } = await supabase.auth.getUser();
  
  // This top-level SSR page relies on (app)/layout.tsx for the primary auth guard.
  // If authUser is null here, the (app)/layout.tsx's client-side guard (ClientAuthGuardWrapper)
  // will redirect to /login after client hydration.
  // We proceed with fetching, assuming user might exist or ClientAuthGuardWrapper will handle.
  
  let initialProfile: Profile | null = null;
  if (authUser?.id) {
    try {
      initialProfile = await fetchUserProfileFromServer(authUser.id, supabase); 
    } catch (error) {
      console.error("DashboardPageSSR (Server): Failed to fetch initial profile", error);
    }
  }

  // If, after server checks, profile is definitively not approved, and we have an authUser,
  // we could redirect here too. However, (app)/layout.tsx's ClientAuthGuardWrapper
  // will also handle this on the client. Server redirect might be slightly faster.
  if (authUser && initialProfile && !initialProfile.is_approved) {
    redirect("/awaiting-approval");
  }
  // If authUser exists but no profile was found, it's treated as not approved by ClientAuthGuardWrapper.


  const initialUserWithProfile = authUser && initialProfile ? { ...authUser, profile: initialProfile } as AppUser : (authUser ? {...authUser, profile: null} as AppUser : null);

  const queryClient = new QueryClient();

  // Prefetch data for StatCards and initial table loads
  if (initialUserWithProfile?.id) { 
    await queryClient.prefetchQuery({
      queryKey: ["allUserContributionsForStatus", initialUserWithProfile.id],
      queryFn: () => fetchAllUserContributionsForStatus(supabase, initialUserWithProfile.id),
    });

    await queryClient.prefetchQuery<PaginatedData<UserContributionForTable>, Error>({
      queryKey: ["userContributionsForDashboard", initialUserWithProfile.id, 1, ""], 
      queryFn: () => fetchUserContributionsForDashboard(supabase, initialUserWithProfile.id, 1, ITEMS_PER_PAGE, ""),
    });
  } else {
    console.warn("DashboardPageSSR (Server): Skipping user-specific prefetches as authUser.id is not available.");
  }

  // Global data prefetches (can run even if no specific user, though less useful if not logged in)
  try {
    await queryClient.prefetchQuery({
      queryKey: ["totalFamilySavings"],
      queryFn: () => fetchTotalFamilySavingsRPC(supabase),
    });

    await queryClient.prefetchQuery<PaginatedData<FamilyEmergencyRequestForTable>, Error>({
      queryKey: ["allFamilyEmergencyRequestsForDashboard", 1, ""], 
      queryFn: () => fetchAllFamilyEmergencyRequestsForDashboard(supabase, 1, ITEMS_PER_PAGE, ""),
    });
  } catch (error) {
      console.error("DashboardPageSSR (Server): Error prefetching global dashboard data:", error);
  }
  
  const dehydratedState = dehydrate(queryClient);

  // If authUser is null at this point, ClientAuthGuardWrapper in (app)/layout will redirect.
  // Passing null initialUser is fine for DashboardClientContent to handle gracefully.

  return (
    <HydrationBoundary state={dehydratedState}>
      <DashboardClientContent 
        initialUser={initialUserWithProfile} // Pass the user with potentially embedded profile
        initialProfile={initialProfile} // Pass profile separately for clarity in DashboardClientContent
        appName={APP_NAME}
      />
    </HydrationBoundary>
  );
}
