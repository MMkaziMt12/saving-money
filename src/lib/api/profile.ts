
import { createClient as createClientComponentClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchUserProfileFromServer(
  userId: string,
  supabaseClient: SupabaseClient // Make client mandatory for server-side use
): Promise<Profile | null> {
  if (!userId) {
    console.warn("API: fetchUserProfileFromServer called with no userId.");
    return null;
  }

  // Use the provided client (expected to be server client or a specific client instance)
  const supabase = supabaseClient;

  console.log(`API: Attempting to fetch profile for user: ${userId} (Using provided Supabase client)`);
  try {
    const { data, error, status } = await supabase
      .from("profiles")
      .select(
        "id, full_name, email, phone, avatar_url, role, is_approved, created_at, updated_at, is_active, last_login"
      )
      .eq("id", userId)
      .single<Profile>();

    if (error) {
      const errorMessage = error.message || `Supabase error (Code: ${error.code || status})`;
      console.error(`API: Error fetching profile for ${userId}. Status: ${status}`, JSON.stringify(error, null, 2));
      throw new Error(errorMessage); 
    }
    
    if (data) {
      console.log(`API: Profile successfully fetched for ${userId}.`);
    } else {
       console.warn(`API: No profile data returned for ${userId}, though no explicit error. Status: ${status}`);
    }
    return data;
  } catch (err: any) {
    console.error(`API: Unexpected error in fetchUserProfileFromServer for ${userId}:`, err);
    throw err; 
  }
}
