
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchCurrentUserActiveEmergencyRequests } from "@/lib/api/emergencyRequests";
import { fetchTotalFamilySavingsRPC } from "@/lib/api/dashboard";
import { EmergencyRequestClientContent } from "@/components/emergency-request/EmergencyRequestClientContent";
import type { AuthenticatedUser as AppUser, Profile } from "@/types";
import { fetchUserProfileFromServer } from "@/lib/api/profile";
import { redirect } from "next/navigation";

export default async function EmergencyRequestPageSSR() {
  const supabase = await createServerSupabaseClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();
  
  if (!authUser) {
    redirect("/login");
  }

  let initialProfile: Profile | null = null;
  try {
    initialProfile = await fetchUserProfileFromServer(authUser.id, supabase);
  } catch (error) {
    console.error("EmergencyRequestPageSSR (Server): Failed to fetch initial profile", error);
  }

  if (!initialProfile?.is_approved) {
      redirect("/awaiting-approval");
  }
  
  const initialUserWithProfile = authUser && initialProfile ? { ...authUser, profile: initialProfile } as AppUser : (authUser ? {...authUser, profile: null} as AppUser : null);

  const queryClient = new QueryClient();

  // Prefetch current user's active emergency requests
  if (initialUserWithProfile?.id) { 
    await queryClient.prefetchQuery({
      queryKey: ["currentUserActiveEmergencyRequests", initialUserWithProfile.id],
      queryFn: () => fetchCurrentUserActiveEmergencyRequests(supabase, initialUserWithProfile.id),
    });
  } else {
    console.warn("EmergencyRequestPageSSR (Server): Skipping prefetch for currentUserActiveEmergencyRequests due to missing user ID.");
  }

  // Prefetch total family savings for the form validation and display
  await queryClient.prefetchQuery({
    queryKey: ["totalFamilySavingsForRequestForm"], 
    queryFn: () => fetchTotalFamilySavingsRPC(supabase),
  });

  const dehydratedState = dehydrate(queryClient);

  return (
    <HydrationBoundary state={dehydratedState}>
      <EmergencyRequestClientContent 
        initialUserId={initialUserWithProfile?.id} 
        initialProfile={initialProfile} // Pass fetched profile for initial display
      />
    </HydrationBoundary>
  );
}
