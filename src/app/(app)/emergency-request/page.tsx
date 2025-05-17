
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { cookies } from "next/headers";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchCurrentUserActiveEmergencyRequests } from "@/lib/api/emergencyRequests";
import { fetchTotalFamilySavingsRPC } from "@/lib/api/dashboard";
import { EmergencyRequestClientContent } from "@/components/emergency-request/EmergencyRequestClientContent";
import type { AuthenticatedUser as AppUser, Profile } from "@/types";
import { fetchUserProfileFromServer } from "@/lib/api/profile";


export default async function EmergencyRequestPageSSR() {
  const cookieStore = cookies();
  const supabase = createServerSupabaseClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();
  
  let initialProfile: Profile | null = null;
  if (authUser?.id) { // Ensure authUser and authUser.id exist
    try {
      initialProfile = await fetchUserProfileFromServer(authUser.id, supabase);
    } catch (error) {
      console.error("EmergencyRequestPageSSR (Server): Failed to fetch initial profile", error);
    }
  }
  const initialUserWithProfile = authUser && initialProfile ? { ...authUser, profile: initialProfile } as AppUser : null;


  const queryClient = new QueryClient();

  if (initialUserWithProfile?.id && typeof initialUserWithProfile.id === 'string') { // Ensure ID is a string
    await queryClient.prefetchQuery({
      queryKey: ["currentUserActiveEmergencyRequests", initialUserWithProfile.id],
      queryFn: () => fetchCurrentUserActiveEmergencyRequests(supabase, initialUserWithProfile.id),
    });
  } else {
    console.warn("EmergencyRequestPageSSR (Server): Skipping prefetch for currentUserActiveEmergencyRequests due to missing or invalid user ID.");
  }

  await queryClient.prefetchQuery({
    queryKey: ["totalFamilySavingsForRequestForm"], 
    queryFn: () => fetchTotalFamilySavingsRPC(supabase),
  });

  const dehydratedState = dehydrate(queryClient);

  return (
    <HydrationBoundary state={dehydratedState}>
      <EmergencyRequestClientContent 
        initialUserId={initialUserWithProfile?.id} 
        initialProfile={initialProfile}
      />
    </HydrationBoundary>
  );
}
