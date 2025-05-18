
import { createClient as createClientComponentClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// This function can be called from server or client.
// If supabaseClient is provided (server context), it uses that.
// Otherwise (client context, e.g., from AuthContext), it creates a new client-side client.
export async function fetchUserProfileFromServer(
  userId: string,
  supabaseClient?: SupabaseClient // Optional: if not provided, creates a client-side instance
): Promise<Profile | null> {
  if (!userId) {
    console.warn("API: fetchUserProfileFromServer called with no userId.");
    return null;
  }

  const supabase = supabaseClient || createClientComponentClient();
  const contextType = supabaseClient ? "server-provided" : "new client-side";

  console.log(`API: Attempting to fetch profile from ${contextType} client for user: ${userId}`);
  try {
    const { data, error, status } = await supabase
      .from("profiles")
      .select(
        "id, full_name, email, phone, avatar_url, role, is_approved, created_at, updated_at, is_active, last_login"
      )
      .eq("id", userId)
      .single<Profile>();

    if (error) {
      // Don't throw if it's a "0 rows" error, just return null
      if (error.code === 'PGRST116') {
          console.warn(`API: No profile found for user ${userId} (PGRST116). Context: ${contextType}`);
          return null;
      }
      const errorMessage = error.message || `Supabase error (Code: ${error.code || status})`;
      console.error(`API: Error fetching profile for ${userId}. Status: ${status}. Context: ${contextType}`, JSON.stringify(error, null, 2));
      throw new Error(errorMessage);
    }
    
    if (data) {
      console.log(`API: Profile successfully fetched for ${userId}. Context: ${contextType}`);
    } else {
       console.warn(`API: No profile data returned for ${userId}, though no explicit error. Status: ${status}. Context: ${contextType}`);
    }
    return data;
  } catch (err: any) {
    console.error(`API: Unexpected error in fetchUserProfileFromServer for ${userId}. Context: ${contextType}`, err);
    throw err;
  }
}

    