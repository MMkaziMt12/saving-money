
import type { Profile } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createClientComponentClient } from "@/lib/supabase/client"; // For client-side fallback

// This function can be called from server or client.
// If supabaseClient is provided (server context), it uses that.
// Otherwise (client context), it creates a new client-side client.
export async function fetchUserProfileFromServer(
  userId: string,
  supabaseClient?: SupabaseClient // Optional: if not provided, creates a client-side instance
): Promise<Profile | null> {
  if (!userId) {
    console.warn("API: fetchUserProfileFromServer called with no userId.");
    return null;
  }

  const supabase = supabaseClient || createClientComponentClient(); // Use provided or create new client
  const contextType = supabaseClient ? "server-provided" : "new client-side";
  let operationType = "fetchUserProfileFromServer";
  operationType = supabaseClient ? "fetchUserProfileFromServer (SSR)" : "fetchUserProfileFromServer (Client)";


  console.log(`API: ${operationType} - Attempting to fetch profile for user: ${userId} (Using ${contextType} client)`);
  try {
    const { data, error, status } = await supabase
      .from("profiles")
      .select(
        "id, full_name, email, phone, avatar_url, role, is_approved, created_at, updated_at, is_active, last_login"
      )
      .eq("id", userId)
      .single<Profile>();

    if (error) {
      if (error.code === 'PGRST116') { // "single" query returned 0 rows
          console.warn(`API: ${operationType} - No profile found for user ${userId} (PGRST116). Context: ${contextType}`);
          return null;
      }
      const errorMessage = error.message || `Supabase error (Code: ${error.code || status})`;
      console.error(`API: ${operationType} - Error fetching profile for ${userId}. Status: ${status}. Context: ${contextType}`, JSON.stringify(error, null, 2));
      throw new Error(errorMessage); // Re-throw to be caught by TanStack Query or calling function
    }
    
    if (data) {
      console.log(`API: ${operationType} - Profile successfully fetched for ${userId}. Context: ${contextType}`);
    } else {
       console.warn(`API: ${operationType} - No profile data returned for ${userId}, though no explicit error. Status: ${status}. Context: ${contextType}`);
    }
    return data;
  } catch (err: any) {
    console.error(`API: ${operationType} - Unexpected error in fetchUserProfileFromServer for ${userId}. Context: ${contextType}`, err);
    throw err; // Re-throw for TanStack Query or calling function
  }
}
