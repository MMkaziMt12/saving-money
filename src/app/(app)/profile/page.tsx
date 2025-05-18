
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchUserProfileFromServer } from "@/lib/api/profile";
import { ProfileClientContent } from "@/components/profile/ProfileClientContent";
import type { Profile } from "@/types";
import { redirect } from "next/navigation";

export default async function ProfilePageSSR() {
  const supabase = await createServerSupabaseClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();
  
  if (!authUser) {
    redirect("/login");
  }

  const queryClient = new QueryClient();
  let initialProfile: Profile | null = null;

  try {
    // Prefetch user profile for initial data
    initialProfile = await queryClient.fetchQuery({
      queryKey: ["userProfile", authUser.id], // This queryKey might be used by ProfileClientContent too
      queryFn: () => fetchUserProfileFromServer(authUser.id, supabase), 
    });
  } catch (error) {
      console.error("ProfilePageSSR: Error prefetching profile data:", error);
      // initialProfile will remain null, ProfileClientContent will rely on useAuth
  }
  
  const dehydratedState = dehydrate(queryClient);

  return (
    <HydrationBoundary state={dehydratedState}>
      <ProfileClientContent initialProfile={initialProfile} />
    </HydrationBoundary>
  );
}
