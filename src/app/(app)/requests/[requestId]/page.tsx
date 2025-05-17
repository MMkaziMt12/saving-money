
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { cookies } from "next/headers";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchEmergencyRequestDetails, fetchRelatedNotificationsForRequest } from "@/lib/api/emergencyRequests";
import { RequestDetailClientContent } from "@/components/requests/RequestDetailClientContent";
import type { EmergencyRequestDetail, RelatedNotificationForRequest } from "@/lib/api/emergencyRequests";
import { redirect } from "next/navigation";

interface RequestDetailPageProps {
  params: { requestId: string };
}

export default async function RequestDetailPageSSR({ params }: RequestDetailPageProps) {
  const { requestId } = params;
  if (!requestId) {
    redirect("/404"); // Or your preferred not-found page
  }

  // const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient();
  const queryClient = new QueryClient();

  let initialRequestDetails: EmergencyRequestDetail | null = null;
  let initialNotifications: RelatedNotificationForRequest[] = [];

  try {
    // Prefetch request details
    initialRequestDetails = await queryClient.fetchQuery({
      queryKey: ["emergencyRequestDetails", requestId],
      queryFn: () => fetchEmergencyRequestDetails(supabase, requestId),
    });

    if (!initialRequestDetails) {
      // Optionally redirect to a not-found page if the request doesn't exist or user doesn't have access (handled by RLS)
      // For now, let client content handle null if RLS prevents fetch
    }

    // Prefetch related notifications
    initialNotifications = await queryClient.fetchQuery({
      queryKey: ["relatedNotificationsForRequest", requestId],
      queryFn: () => fetchRelatedNotificationsForRequest(supabase, requestId),
    });

  } catch (error) {
    console.error(`RequestDetailPageSSR: Error prefetching data for request ${requestId}:`, error);
    // initialRequestDetails and initialNotifications will remain in their default error states
  }
  
  const dehydratedState = dehydrate(queryClient);

  return (
    <HydrationBoundary state={dehydratedState}>
      <RequestDetailClientContent 
        requestId={requestId}
        initialRequestDetails={initialRequestDetails}
        initialNotifications={initialNotifications}
      />
    </HydrationBoundary>
  );
}
