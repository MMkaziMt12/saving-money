
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { cookies } from "next/headers";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchUserProfileFromServer } from "@/lib/api/profile";
import { ProfileClientContent } from "@/components/profile/ProfileClientContent";
import type { Profile } from "@/types";

export default async function ProfilePageSSR() {
  const cookieStore = cookies();
  const supabase = createServerSupabaseClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();
  
  if (!authUser) {
    // This shouldn't happen if AppLayout is working correctly, but as a safeguard.
    // Redirect or show an error/login prompt.
    // For now, we can let ProfileClientContent handle the no-user case if needed.
    console.warn("ProfilePageSSR: No authenticated user found.");
  }

  const queryClient = new QueryClient();
  let initialProfile: Profile | null = null;

  if (authUser?.id) {
    try {
      // Prefetch user profile for initial data
      initialProfile = await queryClient.fetchQuery({
        queryKey: ["userProfile", authUser.id],
        queryFn: () => fetchUserProfileFromServer(authUser.id, supabase), // Pass server client
      });
    } catch (error) {
        console.error("ProfilePageSSR: Error prefetching profile data:", error);
        // initialProfile will remain null
    }
  }

  const dehydratedState = dehydrate(queryClient);

  return (
    <HydrationBoundary state={dehydratedState}>
      <ProfileClientContent initialProfile={initialProfile} />
    </HydrationBoundary>
  );
}
