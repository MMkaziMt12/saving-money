
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
  if (authUser) {
    try {
      initialProfile = await fetchUserProfileFromServer(authUser.id, supabase);
    } catch (error) {
      console.error("EmergencyRequestPageSSR (Server): Failed to fetch initial profile", error);
    }
  }
  const initialUserWithProfile = authUser && initialProfile ? { ...authUser, profile: initialProfile } as AppUser : null;


  const queryClient = new QueryClient();

  if (initialUserWithProfile?.id) {
    await queryClient.prefetchQuery({
      queryKey: ["currentUserActiveEmergencyRequests", initialUserWithProfile.id],
      queryFn: () => fetchCurrentUserActiveEmergencyRequests(supabase, initialUserWithProfile.id),
    });
  }

  await queryClient.prefetchQuery({
    queryKey: ["totalFamilySavingsForRequestForm"], // Using a distinct key for this page if needed, or could use "totalFamilySavings"
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
