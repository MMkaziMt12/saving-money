
"use client";

import { createClient as createClientComponentClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Updated to accept an optional SupabaseClient instance
export async function fetchUserProfileFromServer(
  userId: string,
  supabaseClient?: SupabaseClient
): Promise<Profile | null> {
  if (!userId) {
    console.warn("API: fetchUserProfileFromServer called with no userId.");
    return null;
  }

  // Use provided client or create a new one for client-side calls
  const supabase = supabaseClient || createClientComponentClient();

  console.log(`API: Attempting to fetch profile from server for user: ${userId} (Using ${supabaseClient ? 'provided server client' : 'new client-side client'})`);
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
      console.error(`API: Error fetching profile from server for ${userId}. Status: ${status}`, JSON.stringify(error, null, 2));
      if (typeof window !== 'undefined' && !supabaseClient) { // Only clear cache if it's a client-side failure
        localStorage.removeItem("fft_user_profile");
      }
      throw new Error(errorMessage);
    }
    
    if (data) {
      console.log(`API: Profile successfully fetched from server for ${userId}.`);
      if (typeof window !== 'undefined' && !supabaseClient) { // Only set cache if it's a client-side success
        localStorage.setItem("fft_user_profile", JSON.stringify(data));
      }
    } else {
       console.warn(`API: No profile data returned from server for ${userId}, though no explicit error. Status: ${status}`);
       if (typeof window !== 'undefined' && !supabaseClient) {
         localStorage.removeItem("fft_user_profile");
       }
    }
    return data;
  } catch (err: any) {
    console.error(`API: Unexpected error in fetchUserProfileFromServer for ${userId}:`, err);
    if (typeof window !== 'undefined' && !supabaseClient) {
        localStorage.removeItem("fft_user_profile");
    }
    throw err; 
  }
}
